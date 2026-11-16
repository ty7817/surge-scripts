// 面板渲染脚本：只读缓存，不再发测速请求
var t = $persistentStore.read("tgx_tg_best") || "-";
var tm = $persistentStore.read("tgx_tg_ms") || "-";
var x = $persistentStore.read("tgx_x_best") || "-";
var xm = $persistentStore.read("tgx_x_ms") || "-";
$done({
  title: "TG / X 智能选路",
  content: "Telegram → " + t + "  " + tm + "ms\nX → " + x + "  " + xm + "ms",
  icon: "bolt.horizontal.circle",
  "icon-color": "#FF9500"
});
