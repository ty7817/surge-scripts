// TG/X 节点测速脚本

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
            var tgTime = tgErr ? 9999 : (Date.now() - tgStart);
            
            // 测试Twitter延迟
            var twStart = Date.now();
            $httpClient.get({
                url: 'https://api.twitter.com/',
                policy: groupName,
                timeout: 5
            }, function(twErr, twResp, twData) {
                var twTime = twErr ? 9999 : (Date.now() - twStart);
                
                // 综合得分：越低越好
                var score = tgTime + twTime;
                
                results.push({
                    name: groupName,
                    tg: tgTime,
                    tw: twTime,
                    score: score
                });
                
                completed++;
                
                if (completed === testGroups.length) {
                    // 按综合得分排序
                    results.sort(function(a, b) {
                        return a.score - b.score;
                    });
                    
                    // 生成输出内容
                    var content = '🏆 推荐排名：\n';
                    for (var j = 0; j < Math.min(3, results.length); j++) {
                        var r = results[j];
                        var medal = j === 0 ? '🥇' : (j === 1 ? '🥈' : '🥉');
                        content += medal + ' ' + r.name + '\n';
                        content += '   TG: ' + (r.tg === 9999 ? '超时' : r.tg + 'ms') + '  X: ' + (r.tw === 9999 ? '超时' : r.tw + 'ms') + '\n';
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