// TG/X Node Speed Test Picker
// Surge generic script

const NODES = [
  '香港节点',
  '日本节点',
  '美国节点',
  '新加坡节点',
  '台湾节点',
  '韩国节点'
];
const TG_URL = 'https://api.telegram.org/';
const X_URL = 'https://api.x.com/robots.txt';

function httpGet(url, policyName, cb) {
  $httpClient.get({
    url: url,
    policy: policyName,
    timeout: 4000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, function(err, resp, data) {
    cb(err, resp);
  });
}

function testNode(node) {
  return new Promise((resolve) => {
    const start = Date.now();
    httpGet(TG_URL, node, function(err1, resp1) {
      const tgMs = Date.now() - start;
      const start2 = Date.now();
      httpGet(X_URL, node, function(err2, resp2) {
        const xMs = Date.now() - start2;
        resolve({
          name: node,
          tg: err1 ? 9999 : tgMs,
          x: err2 ? 9999 : xMs,
          ok: !err1 && !err2
        });
      });
    });
  });
}

async function main() {
  const results = [];
  for (const node of NODES) {
    const r = await testNode(node);
    results.push(r);
  }
  
  const sorted = results.sort((a, b) => {
    const aAvg = a.ok ? (a.tg + a.x) / 2 : 9999;
    const bAvg = b.ok ? (b.tg + b.x) / 2 : 9999;
    return aAvg - bAvg;
  });
  
  let lines = [];
  
  if (sorted[0].ok) {
    lines.push('🏆 推荐: ' + sorted[0].name);
    lines.push('   TG ' + sorted[0].tg + 'ms | X ' + sorted[0].x + 'ms');
    lines.push('');
  } else {
    lines.push('❌ 全部超时');
    lines.push('');
  }
  
  lines.push('📊 排名:');
  sorted.forEach((r, i) => {
    if (r.ok) {
      const avg = Math.round((r.tg + r.x) / 2);
      const icon = avg < 500 ? '🟢' : avg < 1000 ? '🟡' : avg < 2000 ? '🟠' : '🔴';
      lines.push((i+1) + '. ' + icon + ' ' + r.name + ' (' + avg + 'ms)');
      lines.push('   TG: ' + r.tg + 'ms | X: ' + r.x + 'ms');
    } else {
      lines.push((i+1) + '. ❌ ' + r.name + ' (超时)');
    }
  });
  
  $done({
    title: 'TG/X 节点推荐',
    content: lines.join('\n'),
    icon: 'target',
    'icon-color': '#ff9500'
  });
}

main();