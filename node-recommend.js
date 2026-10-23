// ============================================
// 节点测速推荐面板 v2（Surge）
// 功能：
//   1. 自动识别所有节点与策略组
//   2. 对每个节点实测延迟（每个节点只测一次，并发，多测速URL容错）
//   3. 为每个地区组 / 功能组推荐最快节点
//   4. 解析每个应用组当前链路，给出最终落地节点
// 健壮性：
//   - 多个测速地址依次容错（主地址失败自动换备用，避免单一站点被墙）
//   - 全局超时兜底、单节点失败不影响整体、必定 $done
//   - 面板底部给出失败原因诊断统计
// ============================================

// 测速地址（按优先级；任一返回 204/2xx 即视为可用）
// 首选 Cloudflare（你配置里的 proxy-test-url，全球最稳，不依赖 Google）
var TEST_URLS = [
  "http://cp.cloudflare.com/generate_204",
  "http://www.gstatic.com/generate_204",
  "http://www.google.com/generate_204",
  "http://www.apple.com/library/test/success.html"
];
var CONCURRENCY = 12;        // 测速并发（Surge 单脚本上限20，留余量）
var NODE_TIMEOUT = 5;        // 单节点单次请求超时（秒）
var GLOBAL_DEADLINE = 55000; // 全局兜底（毫秒）

// 需要测速并推荐的“节点组”
var SERVER_GROUPS = [
  { name: "香港节点",    flag: "🇭🇰", short: "香港" },
  { name: "美国节点",    flag: "🇺🇸", short: "美国" },
  { name: "日本节点",    flag: "🇯🇵", short: "日本" },
  { name: "台湾节点",    flag: "🇹🇼", short: "台湾" },
  { name: "新加坡节点",  flag: "🇸🇬", short: "新加坡" },
  { name: "🤖 AI解锁",   flag: "🤖", short: "AI" },
  { name: "⚙️ 我的节点", flag: "📱", short: "我的" }
];

// 需要展示链路的“应用组”
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

// ---------- 单次 HEAD 请求 ----------
function headOnce(nodeName, url) {
  return new Promise(function (resolve) {
    var start = Date.now();
    try {
      $httpClient.head({
        url: url,
        policy: nodeName,
        timeout: NODE_TIMEOUT,
        "auto-redirect": false,
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
      }, function (error, response) {
        var status = response && response.status;
        resolve({ error: error ? String(error) : null, status: status || 0, latency: Date.now() - start });
      });
    } catch (e) {
      resolve({ error: String(e), status: 0, latency: Date.now() - start });
    }
  });
}

// 失败原因归类
function classifyReason(error, status) {
  if (status && status >= 400) return "HTTP" + status;
  if (error) {
    if (/timeout|timed out|超时/i.test(error)) return "超时";
    if (/unknown policy|invalid policy|not found|no such policy|不存在|未找到/i.test(error)) return "策略错误";
    if (/refused|reset|closed|eof|connect/i.test(error)) return "连接错误";
    return "其他错误";
  }
  return "无响应";
}

// ---------- 单节点测速（多 URL 容错）----------
function measureNode(nodeName) {
  var chain = Promise.resolve(null);
  TEST_URLS.forEach(function (url) {
    chain = chain.then(function (prev) {
      if (prev && prev.ok) return prev;
      return headOnce(nodeName, url).then(function (r) {
        var good = !r.error && (r.status === 204 || (r.status >= 200 && r.status < 400));
        if (good) {
          return { node: nodeName, ok: true, latency: r.latency, reason: "" };
        }
        // 记录最后一次失败原因，继续尝试下一个 URL
        return { node: nodeName, ok: false, latency: -1, reason: classifyReason(r.error, r.status) };
      });
    });
  });
  return chain;
}

// ---------- 并发池：每个节点只测一次 ----------
function measureAll(nodes) {
  return new Promise(function (resolve) {
    var map = {};
    var cursor = 0, active = 0, settled = false;
    function finish() { if (!settled) { settled = true; resolve(map); } }
    function pump() {
      while (active < CONCURRENCY && cursor < nodes.length) {
        var target = nodes[cursor++];
        active++;
        measureNode(target).then(function (r) {
          map[r.node] = r;
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

// ---------- 递归收集组内全部具体节点 ----------
function collectNodes(groupName, policyGroups, seen, depth) {
  if (depth > 6) return [];
  var arr = policyGroups[groupName] || [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (item.isGroup) {
      out = out.concat(collectNodes(item.name, policyGroups, seen, depth + 1));
    } else if (item.name && !seen[item.name]) {
      seen[item.name] = true;
      out.push(item.name);
    }
  }
  return out;
}

// ---------- 组内最快节点 ----------
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

// ---------- 递归追踪应用组当前链路 ----------
function traceApp(groupName, policyGroups, groupBest, depth) {
  if (depth > 8) return Promise.resolve(null);
  return httpAPI("GET", "v1/policy_groups/select?group_name=" + encodeURIComponent(groupName))
    .then(function (sel) {
      if (!sel || !sel.policy) return null;
      var p = sel.policy;
      if (p === "DIRECT") return { final: "DIRECT", latency: 0, via: "直连" };
      if (p.indexOf("REJECT") === 0) return { final: p, latency: -1, via: p };
      if (policyGroups[p]) {
        if (groupBest[p]) return { final: groupBest[p].node, latency: groupBest[p].latency, via: p };
        return traceApp(p, policyGroups, groupBest, depth + 1).then(function (sub) {
          return sub ? { final: sub.final, latency: sub.latency, via: p + "→" + sub.via } : null;
        });
      }
      // 具体节点：延迟从 groupBest 无法直接取，标记为 -1（由渲染层补）
      return { final: p, latency: -2, via: p };
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

  var totalNodes = Object.keys(latencyMap).length;
  var okNodes = 0;
  var reasonStats = {};
  Object.keys(latencyMap).forEach(function (n) {
    var r = latencyMap[n];
    if (r.ok) okNodes++;
    else reasonStats[r.reason || "未知"] = (reasonStats[r.reason || "未知"] || 0) + 1;
  });

  var lines = [];

  lines.push("【地区组推荐】");
  SERVER_GROUPS.forEach(function (g) {
    var b = groupBest[g.name];
    if (b) lines.push(g.flag + " " + g.short + " ➟ " + b.node + " (" + b.latency + "ms)");
    else lines.push(g.flag + " " + g.short + " ➟ 无可用节点");
  });
  var globalBest = groupBest["⚡ 全网最优"];
  if (globalBest) lines.push("⚡ 全网最优 ➟ " + globalBest.node + " (" + globalBest.latency + "ms)");

  lines.push("");
  lines.push("【应用组当前链路】");
  APP_GROUPS.forEach(function (g) {
    var t = appTrace[g];
    if (!t) {
      lines.push("• " + g + " ➟ 无法获取");
    } else if (t.final === "DIRECT") {
      lines.push("• " + g + " ➟ 直连");
    } else {
      // 若落地是具体节点，尝试从 latencyMap 补延迟
      var lat = t.latency;
      var r = latencyMap[t.final];
      if (lat === -2 && r) lat = r.ok ? r.latency : -1;
      if (lat >= 0) lines.push("• " + g + " ➟ " + t.final + " (" + lat + "ms)");
      else lines.push("• " + g + " ➟ " + t.final + " (超时)");
    }
  });

  // 诊断统计
  if (okNodes < totalNodes) {
    lines.push("");
    lines.push("【失败诊断】");
    Object.keys(reasonStats).forEach(function (k) {
      lines.push(k + " ×" + reasonStats[k]);
    });
  }

  var elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  var ratio = totalNodes ? okNodes / totalNodes : 0;
  var color = ratio === 1 ? "#34C759" : (ratio >= 0.5 ? "#FF9500" : "#FF3B30");
  $done({
    title: "⚡ 节点推荐 " + okNodes + "/" + totalNodes + " 可用",
    content: lines.join("\n") + "\n\n测速耗时 " + elapsed + "s · 共" + totalNodes + "节点",
    icon: "speedometer",
    "icon-color": color
  });
}

// 全局兜底
setTimeout(function () { render(null); }, GLOBAL_DEADLINE);

(async function () {
  var policyGroups = await httpAPI("GET", "v1/policy_groups");
  if (!policyGroups) return render(null);

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

  var latencyMap = await measureAll(allNodes);

  var groupBest = {};
  SERVER_GROUPS.forEach(function (g) {
    groupBest[g.name] = bestOf(groupNodes[g.name], latencyMap);
  });
  groupBest["⚡ 全网最优"] = bestOf(allNodes, latencyMap);

  var appTrace = {};
  for (var i = 0; i < APP_GROUPS.length; i++) {
    appTrace[APP_GROUPS[i]] = await traceApp(APP_GROUPS[i], policyGroups, groupBest, 0);
  }

  render({
    latencyMap: latencyMap, groupBest: groupBest,
    groupNodes: groupNodes, appTrace: appTrace
  });
})()["catch"](function () { render(null); });
