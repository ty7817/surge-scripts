// TG/X 节点测速脚本 - 优化版

// 要测试的策略组列表
var testGroups = [
    '香港节点',
    '日本节点', 
    '美国节点',
    '新加坡节点',
    '台湾节点',
    '韩国节点'
];

var results = [];
var completed = 0;
var startTime = Date.now();

// 测试每个策略组
for (var i = 0; i < testGroups.length; i++) {
    (function(groupName) {
        // 测试Telegram延迟
        var tgStart = Date.now();
        $httpClient.get({
            url: 'http://149.154.167.51',
            policy: groupName,
            timeout: 5
        }, function(tgErr, tgResp, tgData) {
            var tgTime = tgErr ? -1 : (Date.now() - tgStart);
            
            // 测试Twitter延迟
            var twStart = Date.now();
            $httpClient.get({
                url: 'https://api.twitter.com/',
                policy: groupName,
                timeout: 5
            }, function(twErr, twResp, twData) {
                var twTime = twErr ? -1 : (Date.now() - twStart);
                
                // 计算综合得分：有效延迟取平均值，超时的权重加倍
                var tgScore = tgTime === -1 ? 9999 : tgTime;
                var twScore = twTime === -1 ? 9999 : twTime;
                var score = (tgScore + twScore) / 2;
                
                results.push({
                    name: groupName,
                    tg: tgTime,
                    tw: twTime,
                    score: score
                });
                
                completed++;
                
                if (completed === testGroups.length) {
                    // 按综合得分排序（越低越好）
                    results.sort(function(a, b) {
                        return a.score - b.score;
                    });
                    
                    // 生成输出内容
                    var now = new Date();
                    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                    
                    var content = '📊 综合排名（越低越快）\n';
                    content += '⏰ 更新时间: ' + timeStr + '\n\n';
                    
                    for (var j = 0; j < results.length; j++) {
                        var r = results[j];
                        var medal = j === 0 ? '🥇' : (j === 1 ? '🥈' : (j === 2 ? '🥉' : (j + 1) + '.'));
                        
                        var tgStr = r.tg === -1 ? '超时' : r.tg + 'ms';
                        var twStr = r.tw === -1 ? '超时' : r.tw + 'ms';
                        
                        content += medal + ' ' + r.name + '\n';
                        content += '   TG: ' + tgStr + '  X: ' + twStr + '\n';
                    }
                    
                    $done({
                        title: 'TG/X 节点推荐',
                        content: content
                    });
                }
            });
        });
    })(testGroups[i]);
}