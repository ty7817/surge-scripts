// TG/X 面板 v6：不用 policies/test，直接按策略发真实请求计延迟
var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";
var HDR = { "X-Key": KEY, "Content-Type": "application/json" };

var TG_URLS = ["https://api.telegram.org/", "https://telegram.org/"];
var X_URLS = ["https://api.x.com/robots.txt", "https://twitter.com/robots.txt", "https://abs.twimg.com/robots.txt"];

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
  // 优先 select 组：smart / hidden 的「最优」组本身只是自动选集，点名它的成员去测往往全失败，
  // 而规则实际指向的是 select 组（如 推特X / 电报信息）。
  for (var i = 0; i < groups.length; i++) {
    if (pat.test(groups[i].name) && strOptions(groups[i]).length >= 1 && groups[i].type === "select") return groups[i];
  }
  for (var j = 0; j < groups.length; j++) {
    if (pat.test(groups[j].name) && strOptions(groups[j]).length >= 1) return groups[j];
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

// 依次尝试多个测试地址，任一有结果就采用
function measureAny(names, urls, cb) {
  var i = 0;
  var attempt = function () {
    if (i >= urls.length) return cb({});
    measure(names, urls[i++], function (res) {
      var ok = false;
      Object.keys(res).forEach(function (k) { if (res[k] > 0) ok = true; });
      if (ok) return cb(res);
      attempt();
    });
  };
  attempt();
}

function runSide(g, urls, cb) {
  var opts = strOptions(g);
  // 候选 = 组里所有成员：地区组优先，其余（如「🐦 Twitter最优」这类 smart 组、主节点）也纳入。
  // 有些出口对 X 不友好，但 smart 组整体能通，所以不能只测地区组。
  var skip = ["DIRECT", "REJECT", "REJECT-TINYGIF", "REJECT-DROP"];
  var regionCands = opts.filter(function (n) {
    return REGION_RX.test(n) && !/优选|最优|专线|自动|排名|推荐|面板/.test(n) && skip.indexOf(n) < 0;
  });
  var otherCands = opts.filter(function (n) {
    return regionCands.indexOf(n) < 0 && skip.indexOf(n) < 0 && !/面板/.test(n);
  });
  var cands = regionCands.concat(otherCands).slice(0, 8);
  if (!cands.length) cands = REGION_NAMES.slice(0);

  currentOf(g.name, function (cur) {
    measureAny(cands, urls, function (res) {
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
      runSide(x, X_URLS, function (r) {
        lines.push(r.text);
        if (r.detail) lines.push("· " + r.detail);
        $done({ title: "TG / X 智能选路", content: lines.join("\n"), icon: "bolt.horizontal.circle", "icon-color": "#FF9500" });
      });
    };
    if (!tg) { lines.push("Telegram：未找到分组"); return afterTg(); }
    runSide(tg, TG_URLS, function (r) {
      lines.push(r.text);
      if (r.detail) lines.push("· " + r.detail);
      afterTg();
    });
  });
})();
