// Telegram 智能选路面板（只处理 Telegram，不含推特）
// 打开面板时按成员逐个发真实请求，用 api.telegram.org 实测往返耗时，切到最快的一个。

var API = "http://127.0.0.1:6171";
var KEY = "ty.20040120";

var TG_PAT = /📡\s*Telegram|Telegram\s*专线|电报信息|电报加速|TG\s*专线/i;
var AUTO_PAT = /最优|专线|加速|优选|自动|排名|推荐|面板/;
var TG_URLS = ["https://api.telegram.org/", "https://telegram.org/"];
var REGION_RX = /(🇭🇰|香港|港|hong ?kong|hk|🇯🇵|日本|japan|jp|🇸🇬|新加坡|狮城|singapore|sg|🇺🇸|美国|美|united ?states|usa|us\b|🇹🇼|台湾|台灣|taiwan|tw\b|🇰🇷|韩国|韓國|korea|kr\b)/i;
var REGION_NAMES = ["香港节点", "日本节点", "新加坡节点", "美国节点", "台湾节点", "韩国节点"];
var MAX_OK_MS = 8000;   // 超过这个值当作不可用
var RATIO = 0.95;       // 新成员比当前快 5% 就切

function req(method, path, body, cb) {
  var opt = {
    url: API + path,
    headers: { "X-Key": KEY, "Content-Type": "application/json" },
    timeout: 8,
    body: body ? JSON.stringify(body) : undefined,
    "auto-redirect": false
  };
  $httpClient[method](opt, function (err, resp, data) {
    cb(err, resp, data);
  });
}

function strOptions(g) {
  if (Array.isArray(g.policies)) return g.policies.map(function (p) {
    return typeof p === "string" ? p : (p && p.name) || "";
  }).filter(Boolean);
  if (Array.isArray(g.options)) return g.options.map(function (p) {
    return typeof p === "string" ? p : (p && p.name) || "";
  }).filter(Boolean);
  return [];
}

function findGroup(groups) {
  // 规则真正指向的是分流组（电报信息），名字带「加速/最优」的是自动组，只当候选项。
  var best = null, bestScore = -1;
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    if (!TG_PAT.test(g.name) || strOptions(g).length < 1) continue;
    var score = 0;
    if (g.type === "select") score += 2;
    if (!AUTO_PAT.test(g.name)) score += 2;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  if (best) return best;
  for (var j = 0; j < groups.length; j++) {
    if (TG_PAT.test(groups[j].name) && strOptions(groups[j]).length >= 1) return groups[j];
  }
  return null;
}

// 按策略发真实请求，测真实往返耗时（不走 $httpClient 的测速接口，避免对组名返回空）
function measure(names, cb) {
  var res = {};
  var pending = names.length;
  if (!pending) return cb(res);
  names.forEach(function (n) {
    var t0 = Date.now();
    var done = false, tried = 0;
    function nextUrl() {
      if (done || tried >= TG_URLS.length) return;
      var url = TG_URLS[tried++];
      $httpClient.get({
        url: url,
        policy: n,
        timeout: 8,
        "auto-redirect": false
      }, function (err) {
        if (done) return;
        if (err) return nextUrl();
        done = true;
        res[n] = Date.now() - t0;
        if (--pending === 0) cb(res);
      });
    }
    nextUrl();
    // 所有地址都失败时也要收尾
    var guard = setInterval(function () {
      if (done) { clearInterval(guard); return; }
      if (tried >= TG_URLS.length) {
        clearInterval(guard); done = true; res[n] = 0;
        if (--pending === 0) cb(res);
      }
    }, 300);
  });
}

function switchTo(group, policy, cb) {
  req("post", "/v1/policy_groups/select", { group_name: group, policy: policy }, cb);
}

$httpClient.get({ url: API + "/v1/policy_groups", headers: { "X-Key": KEY }, timeout: 8 }, function (err, resp, data) {
  if (err || !data) return $done({ content: "读不到策略组\n" + (err || "空响应") });

  var body;
  try { body = JSON.parse(data); } catch (e) { return $done({ content: "策略组返回格式异常" }); }

  var groups = body.groups || body["policy_groups"] || body;
  if (!Array.isArray(groups)) return $done({ content: "策略组列表为空" });

  var g = findGroup(groups);
  if (!g) return $done({ content: "没找到 Telegram 分 流组（应含「电报信息」）" });

  var opts = strOptions(g);
  var skip = ["DIRECT", "REJECT", "REJECT-TINYGIF", "REJECT-DROP"];
  var regionCands = opts.filter(function (n) {
    return REGION_RX.test(n) && !AUTO_PAT.test(n) && skip.indexOf(n) < 0;
  });
  var otherCands = opts.filter(function (n) {
    return regionCands.indexOf(n) < 0 && skip.indexOf(n) < 0 && !/面板/.test(n);
  });
  var cands = regionCands.concat(otherCands).slice(0, 8);

  // 当前选择
  req("get", "/v1/policy_groups/select?group_name=" + encodeURIComponent(g.name), null, function (e2, r2, d2) {
    var cur = "";
    try { cur = (JSON.parse(d2) || {}).policy || ""; } catch (e) {}
    // 当前选择也要参与测速，否则无法判断「需不需要切」
    if (cur && cands.indexOf(cur) < 0 && skip.indexOf(cur) < 0) cands.unshift(cur);

    measure(cands, function (res) {
      var list = [], best = null, bestMs = 1e9, curMs = 0;
      cands.forEach(function (n) {
        var ms = res[n] || 0;
        list.push(short(n) + " " + (ms > 0 && ms <= MAX_OK_MS ? ms + "ms" : "失败"));
        if (ms > 0 && ms <= MAX_OK_MS && ms < bestMs) { bestMs = ms; best = n; }
        if (n === cur) curMs = ms;
      });

      var head;
      if (!best) {
        head = g.name + "：所有成员都连不上 Telegram（" + list.join(" / ") + "）";
        return $done({ content: head });
      }

      var need = curMs > 0 && cur && best !== cur ? bestMs <= curMs * RATIO : true;
      if (best === cur || !need) {
        var curName = cur || best;
        var shown = curMs > 0 ? curMs : bestMs;
        head = g.name + "：" + short(curName) + "　" + shown + "ms　已最优";
        return $done({ content: head + "\n· 测速：" + list.join(" / ") });
      }

      switchTo(g.name, best, function (e3) {
        head = g.name + "：" + short(cur || "未选择") + (curMs > 0 ? "(" + curMs + "ms)" : "") +
               " → " + short(best) + "　" + bestMs + "ms";
        $done({ content: head + "\n· 测速：" + list.join(" / ") });
      });
    });
  });
});

function short(n) {
  return String(n).replace(/节点$/, "").replace(/^🇭🇰|^🇯🇵|^🇸🇬|^🇺🇸|^🇹🇼|^🇰🇷/, function (m) { return m; }).replace(/节点/g, "");
}
