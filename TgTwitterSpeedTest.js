/**
 * Telegram/Twitter 节点测速排名脚本
 * 在Surge面板显示各节点到 t.me / x.com 的延迟，自动推荐最优
 * 作者: ty7817
 * 版本: v1.0
 */

const SURGE_API = 'http://127.0.0.1:6171';
const TEST_TG_URL = 'https://t.me';
const TEST_X_URL = 'https://x.com';
const TIMEOUT = 5000;
const CONCURRENCY = 6;
const TOP_N = 5;

function fetchPolicies() {
  return new Promise((resolve) => {
    $httpClient.get({ url: `${SURGE_API}/v1/policies`, timeout: 3000 }, (error, resp, data) => {
      if (error) return resolve([]);
      try {
        const json = JSON.parse(data);
        resolve(json.policies || []);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

function testNode(nodeName, targetUrl) {
  return new Promise((resolve) => {
    const start = Date.now();
    $httpClient.get({
      url: targetUrl,
      policy: nodeName,
      timeout: TIMEOUT / 1000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (error, response) => {
      const ms = Date.now() - start;
      if (error || !response) {
        resolve({ node: nodeName, ms: 9999, ok: false });
      } else {
        resolve({ node: nodeName, ms: ms, ok: response.status < 500 });
      }
    });
  });
}

async function batchTest(nodes, targetUrl) {
  const results = new Map();
  const queue = [...nodes];
  
  async function worker() {
    while (queue.length > 0) {
      const node = queue.shift();
      const r = await testNode(node, targetUrl);
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
  if (ms < 500) return '🟡';
  if (ms < 1000) return '🟠';
  return '🔴';
}

(async () => {
  try {
    const policies = await fetchPolicies();
    
    // 获取所有实际节点（排除策略组）
    const allNodes = policies
      .filter(p => !['Select', 'Smart', 'URLTest', 'Fallback', 'LoadBalance', 'Relay'].includes(p.type))
      .map(p => p.name);
    
    if (allNodes.length === 0) {
      $done({
        title: '📡 TG/X节点测速',
        content: '未获取到节点列表\n请检查Surge API是否开启',
        style: 'warning'
      });
      return;
    }
    
    // 限制测试节点数量
    const testNodes = allNodes.slice(0, 30);
    
    // 并行测试 t.me 和 x.com
    const [tgResults, xResults] = await Promise.all([
      batchTest(testNodes, TEST_TG_URL),
      batchTest(testNodes, TEST_X_URL)
    ]);
    
    // 合并结果并排序
    const merged = testNodes.map(node => {
      const tg = tgResults.get(node) || { ms: 9999, ok: false };
      const x = xResults.get(node) || { ms: 9999, ok: false };
      const avg = (tg.ms + x.ms) / 2;
      return { node, tgMs: tg.ms, xMs: x.ms, avg, ok: tg.ok && x.ok };
    }).filter(r => r.ok)
      .sort((a, b) => a.avg - b.avg);
    
    let content = '';
    
    if (merged.length === 0) {
      content = '所有节点均超时\n请检查网络后刷新';
    } else {
      const best = merged[0];
      content += `🏆 最优节点: ${best.node}\n`;
      content += `   TG ${formatMs(best.tgMs)} | X ${formatMs(best.xMs)}\n\n`;
      
      content += `📊 Top ${Math.min(TOP_N, merged.length)} 排名:\n`;
      merged.slice(0, TOP_N).forEach((r, i) => {
        const rank = i + 1;
        content += `${rank}. ${pickEmoji(r.avg)} ${r.node}\n`;
        content += `   TG ${formatMs(r.tgMs)} | X ${formatMs(r.xMs)}\n`;
      });
    }
    
    $done({
      title: '📡 TG/X节点测速排名',
      content: content,
      updateInterval: 300
    });
    
  } catch (e) {
    $done({
      title: '📡 TG/X节点测速',
      content: '脚本错误: ' + e.message,
      style: 'warning'
    });
  }
})();