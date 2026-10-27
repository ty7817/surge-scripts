// TG/X 节点推荐测速 v4
// 直接测试策略组，不依赖API

const TEST_GROUPS = ['香港节点', '日本节点', '美国节点', '新加坡节点', '台湾节点', '韩国节点', '主节点', '⚡ 全网最优'];
const TG_URL = 'https://t.me/';
const X_URL = 'https://x.com/';

function test(url, policyName) {
  return new Promise((resolve) => {
    const t = Date.now();
    $httpClient.get({
      url: url,
      policy: policyName,
      timeout: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (err, resp) => {
      const ms = Date.now() - t;
      resolve({ ms: err ? 9999 : ms, ok: !err });
    });
  });
}

(async () => {
  try {
    let lines = [];
    let best = null;
    
    for (const group of TEST_GROUPS) {
      const tg = await test(TG_URL, group);
      const x = await test(X_URL, group);
      const avg = (tg.ms + x.ms) / 2;
      lines.push({ name: group, tg: tg.ms, x: x.ms, avg: avg, ok: tg.ok && x.ok });
    }
    
    lines = lines.filter(l => l.ok).sort((a, b) => a.avg - b.avg);
    
    if (lines.length === 0) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: '全部超时，请检查网络',
        style: 'warning'
      });
      return;
    }
    
    let txt = '🏆 推荐: ' + lines[0].name + '\n';
    txt += '   TG ' + lines[0].tg + 'ms | X ' + lines[0].x + 'ms\n\n';
    
    txt += '📊 排名:\n';
    lines.forEach((l, i) => {
      const e = l.avg < 500 ? '🟢' : l.avg < 1000 ? '🟡' : l.avg < 2000 ? '🟠' : '🔴';
      txt += (i+1) + '. ' + e + ' ' + l.name + '\n';
      txt += '   TG ' + (l.tg >= 9999 ? '超时' : l.tg+'ms') + ' | X ' + (l.x >= 9999 ? '超时' : l.x+'ms') + '\n';
    });
    
    $done({
      title: '🎯 TG/X 节点推荐',
      content: txt,
      updateInterval: 600
    });
    
  } catch (e) {
    $done({
      title: '🎯 TG/X 节点推荐',
      content: '错误: ' + e.message,
      style: 'warning'
    });
  }
})();