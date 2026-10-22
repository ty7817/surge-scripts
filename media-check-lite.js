// ============================================
// 流媒体解锁检测 精简版（中文）
// 只检测6个常用服务，确保Surge内不超时
// ============================================

var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var TIMEOUT = 6000;

function request(url, headers, method, body) {
  return new Promise(function(resolve) {
    var opts = {url: url, timeout: TIMEOUT/1000, headers: {"User-Agent": UA, "Accept-Language": "en"}};
    if (headers) for (var k in headers) opts.headers[k] = headers[k];
    if (body) opts.body = body;
    var cb = function(error, response, data) {
      if (error) { resolve({error: true}); return; }
      try {
        var status = Number(response.status || response.statusCode);
        var hs = {};
        if (response.headers) for (var key in response.headers) hs[key.toLowerCase()] = response.headers[key];
        resolve({status: status, headers: hs, body: data || ""});
      } catch(e) { resolve({error: true}); }
    };
    if (method === "POST") $httpClient.post(opts, cb);
    else $httpClient.get(opts, cb);
  });
}

function country(code) {
  if (!code) return "";
  code = code.toUpperCase();
  var map = {US:"美国",JP:"日本",HK:"香港",TW:"台湾",SG:"新加坡",KR:"韩国",GB:"英国",DE:"德国",FR:"法国",CA:"加拿大",AU:"澳大利亚",NL:"荷兰",SE:"瑞典",ES:"西班牙",IT:"意大利",IN:"印度",BR:"巴西",MX:"墨西哥",AR:"阿根廷",CL:"智利",CO:"哥伦比亚",PE:"秘鲁",NZ:"新西兰",IE:"爱尔兰",CH:"瑞士",AT:"奥地利",BE:"比利时",DK:"丹麦",FI:"芬兰",NO:"挪威",PT:"葡萄牙",GR:"希腊",CZ:"捷克",HU:"匈牙利",PL:"波兰",RO:"罗马尼亚",RU:"俄罗斯",UA:"乌克兰",TR:"土耳其",IL:"以色列",SA:"沙特",AE:"阿联酋",TH:"泰国",VN:"越南",MY:"马来西亚",ID:"印尼",PH:"菲律宾",ZA:"南非",EG:"埃及",NG:"尼日利亚",KE:"肯尼亚"};
  return map[code] || code;
}

function checkNetflix() {
  return new Promise(function(resolve) {
    request("https://www.netflix.com/title/81280792").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️ 超时"); return; }
      if (/not available in your country|proxy or unblocker/i.test(res.body)) { resolve("❌ 不可用"); return; }
      if (res.status !== 200) { resolve("⏱️ 超时"); return; }
      var region = res.body.match(/"requestCountry"\s*:\s*\{\s*"id"\s*:\s*"([a-z]{2})"/i);
      if (!region) region = res.body.match(/\bdata-country\s*=\s*["']([a-z]{2})["']/i);
      var r = region ? country(region[1]) : "可用";
      resolve("✅ " + r);
    });
  });
}

function checkDisney() {
  return new Promise(function(resolve) {
    request("https://www.disneyplus.com/").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️ 超时"); return; }
      if (/Sorry, Disney\+ is not available/i.test(res.body)) { resolve("❌ 不可用"); return; }
      if (res.status !== 200) { resolve("⏱️ 超时"); return; }
      resolve("✅ 可用");
    });
  });
}

function checkYoutube() {
  return new Promise(function(resolve) {
    request("https://www.youtube.com/premium", {Cookie: "SOCS=CAI"}).then(function(res) {
      if (res.error || !res.body) { resolve("⏱️ 超时"); return; }
      if (/premium is not available in your country/i.test(res.body)) { resolve("❌ 不可用"); return; }
      if (res.body.includes("www.google.cn")) { resolve("❌ 不可用"); return; }
      if (/ad-free|premiumPurchaseButton|Start trial/i.test(res.body)) {
        var region = res.body.match(/"(?:countryCode|contentRegion)"\s*:\s*"([A-Z]{2})"/);
        resolve("✅ " + (region ? country(region[1]) : "Premium"));
        return;
      }
      resolve("⏱️ 超时");
    });
  });
}

function checkSpotify() {
  return new Promise(function(resolve) {
    request("https://open.spotify.com/").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️ 超时"); return; }
      if (/not (?:yet )?available in (?:your|this) country/i.test(res.body)) { resolve("❌ 不可用"); return; }
      if (res.status !== 200) { resolve("⏱️ 超时"); return; }
      resolve("✅ 可用");
    });
  });
}

function checkTikTok() {
  return new Promise(function(resolve) {
    request("https://www.tiktok.com/explore").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️ 超时"); return; }
      if (/not available in (?:your|this) country/i.test(res.body)) { resolve("❌ 不可用"); return; }
      if (res.status !== 200) { resolve("⏱️ 超时"); return; }
      var region = res.body.match(/"region"\s*:\s*"([a-z]{2,3})"/i);
      resolve("✅ " + (region ? country(region[1]) : "可用"));
    });
  });
}

function checkChatGPT() {
  return new Promise(function(resolve) {
    request("https://api.openai.com/compliance/cookie_requirements", {
      "Authorization": "Bearer null", "Content-Type": "application/json",
      "Origin": "https://platform.openai.com", "Referer": "https://platform.openai.com/"
    }).then(function(res) {
      if (res.error) { resolve("⏱️ 超时"); return; }
      if (/unsupported_country|disallowed isp|been blocked/i.test(res.body || "")) { resolve("❌ 不可用"); return; }
      if (res.status >= 200 && res.status < 400) { resolve("✅ 可用"); return; }
      resolve("⏱️ 超时");
    });
  });
}

var SERVICES = [
  {name: "奈飞", check: checkNetflix},
  {name: "迪士尼+", check: checkDisney},
  {name: "油管", check: checkYoutube},
  {name: "声田", check: checkSpotify},
  {name: "TikTok", check: checkTikTok},
  {name: "ChatGPT", check: checkChatGPT}
];

var results = [];
var done = 0;
var finished = false;

function finish() {
  if (finished) return;
  finished = true;
  var ok = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i] && results[i].indexOf("✅") === 0) ok++;
  }
  var lines = [];
  for (var j = 0; j < SERVICES.length; j++) {
    lines.push(SERVICES[j].name + " ➟ " + (results[j] || "⏱️ 超时"));
  }
  var icon = ok === SERVICES.length ? "✅" : "⚠️";
  var color = ok === SERVICES.length ? "#3CB371" : "#DAA520";
  $done({
    title: icon + " 流媒体 " + ok + "/" + SERVICES.length,
    content: lines.join("\n"),
    icon: "play.circle.fill",
    "icon-color": color
  });
}

setTimeout(finish, 20000);

for (var i = 0; i < SERVICES.length; i++) {
  (function(idx) {
    SERVICES[idx].check().then(function(result) {
      results[idx] = result;
      done++;
      if (done === SERVICES.length) finish();
    });
  })(i);
}