// Twitter & Telegram 检测面板
// Surge generic script

let results = [];

function httpGet(url, cb) {
  $httpClient.get({ url: url, timeout: 5000 }, function(err, resp, data) {
    cb(err, resp, data);
  });
}

function checkTwitter() {
  return new Promise((resolve) => {
    const start = Date.now();
    httpGet("https://twitter.com/robots.txt", function(err, resp, data) {
      const cost = Date.now() - start;
      if (err) {
        resolve({ name: "Twitter/X", ok: false, cost: cost, status: 0 });
      } else {
        resolve({ name: "Twitter/X", ok: true, cost: cost, status: resp.status });
      }
    });
  });
}

function checkTelegram() {
  return new Promise((resolve) => {
    const start = Date.now();
    httpGet("https://api.telegram.org/", function(err, resp, data) {
      const cost = Date.now() - start;
      if (err) {
        resolve({ name: "Telegram API", ok: false, cost: cost, status: 0 });
      } else {
        resolve({ name: "Telegram API", ok: true, cost: cost, status: resp.status });
      }
    });
  });
}

function checkTelegramDC() {
  return new Promise((resolve) => {
    const start = Date.now();
    httpGet("http://149.154.167.51", function(err, resp, data) {
      const cost = Date.now() - start;
      if (err) {
        resolve({ name: "Telegram DC", ok: false, cost: cost, status: 0 });
      } else {
        resolve({ name: "Telegram DC", ok: true, cost: cost, status: resp.status });
      }
    });
  });
}

function checkXApi() {
  return new Promise((resolve) => {
    const start = Date.now();
    httpGet("https://api.x.com/robots.txt", function(err, resp, data) {
      const cost = Date.now() - start;
      if (err) {
        resolve({ name: "X API", ok: false, cost: cost, status: 0 });
      } else {
        resolve({ name: "X API", ok: true, cost: cost, status: resp.status });
      }
    });
  });
}

async function main() {
  const results = await Promise.all([
    checkTwitter(),
    checkTelegram(),
    checkTelegramDC(),
    checkXApi()
  ]);

  let lines = [];
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    lines.push(icon + " " + r.name + ": " + (r.ok ? "已连接" : "失败") + " , " + r.cost + "ms , HTTP " + r.status);
  }

  $done({
    title: "Twitter/Telegram 检测",
    content: lines.join("\n"),
    icon: "paperplane.fill",
    "icon-color": "#0088cc"
  });
}

main();
