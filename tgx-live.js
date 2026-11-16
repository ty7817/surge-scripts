// TG/X 实时选路面板（打开面板即测速，结果直接显示，不等 cron）
// 依赖 profile 里的 http-api = key@127.0.0.1:6171

var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";
var HDR = { "X-Key": KEY, "Content-Type": "application/json" };

var TG_URL = "https://api.telegram.org/";
var X_URL = "https://abs.twimg.com/favicon.ico";
var TG_GROUP = "📡 Telegram 专线";
var X_GROUP = "🐦 X 专线";

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

var MAX_OK_MS = 600;
var IMPROVE_RATIO = 0.85;

var ERR = null;

function j(d) { try { return JSON.parse(d); } catch (e) { return null; } }

function api(method, path, body, cb) {
  var opt = { url: API + path, headers: HDR, timeout: 12 };
  var fn = method === "POST"
    ? function (o, cb) { $httpClient.post(o, cb); }
    : function (o, cb) { $httpClient.get(o, cb); };
  if (body) opt.body = JSON.stringify(body);
  fn(opt, function (err, resp, data) {
    if (err) { ERR = (err && err.error) ? err.error : String(err); return cb(null); }
    var st = resp && resp.status ? resp.status : 0;
    if (st === 0 || st >= 400) { ERR = "HTTP " + st; return cb(null); }
    cb(j(data));
  });
}

function pick(results, allowed) {
  var best = null;
  Object.keys(results || {}).forEach(function (k) {
    if (allowed && allowed.indexOf(k) < 0) return;
    var ms = results[k];
    if (ms <= 0 || ms > MAX_OK_MS) return;
    if (!best || ms < best.ms) best = { name: k, ms: ms };
  });
  return best;
}

function parseTest(data) {
  var o = typeof data === "string" ? j(data) : data;
  if (!o) return {};
  var out = {};
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
  api("POST", "/v1/policies/test", { policy_names: names, url: url }, function (o) {
    cb(parseTest(o));
  });
}

function currentOf(group, cb) {
  api("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(group), null, function (o) {
    cb(o && o.policy ? o.policy : null);
  });
}

function regionOf(name) {
  for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i][1].test(name)) return REGIONS[i][0];
  return null;
}

function fallback(url, allowed, cb) {
  api("GET", "/v1/policies", null, function (o) {
    var list = Array.isArray(o) ? o : (o && (o.policies || o.data) || []);
    var names = [];
    list.forEach(function (it) {
      var n = typeof it === "string" ? it : (it && (it.name || it.policy_name));
      if (!n) return;
      var r = regionOf(n);
      if (r && allowed.indexOf(r) >= 0 && names.indexOf(n) < 0) names.push(n);
    });
    if (!names.length) return cb(null);
    names = names.slice(0, 12);
    test(names, url, function (res) {
      var b = pick(res, null);
      cb(b ? { name: regionOf(b.name), ms: b.ms } : null);
    });
  });
}

// 返回一句描述
function runOne(group, regions, url, cb) {
  currentOf(group, function (cur) {
    test(regions.slice(), url, function (res) {
      var handle = function (best) {
        if (!best || !best.name) return cb((cur || "未选择") + "　测速无结果");
        var text;
        if (!cur) {
          text = best.name + "　" + Math.round(best.ms) + "ms";
        } else if (best.name === cur) {
          text = cur + "　" + Math.round(best.ms) + "ms　已最优";
        } else {
          var curMs = res[cur];
          var better = !curMs || curMs > MAX_OK_MS || best.ms <= curMs * IMPROVE_RATIO;
          if (!better) return cb(cur + "　" + Math.round(curMs) + "ms　无需切");
          text = cur + " → " + best.name + "　" + Math.round(best.ms) + "ms";
          api("POST", "/v1/policy_groups/select", { group_name: group, policy: best.name }, function () {});
          $persistentStore.write(String(Math.round(best.ms)), group === TG_GROUP ? "tgx_tg_ms" : "tgx_x_ms");
          $persistentStore.write(best.name, group === TG_GROUP ? "tgx_tg_best" : "tgx_x_best");
          return cb(text);
        }
        $persistentStore.write(String(Math.round(best.ms)), group === TG_GROUP ? "tgx_tg_ms" : "tgx_x_ms");
        $persistentStore.write(best.name, group === TG_GROUP ? "tgx_tg_best" : "tgx_x_best");
        cb(text);
      };
      var best = pick(res, regions);
      if (!best && !ERR) return fallback(url, regions, function (b) { handle(b); });
      handle(best);
    });
  });
}

(function main() {
  runOne(TG_GROUP, TG_REGIONS, TG_URL, function (tgText) {
    runOne(X_GROUP, X_REGIONS, X_URL, function (xText) {
      if (ERR) {
        $done({
          title: "TG / X 智能选路",
          content: "❌ 本机 API 无响应：" + ERR + "\n检查 profile 里 http-api 是否开启",
          icon: "exclamationmark.triangle",
          "icon-color": "#FF3B30"
        });
        return;
      }
      $done({
        title: "TG / X 智能选路",
        content: "Telegram：" + tgText + "\nX：" + xText,
        icon: "bolt.horizontal.circle",
        "icon-color": "#FF9500"
      });
    });
  });
})();
