// Telegram & Twitter 节点推荐测速脚本 v3
// Surge generic script

const API_BASE = 'http://127.0.0.1:6171';
const API_USER = 'ty.20040120';
const TG_URL = 'https://t.me/';
const X_URL = 'https://x.com/';
const TIMEOUT = 5;
const CONCURRENCY = 4;
const MAX_NODES = 20;

const auth = 'Basic ' + $text.base64Encode(API_USER + ':');

function getNodeList() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: API_BASE + '/v1/policies',
      headers: { 'Authorization': auth },
      policy: 'DIRECT',
      timeout: 3000
    }, (err, resp, body) => {
      if (err) {
        resolve({ ok: false, err: '连接失败: ' + err, raw: '' });
        return;
      }
      try {
        const json = JSON.parse(body);
        let list = [];
        if (Array.isArray(json)) {
          list = json;
        } else if (json.policies) {
          list = json.policies;
        }
        resolve({ ok: true, list: list, raw: body.substring(0, 200) });
      } catch (e) {
        resolve({ ok: false, err: '解析失败: ' + e.message, raw: (body || '空').substring(0, 200) });
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
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (err, resp) => {
      const ms = Date.now() - t;
      if (err || !resp) {
        resolve({ ms: 9999, ok: false });
      } else {
        resolve({ ms: ms, ok: true });
      }
    });
  });
}

async function testAll(nodes, url) {
  const map = {};
  const queue = nodes.slice();
  async function run() {
    while (queue.length > 0) {
      const n = queue.shift();
      map[n] = await testOne(n, url);
    }
  }
  await Promise.all(Array(CONCURRENCY).fill(null).map(run));
  return map;
}

(async () => {
  try {
    const api = await getNodeList();
    
    if (!api.ok) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: 'API错误: ' + api.err + '\n\n原始: ' + api.raw,
        style: 'warning'
      });
      return;
    }
    
    // 过滤出实际节点
    const nodes = api.list
      .filter(p => p.name && p.name !== 'DIRECT' && p.name !== 'REJECT')
      .filter(p => {
        if (!p.type) return true;
        return !['Select', 'Smart', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'Group', 'Direct'].includes(p.type);
      })
      .map(p => p.name);
    
    if (nodes.length === 0) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: '节点列表为空\n共获取 ' + api.list.length + ' 条记录\n原始: ' + api.raw,
        style: 'warning'
      });
      return;
    }
    
    const testNodes = nodes.slice(0, MAX_NODES);
    
    const tgMap = await testAll(testNodes, TG_URL);
    const xMap = await testAll(testNodes, X_URL);
    
    const results = testNodes.map(n => {
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
    if (results.length === 0) {
      txt = '全部超时\n测了 ' + testNodes.length + ' 个节点都连不通';
    } else {
      txt += '🏆 ' + results[0].name + '\n';
      txt += '   TG ' + results[0].tg + 'ms | X ' + results[0].x + 'ms\n\n';
      results.slice(0, 8).forEach((r, i) => {
        const e = r.avg < 200 ? '🟢' : r.avg < 400 ? '🟡' : r.avg < 800 ? '🟠' : '🔴';
        txt += (i+1) + '. ' + e + ' ' + r.name + '\n';
        txt += '   TG ' + (r.tg >= 9999 ? '超时' : r.tg+'ms') + ' | X ' + (r.x >= 9999 ? '超时' : r.x+'ms') + '\n';
      });
      txt += '\n测了 ' + testNodes.length + ' 个节点';
    }
    
    $done({
      title: '🎯 TG/X 节点推荐',
      content: txt,
      updateInterval: 600
    });
    
  } catch (e) {
    $done({
      title: '🎯 TG/X 节点推荐',
      content: '异常: ' + e.message,
      style: 'warning'
    });
  }
})();