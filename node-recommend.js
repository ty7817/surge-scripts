// ============================================
// 节点测速推荐面板 v5.0
// 功能：测试每个地区组所有节点延迟，推荐最优节点
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
  var debugInfo = data.debug || "";

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
setTimeout(function () { render(null); }, 60000);

(async function () {
  // 1. 触发所有地区组测速
  for (var i = 0; i < SERVER_GROUPS.length; i++) {
    await httpAPI("/v1/policy_groups/test", "POST", { group_name: SERVER_GROUPS[i].name });
  }

  // 2. 等待测速完成（多等一会，确保测完）
  await new Promise(function (r) { setTimeout(r, 15000); });

  // 3. 获取测速结果
  var testResults = await httpAPI("/v1/policy_groups/test_results");

  var groupBest = {};

  if (testResults && typeof testResults === "object") {
    SERVER_GROUPS.forEach(function (g) {
      var groupData = testResults[g.name];
      if (!groupData) return;

      // 兼容多种返回格式
      var best = null;

      // 格式1: { "节点名": 延迟毫秒数 }
      if (typeof groupData === "object" && !Array.isArray(groupData)) {
        Object.keys(groupData).forEach(function (nodeName) {
          var delay = groupData[nodeName];
          if (typeof delay === "number" && delay > 0) {
            if (!best || delay < best.latency) {
              best = { node: nodeName, latency: delay };
            }
          }
        });
      }
      // 格式2: [{ name: "xxx", delay: 45 }]
      else if (Array.isArray(groupData)) {
        groupData.forEach(function (item) {
          if (item && item.delay > 0) {
            if (!best || item.delay < best.latency) {
              best = { node: item.name, latency: item.delay };
            }
          }
        });
      }

      groupBest[g.name] = best;
    });
  }

  render({ groupBest: groupBest });
})()["catch"](function (e) {
  render({ error: String(e) });
});
