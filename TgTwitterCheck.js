/* =========================================================
 * Twitter & Telegram 服务检测面板
 * 2026.10.27
 * ========================================================= */

const $http = $httpClient;

async function testTwitter() {
  return new Promise((resolve) => {
    const start = Date.now();
    $http.get({
      url: "https://twitter.com/robots.txt",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
      timeout: 5000
    }, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) return resolve({ name: "Twitter/X", ok: false, cost, status: 0, msg: "失败" });
      const status = resp?.status || 0;
      if (status === 200) {
        return resolve({ name: "Twitter/X", ok: true, cost, status, msg: "已连接" });
      } else if (status === 404) {
        return resolve({ name: "Twitter/X", ok: true, cost, status, msg: "已连接" });
      } else {
        return resolve({ name: "Twitter/X", ok: false, cost, status, msg: `HTTP ${status}` });
      }
    });
  });
}

async function testTelegram() {
  return new Promise((resolve) => {
    const start = Date.now();
    $http.get({
      url: "https://api.telegram.org/",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
      timeout: 5000
    }, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) return resolve({ name: "Telegram", ok: false, cost, status: 0, msg: "失败" });
      const status = resp?.status || 0;
      if (status === 200 || status === 404) {
        return resolve({ name: "Telegram", ok: true, cost, status, msg: "已连接" });
      } else {
        return resolve({ name: "Telegram", ok: false, cost, status, msg: `HTTP ${status}` });
      }
    });
  });
}

async function testTelegramDC() {
  return new Promise((resolve) => {
    const start = Date.now();
    $http.get({
      url: "http://149.154.167.51",
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 5000
    }, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) return resolve({ name: "Telegram DC", ok: false, cost, status: 0, msg: "失败" });
      const status = resp?.status || 0;
      return resolve({ name: "Telegram DC", ok: true, cost, status, msg: `HTTP ${status}` });
    });
  });
}

async function testXApi() {
  return new Promise((resolve) => {
    const start = Date.now();
    $http.get({
      url: "https://api.x.com/robots.txt",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
      timeout: 5000
    }, (err, resp, data) => {
      const cost = Date.now() - start;
      if (err) return resolve({ name: "X API", ok: false, cost, status: 0, msg: "失败" });
      const status = resp?.status || 0;
      return resolve({ name: "X API", ok: true, cost, status, msg: `HTTP ${status}` });
    });
  });
}

async function getPolicyName() {
  return new Promise((resolve) => {
    if (typeof $httpAPI !== "function") return resolve("");
    $httpAPI("GET", "/v1/policy_groups", null, (data) => {
      try {
        resolve("当前节点");
      } catch { resolve(""); }
    });
  });
}

async function run() {
  const [twitter, tg, tgDC, xApi, policy] = await Promise.all([
    testTwitter(),
    testTelegram(),
    testTelegramDC(),
    testXApi(),
    getPolicyName()
  ]);

  const lines = [];
  if (policy) lines.push(`节点策略: ${policy}\n`);

  const results = [twitter, tg, tgDC, xApi];
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    lines.push(`${icon} ${r.name}: ${r.msg} , ${r.cost}ms , HTTP ${r.status}`);
  }

  $done({
    title: "Twitter/Telegram 检测",
    content: lines.join("\n"),
    icon: "paperplane.fill",
    "icon-color": "#0088cc"
  });
}

run().catch(err => {
  $done({ title: "Twitter/Telegram 检测", content: `Error: ${err}` });
});
