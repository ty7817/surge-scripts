// TG/X 实时面板 v2：自动探测分组名 + 宽松阈值，打开面板即测速
var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";
var HDR = { "X-Key": KEY, "Content-Type": "application/json" };

var TG_URL = "https://api.telegram.org/";
var X_URL = "https://abs.twimg.com/favicon.ico";

var TG_PAT = /📡\s*Telegram|Telegram\s*专线|电报信息|电报加速|TG\s*专线/i;
var X_PAT = /🐦\s*X|X\s*专线|推特|Twitter|🐦/i;

var REGIONS = [
  ["香港节点", /🇭🇰|香港|Hong ?Kong|\bHK\b/i],
  ["日本节点", /🇯🇵|日本|Japan|东京|大阪|\bJP\b/i],
  ["新加坡节点", /🇸🇬|新加坡|狮城|Singapore|\bSG\b/i],
  ["美国节点", /🇺🇸|美国|United ?States|America|\bUS\b|\bUSA\b/i],
  ["台湾节点", /🇹🇼|台湾|臺灣|Taiwan|\bTW\b/i],
  ["韩国节点", /🇰🇷|韩国|南韩|Korea|\bKR\b/i]
];

var MAX_OK_MS = 5000;
var IMPROVE_RATIO = 0.85;
var ERR = null;

function j(d) { try { return JSON.parse(d); } catch (e) { return null; } }

function api(method, path, body, cb) {
  var opt = { url: API + path, headers: HDR, timeout: 15 };
  if (body) opt.body = JSON.stringify(body);
  var fn = method === "POST"
    ? function (o, c) { $httpClient.post(o, c); }
    : function (o, c) { $httpClient.get(o, c); };
  fn(opt, function (err, resp, data) {
    if (err) { if (!ERR) ERR = (err && err.error) ? err.error : String(err); return cb(null); }
    var st = resp && resp.status ? resp.status : 0;
    if (st >= 400) { if (!ERR) ERR = "HTTP " + st; return cb(null); }
    cb(typeof data === "string" ? j(data) : data);
  });
}

// 解析 /v1/policy_groups：兼容数组/字典/嵌套
function parseGroups(o) {
  var out = [];
  if (!o) return out;
  var list = null;
  if (Array.isArray(o)) list = o;
  else if (Array.isArray(o.groups)) list = o.groups;
  else if (Array.isArray(o.data)) list = o.data;
  else if (Array.isArray(o.policy_groups)) list = o.policy_groups;
  if (list) {
    list.forEach(function (it) {
      if (!it) return;
      var name = it.name || it.group_name || it.policy_name;
      var opts = it.policies || it.options || it.proxies || it.members || it.list || [];
      if (name) out.push({ name: name, options: opts, type: it.type || "" });
    });
    return out;
  }
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    if (Array.isArray(v)) out.push({ name: k, options: v, type: "" });
    else if (v && typeof v === "object") {
      var opts = v.policies || v.options || v.proxies || v.members || [];
      out.push({ name: k, options: opts, type: v.type || "" });
    }
  });
  return out;
}

function strOptions(g) {
  if (!g || !g.options) return [];
  if (Array.isArray(g.options)) {
    return g.options.map(function (x) { return typeof x === "string" ? x : (x && (x.name || x.policy)); }).filter(Boolean);
  }
  return [];
}

function findGroup(groups, pat) {
  var i;
  for (i = 0; i < groups.length; i++) {
    if (pat.test(groups[i].name) && strOptions(groups[i]).length >= 2) return groups[i];
  }
  return null;
}

function parseTest(o) {
  var out = {};
  if (!o) return out;
  function take(n, ms) { if (n && isFinite(Number(ms)) && Number(ms) > 0) out[n] = Number(ms); }
  var arr = Array.isArray(o) ? o : (Array.isArray(o.results) ? o.results : (Array.isArray(o.data) ? o.data : null));
  if (arr) {
    arr.forEach(function (it) { if (it) take(it.policy || it.name || it.policy_name, it.latency != null ? it.latency : (it.time != null ? it.time : it.delay)); });
    return out;
  }
  var map = o.results || o.latency || o.data || o;
  if (map && typeof map === "object") {
    Object.keys(map).forEach(function (k) {
      var v = map[k];
      if (v && typeof v === "object") take(k, v.latency != null ? v.latency : (v.time != null ? v.time : v.delay));
      else take(k, v);
    });
  }
  return out;
}

function test(names, url, cb) {
  api("POST", "/v1/policies/test", { policy_names: names, url: url }, function (o) { cb(parseTest(o)); });
}

function pick(res, allowed) {
  var best = null;
  Object.keys(res || {}).forEach(function (k) {
    if (allowed && allowed.indexOf(k) < 0) return;
    var ms = res[k];
    if (ms <= 0 || ms > MAX_OK_MS) return;
    if (!best || ms < best.ms) best = { name: k, ms: ms };
  });
  return best;
}

function regionOf(name) {
  for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i][1].test(name)) return REGIONS[i][0];
  return null;
}

function nodeCandidates(url, allowed, cb) {
  api("GET", "/v1/policies", null, function (o) {
    var list = Array.isArray(o) ? o : (o && (o.policies || o.data) || []);
    var names = [];
    list.forEach(function (it) {
      var n = typeof it === "string" ? it : (it && (it.name || it.policy_name));
      if (!n) return;
      if (allowed && allowed.indexOf(n) < 0) return;
      if (names.indexOf(n) < 0) names.push(n);
    });
    if (!names.length) return cb(null);
    test(names.slice(0, 14), url, function (res) { cb(pick(res, null)); });
  });
}

function currentOf(group, cb) {
  api("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(group), null, function (o) {
    cb(o && o.policy ? o.policy : null);
  });
}

function describe(g, current, best, res) {
  if (!best) return g.name + "　测速无结果";
  var ms = Math.round(best.ms);
  if (!current) return g.name + "：未选择 → " + best.name + "　" + ms + "ms";
  if (current === best.name) return g.name + "：" + best.name + "　" + ms + "ms　已最优";
  var curMs = res[current];
  if (curMs && curMs <= MAX_OK_MS && best.ms > curMs * IMPROVE_RATIO)
    return g.name + "：" + current + "　" + Math.round(curMs) + "ms　无需切";
  return g.name + "：" + current + " → " + best.name + "　" + ms + "ms";
}

function runSide(g, url, label, cb) {
  var opts = strOptions(g).slice(0, 12);
  var allNames = strOptions(g);
  test(opts, url, function (res) {
    var best = pick(res, allNames);
    currentOf(g.name, function (cur) {
      var finish = function (b) {
        if (b && (!cur || b.name !== cur)) {
          var curMs = res[cur];
          var should = !cur || !curMs || curMs > MAX_OK_MS || b.ms <= curMs * IMPROVE_RATIO;
          if (should && allNames.indexOf(b.name) >= 0) {
            api("POST", "/v1/policy_groups/select", { group_name: g.name, policy: b.name }, function () {});
          }
        }
        cb(describe(g, cur, b, res));
      };
      if (!best && !ERR) {
        return nodeCandidates(url, allNames, function (b) {
          if (b) {
            var r = regionOf(b.name);
            b = r ? { name: r, ms: b.ms } : b;
          }
          finish(b);
        });
      }
      finish(best);
    });
  });
}

(function main() {
  api("GET", "/v1/policy_groups", null, function (o) {
    var groups = parseGroups(o);
    var tg = findGroup(groups, TG_PAT);
    var x = findGroup(groups, X_PAT);
    if (ERR && !tg && !x) {
      $done({
        title: "TG / X 智能选路",
        content: "❌ 本机 API 无响应：" + ERR + "\n检查 profile 里 http-api 是否开启",
        icon: "exclamationmark.triangle",
        "icon-color": "#FF3B30"
      });
      return;
    }
    if (!tg && !x) {
      $done({
        title: "TG / X 智能选路",
        content: "❌ 没找到 Telegram / X 相关分组（共 " + groups.length + " 个组）\n请先导入新版 profile",
        icon: "exclamationmark.triangle",
        "icon-color": "#FF3B30"
      });
      return;
    }
    var first = !tg ? "Telegram：未找到分组" : null;
    var task = function (next) {
      if (!tg) { return next(); }
      runSide(tg, TG_URL, "TG", function (t) { first = t; next(); });
    };
    task(function () {
      if (!x) {
        return $done({ title: "TG / X 智能选路", content: first + "\nX：未找到分组", icon: "bolt.horizontal.circle", "icon-color": "#FF9500" });
      }
      runSide(x, X_URL, "X", function (xText) {
        if (ERR) {
          return $done({ title: "TG / X 智能选路", content: "❌ 本机 API 异常：" + ERR, icon: "exclamationmark.triangle", "icon-color": "#FF3B30" });
        }
        $done({
          title: "TG / X 智能选路",
          content: first + "\n" + xText,
          icon: "bolt.horizontal.circle",
          "icon-color": "#FF9500"
        });
      });
    });
  });
})();
