// Telegram & Twitter 节点推荐测速脚本 v2
// Surge generic script

const SURGE_API = 'http://127.0.0.1:6171';
const API_USER = 'ty.20040120';
const TG_TEST_URL = 'https://t.me/';
const X_TEST_URL = 'https://x.com/';
const TIMEOUT = 4;
const CONCURRENCY = 5;
const TOP_N = 8;
const MAX_NODES = 25;

const authHeader = 'Basic ' + $text.base64Encode(API_USER + ':');

function fetchPolicies() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: `${SURGE_API}/v1/policies`,
      headers: { 'Authorization': authHeader },
      timeout: 3000
    }, (error, resp, data) => {
      if (error) return resolve({ error: 'API请求失败: ' + error, data: null });
      try {
        const json = JSON.parse(data);
        // Surge API可能返回数组或对象
        let policies = [];
        if (Array.isArray(json)) {
          policies = json;
        } else if (json.policies) {
          policies = json.policies;
        } else if (json.proxies) {
          policies = json.proxies;
        }
        resolve({ error: null, policies: policies });
      } catch (e) {
        resolve({ error: 'JSON解析失败: ' + e.message + ' 原始数据: ' + (data || '空').substring(0, 100), data: null });
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
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (error, response, body) => {
      const ms = Date.now() - start;
      if (error || !response) {
        resolve({ ms: 9999, ok: false });
      } else {
        resolve({ ms: ms, ok: response.status < 500 });
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
    
    if (policiesRes.error) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: 'API错误: ' + policiesRes.error,
        style: 'warning'
      });
      return;
    }
    
    let allNodes = policiesRes.policies
      .filter(p => {
        // 排除策略组，只保留实际节点
        if (p.type && ['Select', 'Smart', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'SSID', 'Group', 'Direct', 'Reject'].includes(p.type)) {
          return false;
        }
        // 排除DIRECT等特殊节点
        if (['DIRECT', 'REJECT', 'REJECT-DROP', 'COMPATIBLE'].includes(p.name)) {
          return false;
        }
        return true;
      })
      .map(p => p.name);
    
    if (allNodes.length === 0) {
      // 如果过滤后为空，就用所有非DIRECT节点
      allNodes = policiesRes.policies
        .filter(p => !['DIRECT', 'REJECT', 'REJECT-DROP'].includes(p.name))
        .map(p => p.name);
    }
    
    if (allNodes.length === 0) {
      $done({
        title: '🎯 TG/X 节点推荐',
        content: '未获取到节点\n请先更新订阅',
        style: 'warning'
      });
      return;
    }
    
    const testNodes = allNodes.slice(0, MAX_NODES);
    
    // 先测TG，再测X（避免并发太高）
    const tgResults = await batchTest(testNodes, TG_TEST_URL);
    const xResults = await batchTest(testNodes, X_TEST_URL);
    
    const merged = testNodes.map(node => {
      const tg = tgResults.get(node) || { ms: 9999, ok: false };
      const x = xResults.get(node) || { ms: 9999, ok: false };
      const avg = (tg.ms + x.ms) / 2;
      return { 
        node: node, 
        tgMs: tg.ms, 
        xMs: x.ms, 
        avg: avg, 
        ok: tg.ok && x.ok
      };
    }).filter(r => r.ok)
      .sort((a, b) => a.avg - b.avg);
    
    let content = '';
    
    if (merged.length === 0) {
      content = '所有节点均超时\n请检查网络后刷新\n\n共尝试 ' + testNodes.length + ' 个节点';
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
      
      content += `\n共测试 ${testNodes.length} 节点，${merged.length} 个可用`;
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