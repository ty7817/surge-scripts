// TG/X 节点推荐 - 读取Surge自动测速结果
// Surge generic script

const AUTH = 'Basic dHkuMjAwNDAxMjA6';

function apiGet(path) {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'http://127.0.0.1:6171' + path,
      headers: { 'Authorization': AUTH },
      timeout: 3000
    }, (err, resp, body) => {
      if (err) { resolve(null); return; }
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve(null); }
    });
  });
}

async function main() {
  try {
    const data = await apiGet('/v1/policies');
    
    if (!data) {
      $done({
        title: 'TG/X 节点推荐',
        content: 'API连接失败\n请检查Surge设置',
        icon: 'exclamationmark.triangle',
        'icon-color': '#ff3b30'
      });
      return;
    }
    
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data.policies) list = data.policies;
    
    // 找电报加速和Twitter最优
    const tgGroup = list.find(p => p.name === '⚡ 电报加速');
    const twGroup = list.find(p => p.name === '🐦 Twitter最优');
    const mainGroup = list.find(p => p.name === '主节点');
    
    let txt = '🎯 Surge自动测速结果\n';
    txt += '━━━━━━━━━━━━━━\n';
    
    if (tgGroup) {
      txt += '📡 电报加速:\n';
      txt += '   当前节点: ' + (tgGroup.current || tgGroup.selected || '自动选择') + '\n';
      if (tgGroup.delay) txt += '   延迟: ' + tgGroup.delay + 'ms\n';
    }
    
    txt += '\n';
    
    if (twGroup) {
      txt += '🐦 Twitter最优:\n';
      txt += '   当前节点: ' + (twGroup.current || twGroup.selected || '自动选择') + '\n';
      if (twGroup.delay) txt += '   延迟: ' + twGroup.delay + 'ms\n';
    }
    
    txt += '\n━━━━━━━━━━━━━━\n';
    txt += '💡 Surge每300秒自动测速\n';
    txt += '自动切换最快节点\n';
    txt += '无需手动操作';
    
    $done({
      title: 'TG/X 节点推荐',
      content: txt,
      icon: 'target',
      'icon-color': '#ff9500'
    });
    
  } catch (e) {
    $done({
      title: 'TG/X 节点推荐',
      content: '错误: ' + e.message,
      icon: 'exclamationmark.triangle',
      'icon-color': '#ff3b30'
    });
  }
}

main();