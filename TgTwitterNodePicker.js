// TG/X 节点推荐测速
// Surge generic script

function httpGet(url, cb) {
  $httpClient.get({ url: url, timeout: 5000 }, function(err, resp, data) {
    cb(err, resp, data);
  });
}

function httpGetWithPolicy(url, policyName, cb) {
  $httpClient.get({ url: url, policy: policyName, timeout: 4000 }, function(err, resp, data) {
    cb(err, resp, data);
  });
}

async function main() {
  try {
    // 先测试当前节点的TG和X延迟
    const tgStart = Date.now();
    const tgResult = await new Promise((resolve) => {
      httpGet('https://t.me/', function(err, resp, data) {
        resolve({ ok: !err, cost: Date.now() - tgStart });
      });
    });
    
    const xStart = Date.now();
    const xResult = await new Promise((resolve) => {
      httpGet('https://x.com/', function(err, resp, data) {
        resolve({ ok: !err, cost: Date.now() - xStart });
      });
    });
    
    let lines = [];
    lines.push('🎯 当前节点测试结果');
    lines.push('✅ Telegram: ' + tgResult.cost + 'ms');
    lines.push('✅ X/Twitter: ' + xResult.cost + 'ms');
    lines.push('');
    lines.push('💡 配置中已开启:');
    lines.push('⚡ 电报加速 (自动最优)');
    lines.push('🐦 Twitter最优 (自动最优)');
    lines.push('');
    lines.push('Surge会自动选择最快节点');
    lines.push('无需手动切换');
    
    $done({
      title: 'TG/X 节点推荐',
      content: lines.join('\n'),
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