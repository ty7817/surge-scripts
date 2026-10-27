const TG_URL = 'https://api.telegram.org/';
const X_URL = 'https://api.x.com/robots.txt';

function httpAPI(method, path, body) {
    return new Promise((resolve, reject) => {
        $httpAPI(method, path, body || {}, (result) => {
            if (result.error) reject(new Error(result.error));
            else resolve(result);
        });
    });
}

async function main() {
    try {
        // 1. 获取所有策略组
        const groupsResult = await httpAPI('GET', '/v1/policy_groups');
        const groups = groupsResult.groups || [];
        
        // 2. 收集所有节点（去重）
        const allNodes = new Set();
        for (const g of groups) {
            if (g.type === 'Selector' || g.type === 'URLTest' || g.type === 'Fallback') {
                for (const node of g.options || []) {
                    allNodes.add(node);
                }
            }
        }
        
        const nodes = Array.from(allNodes);
        if (nodes.length === 0) {
            $done({title: 'TG/X节点推荐', content: '未找到节点'});
            return;
        }
        
        // 3. 批量测试Telegram延迟
        const tgResult = await httpAPI('POST', '/v1/policies/test', {
            policy_names: nodes,
            url: TG_URL
        });
        
        // 4. 批量测试Twitter延迟
        const xResult = await httpAPI('POST', '/v1/policies/test', {
            policy_names: nodes,
            url: X_URL
        });
        
        // 5. 整理结果并排名
        const results = [];
        for (const node of nodes) {
            const tgDelay = tgResult[node] || 99999;
            const xDelay = xResult[node] || 99999;
            const avg = (tgDelay + xDelay) / 2;
            results.push({name: node, tg: tgDelay, x: xDelay, avg: avg});
        }
        
        // 按综合延迟排序
        results.sort((a, b) => a.avg - b.avg);
        
        // 6. 生成输出
        const lines = [];
        lines.push('🏆 TG/X 节点排名');
        lines.push('');
        
        for (let i = 0; i < Math.min(results.length, 10); i++) {
            const r = results[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const tg = r.tg >= 99999 ? '超时' : r.tg + 'ms';
            const x = r.x >= 99999 ? '超时' : r.x + 'ms';
            lines.push(`${medal} ${r.name}`);
            lines.push(`   TG: ${tg} | X: ${x}`);
        }
        
        $done({
            title: 'TG/X节点推荐',
            content: lines.join('\n')
        });
    } catch (e) {
        $done({
            title: 'TG/X节点推荐',
            content: '测试失败: ' + e.message
        });
    }
}

main();