// ============================================
// 节点测速推荐面板 v4.0（修正API参数版）
// 修正：httpAPI参数顺序为 (path, method, body)
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

var APP_GROUPS = [
  "主节点", "谷歌服务", "油管视频", "奈飞视频", "电报信息", "推特X",
  "GitHub", "AI服务", "TikTok短视频", "Emby影院", "微软服务",
  "游戏服务", "动漫漫画", "GameBus视频网站", "哔哩哔哩"
];

// ---------- HTTP API（正确参数顺序：path, method, body）----------
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
  var appTrace = data.appTrace || {};

  var lines = [];

  lines.push("【地区组推荐】");
  SERVER_GROUPS.forEach(function (g) {
    var b = groupBest[g.name];
    if (b) lines.push(g.flag + " " + g.short + " ➟ " + b.node + " (" + b.latency + "ms)");
    else lines.push(g.flag + " " + g.short + " ➟ 无可用节点");
  });

  lines.push("");
  lines.push("【应用组当前链路】");
  APP_GROUPS.forEach(function (g) {
    var t = appTrace[g];
    if (!t) {
      lines.push("• " + g + " ➟ 无法获取");
    } else if (t.final === "DIRECT") {
      lines.push("• " + g + " ➟ 直连");
    } else {
      lines.push("• " + g + " ➟ " + t.final);
    }
  });

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var hasResult = Object.keys(appTrace).length > 0;
  var color = hasResult ? "#34C759" : "#FF9500";

  $done({
    title: "⚡ 节点推荐",
    content: lines.join("\n") + "\n\n测速耗时 " + elapsed + "s",
    icon: "speedometer",
    "icon-color": color
  });
}

// 全局兜底
setTimeout(function () { render(null); }, 60000);

(async function () {
  // 1. 获取所有策略组
  var allGroups = await httpAPI("/v1/policy_groups");
  if (!allGroups) return render(null);

  // 2. 触发所有地区组测速
  for (var i = 0; i < SERVER_GROUPS.length; i++) {
    await httpAPI("/v1/policy_groups/test", "POST", { group_name: SERVER_GROUPS[i].name });
  }

  // 3. 等待测速完成
  await new Promise(function (r) { setTimeout(r, 10000); });

  // 4. 获取测速结果
  var testResults = await httpAPI("/v1/policy_groups/test_results");

  // 5. 解析每个组的最快节点
  var groupBest = {};
  if (testResults && typeof testResults === "object") {
    SERVER_GROUPS.forEach(function (g) {
      var groupResult = testResults[g.name];
      if (groupResult && Array.isArray(groupResult)) {
        var best = null;
        groupResult.forEach(function (item) {
          if (item.alive && (!best || item.delay < best.delay)) {
            best = { node: item.name, latency: item.delay };
          }
        });
        groupBest[g.name] = best;
      }
    });
  }

  // 6. 获取应用组当前链路
  var appTrace = {};
  for (var j = 0; j < APP_GROUPS.length; j++) {
    var sel = await httpAPI("/v1/policy_groups/select?group_name=" + encodeURIComponent(APP_GROUPS[j]));
    if (sel && sel.policy) {
      appTrace[APP_GROUPS[j]] = { final: sel.policy };
    }
  }

  render({ groupBest: groupBest, appTrace: appTrace });
})()["catch"](function (e) {
  render({ error: String(e) });
});
