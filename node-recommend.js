// ============================================
// 节点测速推荐面板 v1（Surge）
// 功能：
//   1. 自动识别所有节点与策略组
//   2. 用策略组的测速地址（generate_204）对每个节点实测延迟（每个节点只测一次，并发）
//   3. 为每个地区组 / 功能组推荐最快节点
//   4. 解析每个应用组当前链路，给出最终落地节点与推荐
// 健壮性：全局超时兜底、单节点失败不影响整体、必定 $done
// ============================================

var TEST_URL = "http://www.gstatic.com/generate_204";
var CONCURRENCY = 20;       // 测速并发
var NODE_TIMEOUT = 3;       // 单节点超时（秒）
var GLOBAL_DEADLINE = 50000; // 全局兜底（毫秒）

// 需要测速并推荐的“节点组”（含具体节点的 url-test 组）
var SERVER_GROUPS = [
  { name: "香港节点",    flag: "🇭🇰", short: "香港" },
  { name: "美国节点",    flag: "🇺🇸", short: "美国" },
  { name: "日本节点",    flag: "🇯🇵", short: "日本" },
  { name: "台湾节点",    flag: "🇹🇼", short: "台湾" },
  { name: "新加坡节点",  flag: "🇸🇬", short: "新加坡" },
  { name: "🤖 AI解锁",   flag: "🤖", short: "AI" },
  { name: "⚙️ 我的节点", flag: "📱", short: "我的" }
];

// 需要展示链路推荐的“应用组”（select 组）
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

// ---------- 单节点测速 ----------
function measureNode(nodeName) {
  return new Promise(function (resolve) {
    var start = Date.now();
    try {
      $httpClient.head({
        url: TEST_URL,
        policy: nodeName,
        timeout: NODE_TIMEOUT,
        "auto-redirect": true
      }, function (error, response) {
        var elapsed = Date.now() - start;
        var status = response && response.status;
        if (!error && (status === 204 || status === 200)) {
          resolve({ node: nodeName, ok: true, latency: elapsed });
        } else {
          resolve({ node: nodeName, ok: false, latency: -1 });
        }
      });
    } catch (e) {
      resolve({ node: nodeName, ok: false, latency: -1 });
    }
  });
}

// 并发池：每个节点只测一次
function measureAll(nodes) {
  return new Promise(function (resolve) {
    var map = {};
    var cursor = 0;
    var active = 0;
    var done = false;

    function finish() { if (done) return; done = true; resolve(map); }

    function pump() {
      while (active < CONCURRENCY && cursor < nodes.length) {
        var node = nodes[cursor++];
        active++;
        measureNode(node).then(function (r) {
          map[r.node] = r;   // 用结果自带的节点名，避免 var 闭包共享
          active--;
          if (cursor >= nodes.length && active === 0) finish();
          else pump();
        });
      }
    }
    if (!nodes.length) finish();
    else pump();
  });
}

// 递归收集某组包含的全部具体节点（展开 isGroup）
function collectNodes(groupName, policyGroups, seen, depth) {
  if (depth > 6) return [];
  var arr = policyGroups[groupName] || [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (item.isGroup) {
      out = out.concat(collectNodes(item.name, policyGroups, seen, depth + 1));
    } else if (!seen[item.name]) {
      seen[item.name] = true;
      out.push(item.name);
    }
  }
  return out;
}

// 组内最快节点
function bestOf(nodes, latencyMap) {
  var best = null;
  for (var i = 0; i < nodes.length; i++) {
    var r = latencyMap[nodes[i]];
    if (r && r.ok && (!best || r.latency < best.latency)) {
      best = { node: nodes[i], latency: r.latency };
    }
  }
  return best;
}

// 递归追踪应用组当前链路 → 最终落地节点
function traceApp(groupName, policyGroups, latencyMap, groupBest, depth) {
  if (depth > 8) return Promise.resolve(null);
  return httpAPI("GET", "v1/policy_groups/select?group_name=" + encodeURIComponent(groupName))
    .then(function (sel) {
      if (!sel || !sel.policy) return null;
      var p = sel.policy;
      if (p === "DIRECT") return { final: "DIRECT", latency: 0, via: "直连" };
      if (p.indexOf("REJECT") === 0) return { final: p, latency: -1, via: p };

      // 指向另一个组
      if (policyGroups[p]) {
        if (groupBest[p]) {
          return { final: groupBest[p].node, latency: groupBest[p].latency, via: p };
        }
        return traceApp(p, policyGroups, latencyMap, groupBest, depth + 1)
          .then(function (sub) {
            return sub ? { final: sub.final, latency: sub.latency, via: p + "→" + sub.via } : null;
          });
      }
      // 指向具体节点
      var r = latencyMap[p];
      return { final: p, latency: r && r.ok ? r.latency : -1, via: p };
    });
}

// ---------- 主流程 ----------
var finished = false;
var startTs = Date.now();

function render(data) {
  if (finished) return;
  finished = true;
  data = data || {};
  var latencyMap = data.latencyMap || {};
  var groupBest = data.groupBest || {};
  var groupNodes = data.groupNodes || {};
  var appTrace = data.appTrace || {};
  var policyGroups = data.policyGroups || {};

  var totalNodes = Object.keys(latencyMap).length;
  var okNodes = 0;
  Object.keys(latencyMap).forEach(function (n) {
    if (latencyMap[n].ok) okNodes++;
  });

  var lines = [];

  // 全局最快
  var globalBest = groupBest["⚡ 全网最优"] || bestOf(Object.keys(latencyMap), latencyMap);

  lines.push("【地区组推荐】");
  SERVER_GROUPS.forEach(function (g) {
    var b = groupBest[g.name];
    if (b) {
      lines.push(g.flag + " " + g.short + " ➟ " + b.node + " (" + b.latency + "ms)");
    } else {
      lines.push(g.flag + " " + g.short + " ➟ 无可用节点");
    }
  });
  if (globalBest) {
    lines.push("⚡ 全网最优 ➟ " + globalBest.node + " (" + globalBest.latency + "ms)");
  }

  lines.push("");
  lines.push("【应用组当前链路】");
  APP_GROUPS.forEach(function (g) {
    var t = appTrace[g];
    if (!t) {
      lines.push("• " + g + " ➟ 无法获取");
    } else if (t.final === "DIRECT") {
      lines.push("• " + g + " ➟ 直连");
    } else if (t.latency >= 0) {
      // 精简节点名（去掉flag和冗长前缀）
      var short = t.final;
      lines.push("• " + g + " ➟ " + short + " (" + t.latency + "ms)");
    } else {
      lines.push("• " + g + " ➟ " + t.final + " (超时)");
    }
  });

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var allHealthy = totalNodes > 0 && okNodes === totalNodes;
  $done({
    title: "⚡ 节点推荐 " + okNodes + "/" + totalNodes + " 可用",
    content: lines.join("\n") + "\n\n测速耗时 " + elapsed + "s · 共" + totalNodes + "节点",
    icon: "speedometer",
    "icon-color": allHealthy ? "#34C759" : "#5856D6"
  });
}

// 全局兜底
setTimeout(function () { render(null); }, GLOBAL_DEADLINE);

(async function () {
  // 1. 所有策略组结构
  var policyGroups = await httpAPI("GET", "v1/policy_groups");
  if (!policyGroups) return render(null);

  // 2. 收集各节点组的节点
  var groupNodes = {};
  var globalSeen = {};
  var allNodes = [];
  SERVER_GROUPS.forEach(function (g) {
    var seen = {};
    var nodes = collectNodes(g.name, policyGroups, seen, 0);
    groupNodes[g.name] = nodes;
    nodes.forEach(function (n) {
      if (!globalSeen[n]) { globalSeen[n] = true; allNodes.push(n); }
    });
  });

  // 3. 并发实测全部节点
  var latencyMap = await measureAll(allNodes);

  // 4. 各节点组最快
  var groupBest = {};
  SERVER_GROUPS.forEach(function (g) {
    groupBest[g.name] = bestOf(groupNodes[g.name], latencyMap);
  });
  // 全网最优 = 全部节点最快
  groupBest["⚡ 全网最优"] = bestOf(allNodes, latencyMap);

  // 5. 应用组链路追踪
  var appTrace = {};
  for (var i = 0; i < APP_GROUPS.length; i++) {
    var g = APP_GROUPS[i];
    appTrace[g] = await traceApp(g, policyGroups, latencyMap, groupBest, 0);
  }

  render({
    latencyMap: latencyMap, groupBest: groupBest,
    groupNodes: groupNodes, appTrace: appTrace, policyGroups: policyGroups
  });
})()["catch"](function () { render(null); });
