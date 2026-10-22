// ============================================
// 流媒体解锁检测 精简版
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
  var map = {US:"US",JP:"JP",HK:"HK",TW:"TW",SG:"SG",KR:"KR",GB:"GB",DE:"DE",FR:"FR",CA:"CA",AU:"AU",NL:"NL",SE:"SE",ES:"ES",IT:"IT",IN:"IN",BR:"BR",MX:"MX",AR:"AR",CL:"CL",CO:"CO",PE:"PE",NZ:"NZ",IE:"IE",CH:"CH",AT:"AT",BE:"BE",DK:"DK",FI:"FI",NO:"NO",PT:"PT",GR:"GR",CZ:"CZ",HU:"HU",PL:"PL",RO:"RO",RU:"RU",UA:"UA",TR:"TR",IL:"IL",SA:"SA",AE:"AE",TH:"TH",VN:"VN",MY:"MY",ID:"ID",PH:"PH",ZA:"ZA",EG:"EG",NG:"NG",KE:"KE"};
  return map[code] || code;
}

function checkNetflix() {
  return new Promise(function(resolve) {
    request("https://www.netflix.com/title/81280792").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️"); return; }
      if (/not available in your country|proxy or unblocker/i.test(res.body)) { resolve("❌ NO"); return; }
      if (res.status !== 200) { resolve("⏱️"); return; }
      var region = res.body.match(/"requestCountry"\s*:\s*\{\s*"id"\s*:\s*"([a-z]{2})"/i);
      if (!region) region = res.body.match(/\bdata-country\s*=\s*["']([a-z]{2})["']/i);
      var r = region ? country(region[1]) : "OK";
      resolve("✅ " + r);
    });
  });
}

function checkDisney() {
  return new Promise(function(resolve) {
    request("https://www.disneyplus.com/").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️"); return; }
      if (/Sorry, Disney\+ is not available/i.test(res.body)) { resolve("❌ NO"); return; }
      if (res.status !== 200) { resolve("⏱️"); return; }
      resolve("✅ OK");
    });
  });
}

function checkYoutube() {
  return new Promise(function(resolve) {
    request("https://www.youtube.com/premium", {Cookie: "SOCS=CAI"}).then(function(res) {
      if (res.error || !res.body) { resolve("⏱️"); return; }
      if (/premium is not available in your country/i.test(res.body)) { resolve("❌ NO"); return; }
      if (res.body.includes("www.google.cn")) { resolve("❌ NO"); return; }
      if (/ad-free|premiumPurchaseButton|Start trial/i.test(res.body)) {
        var region = res.body.match(/"(?:countryCode|contentRegion)"\s*:\s*"([A-Z]{2})"/);
        resolve("✅ " + (region ? country(region[1]) : "Premium"));
        return;
      }
      resolve("⏱️");
    });
  });
}

function checkSpotify() {
  return new Promise(function(resolve) {
    request("https://open.spotify.com/").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️"); return; }
      if (/not (?:yet )?available in (?:your|this) country/i.test(res.body)) { resolve("❌ NO"); return; }
      if (res.status !== 200) { resolve("⏱️"); return; }
      resolve("✅ OK");
    });
  });
}

function checkTikTok() {
  return new Promise(function(resolve) {
    request("https://www.tiktok.com/explore").then(function(res) {
      if (res.error || !res.body) { resolve("⏱️"); return; }
      if (/not available in (?:your|this) country/i.test(res.body)) { resolve("❌ NO"); return; }
      if (res.status !== 200) { resolve("⏱️"); return; }
      var region = res.body.match(/"region"\s*:\s*"([a-z]{2,3})"/i);
      resolve("✅ " + (region ? country(region[1]) : "OK"));
    });
  });
}

function checkChatGPT() {
  return new Promise(function(resolve) {
    request("https://api.openai.com/compliance/cookie_requirements", {
      "Authorization": "Bearer null", "Content-Type": "application/json",
      "Origin": "https://platform.openai.com", "Referer": "https://platform.openai.com/"
    }).then(function(res) {
      if (res.error) { resolve("⏱️"); return; }
      if (/unsupported_country|disallowed isp|been blocked/i.test(res.body || "")) { resolve("❌ NO"); return; }
      if (res.status >= 200 && res.status < 400) { resolve("✅ OK"); return; }
      resolve("⏱️");
    });
  });
}

var SERVICES = [
  {name: "Netflix", check: checkNetflix},
  {name: "Disney+", check: checkDisney},
  {name: "YouTube", check: checkYoutube},
  {name: "Spotify", check: checkSpotify},
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
    lines.push(SERVICES[j].name + " ➟ " + (results[j] || "⏱️"));
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