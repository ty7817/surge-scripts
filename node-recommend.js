// ============================================
// 节点测速推荐面板 v3.0（Surge原生API版）
// 功能：
//   1. 用Surge原生API测试策略组延迟
//   2. 为每个地区组推荐最快节点
//   3. 解析每个应用组当前链路
// 改进：
//   - 用 /v1/policy_groups/test API，不是逐个HTTP请求
//   - 更稳定，不会全部超时
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

// ---------- HTTP API ----------
function httpAPI(method, path, body) {
  return new Promise(function (resolve) {
    try {
      $httpAPI(method, path, body || {}, function (result) { resolve(result); });
    } catch (e) { resolve(null); }
  });
}

// ---------- 触发策略组测速 ----------
function testGroup(groupName) {
  return httpAPI("POST", "/v1/policy_groups/test", { group_name: groupName });
}

// ---------- 获取测速结果 ----------
function getTestResults() {
  return httpAPI("GET", "/v1/policy_groups/test_results");
}

// ---------- 获取策略组当前选择 ----------
function getSelect(groupName) {
  return httpAPI("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(groupName));
}

// ---------- 获取所有策略组 ----------
function getAllGroups() {
  return httpAPI("GET", "/v1/policy_groups");
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
    } else if (t.final === "REJECT") {
      lines.push("• " + g + " ➟ 拦截");
    } else {
      lines.push("• " + g + " ➟ " + t.final);
    }
  });

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var hasResult = Object.keys(groupBest).length > 0;
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
  var allGroups = await getAllGroups();
  if (!allGroups || !Array.isArray(allGroups)) return render(null);

  // 2. 触发所有地区组测速
  for (var i = 0; i < SERVER_GROUPS.length; i++) {
    await testGroup(SERVER_GROUPS[i].name);
  }

  // 3. 等待测速完成（给10秒）
  await new Promise(function (r) { setTimeout(r, 10000); });

  // 4. 获取测速结果
  var testResults = await getTestResults();

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
    var sel = await getSelect(APP_GROUPS[j]);
    if (sel && sel.policy) {
      appTrace[APP_GROUPS[j]] = { final: sel.policy };
    }
  }

  render({ groupBest: groupBest, appTrace: appTrace });
})()["catch"](function () { render(null); });
