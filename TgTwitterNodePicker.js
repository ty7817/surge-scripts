// TG/X 全节点推荐测速 v8
// Surge generic script

const TG_URL = 'https://t.me/';
const X_URL = 'https://x.com/';
const CONCURRENCY = 5;
const TIMEOUT = 4;
// ty.20040120: 的base64
const AUTH = 'Basic dHkuMjAwNDAxMjA6';

function fetchNodes() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'http://127.0.0.1:6171/v1/policies',
      headers: { 'Authorization': AUTH },
      timeout: 3000
    }, (err, resp, body) => {
      if (err) {
        resolve({ ok: false, err: 'API连接失败' });
        return;
      }
      try {
        const json = JSON.parse(body);
        let list = [];
        if (Array.isArray(json)) list = json;
        else if (json.policies) list = json.policies;
        resolve({ ok: true, list: list });
      } catch (e) {
        resolve({ ok: false, err: 'JSON解析失败' });
      }
    });
  });
}

function testOne(node, url) {
  return new Promise((resolve) => {
    const t = Date.now();
    $httpClient.get({
      url: url,
      policy: node,
      timeout: TIMEOUT
    }, (err, resp) => {
      const ms = Date.now() - t;
      resolve({ ms: err ? 9999 : ms, ok: !err });
    });
  });
}

async function testAll(nodes, url) {
  const results = {};
  const queue = nodes.slice();
  async function worker() {
    while (queue.length > 0) {
      const n = queue.shift();
      results[n] = await testOne(n, url);
    }
  }
  await Promise.all(Array(CONCURRENCY).fill(null).map(worker));
  return results;
}

(async () => {
  try {
    const api = await fetchNodes();
    
    if (!api.ok) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: 'API错误: ' + api.err + '\n请检查Surge设置',
        style: 'warning'
      });
      return;
    }
    
    const nodes = api.list
      .filter(p => p.name && p.name !== 'DIRECT' && p.name !== 'REJECT')
      .filter(p => {
        if (!p.type) return true;
        return !['Select','Smart','URLTest','Fallback','LoadBalance','Relay','Group','Direct','SSID'].includes(p.type);
      })
      .map(p => p.name);
    
    if (nodes.length === 0) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: '节点为空\n共获取' + api.list.length + '条',
        style: 'warning'
      });
      return;
    }
    
    const testNodes = nodes.slice(0, 25);
    
    const tgMap = await testAll(testNodes, TG_URL);
    const xMap = await testAll(testNodes, X_URL);
    
    const merged = testNodes.map(n => {
      const tg = tgMap[n] || { ms: 9999, ok: false };
      const x = xMap[n] || { ms: 9999, ok: false };
      return {
        name: n,
        tg: tg.ms,
        x: x.ms,
        avg: (tg.ms + x.ms) / 2,
        ok: tg.ok && x.ok
      };
    }).filter(r => r.ok).sort((a, b) => a.avg - b.avg);
    
    let txt = '';
    if (merged.length === 0) {
      txt = '全部超时\n测了' + testNodes.length + '个节点';
    } else {
      txt += '🏆 ' + merged[0].name + '\n';
      txt += '   TG ' + merged[0].tg + 'ms | X ' + merged[0].x + 'ms\n\n';
      txt += '📊 Top 8:\n';
      merged.slice(0, 8).forEach((r, i) => {
        const e = r.avg < 300 ? '🟢' : r.avg < 600 ? '🟡' : r.avg < 1200 ? '🟠' : '🔴';
        txt += (i+1) + '. ' + e + ' ' + r.name + '\n';
        txt += '   TG ' + (r.tg>=9999?'超时':r.tg+'ms') + ' | X ' + (r.x>=9999?'超时':r.x+'ms') + '\n';
      });
      txt += '\n共测' + testNodes.length + '个节点，' + merged.length + '个可用';
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