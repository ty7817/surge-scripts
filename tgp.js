// Telegram 加速（面板版）：先测各成员到电报 DC 的往返，再对前 3 名实测下载吞吐，综合挑最快并切换
var API = "http://127.0.0.1:6171", KEY = "ty.20040120", HDR = { "X-Key": KEY, "Content-Type": "application/json" };
var URLS = ["https://api.telegram.org/", "https://telegram.org/"];
var THRU = "https://telegram.org/img/t_logo.png";
var TPAT = /电报信息|电报加速|Telegram|TG专线/i;
var APAT = /最优|专线|加速|优选|自动|排名|推荐|面板/;
var MAX = 8000, RATIO = 0.95;

function api(m, path, body, cb) {
  var o = { url: API + path, headers: HDR, timeout: 10 };
  if (body) o.body = JSON.stringify(body);
  $httpClient[m === "POST" ? "post" : "get"](o, function (e, r, d) {
    if (e) return cb(null, 0, String((e && e.error) || e));
    var st = (r && r.status) ? r.status : 0, j = null;
    try { j = JSON.parse(d); } catch (x) {}
    cb(j, st, null);
  });
}

function names(g) {
  var a = g.policies || g.options || g.proxies || g.members || [];
  return a.map(function (i) { return typeof i === "string" ? i : (i && i.name); }).filter(Boolean);
}

function pickGroup(list) {
  var b = null, s = -1;
  list.forEach(function (g) {
    var n = g.name || g.group_name;
    if (!n || !TPAT.test(n) || names(g).length < 1) return;
    var sc = 0;
    if (g.type === "select") sc += 2;
    if (!APAT.test(n)) sc += 2;
    if (sc > s) { s = sc; b = { name: n, options: names(g), type: g.type || "" }; }
  });
  return b;
}

function rtt(list, cb) {
  var i = 0;
  (function tryUrl() {
    if (i >= URLS.length) return cb({});
    var u = URLS[i++], res = {}, left = list.length;
    list.forEach(function (n) {
      var t0 = Date.now();
      $httpClient.get({ url: u, policy: n, timeout: 8 }, function (e) {
        res[n] = e ? 0 : Date.now() - t0;
        if (--left === 0) {
          var ok = false;
          list.forEach(function (k) { if (res[k] > 0) ok = true; });
          ok ? cb(res) : tryUrl();
        }
      });
    });
  })();
}

function thru(list, cb) {
  var res = {}, left = list.length;
  list.forEach(function (n) {
    var t0 = Date.now();
    $httpClient.get({ url: THRU, policy: n, timeout: 12, "auto-redirect": false }, function (e, r, d) {
      var b = (!e && d) ? ((typeof d === "string") ? d.length : (d.byteLength || 0)) : 0;
      var ms = Date.now() - t0;
      res[n] = (b && ms > 0) ? Math.round(b * 1000 / ms / 1024) : 0;
      if (--left === 0) cb(res);
    });
  });
}

function sh(n) { return String(n).replace(/节点/g, "").replace(/^主$/, "主节点"); }

api("GET", "/v1/policy_groups", null, function (o, st, err) {
  if (err || st >= 400) return $done({ content: "❌ 本机 API 无响应：" + (err || st) });
  var arr = Array.isArray(o) ? o : ((o && (o.groups || o.data || o.policy_groups)) || []);
  if (!Array.isArray(arr)) arr = Object.keys(o || {}).map(function (k) { return { name: k, policies: o[k] }; });
  var g = pickGroup(arr);
  if (!g) return $done({ content: "❌ 没找到 Telegram 分组" });

  var list = g.options.filter(function (n) { return !/DIRECT|REJECT/.test(n); });
  if (list.length > 8) list = list.slice(0, 8);

  api("GET", "/v1/policy_groups/select?group_name=" + encodeURIComponent(g.name), null, function (o2) {
    var cur = (o2 && o2.policy) || "";
    if (cur && list.indexOf(cur) < 0) list.unshift(cur);

    rtt(list, function (res) {
      var ok = Object.keys(res).filter(function (k) { return res[k] > 0 && res[k] <= MAX; })
        .sort(function (a, b) { return res[a] - res[b]; });
      if (!ok.length) return $done({ content: g.name + "：所有成员都连不上 Telegram" });

      thru(ok.slice(0, 3), function (t) {
        var win = ok[0], wms = res[win];
        ok.slice(0, 3).forEach(function (n) {
          if (n === win) return;
          var b = t[win] || 0, x = t[n] || 0;
          if (b > 0 && x >= b * 1.5 && res[n] <= wms * 1.25) win = n;
        });

        var curMs = res[cur] || 0, w = Math.round(res[win]);
        var text, sw = false;
        if (!cur) text = g.name + "：未选择 → " + sh(win) + "　" + w + "ms";
        else if (cur === win) text = g.name + "：" + sh(cur) + "　" + w + "ms　已最优";
        else if (curMs && res[win] > curMs * RATIO) text = g.name + "：" + sh(cur) + "　" + Math.round(curMs) + "ms　无需切";
        else { text = g.name + "：" + sh(cur) + "(" + Math.round(curMs) + "ms) → " + sh(win) + "　" + w + "ms"; sw = true; }

        var l1 = "· 测速：" + Object.keys(res).map(function (k) { return sh(k) + " " + (res[k] ? Math.round(res[k]) + "ms" : "失败"); }).join(" / ");
        var l2 = "· 吞吐：" + ok.slice(0, 3).map(function (k) { return sh(k) + " " + (t[k] ? t[k] + "KB/s" : "失败"); }).join(" / ");
        var l3 = "· 画质：App 内 设置→数据和存储→自动下载，视频选最高、关节省流量";
        var out = [text, l1, l2, l3].join("\n");

        if (!sw) return $done({ content: out });
        api("POST", "/v1/policy_groups/select", { group_name: g.name, policy: win }, function () { $done({ content: out }); });
      });
    });
  });
});
