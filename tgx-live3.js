// TG/X 面板 v5：组测速被 API 拒绝时，自动改为测真实节点，再映射回地区组
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
var REGION_GROUP_NAMES = ["香港节点", "日本节点", "新加坡节点", "美国节点", "台湾节点", "韩国节点"];

var MAX_OK_MS = 5000;
var IMPROVE_RATIO = 0.85;

function j(d) { try { return JSON.parse(d); } catch (e) { return null; } }

// cb(obj, status, errText)
function api(method, path, body, cb) {
  var opt = { url: API + path, headers: HDR, timeout: 15 };
  if (body) opt.body = JSON.stringify(body);
  var fn = method === "POST"
    ? function (o, c) { $httpClient.post(o, c); }
    : function (o, c) { $httpClient.get(o, c); };
  fn(opt, function (err, resp, data) {
    if (err) return cb(null, 0, (err && err.error) ? err.error : String(err));
    var st = resp && resp.status ? resp.status : 0;
    cb(typeof data === "string" ? j(data) : data, st, null);
  });
}

function parseGroups(o) {
  var out = [];
  if (!o) return out;
  var list = Array.isArray(o) ? o : (Array.isArray(o.groups) ? o.groups : (Array.isArray(o.data) ? o.data : (Array.isArray(o.policy_groups) ? o.policy_groups : null)));
  if (list) {
    list.forEach(function (it) {
      if (!it) return;
      var name = it.name || it.group_name || it.policy_name;
      if (!name) return;
      var opts = it.policies || it.options || it.proxies || it.members || it.list || [];
      out.push({ name: name, options: opts, type: it.type || "" });
    });
    return out;
  }
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    if (Array.isArray(v)) out.push({ name: k, options: v, type: "" });
    else if (v && typeof v === "object") out.push({ name: k, options: v.policies || v.options || v.proxies || v.members || [], type: v.type || "" });
  });
  return out;
}

function strOptions(g) {
  if (!g || !g.options || !Array.isArray(g.options)) return [];
  return g.options.map(function (x) { return typeof x === "string" ? x : (x && (x.name || x.policy)); }).filter(Boolean);
}

function findGroup(groups, pat) {
  for (var i = 0; i < groups.length; i++) {
    if (pat.test(groups[i].name) && strOptions(groups[i]).length >= 1) return groups[i];
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

function testNames(names, url, cb) {
  api("POST", "/v1/policies/test", { policy_names: names, url: url }, function (o, st, err) {
    cb(parseTest(o), st, err);
  });
}

function currentOf(group, cb) {
  api("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(group), null, function (o, st, err) {
    cb(o && o.policy ? o.policy : null, st, err);
  });
}

// 从 /v1/policies 里挑真实节点（排除地区组本身与自动组名）
function collectNodes(allowedRegions, cb) {
  api("GET", "/v1/policies", null, function (o, st, err) {
    if (err || st >= 400) return cb([], st, err);
    var list = Array.isArray(o) ? o : (o && (o.policies || o.data) || []);
    var names = [];
    list.forEach(function (it) {
      var n = typeof it === "string" ? it : (it && (it.name || it.policy_name));
      if (!n) return;
      if (REGION_GROUP_NAMES.indexOf(n) >= 0) return;           // 地区组本身，不是节点
      if (/优选|专线|最优|排名|推荐|面板/.test(n)) return;        // 自动组/面板名
      var r = regionOf(n);
      if (r && allowedRegions.indexOf(r) >= 0 && names.indexOf(n) < 0) names.push(n);
    });
    cb(names.slice(0, 16), st, null);
  });
}

function runSide(g, url, cb) {
  var opts = strOptions(g);
  var regionOpts = opts.filter(function (n) { return regionOf(n); });
  var diag = [];

  var finish = function (best, cur, res, curMs) {
    if (!best) return cb({ text: g.name + "　测速无结果", diag: diag.join("，") });
    var ms = Math.round(best.ms);
    var target = best.name;
    // 节点名 → 地区组名（若该组是组的成员）
    if (regionOpts.indexOf(target) < 0) {
      var r = regionOf(target);
      if (r && opts.indexOf(r) >= 0) { target = r; diag.push("节点 " + best.name + " → 组 " + r); }
    }
    var text;
    if (!cur) text = g.name + "：" + target + "　" + ms + "ms";
    else if (cur === target) text = g.name + "：" + cur + "　" + ms + "ms　已最优";
    else if (curMs && curMs <= MAX_OK_MS && best.ms > curMs * IMPROVE_RATIO) text = g.name + "：" + cur + "　" + Math.round(curMs) + "ms　无需切";
    else text = g.name + "：" + cur + " → " + target + "　" + ms + "ms";

    if (cur !== target) {
      api("POST", "/v1/policy_groups/select", { group_name: g.name, policy: target }, function (o, st, err) {
        if (err || st >= 400) diag.push("切换失败 " + (err || ("HTTP " + st)));
        cb({ text: text, diag: diag.join("，") });
      });
    } else cb({ text: text, diag: diag.join("，") });
  };

  currentOf(g.name, function (cur) {
    // ① 先测分组选项（新配置下有效）
    testNames(regionOpts.length ? regionOpts : opts.slice(0, 12), url, function (res, st, err) {
      var best = pick(res, opts);
      if (best) return finish(best, cur, res, res[cur]);

      diag.push(err ? ("组测速：" + err) : (st >= 400 ? ("组测速被拒 HTTP " + st) : "组测速无结果"));

      // ② 改测真实节点，再映射回地区组
      collectNodes(regionOpts.length ? regionOpts : REGION_GROUP_NAMES, function (names, st2, err2) {
        if (!names.length) {
          diag.push(err2 ? ("取节点：" + err2) : "没有可用节点名");
          return finish(null, cur, res, res[cur]);
        }
        testNames(names, url, function (res2, st3, err3) {
          var best2 = pick(res2, null);
          if (!best2) diag.push("节点测速全部失败" + (err3 ? "：" + err3 : ""));
          finish(best2, cur, res2, res2[cur]);
        });
      });
    });
  });
}

(function main() {
  api("GET", "/v1/policy_groups", null, function (o, st, err) {
    if (err || st >= 400) {
      return $done({ title: "TG / X 智能选路", content: "❌ 本机 API 无响应：" + (err || ("HTTP " + st)), icon: "exclamationmark.triangle", "icon-color": "#FF3B30" });
    }
    var groups = parseGroups(o);
    var tg = findGroup(groups, TG_PAT);
    var x = findGroup(groups, X_PAT);
    if (!tg && !x) {
      return $done({ title: "TG / X 智能选路", content: "❌ 没找到 Telegram / X 分组（共 " + groups.length + " 个）", icon: "exclamationmark.triangle", "icon-color": "#FF3B30" });
    }
    var lines = [];
    var push = function (r) {
      lines.push(r.text);
      if (r.diag && /测速无结果|切换失败/.test(r.text + r.diag)) lines.push("· " + r.diag);
    };
    var afterTg = function () {
      if (!x) { lines.push("X：未找到分组"); return done(); }
      runSide(x, X_URL, function (r) { push(r); done(); });
    };
    var done = function () {
      $done({ title: "TG / X 智能选路", content: lines.join("\n"), icon: "bolt.horizontal.circle", "icon-color": "#FF9500" });
    };
    if (!tg) { lines.push("Telegram：未找到分组"); return afterTg(); }
    runSide(tg, TG_URL, function (r) { push(r); afterTg(); });
  });
})();
