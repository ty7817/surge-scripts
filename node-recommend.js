// ============================================
// 全策略组节点推荐面板 v7.0
// 功能：测试每个应用策略组，推荐组内最快节点，按延迟排序
// ============================================

var APP_GROUPS = [
  { name: "油管视频",     icon: "📺" },
  { name: "奈飞视频",     icon: "🎬" },
  { name: "推特X",       icon: "🐦" },
  { name: "电报信息",     icon: "✈️" },
  { name: "TikTok短视频",  icon: "🎵" },
  { name: "谷歌服务",     icon: "🔍" },
  { name: "Emby影院",    icon: "🎞️" },
  { name: "AI服务",      icon: "🤖" },
  { name: "GitHub",      icon: "🐙" },
  { name: "微软服务",     icon: "🪟" }
];

// ---------- HTTP API ----------
function httpAPI(path, method, body) {
  return new Promise((resolve) => {
    $httpAPI(method || "GET", path, body || {}, (result) => {
      resolve(result);
    });
  });
}

// ---------- 主流程 ----------
var startTs = Date.now();
var finished = false;

function render(data) {
  if (finished) return;
  finished = true;
  data = data || {};
  var groupBest = data.groupBest || {};

  var lines = [];

  // 收集所有有结果的组
  var results = [];
  APP_GROUPS.forEach(function (g) {
    var b = groupBest[g.name];
    if (b) {
      results.push({ icon: g.icon, name: g.name, node: b.node, latency: b.latency });
    }
  });

  // 按延迟从低到高排序
  results.sort(function (a, b) { return a.latency - b.latency; });

  if (results.length > 0) {
    lines.push("【按网速排序推荐】");
    results.forEach(function (r) {
      lines.push(r.icon + " " + r.name + " ➟ " + r.node + " (" + r.latency + "ms)");
    });
  }

  // 无结果的组
  var noResult = [];
  APP_GROUPS.forEach(function (g) {
    if (!groupBest[g.name]) {
      noResult.push(g.icon + " " + g.name + " ➟ 无可用节点");
    }
  });
  if (noResult.length > 0) {
    if (results.length > 0) lines.push("");
    lines.push("【待检测】");
    noResult.forEach(function (l) { lines.push(l); });
  }

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var color = results.length >= 7 ? "#34C759" : (results.length >= 4 ? "#FF9500" : "#FF3B30");

  $done({
    title: "⚡ 节点推荐 " + results.length + "/" + APP_GROUPS.length,
    content: lines.join("\n") + "\n\n测速耗时 " + elapsed + "s",
    icon: "speedometer",
    "icon-color": color
  });
}

// 全局兜底
setTimeout(function () { render(null); }, 60000);

(async function () {
  // 1. 获取所有策略组
  var policyGroups = await httpAPI("/v1/policy_groups");
  if (!policyGroups) return render(null);

  // 2. 触发所有应用组测速
  for (var i = 0; i < APP_GROUPS.length; i++) {
    await httpAPI("/v1/policy_groups/test", "POST", { group_name: APP_GROUPS[i].name });
  }

  // 3. 等待测速完成
  await new Promise(function (r) { setTimeout(r, 20000); });

  // 4. 获取benchmark结果
  var benchmark = await httpAPI("/v1/policies/benchmark_results");

  var groupBest = {};

  if (benchmark && typeof benchmark === "object") {
    APP_GROUPS.forEach(function (g) {
      var groupNodes = policyGroups[g.name];
      if (!groupNodes || !Array.isArray(groupNodes)) return;

      var best = null;
      groupNodes.forEach(function (node) {
        if (!node.lineHash) return;
        var result = benchmark[node.lineHash];
        if (!result) return;

        var delay = result.lastTestScoreInMS;
        if (delay && delay > 0 && delay < 6000) {
          if (!best || delay < best.latency) {
            best = { node: node.name, latency: delay };
          }
        }
      });

      groupBest[g.name] = best;
    });
  }

  render({ groupBest: groupBest });
})()["catch"](function (e) {
  render({ error: String(e) });
});
