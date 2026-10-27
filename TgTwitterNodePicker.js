// Telegram & Twitter 节点推荐测速脚本
// Surge generic script

const SURGE_API = 'http://127.0.0.1:6171';
const API_USER = 'ty.20040120';
const TG_TEST_URL = 'https://t.me/';
const X_TEST_URL = 'https://x.com/';
const TIMEOUT = 5000;
const CONCURRENCY = 8;
const TOP_N = 8;

const authHeader = 'Basic ' + $text.base64Encode(API_USER + ':');

function fetchPolicies() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: `${SURGE_API}/v1/policies`,
      headers: { 'Authorization': authHeader },
      timeout: 3000
    }, (error, resp, data) => {
      if (error) return resolve({ error: true, data: null });
      try {
        const json = JSON.parse(data);
        resolve({ error: false, data: json });
      } catch (e) {
        resolve({ error: true, data: null });
      }
    });
  });
}

function testNodeUrl(nodeName, url) {
  return new Promise((resolve) => {
    const start = Date.now();
    $httpClient.get({
      url: url,
      policy: nodeName,
      timeout: TIMEOUT / 1000,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }
    }, (error, response, body) => {
      const ms = Date.now() - start;
      const size = body ? body.length : 0;
      if (error || !response) {
        resolve({ ms: 9999, size: 0, ok: false });
      } else {
        resolve({ ms: ms, size: size, ok: response.status < 500 });
      }
    });
  });
}

async function batchTest(nodes, url) {
  const results = new Map();
  const queue = [...nodes];
  
  async function worker() {
    while (queue.length > 0) {
      const node = queue.shift();
      const r = await testNodeUrl(node, url);
      results.set(node, r);
    }
  }
  
  const workers = Array(CONCURRENCY).fill(null).map(worker);
  await Promise.all(workers);
  return results;
}

function formatMs(ms) {
  if (ms >= 9999) return '超时';
  return ms + 'ms';
}

function pickEmoji(ms) {
  if (ms < 200) return '🟢';
  if (ms < 400) return '🟡';
  if (ms < 800) return '🟠';
  return '🔴';
}

(async () => {
  try {
    const policiesRes = await fetchPolicies();
    
    if (policiesRes.error || !policiesRes.data || !policiesRes.data.policies) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: 'API连接失败\n请检查HTTP API是否开启',
        style: 'warning'
      });
      return;
    }
    
    const allNodes = policiesRes.data.policies
      .filter(p => !['Select', 'Smart', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'SSID', 'Group'].includes(p.type))
      .map(p => p.name);
    
    if (allNodes.length === 0) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: '未获取到节点\n请先更新订阅',
        style: 'warning'
      });
      return;
    }
    
    const testNodes = allNodes.slice(0, 40);
    
    const [tgResults, xResults] = await Promise.all([
      batchTest(testNodes, TG_TEST_URL),
      batchTest(testNodes, X_TEST_URL)
    ]);
    
    const merged = testNodes.map(node => {
      const tg = tgResults.get(node) || { ms: 9999, size: 0, ok: false };
      const x = xResults.get(node) || { ms: 9999, size: 0, ok: false };
      const avg = (tg.ms + x.ms) / 2;
      const totalSize = tg.size + x.size;
      return { 
        node: node, 
        tgMs: tg.ms, 
        xMs: x.ms, 
        avg: avg, 
        ok: tg.ok && x.ok,
        tgSize: tg.size,
        xSize: x.size
      };
    }).filter(r => r.ok)
      .sort((a, b) => a.avg - b.avg);
    
    let content = '';
    
    if (merged.length === 0) {
      content = '所有节点均超时\n请检查网络后刷新';
    } else {
      const best = merged[0];
      content += `🏆 推荐: ${best.node}\n`;
      content += `   TG ${formatMs(best.tgMs)} | X ${formatMs(best.xMs)}\n\n`;
      
      content += `📊 Top ${Math.min(TOP_N, merged.length)} 排名:\n`;
      merged.slice(0, TOP_N).forEach((r, i) => {
        const rank = i + 1;
        content += `${rank}. ${pickEmoji(r.avg)} ${r.node}\n`;
        content += `   TG ${formatMs(r.tgMs)} | X ${formatMs(r.xMs)}\n`;
      });
      
      content += `\n共测试 ${testNodes.length} 个节点`;
    }
    
    $done({
      title: '🎯 TG/X 节点推荐',
      content: content,
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