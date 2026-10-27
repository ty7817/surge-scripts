// TG/X Node Picker v9
// Surge generic script

const TG_URL = 'https://t.me/';
const X_URL = 'https://x.com/';
const CONCURRENCY = 5;
const TIMEOUT = 4;
const AUTH = 'Basic dHkuMjAwNDAxMjA6';

function fetchNodes() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'http://127.0.0.1:6171/v1/policies',
      headers: { 'Authorization': AUTH },
      policy: 'DIRECT',
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

async function main() {
  try {
    const api = await fetchNodes();
    
    if (!api.ok) {
      $done({
        title: 'TG/X Node Picker',
        content: 'API error: ' + api.err,
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
        title: 'TG/X Node Picker',
        content: 'No nodes found',
        style: 'warning'
      });
      return;
    }
    
    const testNodes = nodes.slice(0, 20);
    
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
      txt = 'All timeout';
    } else {
      txt += 'Best: ' + merged[0].name + '\n';
      txt += 'TG ' + merged[0].tg + 'ms | X ' + merged[0].x + 'ms\n\n';
      merged.slice(0, 8).forEach((r, i) => {
        txt += (i+1) + '. ' + r.name + ' (' + Math.round(r.avg) + 'ms)\n';
      });
      txt += '\nTested ' + testNodes.length + ' nodes';
    }
    
    $done({
      title: 'TG/X Node Picker',
      content: txt,
      updateInterval: 600
    });
    
  } catch (e) {
    $done({
      title: 'TG/X Node Picker',
      content: 'Error: ' + e.message,
      style: 'warning'
    });
  }
}

main();