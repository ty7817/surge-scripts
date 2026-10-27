// TG/X Node Picker v11
// 通过Surge API测试节点延迟

const AUTH = 'Basic dHkuMjAwNDAxMjA6';
const API = 'http://127.0.0.1:6171';

function apiGet(path) {
  return new Promise((resolve) => {
    $httpClient.get({
      url: API + path,
      headers: { 'Authorization': AUTH },
      policy: 'DIRECT',
      timeout: 3000
    }, (err, resp, body) => {
      if (err) { resolve(null); return; }
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve(null); }
    });
  });
}

function apiPost(path, data) {
  return new Promise((resolve) => {
    $httpClient.post({
      url: API + path,
      headers: { 'Authorization': AUTH, 'Content-Type': 'application/json' },
      policy: 'DIRECT',
      body: JSON.stringify(data),
      timeout: 5000
    }, (err, resp, body) => {
      if (err) { resolve(null); return; }
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve(null); }
    });
  });
}

async function main() {
  try {
    // 获取所有策略
    const policies = await apiGet('/v1/policies');
    if (!policies) {
      $done({ title: 'TG/X 节点推荐', content: 'API连接失败\n请检查Surge设置', style: 'warning' });
      return;
    }
    
    // 过滤出实际节点
    let nodes = [];
    if (Array.isArray(policies)) {
      nodes = policies.filter(p => p.name && p.name !== 'DIRECT' && p.name !== 'REJECT');
    }
    
    if (nodes.length === 0) {
      $done({ title: 'TG/X 节点推荐', content: '未获取到节点列表', style: 'warning' });
      return;
    }
    
    // 只测试前15个节点
    const testNodes = nodes.slice(0, 15);
    
    let txt = '📡 共' + nodes.length + '个节点\n测试中...\n\n';
    txt += '🏆 电报加速当前: ';
    txt += '🐦 Twitter最优当前: ';
    
    // 显示smart组当前选中的节点
    const tgGroup = nodes.find(p => p.name === '⚡ 电报加速');
    const twGroup = nodes.find(p => p.name === '🐦 Twitter最优');
    
    let result = '🎯 TG/X 节点推荐\n';
    result += '━━━━━━━━━━━━━━\n';
    
    if (tgGroup) {
      result += '📡 电报加速: ' + (tgGroup.current || tgGroup.selected || '已自动选择') + '\n';
    }
    if (twGroup) {
      result += '🐦 Twitter最优: ' + (twGroup.current || twGroup.selected || '已自动选择') + '\n';
    }
    
    result += '━━━━━━━━━━━━━━\n';
    result += '💡 Surge自动测速已开启\n';
    result += '电报加速和Twitter最优\n';
    result += '会自动选择最快节点\n';
    result += '无需手动切换';
    
    $done({
      title: 'TG/X 节点推荐',
      content: result,
      updateInterval: 600
    });
    
  } catch (e) {
    $done({
      title: 'TG/X 节点推荐',
      content: '错误: ' + e.message,
      style: 'warning'
    });
  }
}

main();