// Telegram 自动测速选点脚本
// 每10分钟自动测试「电报信息」策略组中所有节点延迟，切换到最快节点
// 依赖 Surge HTTP API (http-api 需开启)

const GROUP_NAME = "电报信息";
const API_BASE = "http://127.0.0.1:6171";
const API_PASS = "ty.20040120";

function auth() {
  return { "Authorization": "Basic " + $text.base64(":" + API_PASS) };
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    $http.get({
      url: API_BASE + path,
      headers: auth(),
      timeout: 10
    }, (err, resp, data) => {
      if (err) reject(err);
      else resolve(JSON.parse(data));
    });
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    $http.post({
      url: API_BASE + path,
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 30
    }, (err, resp, data) => {
      if (err) reject(err);
      else resolve(data ? JSON.parse(data) : {});
    });
  });
}

function httpPut(path, body) {
  return new Promise((resolve, reject) => {
    $http.put({
      url: API_BASE + path,
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 10
    }, (err, resp, data) => {
      if (err) reject(err);
      else resolve(data ? JSON.parse(data) : {});
    });
  });
}

(async () => {
  try {
    // 1. 触发策略组测速
    await httpPost("/v1/test", {
      policy_groups: [GROUP_NAME],
      workers: 15
    });

    // 2. 等待测速完成
    await new Promise(r => setTimeout(r, 8000));

    // 3. 获取候选节点及延迟
    const candidates = await httpGet(
      "/v1/policy_groups/" + encodeURIComponent(GROUP_NAME) + "/candidates"
    );

    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.log("[TG自动选点] 未获取到候选节点");
      return;
    }

    // 4. 筛选有效节点（delay > 0）
    const valid = candidates.filter(c => c.delay && c.delay > 0);
    if (valid.length === 0) {
      console.log("[TG自动选点] 所有节点均不可用");
      return;
    }

    // 5. 按延迟排序，选最快
    valid.sort((a, b) => a.delay - b.delay);
    const best = valid[0];

    // 6. 获取当前选中节点
    const groupInfo = await httpGet(
      "/v1/policy_groups/" + encodeURIComponent(GROUP_NAME)
    );
    const current = groupInfo.selected;

    // 7. 如果当前不是最快，切换
    if (current !== best.name) {
      await httpPut("/v1/policy_groups/select", {
        policy_group: GROUP_NAME,
        policy: best.name
      });
      console.log(`[TG自动选点] ${current}(${groupInfo.delay}ms) → ${best.name}(${best.delay}ms)`);
      $notification.post("Telegram 自动选点", `已切换到最快节点`, `${best.name} (${best.delay}ms)`);
    } else {
      console.log(`[TG自动选点] 当前已是最快: ${best.name} (${best.delay}ms)`);
    }

  } catch (e) {
    console.error("[TG自动选点] 失败:", e);
  }
})();