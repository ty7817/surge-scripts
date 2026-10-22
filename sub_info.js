// ============================================
// 自动订阅流量查询脚本 v2
// 自动从Surge配置发现订阅链接，自动识别订阅名称
// ============================================

var DEFAULT_SUBS = [
  {name: "", url: "https://liangxin.xyz/api/v1/liangxin?OwO=b70caf2736c09389862f6308d6d60ff0"},
  {name: "", url: "https://dasho.xn--cp3a08l.com/api/v1/pq/d48f7e0117d75b38f55c2f3be4e81162"},
  {name: "", url: "https://scyydsbgw.xm-pass.one/feed/yhDhUOC8AYK8VIVCHgKZoKVSPBSeh1SY"},
  {name: "", url: "https://login.yfjc.xyz/api/v1/client/subscribe?token=5b38f7bed2857c419b4334a1a8a6cca0"}
];

var UA_LIST = ["clash.meta", "clash", "Quantumult%20X", "surge"];

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
  if (!val || val === "") return {date: "未知", days: ""};
  var ts = parseFloat(val);
  if (!isNaN(ts) && ts > 0) {
    if (ts < 1e12) ts = ts * 1000;
    var d = new Date(ts);
    var dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    var days = Math.ceil((ts - Date.now()) / 86400000);
    return {date: dateStr, days: days < 0 ? " 已过期" : " 剩" + days + "天"};
  }
  return {date: String(val).slice(0,10), days: ""};
}

function parseUserInfo(info) {
  if (!info) return null;
  var p = {};
  var parts = info.split(";");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].trim().split("=");
    if (kv.length >= 2 && kv[1] !== "") {
      var key = kv[0].trim().toLowerCase();
      if (key === "upload" || key === "download" || key === "total" || key === "expire") {
        p[key] = kv[1].trim();
      }
    }
  }
  return p;
}

function detectName(sub, response, body) {
  if (sub.manualName) return sub.manualName;
  if (response && response.headers) {
    var cd = response.headers["content-disposition"] || response.headers["Content-Disposition"];
    if (cd) {
      var m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      if (m) {
        try { return decodeURIComponent(m[1]).replace(/\.(conf|txt|yaml|yml)$/i, ""); }
        catch(e) { return m[1].replace(/\.(conf|txt|yaml|yml)$/i, ""); }
      }
    }
  }
  if (body) {
    var firstLines = body.split("\n").slice(0, 5).join("\n");
    var tm = firstLines.match(/profile-title\s*=\s*([^\n]+)/i) || firstLines.match(/#!name\s*=\s*([^\n]+)/i);
    if (tm) return tm[1].trim();
  }
  try {
    var host = sub.url.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    host = host.replace(/^(www|login|api|app|dash|panel|user|client)\./, "");
    return host;
  } catch(e) {
    return "订阅" + (sub.index + 1);
  }
}

function discoverSubs(callback) {
  var password = "ty.20040120";
  $httpClient.get({
    url: "http://127.0.0.1:6171/v1/configuration",
    headers: {"Authorization": "Bearer " + password}
  }, function(error, response, data) {
    if (!error && response && response.status === 200 && data) {
      var subs = [];
      var regex = /policy-path=([^\s,]+)/g;
      var match, urls = {};
      while ((match = regex.exec(data)) !== null) {
        var url = match[1].trim();
        if (url && url.indexOf("http") === 0 && !urls[url]) {
          urls[url] = true;
          subs.push({name: "", url: url});
        }
      }
      if (subs.length > 0) { callback(subs); return; }
    }
    callback(DEFAULT_SUBS);
  });
}

var results = [], doneCount = 0, finished = false;

function finish() {
  if (finished) return;
  finished = true;
  $done({title: "订阅流量", content: results.join("\n"), icon: "crown", "icon-color": "#FF9500"});
}

setTimeout(finish, 25000);

function fetchSub(sub, uaIndex, callback) {
  if (uaIndex >= UA_LIST.length) {
    callback((sub.name || detectName(sub, null, null)) + ": 获取失败");
    return;
  }
  var ua = UA_LIST[uaIndex];
  $httpClient.get({url: sub.url, headers: {"User-Agent": ua}}, function(error, response, data) {
    if (error || !response) { fetchSub(sub, uaIndex + 1, callback); return; }
    if (!sub.name) sub.name = detectName(sub, response, data);
    
    var info = null;
    if (response.headers) {
      info = response.headers["subscription-userinfo"] 
          || response.headers["Subscription-Userinfo"] 
          || response.headers["Subscription-UserInfo"]
          || response.headers["subscription-user-info"];
    }
    
    if (info) {
      var p = parseUserInfo(info);
      if (p && (p.upload || p.download || p.total)) {
        var used = (parseFloat(p.upload) || 0) + (parseFloat(p.download) || 0);
        var total = parseFloat(p.total);
        var exp = parseExpire(p.expire);
        if (total && !isNaN(total) && total > 0) {
          var pct = Math.min(100, Math.round(used / total * 100));
          callback(sub.name + ": " + fmtBytes(used) + "/" + fmtBytes(total) + " " + pct + "%\n到期:" + exp.date + exp.days);
        } else {
          callback(sub.name + ": " + fmtBytes(used) + " 已用\n到期:" + exp.date + exp.days);
        }
        return;
      }
    }
    if (response.status === 403 || !info) { fetchSub(sub, uaIndex + 1, callback); }
    else { callback(sub.name + ": 无流量信息"); }
  });
}

discoverSubs(function(subs) {
  for (var i = 0; i < subs.length; i++) {
    (function(idx) {
      subs[idx].index = idx;
      fetchSub(subs[idx], 0, function(line) {
        results[idx] = line;
        doneCount++;
        if (doneCount === subs.length) finish();
      });
    })(i);
  }
});