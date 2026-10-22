// ============================================
// 通用订阅流量查询脚本 v2
// 适配大部分机场订阅（sspanel/v2board/xboard等）
// ============================================

// ===== 在这里添加你的订阅链接 =====
var SUB_LIST = [
  {name: "良心云", url: "https://liangxin.xyz/api/v1/liangxin?OwO=b70caf2736c09389862f6308d6d60ff0"},
  {name: "赔钱", url: "https://dasho.xn--cp3a08l.com/api/v1/pq/d48f7e0117d75b38f55c2f3be4e81162"},
  {name: "顺畅", url: "https://scyydsbgw.xm-pass.one/feed/yhDhUOC8AYK8VIVCHgKZoKVSPBSeh1SY"},
  {name: "一分", url: "https://login.yfjc.xyz/api/v1/client/subscribe?token=5b38f7bed2857c419b4334a1a8a6cca0"}
];

// 自动尝试的UA列表
var UA_LIST = ["clash.meta", "clash", "Quantumult%20X", "surge"];

// ============================================
// 工具函数
// ============================================
function fmtBytes(b) {
  if (b === null || b === undefined || isNaN(b)) return "?";
  b = parseFloat(b);
  if (b < 0) return "?";
  if (b === 0) return "0G";
  var tb = b / 1099511627776;
  if (tb >= 1) return tb.toFixed(1) + "T";
  var gb = b / 1073741824;
  if (gb >= 1) return gb.toFixed(1) + "G";
  var mb = b / 1048576;
  if (mb >= 1) return mb.toFixed(0) + "M";
  var kb = b / 1024;
  if (kb >= 1) return kb.toFixed(0) + "K";
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
    var daysStr = days < 0 ? " 已过期" : " 剩" + days + "天";
    return {date: dateStr, days: daysStr};
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
      var val = kv[1].trim();
      if (key === "upload" || key === "download" || key === "total" || key === "expire") {
        p[key] = val;
      }
    }
  }
  return p;
}

function extractFromBody(body) {
  if (!body) return null;
  var m = body.match(/(?:upload|download|total|expire)\s*=\s*[^;\n\s]+/gi);
  if (m && m.length >= 2) {
    return parseUserInfo(m.join(";"));
  }
  return null;
}

// ============================================
// 主逻辑
// ============================================
var results = [];
var doneCount = 0;
var finished = false;

function finish() {
  if (finished) return;
  finished = true;
  $done({
    title: "订阅流量",
    content: results.join("\n"),
    icon: "crown",
    "icon-color": "#FF9500"
  });
}

setTimeout(finish, 20000);

function fetchSub(sub, uaIndex, callback) {
  if (uaIndex >= UA_LIST.length) {
    callback(sub.name + ": 获取失败");
    return;
  }
  var ua = UA_LIST[uaIndex];
  $httpClient.get({url: sub.url, headers: {"User-Agent": ua}}, function(error, response, data) {
    if (error || !response) {
      fetchSub(sub, uaIndex + 1, callback);
      return;
    }
    
    var info = null;
    if (response.headers) {
      info = response.headers["subscription-userinfo"] 
          || response.headers["Subscription-Userinfo"] 
          || response.headers["Subscription-UserInfo"]
          || response.headers["subscription-user-info"];
    }
    
    if (!info && data) {
      var p = extractFromBody(data);
      if (p) {
        info = "upload=" + (p.upload||"0") + ";download=" + (p.download||"0") + ";total=" + (p.total||"") + ";expire=" + (p.expire||"");
      }
    }
    
    if (info) {
      var p = parseUserInfo(info);
      if (p && (p.upload || p.download || p.total)) {
        var used = (parseFloat(p.upload) || 0) + (parseFloat(p.download) || 0);
        var total = parseFloat(p.total);
        var exp = parseExpire(p.expire);
        
        if (total && !isNaN(total) && total > 0) {
          var pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
          callback(sub.name + ": " + fmtBytes(used) + "/" + fmtBytes(total) + " " + pct + "%\n到期:" + exp.date + exp.days);
        } else {
          callback(sub.name + ": " + fmtBytes(used) + " 已用\n到期:" + exp.date + exp.days);
        }
        return;
      }
    }
    
    if (response.status === 403 || !info) {
      fetchSub(sub, uaIndex + 1, callback);
    } else {
      callback(sub.name + ": 无流量信息");
    }
  });
}

for (var i = 0; i < SUB_LIST.length; i++) {
  (function(idx) {
    fetchSub(SUB_LIST[idx], 0, function(line) {
      results[idx] = line;
      doneCount++;
      if (doneCount === SUB_LIST.length) finish();
    });
  })(i);
}