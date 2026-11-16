// TG/X 面板 v6：不用 policies/test，直接按策略发真实请求计延迟
var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";
var HDR = { "X-Key": KEY, "Content-Type": "application/json" };

var TG_URL = "https://api.telegram.org/";
var X_URL = "https://abs.twimg.com/favicon.ico";

var TG_PAT = /📡\s*Telegram|Telegram\s*专线|电报信息|电报加速|TG\s*专线/i;
var X_PAT = /🐦\s*X|X\s*专线|推特|Twitter|🐦/i;

var REGION_NAMES = ["香港节点", "日本节点", "新加坡节点", "美国节点", "台湾节点", "韩国节点"];
var REGION_RX = /🇭🇰|香港|Hong ?Kong|🇯🇵|日本|Japan|东京|大阪|🇸🇬|新加坡|Singapore|🇺🇸|美国|United ?States|\bUS\b|🇹🇼|台湾|臺灣|Taiwan|🇰🇷|韩国|Korea/i;

var MAX_OK_MS = 8000;
var IMPROVE_RATIO = 0.85;

function j(d) { try { return JSON.parse(d); } catch (e) { return null; } }

function api(method, path, body, cb) {
  var opt = { url: API + path, headers: HDR, timeout: 10 };
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
      out.push({ name: name, options: it.policies || it.options || it.proxies || it.members || [], type: it.type || "" });
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
  if (!g || !Array.isArray(g.options)) return [];
  return g.options.map(function (x) { return typeof x === "string" ? x : (x && (x.name || x.policy)); }).filter(Boolean);
}

function findGroup(groups, pat) {
  for (var i = 0; i < groups.length; i++) {
    if (pat.test(groups[i].name) && strOptions(groups[i]).length >= 1) return groups[i];
  }
  return null;
}

// 按策略发真实请求，测真实往返耗时
function measure(names, url, cb) {
  var res = {};
  var pending = names.length;
  if (!pending) return cb(res);
  names.forEach(function (n) {
    var t0 = Date.now();
    var done = false;
    var fin = function (ok) {
      if (done) return;
      done = true;
      res[n] = ok ? (Date.now() - t0) : 0;
      if (--pending === 0) cb(res);
    };
    $httpClient.get({ url: url, policy: n, timeout: 8 }, function (err, resp) {
      fin(!err);
    });
  });
}

function pick(res) {
  var best = null;
  Object.keys(res).forEach(function (k) {
    var ms = res[k];
    if (ms <= 0 || ms > MAX_OK_MS) return;
    if (!best || ms < best.ms) best = { name: k, ms: ms };
  });
  return best;
}

function currentOf(group, cb) {
  api("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(group), null, function (o, st, err) {
    cb(o && o.policy ? o.policy : null);
  });
}

function runSide(g, url, cb) {
  var opts = strOptions(g);
  var cands = opts.filter(function (n) { return REGION_NAMES.indexOf(n) >= 0; });
  if (!cands.length) cands = opts.filter(function (n) { return REGION_RX.test(n) && n.indexOf("优选") < 0 && n.indexOf("最优") < 0; });
  if (!cands.length) cands = REGION_NAMES.slice(0);
  cands = cands.slice(0, 8);

  currentOf(g.name, function (cur) {
    measure(cands, url, function (res) {
      var best = pick(res);
      if (!best) return cb({ text: g.name + "　全部超时（节点连不上目标域名）" });
      var ms = Math.round(best.ms);
      var curMs = res[cur];
      var text, switched = false;
      if (!cur) { text = g.name + "：未选择 → " + best.name + "　" + ms + "ms"; }
      else if (cur === best.name) { text = g.name + "：" + cur + "　" + ms + "ms　已最优"; }
      else if (curMs && curMs <= MAX_OK_MS && best.ms > curMs * IMPROVE_RATIO) { text = g.name + "：" + cur + "　" + Math.round(curMs) + "ms　无需切"; }
      else { text = g.name + "：" + cur + (curMs ? "(" + Math.round(curMs) + "ms)" : "") + " → " + best.name + "　" + ms + "ms"; switched = true; }

      var listText = "测速：" + Object.keys(res).map(function (k) { return k.replace("节点", "") + " " + (res[k] ? Math.round(res[k]) + "ms" : "失败"); }).join(" / ");

      if (!switched && cur === best.name) return cb({ text: text, detail: listText });
      api("POST", "/v1/policy_groups/select", { group_name: g.name, policy: best.name }, function (o, st, err) {
        if (err || st >= 400) return cb({ text: text, detail: listText + "（切换失败 " + (err || ("HTTP " + st)) + "）" });
        cb({ text: text, detail: listText });
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
    var afterTg = function () {
      if (!x) { lines.push("X：未找到分组"); return $done({ title: "TG / X 智能选路", content: lines.join("\n"), icon: "bolt.horizontal.circle", "icon-color": "#FF9500" }); }
      runSide(x, X_URL, function (r) {
        lines.push(r.text);
        if (r.detail) lines.push("· " + r.detail);
        $done({ title: "TG / X 智能选路", content: lines.join("\n"), icon: "bolt.horizontal.circle", "icon-color": "#FF9500" });
      });
    };
    if (!tg) { lines.push("Telegram：未找到分组"); return afterTg(); }
    runSide(tg, TG_URL, function (r) {
      lines.push(r.text);
      if (r.detail) lines.push("· " + r.detail);
      afterTg();
    });
  });
})();
