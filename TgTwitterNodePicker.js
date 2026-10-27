// TG/X 节点推荐测速 v6
// Surge generic script

const NODES = ['日本节点', '美国节点', '新加坡节点', '香港节点'];

async function testDelay(url, node) {
  return new Promise((resolve) => {
    const start = Date.now();
    $httpClient.get({
      url: url,
      policy: node,
      timeout: 4
    }, (err, resp) => {
      const ms = Date.now() - start;
      resolve({ ms: err ? -1 : ms, ok: !err });
    });
  });
}

(async () => {
  try {
    const results = [];
    
    for (const node of NODES) {
      const tg = await testDelay('https://t.me/', node);
      const x = await testDelay('https://x.com/', node);
      const avg = tg.ok && x.ok ? (tg.ms + x.ms) / 2 : 9999;
      results.push({ name: node, tg: tg.ms, x: x.ms, avg: avg, ok: tg.ok && x.ok });
    }
    
    const sorted = results.filter(r => r.ok).sort((a, b) => a.avg - b.avg);
    
    let txt = '';
    if (sorted.length === 0) {
      txt = '测试失败\n请检查网络';
    } else {
      txt += '🏆 推荐: ' + sorted[0].name + '\n';
      txt += '   TG ' + sorted[0].tg + 'ms | X ' + sorted[0].x + 'ms\n\n';
      sorted.forEach((r, i) => {
        const e = r.avg < 500 ? '🟢' : r.avg < 1000 ? '🟡' : '🟠';
        txt += (i+1) + '. ' + e + ' ' + r.name + ' (' + Math.round(r.avg) + 'ms)\n';
      });
    }
    
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