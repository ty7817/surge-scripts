// TG/X 专线自动优选（Surge 模块脚本）
// 思路：通过本机 HTTP API，用 telegram / twitter 的真实地址给「地区组」测速，
// 把「📡 Telegram 专线」「🐦 X 专线」切到最快的地区组（这两个组的成员就是地区组）。
// 只切换已有 select 组，不改任何规则与分组定义。

var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";
var HDR = { "X-Key": KEY, "Content-Type": "application/json" };

var TG_URL = "https://api.telegram.org/";
var X_URL = "https://abs.twimg.com/favicon.ico";
var TG_GROUP = "📡 Telegram 专线";
var X_GROUP = "🐦 X 专线";

// 组名 -> 节点名匹配
var REGIONS = [
  ["香港节点", /🇭🇰|香港|HK|Hong ?Kong/i],
  ["日本节点", /🇯🇵|日本|JP|Japan|东京|大阪/i],
  ["新加坡节点", /🇸🇬|新加坡|狮城|SG|Singapore/i],
  ["美国节点", /🇺🇸|美国|US|USA|United ?States|America/i],
  ["台湾节点", /🇹🇼|台湾|臺灣|TW|Taiwan/i],
  ["韩国节点", /🇰🇷|韩国|南韩|KR|Korea/i]
];

var TG_REGIONS = ["香港节点", "日本节点", "新加坡节点", "美国节点", "台湾节点", "韩国节点"];
var X_REGIONS = ["香港节点", "日本节点", "新加坡节点", "美国节点"];

var IMPROVE_RATIO = 0.85;   // 新组要比当前快 15% 才切
var MAX_OK_MS = 600;        // 超过 600ms 视为不可用，不切
var MIN_SWITCH_MS = 0;

function apiGet(path, cb) {
  $httpClient.get({ url: API + path, headers: HDR }, function (err, resp, data) {
    cb(err, resp, data);
  });
}

function apiPost(path, obj, cb) {
  $httpClient.post({ url: API + path, headers: HDR, body: JSON.stringify(obj) }, function (err, resp, data) {
    cb(err, resp, data);
  });
}

function j(data) {
  try { return JSON.parse(data); } catch (e) { return null; }
}

// /v1/policies/test 的返回格式未公开，做多种兼容
function parseResults(data) {
  var o = j(data);
  if (!o) return {};
  var out = {};
  function take(name, ms) {
    if (!name) return;
    ms = Number(ms);
    if (isFinite(ms) && ms > 0) out[name] = ms;
  }
  var arr = null;
  if (Array.isArray(o)) arr = o;
  else if (Array.isArray(o.results)) arr = o.results;
  else if (Array.isArray(o.data)) arr = o.data;
  if (arr) {
    arr.forEach(function (it) {
      if (!it) return;
      take(it.policy || it.name || it.policy_name,
           it.latency != null ? it.latency : (it.time != null ? it.time : it.delay));
    });
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

function regionOf(name) {
  for (var i = 0; i < REGIONS.length; i++) {
    if (REGIONS[i][1].test(name)) return REGIONS[i][0];
  }
  return null;
}

function bestOf(results, allowed) {
  var best = null;
  Object.keys(results).forEach(function (k) {
    if (allowed && allowed.indexOf(k) < 0) return;
    var ms = results[k];
    if (ms <= 0 || ms > MAX_OK_MS) return;
    if (!best || ms < best.ms) best = { name: k, ms: ms };
  });
  return best;
}

function testPolicies(names, url, cb) {
  apiPost("/v1/policies/test", { policy_names: names, url: url }, function (err, resp, data) {
    if (err) return cb(err, null);
    cb(null, parseResults(data));
  });
}

function readCurrent(group, cb) {
  apiGet("/v1/policy_groups/select?group_name=" + encodeURIComponent(group), function (err, resp, data) {
    var o = j(data);
    cb(o && o.policy ? o.policy : null);
  });
}

function switchGroup(group, policy, cb) {
  apiPost("/v1/policy_groups/select", { group_name: group, policy: policy }, function (err, resp, data) {
    cb(!err);
  });
}

// 组测速失败时，退化为按节点测速再映射地区组
function fallbackByNodes(url, allowedRegions, cb) {
  apiGet("/v1/policies", function (err, resp, data) {
    var o = j(data);
    if (!o) return cb(null, null);
    var list = Array.isArray(o) ? o : (o.policies || o.data || []);
    var names = [];
    list.forEach(function (it) {
      var n = typeof it === "string" ? it : (it && (it.name || it.policy_name));
      if (!n) return;
      var r = regionOf(n);
      if (r && allowedRegions.indexOf(r) >= 0 && names.indexOf(n) < 0) names.push(n);
    });
    if (!names.length) return cb(null, null);
    names = names.slice(0, 14);
    testPolicies(names, url, function (e, res) {
      if (e) return cb(null, null);
      var best = bestOf(res, null);
      if (!best) return cb(null, null);
      var region = regionOf(best.name);
      cb(region ? { name: region, ms: best.ms, node: best.name } : null);
    });
  });
}

function runOne(groupName, regions, url, storeKey, cb) {
  readCurrent(groupName, function (current) {
    testPolicies(regions.slice(), url, function (err, res) {
      var done = function (best) {
        if (!best) {
          $persistentStore.write("", storeKey + "_ms");
          $persistentStore.write(current || "", storeKey + "_cur");
          return cb(null);
        }
        $persistentStore.write(String(Math.round(best.ms)), storeKey + "_ms");
        $persistentStore.write(best.name, storeKey + "_best");
        $persistentStore.write(current || "", storeKey + "_cur");
        if (!current) { switchGroup(groupName, best.name, function () { cb(best); }); return; }
        if (best.name === current) return cb(best);
        var curMs = res[current];
        if (curMs && curMs <= MAX_OK_MS && best.ms > curMs * IMPROVE_RATIO) return cb(best);
        switchGroup(groupName, best.name, function () { cb(best); });
      };
      if (err || !bestOf(res, regions)) {
        return fallbackByNodes(url, regions, function (b) { done(b); });
      }
      done(bestOf(res, regions));
    });
  });
}

(function main() {
  runOne(TG_GROUP, TG_REGIONS, TG_URL, "tgx_tg", function () {
    runOne(X_GROUP, X_REGIONS, X_URL, "tgx_x", function () {
      var t = $persistentStore.read("tgx_tg_best") || "-";
      var tm = $persistentStore.read("tgx_tg_ms") || "-";
      var x = $persistentStore.read("tgx_x_best") || "-";
      var xm = $persistentStore.read("tgx_x_ms") || "-";
      $notification.post("TG/X 智能选路", "TG: " + t + " " + tm + "ms", "X: " + x + " " + xm + "ms");
      $done();
    });
  });
})();
