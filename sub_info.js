// ============================================
// 自动订阅流量查询脚本 v3
// 修复要点（基于对4个订阅的真实抓包验证）：
//   1. 订阅查询强制直连(DIRECT)优先——机场流量接口走代理会被风控/连不上，
//      直连实测4个订阅全部可返回流量头；直连失败再回退系统默认路由
//   2. UA 固定 clash.meta 优先——实测只有它对4个机场都返回 subscription-userinfo
//   3. 用内置 $httpAPI 读取当前配置(v1/profiles/current)自动发现订阅，
//      替代旧版错误的 /v1/configuration + Bearer；失败回退内置订阅
//   4. 单请求超时、整体兜底、空 expire 兼容、中文订阅名解码
// ============================================

var DEFAULT_SUBS = [
  { name: "", url: "https://liangxin.xyz/api/v1/liangxin?OwO=b70caf2736c09389862f6308d6d60ff0" },
  { name: "", url: "https://dasho.xn--cp3a08l.com/api/v1/pq/d48f7e0117d75b38f55c2f3be4e81162" },
  { name: "", url: "https://scyydsbgw.xm-pass.one/feed/yhDhUOC8AYK8VIVCHgKZoKVSPBSeh1SY" },
  { name: "", url: "https://login.yfjc.xyz/api/v1/client/subscribe?token=5b38f7bed2857c419b4334a1a8a6cca0" }
];

// 通道 × UA 尝试顺序：直连优先，clash.meta 优先
var ATTEMPTS = [
  { policy: "DIRECT", ua: "clash.meta" },
  { policy: "DIRECT", ua: "clash" },
  { policy: null,      ua: "clash.meta" },  // null = 不指定 policy，跟随系统分流
  { policy: null,      ua: "clash" }
];
var REQ_TIMEOUT = 8;     // 单次请求超时（秒）
var GLOBAL_DEADLINE = 28000;

function fmtBytes(b) {
  if (b === null || b === undefined || isNaN(b)) return "?";
  b = parseFloat(b);
  if (b < 0) return "?";
  if (b === 0) return "0G";
  if (b >= 1099511627776) return (b / 1099511627776).toFixed(1) + "T";
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + "G";
  if (b >= 1048576) return (b / 1048576).toFixed(0) + "M";
  if (b >= 1024) return (b / 1024).toFixed(0) + "K";
  return b + "B";
}

function parseExpire(val) {
  if (!val || val === "") return { date: "未知", days: "" };
  var ts = parseFloat(val);
  if (!isNaN(ts) && ts > 0) {
    if (ts < 1e12) ts = ts * 1000;
    var d = new Date(ts);
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    var dateStr = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    var days = Math.ceil((ts - Date.now()) / 86400000);
    return { date: dateStr, days: days < 0 ? " 已过期" : " 剩" + days + "天" };
  }
  return { date: String(val).slice(0, 10), days: "" };
}

function parseUserInfo(info) {
  if (!info) return null;
  var p = {};
  var parts = info.split(";");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].trim().split("=");
    if (kv.length >= 2) {
      var key = kv[0].trim().toLowerCase();
      var val = kv.slice(1).join("=").trim();
      if (key === "upload" || key === "download" || key === "total" || key === "expire") {
        p[key] = val;
      }
    }
  }
  return p;
}

function getHeader(headers, name) {
  if (!headers) return null;
  var lower = name.toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) return headers[keys[i]];
  }
  return null;
}

function detectName(sub, response, body) {
  if (response && response.headers) {
    var cd = getHeader(response.headers, "content-disposition");
    if (cd) {
      var m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename\*=([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      if (m) {
        try { return decodeURIComponent(m[1].trim()).replace(/\.(conf|txt|yaml|yml)$/i, ""); }
        catch (e) { return m[1].trim().replace(/\.(conf|txt|yaml|yml)$/i, ""); }
      }
    }
  }
  if (body) {
    var head = body.split("\n").slice(0, 5).join("\n");
    var tm = head.match(/profile-title\s*=\s*([^\n]+)/i) || head.match(/#!name\s*=\s*([^\n]+)/i);
    if (tm) return tm[1].trim().replace(/^['"]|['"]$/g, "");
  }
  try {
    var host = sub.url.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    host = host.replace(/^(www|login|api|app|dash|panel|user|client)\./, "");
    return host;
  } catch (e) {
    return "订阅" + ((sub.index || 0) + 1);
  }
}

// 用内置 $httpAPI 读取当前配置，正则提取 policy-path 订阅链接
function discoverSubs(callback) {
  try {
    $httpAPI("GET", "v1/profiles/current", {}, function (res) {
      var text = null;
      if (typeof res === "string") text = res;
      else if (res && typeof res === "object") {
        text = res.profile || res.content || res.text || res.data || null;
        if (!text) {
          // 某些版本直接把配置放在某字符串字段里
          for (var k in res) { if (typeof res[k] === "string" && res[k].indexOf("policy-path") >= 0) { text = res[k]; break; } }
        }
      }
      var subs = [];
      if (text) {
        var regex = /policy-path=([^\s,]+)/g, m, seen = {};
        while ((m = regex.exec(text)) !== null) {
          var u = m[1].trim().replace(/^['"]|['"]$/g, "");
          if (u.indexOf("http") === 0 && !seen[u]) { seen[u] = true; subs.push({ name: "", url: u }); }
        }
      }
      callback(subs.length ? subs : DEFAULT_SUBS);
    });
  } catch (e) {
    callback(DEFAULT_SUBS);
  }
}

// 单次请求（可指定直连/默认、UA）
function oneRequest(sub, attempt, cb) {
  var opts = {
    url: sub.url,
    timeout: REQ_TIMEOUT,
    headers: { "User-Agent": attempt.ua, "Cache-Control": "no-cache" }
  };
  if (attempt.policy) opts.policy = attempt.policy;
  try {
    $httpClient.get(opts, function (error, response, data) {
      cb(error, response, data);
    });
  } catch (e) {
    cb(String(e), null, null);
  }
}

// 依次尝试多个通道/UA，拿到流量头即成功
function fetchSub(sub, idx, callback) {
  var attemptIdx = 0;
  function next() {
    if (attemptIdx >= ATTEMPTS.length) {
      callback(idx, (sub.name || detectName(sub, null, null)) + ": 获取失败(直连/代理均不通)");
      return;
    }
    var attempt = ATTEMPTS[attemptIdx++];
    oneRequest(sub, attempt, function (error, response, data) {
      if (error || !response) { next(); return; }
      if (!sub.name) sub.name = detectName(sub, response, data);

      var info = getHeader(response.headers, "subscription-userinfo")
              || getHeader(response.headers, "subscription_userinfo")
              || getHeader(response.headers, "sub-userinfo");

      if (info) {
        var p = parseUserInfo(info);
        if (p && (p.upload !== undefined || p.download !== undefined || p.total !== undefined)) {
          var used = (parseFloat(p.upload) || 0) + (parseFloat(p.download) || 0);
          var exp = parseExpire(p.expire);
          var total = p.total !== undefined ? parseFloat(p.total) : NaN;
          if (total && !isNaN(total) && total > 0) {
            var pct = Math.min(100, Math.round(used / total * 100));
            callback(idx, sub.name + ": " + fmtBytes(used) + "/" + fmtBytes(total) + " " + pct + "%\n到期:" + exp.date + exp.days);
          } else {
            callback(idx, sub.name + ": 已用 " + fmtBytes(used) + "\n到期:" + exp.date + exp.days);
          }
          return;
        }
      }
      // 403 或无流量头：换下一通道/UA
      next();
    });
  }
  next();
}

var lines = [];
var doneCount = 0, finished = false;
function finish() {
  if (finished) return;
  finished = true;
  $done({
    title: "订阅流量",
    content: lines.filter(Boolean).join("\n"),
    icon: "crown",
    "icon-color": "#FF9500"
  });
}
setTimeout(finish, GLOBAL_DEADLINE);

discoverSubs(function (subs) {
  var total = subs.length;
  if (!total) return finish();
  for (var i = 0; i < total; i++) {
    (function (idx) {
      subs[idx].index = idx;
      fetchSub(subs[idx], idx, function (order, line) {
        lines[order] = line;
        doneCount++;
        if (doneCount === total) finish();
      });
    })(i);
  }
});
