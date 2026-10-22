// ============================================
// DNS 分流矫正器 v3
// 优化：阿里云DoH国内视角 + Surge配置检测 + CDN智能判断
// ============================================

var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
var API_BASE = "http://127.0.0.1:6171";
var API_AUTH = "ty.20040120";

var CDN_RANGES = [
  {start: "43.169.0.0", end: "43.169.255.255", name: "腾讯云CDN"},
  {start: "155.102.0.0", end: "155.102.255.255", name: "阿里云CDN"},
  {start: "101.32.0.0", end: "101.32.255.255", name: "腾讯云"},
  {start: "120.232.0.0", end: "120.232.255.255", name: "阿里云"}
];

function ipToInt(ip) {
  var parts = ip.split(".");
  return (parseInt(parts[0]) << 24) + (parseInt(parts[1]) << 16) + (parseInt(parts[2]) << 8) + parseInt(parts[3]);
}

function isCdnIp(ip) {
  var ipInt = ipToInt(ip);
  for (var i = 0; i < CDN_RANGES.length; i++) {
    if (ipInt >= ipToInt(CDN_RANGES[i].start) && ipInt <= ipToInt(CDN_RANGES[i].end)) {
      return CDN_RANGES[i].name;
    }
  }
  return null;
}

function dohQuery(domain, server) {
  return new Promise(function(resolve) {
    var url;
    if (server === "google") {
      url = "https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=A";
    } else if (server === "alidns") {
      url = "https://dns.alidns.com/resolve?name=" + encodeURIComponent(domain) + "&type=A";
    } else {
      url = "https://doh.pub/dns-query?name=" + encodeURIComponent(domain) + "&type=A";
    }
    $httpClient.get({
      url: url,
      timeout: 6,
      headers: {"User-Agent": UA, "Accept": "application/dns-json"}
    }, function(error, response, data) {
      if (error || !data) { resolve(null); return; }
      try {
        var json = JSON.parse(data);
        if (json.Answer && json.Answer.length > 0) {
          for (var i = 0; i < json.Answer.length; i++) {
            if (json.Answer[i].type === 1) {
              resolve(json.Answer[i].data);
              return;
            }
          }
        }
        resolve(null);
      } catch(e) { resolve(null); }
    });
  });
}

function ipInfo(ip) {
  return new Promise(function(resolve) {
    if (!ip) { resolve(null); return; }
    $httpClient.get({
      url: "http://ip-api.com/json/" + ip + "?lang=zh-CN&fields=status,country,regionName,city,isp,org",
      timeout: 5,
      headers: {"User-Agent": UA}
    }, function(error, response, data) {
      if (error || !data) { resolve(null); return; }
      try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
    });
  });
}

function getSurgeDnsConfig() {
  return new Promise(function(resolve) {
    $httpClient.get({
      url: API_BASE + "/v1/features",
      timeout: 3,
      headers: {"X-Key": API_AUTH}
    }, function(error, response, data) {
      if (error || !data) { resolve(null); return; }
      try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
    });
  });
}

function checkNetwork() {
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

var CN_DOMAINS = ["www.baidu.com", "www.qq.com", "www.taobao.com", "www.jd.com"];
var FOREIGN_DOMAINS = ["www.google.com", "www.youtube.com", "www.netflix.com"];

var results = {};
var done = 0;
var total = CN_DOMAINS.length + FOREIGN_DOMAINS.length + 2;
var finished = false;

function finish() {
  if (finished) return;
  finished = true;
  
  var lines = [];
  var cnOk = 0, cnTotal = 0;
  var foreignOk = 0, foreignTotal = 0;
  
  if (results._dnsConfig) {
    lines.push("【Surge DNS】");
    var cfg = results._dnsConfig;
    if (cfg.dnsServer) lines.push("DNS服务器: " + cfg.dnsServer.join(", "));
    if (cfg.encryptedDnsServer) lines.push("加密DNS: " + cfg.encryptedDnsServer.join(", "));
    if (cfg.hijackDns) lines.push("DNS劫持: 开启");
    lines.push("");
  }
  
  lines.push("【国内域名】");
  for (var i = 0; i < CN_DOMAINS.length; i++) {
    var d = CN_DOMAINS[i];
    var r = results[d];
    cnTotal++;
    var cdn = r && r.ip ? isCdnIp(r.ip) : null;
    if (r && r.info && (r.info.country === "中国" || cdn)) {
      cnOk++;
      var loc = cdn ? cdn : r.info.regionName;
      lines.push("✅ " + d + " ➟ " + r.ip + " (" + loc + ")");
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
  
  if (results._network) {
    lines.push("");
    lines.push("【网络出口】");
    var net = results._network;
    lines.push("IP: " + (net.ip || "未知"));
    lines.push("位置: " + (net.loc || "未知") + " (" + (net.colo || "未知") + ")");
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

setTimeout(finish, 25000);

for (var i = 0; i < CN_DOMAINS.length; i++) {
  (function(idx) {
    var domain = CN_DOMAINS[idx];
    dohQuery(domain, "alidns").then(function(ip) {
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
    dohQuery(domain, "google").then(function(ip) {
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

getSurgeDnsConfig().then(function(cfg) {
  results._dnsConfig = cfg;
  done++;
  if (done === total) finish();
});

checkNetwork().then(function(net) {
  results._network = net;
  done++;
  if (done === total) finish();
});