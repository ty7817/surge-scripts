// ============================================
// 全策略组节点推荐面板 v8.0
// 功能：
// 1. 地区节点组：每组找出最快节点，按延迟排序
// 2. 应用策略组：每组测试包含的子组，推荐最优子组
// ============================================

// 地区节点组（SERVER类，url-test）
var SERVER_GROUPS = [
  { name: "香港节点",    flag: "🇭🇰", short: "香港" },
  { name: "美国节点",    flag: "🇺🇸", short: "美国" },
  { name: "日本节点",    flag: "🇯🇵", short: "日本" },
  { name: "台湾节点",    flag: "🇹🇼", short: "台湾" },
  { name: "新加坡节点",  flag: "🇸🇬", short: "新加坡" },
  { name: "韩国节点",    flag: "🇰🇷", short: "韩国" },
  { name: "⚙️ 我的节点", flag: "📱", short: "我的" }
];

// 应用策略组（GROUP类，select）
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
  { name: "微软服务",     icon: "🪟" },
  { name: "苹果服务",     icon: "🍎" },
  { name: "游戏服务",     icon: "🎮" },
  { name: "全球媒体",     icon: "🌍" },
  { name: "动漫漫画",     icon: "📚" },
  { name: "GameBus视频网站", icon: "🎮" }
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
  var serverBest = data.serverBest || {};
  var appBest = data.appBest || {};

  var lines = [];

  // ===== 第一部分：地区节点组排名 =====
  var serverResults = [];
  SERVER_GROUPS.forEach(function (g) {
    var b = serverBest[g.name];
    if (b) {
      serverResults.push({ flag: g.flag, short: g.short, node: b.node, latency: b.latency });
    }
  });
  serverResults.sort(function (a, b) { return a.latency - b.latency; });

  if (serverResults.length > 0) {
    lines.push("【🌏 地区节点排名】");
    serverResults.forEach(function (r) {
      lines.push(r.flag + " " + r.short + " ➟ " + r.node + " (" + r.latency + "ms)");
    });
  }

  // ===== 第二部分：应用策略组推荐 =====
  var appResults = [];
  APP_GROUPS.forEach(function (g) {
    var b = appBest[g.name];
    if (b) {
      appResults.push({ icon: g.icon, name: g.name, target: b.target, latency: b.latency });
    }
  });
  appResults.sort(function (a, b) { return a.latency - b.latency; });

  if (appResults.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("【📱 应用策略推荐】");
    appResults.forEach(function (r) {
      lines.push(r.icon + " " + r.name + " ➟ " + r.target + " (" + r.latency + "ms)");
    });
  }

  // 无结果的
  var noResult = [];
  SERVER_GROUPS.forEach(function (g) {
    if (!serverBest[g.name]) noResult.push(g.flag + " " + g.short);
  });
  APP_GROUPS.forEach(function (g) {
    if (!appBest[g.name]) noResult.push(g.icon + " " + g.name);
  });
  if (noResult.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("【⚠️ 待检测】");
    lines.push(noResult.join("、"));
  }

  var totalOk = serverResults.length + appResults.length;
  var totalAll = SERVER_GROUPS.length + APP_GROUPS.length;
  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var color = totalOk >= 18 ? "#34C759" : (totalOk >= 10 ? "#FF9500" : "#FF3B30");

  $done({
    title: "⚡ 节点推荐 " + totalOk + "/" + totalAll,
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

  // 2. 触发所有地区组测速
  for (var i = 0; i < SERVER_GROUPS.length; i++) {
    await httpAPI("/v1/policy_groups/test", "POST", { group_name: SERVER_GROUPS[i].name });
  }

  // 3. 等待测速完成
  await new Promise(function (r) { setTimeout(r, 20000); });

  // 4. 获取benchmark结果
  var benchmark = await httpAPI("/v1/policies/benchmark_results");

  var serverBest = {};
  var appBest = {};

  if (benchmark && typeof benchmark === "object") {

    // ===== 处理地区节点组：找出每组最快节点 =====
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

      serverBest[g.name] = best;
    });

    // ===== 处理应用策略组：找出每组最快子组 =====
    APP_GROUPS.forEach(function (g) {
      var groupItems = policyGroups[g.name];
      if (!groupItems || !Array.isArray(groupItems)) return;

      var best = null;
      groupItems.forEach(function (item) {
        // item可能是节点（有lineHash），也可能是子组（没有lineHash）
        if (item.lineHash) {
          // 是具体节点
          var result = benchmark[item.lineHash];
          if (!result) return;
          var delay = result.lastTestScoreInMS;
          if (delay && delay > 0 && delay < 6000) {
            if (!best || delay < best.latency) {
              best = { target: item.name, latency: delay };
            }
          }
        } else if (item.name) {
          // 是子组，去子组里找最快节点
          var subGroup = policyGroups[item.name];
          if (!subGroup || !Array.isArray(subGroup)) return;

          var subBest = null;
          subGroup.forEach(function (node) {
            if (!node.lineHash) return;
            var result = benchmark[node.lineHash];
            if (!result) return;
            var delay = result.lastTestScoreInMS;
            if (delay && delay > 0 && delay < 6000) {
              if (!subBest || delay < subBest.latency) {
                subBest = { latency: delay };
              }
            }
          });

          if (subBest) {
            if (!best || subBest.latency < best.latency) {
              best = { target: item.name, latency: subBest.latency };
            }
          }
        }
      });

      appBest[g.name] = best;
    });
  }

  render({ serverBest: serverBest, appBest: appBest });
})()["catch"](function (e) {
  render({ error: String(e) });
});
