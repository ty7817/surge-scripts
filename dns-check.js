// ============================================
// DNS 分流矫正器
// 检测国内/国外域名解析是否正确，DNS泄漏检测
// ============================================

var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function dnsResolve(domain) {
  return new Promise(function(resolve) {
    try {
      $httpClient.dns(domain, function(error, data) {
        if (error || !data || !data.address) { resolve(null); return; }
        resolve(data.address);
      });
    } catch(e) { resolve(null); }
  });
}

function ipInfo(ip) {
  return new Promise(function(resolve) {
    if (!ip) { resolve(null); return; }
    $httpClient.get({
      url: "http://ip-api.com/json/" + ip + "?lang=zh-CN&fields=status,country,regionName,city,isp,query",
      timeout: 5,
      headers: {"User-Agent": UA}
    }, function(error, response, data) {
      if (error || !data) { resolve(null); return; }
      try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
    });
  });
}

function checkDnsLeak() {
  return new Promise(function(resolve) {
    $httpClient.get({
      url: "https://www.cloudflare.com/cdn-cgi/trace",
      timeout: 5,
      headers: {"User-Agent": UA}
    }, function(error, response, data) {
      if (error || !data) { resolve(null); return; }
      var result = {};
      var lines = data.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var kv = lines[i].split("=");
        if (kv.length === 2) result[kv[0]] = kv[1];
      }
      resolve(result);
    });
  });
}

var CN_DOMAINS = ["www.baidu.com", "www.qq.com", "www.taobao.com"];
var FOREIGN_DOMAINS = ["www.google.com", "www.youtube.com", "www.netflix.com"];

var results = {};
var done = 0;
var total = CN_DOMAINS.length + FOREIGN_DOMAINS.length + 1;
var finished = false;

function finish() {
  if (finished) return;
  finished = true;
  
  var lines = [];
  var cnOk = 0, cnTotal = 0;
  var foreignOk = 0, foreignTotal = 0;
  
  lines.push("【国内域名】");
  for (var i = 0; i < CN_DOMAINS.length; i++) {
    var d = CN_DOMAINS[i];
    var r = results[d];
    cnTotal++;
    if (r && r.info && r.info.country === "中国") {
      cnOk++;
      lines.push("✅ " + d + " ➟ " + r.ip + " (" + r.info.regionName + ")");
    } else if (r && r.ip) {
      lines.push("⚠️ " + d + " ➟ " + r.ip + " (" + (r.info ? r.info.country : "未知") + ")");
    } else {
      lines.push("❌ " + d + " ➟ 解析失败");
    }
  }
  
  lines.push("");
  lines.push("【国外域名】");
  for (var j = 0; j < FOREIGN_DOMAINS.length; j++) {
    var fd = FOREIGN_DOMAINS[j];
    var fr = results[fd];
    foreignTotal++;
    if (fr && fr.info && fr.info.country !== "中国" && fr.info.country !== "未知") {
      foreignOk++;
      lines.push("✅ " + fd + " ➟ " + fr.ip + " (" + fr.info.country + ")");
    } else if (fr && fr.ip) {
      lines.push("⚠️ " + fd + " ➟ " + fr.ip + " (" + (fr.info ? fr.info.country : "未知") + ")");
    } else {
      lines.push("❌ " + fd + " ➟ 解析失败");
    }
  }
  
  if (results._leak) {
    lines.push("");
    lines.push("【网络出口】");
    var leak = results._leak;
    lines.push("IP: " + (leak.ip || "未知"));
    lines.push("位置: " + (leak.loc || "未知") + " (" + (leak.colo || "未知") + ")");
  }
  
  var totalOk = cnOk + foreignOk;
  var totalAll = cnTotal + foreignTotal;
  var allOk = cnOk === cnTotal && foreignOk === foreignTotal;
  var icon = allOk ? "✅" : "⚠️";
  var color = allOk ? "#3CB371" : "#DAA520";
  
  $done({
    title: icon + " DNS分流 " + totalOk + "/" + totalAll,
    content: lines.join("\n"),
    icon: "network",
    "icon-color": color
  });
}

setTimeout(finish, 15000);

for (var i = 0; i < CN_DOMAINS.length; i++) {
  (function(idx) {
    var domain = CN_DOMAINS[idx];
    dnsResolve(domain).then(function(ip) {
      if (ip) {
        ipInfo(ip).then(function(info) {
          results[domain] = {ip: ip, info: info};
          done++;
          if (done === total) finish();
        });
      } else {
        results[domain] = {ip: null, info: null};
        done++;
        if (done === total) finish();
      }
    });
  })(i);
}

for (var j = 0; j < FOREIGN_DOMAINS.length; j++) {
  (function(idx) {
    var domain = FOREIGN_DOMAINS[idx];
    dnsResolve(domain).then(function(ip) {
      if (ip) {
        ipInfo(ip).then(function(info) {
          results[domain] = {ip: ip, info: info};
          done++;
          if (done === total) finish();
        });
      } else {
        results[domain] = {ip: null, info: null};
        done++;
        if (done === total) finish();
      }
    });
  })(j);
}

checkDnsLeak().then(function(leak) {
  results._leak = leak;
  done++;
  if (done === total) finish();
});