// ============================================
// 节点测速推荐面板 v6.0（正确API版）
// 正确API：/v1/policies/benchmark_results（按lineHash索引）
// ============================================

var SERVER_GROUPS = [
  { name: "香港节点",    flag: "🇭🇰", short: "香港" },
  { name: "美国节点",    flag: "🇺🇸", short: "美国" },
  { name: "日本节点",    flag: "🇯🇵", short: "日本" },
  { name: "台湾节点",    flag: "🇹🇼", short: "台湾" },
  { name: "新加坡节点",  flag: "🇸🇬", short: "新加坡" },
  { name: "韩国节点",    flag: "🇰🇷", short: "韩国" },
  { name: "⚙️ 我的节点", flag: "📱", short: "我的" }
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
  lines.push("【推荐最优节点】");

  var okCount = 0;
  SERVER_GROUPS.forEach(function (g) {
    var b = groupBest[g.name];
    if (b) {
      okCount++;
      lines.push(g.flag + " " + g.short + " ➟ " + b.node + " (" + b.latency + "ms)");
    } else {
      lines.push(g.flag + " " + g.short + " ➟ 无可用节点");
    }
  });

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var color = okCount >= 5 ? "#34C759" : (okCount >= 2 ? "#FF9500" : "#FF3B30");

  $done({
    title: "⚡ 节点推荐 " + okCount + "/" + SERVER_GROUPS.length,
    content: lines.join("\n") + "\n\n测速耗时 " + elapsed + "s",
    icon: "speedometer",
    "icon-color": color
  });
}

// 全局兜底
setTimeout(function () { render(null); }, 45000);

(async function () {
  // 1. 获取所有策略组（拿到每个节点的lineHash）
  var policyGroups = await httpAPI("/v1/policy_groups");
  if (!policyGroups) return render(null);

  // 2. 触发所有地区组测速
  for (var i = 0; i < SERVER_GROUPS.length; i++) {
    await httpAPI("/v1/policy_groups/test", "POST", { group_name: SERVER_GROUPS[i].name });
  }

  // 3. 等待测速完成
  await new Promise(function (r) { setTimeout(r, 15000); });

  // 4. 获取benchmark结果（正确API！）
  var benchmark = await httpAPI("/v1/policies/benchmark_results");

  var groupBest = {};

  if (benchmark && typeof benchmark === "object") {
    SERVER_GROUPS.forEach(function (g) {
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
