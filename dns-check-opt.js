// ============================================
// DNS 分流矫正器 v5（5秒刷新优化版）
// 优化点：
//  1. IP归属地 / 网络出口 / Surge配置 强缓存 → 5秒刷新不触发 ip-api 限流、不堆积
//  2. 修复 ipToInt 32位有符号位运算 bug（首段≥128 的 IP 曾算成负数）
//  3. 全部任务并行 + 主备 DoH 自动切换
//  4. 全局 8 秒超时兜底，任何情况都保证 $done
//  5. 缓存命中时 1~2 秒完成，新 IP 才走在线查询
// ============================================

var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
var API_BASE = "http://127.0.0.1:6171";
var API_AUTH = "ty.20040120";

// 缓存键与 TTL（秒）
var K = { ipPrefix: "dnsc_ip_", net: "dnsc_net", cfg: "dnsc_cfg" };
var TTL = { ip: 86400, net: 20, cfg: 20 };

// 已知国内 CDN / 运营商段（命中即判定国内，无需在线查询）
var CDN_RANGES = [
  { start: "43.169.0.0",   end: "43.169.255.255",   name: "腾讯云CDN" },
  { start: "155.102.0.0",  end: "155.102.255.255",   name: "阿里云CDN" },
  { start: "101.32.0.0",   end: "101.32.255.255",    name: "腾讯云" },
  { start: "120.232.0.0",  end: "120.232.255.255",   name: "阿里云" },
  { start: "123.150.0.0",  end: "123.150.255.255",   name: "天津联通" },
  { start: "203.205.0.0",  end: "203.205.255.255",   name: "腾讯云" },
  { start: "113.108.0.0",  end: "113.108.255.255",   name: "广东电信" }
];

var CN_DOH = [
  "https://dns.alidns.com/resolve?name={domain}&type=A",
  "https://doh.pub/dns-query?name={domain}&type=A"
];
var FOREIGN_DOH = [
  "https://dns.google/resolve?name={domain}&type=A",
  "https://cloudflare-dns.com/dns-query?name={domain}&type=A"
];

var CN_DOMAINS = ["www.baidu.com", "www.qq.com", "www.taobao.com", "www.jd.com"];
var FOREIGN_DOMAINS = ["www.google.com", "www.youtube.com", "www.netflix.com"];

// ---------- 工具函数 ----------

// 修复：用无符号乘法，避免 <<24 产生负数
function ipToInt(ip) {
  var p = ip.split(".");
  return (((+p[0]) * 256 + (+p[1])) * 256 + (+p[2])) * 256 + (+p[3]);
}

function isCdnIp(ip) {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  var x = ipToInt(ip);
  for (var i = 0; i < CDN_RANGES.length; i++) {
    if (x >= ipToInt(CDN_RANGES[i].start) && x <= ipToInt(CDN_RANGES[i].end)) {
      return CDN_RANGES[i].name;
    }
  }
  return null;
}

function now() { return Math.floor(Date.now() / 1000); }

// ---------- 持久化缓存 ----------
function cacheRead(key) {
  return new Promise(function (resolve) {
    try {
      $persistentStore.read(key, function (data, err) {
        if (!data) return resolve(null);
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}

function cacheWrite(key, val) {
  return new Promise(function (resolve) {
    try {
      $persistentStore.write(JSON.stringify(val), key, function () { resolve(); });
    } catch (e) { resolve(); }
  });
}

// ---------- HTTP 封装 ----------
function httpGet(url, timeout, headers) {
  return new Promise(function (resolve) {
    var h = headers || {};
    if (!h["User-Agent"]) h["User-Agent"] = UA;
    $httpClient.get({ url: url, timeout: timeout, headers: h }, function (error, response, data) {
      if (error || !data) return resolve(null);
      resolve({ status: response && response.status, data: data });
    });
  });
}

// ---------- DoH 解析（主备依次）----------
function dohQuery(domain, servers) {
  return new Promise(function (resolve) {
    var idx = 0;
    (function next() {
      if (idx >= servers.length) return resolve(null);
      var url = servers[idx++].replace("{domain}", encodeURIComponent(domain));
      httpGet(url, 2, { Accept: "application/dns-json", "User-Agent": UA }).then(function (r) {
        if (!r) return next();
        try {
          var json = JSON.parse(r.data);
          if (json && json.Answer) {
            // 取最后一个 A 记录（CNAME 链之后的最终地址）
            var a = null;
            for (var i = 0; i < json.Answer.length; i++) {
              if (json.Answer[i].type === 1) a = json.Answer[i].data;
            }
            if (a) return resolve(a);
          }
          next();
        } catch (e) { next(); }
      });
    })();
  });
}

// 归属地缓存按 /24 网段建键：同段归属地一致，可抗 CDN IP 轮询，国家判断不受影响
function ipCacheKey(ip) {
  var p = ip.split(".");
  return K.ipPrefix + p[0] + "." + p[1] + "." + p[2] + ".0";
}

// ---------- IP 归属地（CDN段 → 缓存 → 在线）----------
function ipInfo(ip) {
  return new Promise(function (resolve) {
    if (!ip) return resolve(null);

    // 1. 已知 CDN 段直接判定，不请求
    var cdn = isCdnIp(ip);
    if (cdn) return resolve({ country: "中国", regionName: cdn, isp: cdn, cached: true });

    // 2. 缓存（/24 网段）
    var key = ipCacheKey(ip);
    cacheRead(key).then(function (rec) {
      if (rec && rec.t && (now() - rec.t) < TTL.ip) {
        rec.info.cached = true;
        return resolve(rec.info);
      }
      // 3. 在线查询（仅新 IP，结果写缓存）
      var url = "http://ip-api.com/json/" + ip + "?lang=zh-CN&fields=status,message,country,regionName,city,isp";
      httpGet(url, 2).then(function (r) {
        var info = null;
        if (r) {
          try {
            var j = JSON.parse(r.data);
            if (j.status === "success") {
              info = { country: j.country, regionName: j.regionName, city: j.city, isp: j.isp };
              cacheWrite(key, { info: info, t: now() });
            }
          } catch (e) { /* 限流(429)或解析失败，保留旧缓存 */ }
        }
        // 在线失败时用旧缓存兜底（即使过期）
        if (!info && rec && rec.info) { rec.info.cached = true; info = rec.info; }
        resolve(info);
      });
    });
  });
}

// ---------- Surge 配置（缓存）----------
function getSurgeConfig() {
  return new Promise(function (resolve) {
    cacheRead(K.cfg).then(function (rec) {
      if (rec && rec.t && (now() - rec.t) < TTL.cfg) return resolve(rec.cfg);
      httpGet(API_BASE + "/v1/features", 2, { "X-Key": API_AUTH }).then(function (r) {
        var cfg = null;
        if (r) { try { cfg = JSON.parse(r.data); } catch (e) {} }
        if (cfg) cacheWrite(K.cfg, { cfg: cfg, t: now() });
        else if (rec && rec.cfg) cfg = rec.cfg;
        resolve(cfg);
      });
    });
  });
}

// ---------- 网络出口（缓存）----------
function checkNetwork() {
  return new Promise(function (resolve) {
    cacheRead(K.net).then(function (rec) {
      if (rec && rec.t && (now() - rec.t) < TTL.net) return resolve(rec.net);
      httpGet("https://www.cloudflare.com/cdn-cgi/trace", 2).then(function (r) {
        var net = null;
        if (r && r.data) {
          net = {};
          var lines = r.data.split("\n");
          for (var i = 0; i < lines.length; i++) {
            var kv = lines[i].split("=");
            if (kv.length === 2) net[kv[0].trim()] = kv[1].trim();
          }
          if (net.ip) cacheWrite(K.net, { net: net, t: now() });
        }
        if (!net && rec && rec.net) net = rec.net;
        resolve(net);
      });
    });
  });
}

// ---------- 单个域名检测（DoH + 归属地）----------
function checkDomain(domain, dohServers) {
  return dohQuery(domain, dohServers).then(function (ip) {
    if (!ip) return { ip: null, info: null };
    return ipInfo(ip).then(function (info) {
      return { ip: ip, info: info };
    });
  });
}

// ---------- 主流程 ----------
var results = { domains: {}, cfg: null, net: null };
var finished = false;
var startTs = Date.now();

function render() {
  if (finished) return;
  finished = true;

  var lines = [];
  var cnOk = 0, cnTotal = 0, fOk = 0, fTotal = 0;

  if (results.cfg) {
    lines.push("【Surge DNS】");
    var c = results.cfg;
    if (c.dnsServer && c.dnsServer.length) lines.push("DNS: " + c.dnsServer.join(", "));
    if (c.encryptedDnsServer && c.encryptedDnsServer.length) lines.push("加密DNS: 已配置");
    if (c.hijackDns) lines.push("DNS劫持: 开启");
    lines.push("");
  }

  lines.push("【国内域名】");
  for (var i = 0; i < CN_DOMAINS.length; i++) {
    var d = CN_DOMAINS[i], r = results.domains[d];
    cnTotal++;
    var cdn = r && r.ip ? isCdnIp(r.ip) : null;
    if (r && r.info && (r.info.country === "中国" || cdn)) {
      cnOk++;
      var loc = cdn ? cdn : (r.info.regionName || "中国");
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
    var fd = FOREIGN_DOMAINS[j], fr = results.domains[fd];
    fTotal++;
    if (fr && fr.info && fr.info.country && fr.info.country !== "中国") {
      fOk++;
      lines.push("✅ " + fd + " ➟ " + fr.ip + " (" + fr.info.country + ")");
    } else if (fr && fr.ip) {
      lines.push("⚠️ " + fd + " ➟ " + fr.ip + " (" + (fr.info ? fr.info.country : "未知") + ")");
    } else {
      lines.push("❌ " + fd + " ➟ 解析失败");
    }
  }

  if (results.net) {
    lines.push("");
    lines.push("【网络出口】");
    lines.push("IP: " + (results.net.ip || "未知"));
    if (results.net.loc) lines.push("地区: " + results.net.loc);
    if (results.net.colo) lines.push("机房: " + results.net.colo);
  }

  var allOk = cnOk === cnTotal && fOk === fTotal;
  var icon = allOk ? "✅" : "⚠️";
  var color = allOk ? "#34C759" : "#FF9500";
  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);

  $done({
    title: icon + " DNS分流 " + (cnOk + fOk) + "/" + (cnTotal + fTotal),
    content: lines.join("\n") + "\n\n检测耗时 " + elapsed + "s",
    icon: "network",
    "icon-color": color
  });
}

// 兜底：8 秒内无论结果如何都必须刷新一次面板
setTimeout(render, 8000);

// 全部任务并行
var tasks = [];
CN_DOMAINS.forEach(function (d) {
  tasks.push(checkDomain(d, CN_DOH).then(function (r) { results.domains[d] = r; }));
});
FOREIGN_DOMAINS.forEach(function (d) {
  tasks.push(checkDomain(d, FOREIGN_DOH).then(function (r) { results.domains[d] = r; }));
});
tasks.push(getSurgeConfig().then(function (c) { results.cfg = c; }));
tasks.push(checkNetwork().then(function (n) { results.net = n; }));

Promise.all(tasks).then(render)["catch"](function () { render(); });
