const POLICY_GROUPS = ['⚡ 电报加速 (Telegram)', '🐦 Twitter最优 (Twitter)'];

function httpGet(url, headers) {
    return new Promise((resolve, reject) => {
        $httpClient.get({url: url, headers: headers || {}, timeout: 5}, (err, resp, body) => {
            if (err) reject(err);
            else resolve({status: resp.status, body: body});
        });
    });
}

async function main() {
    const auth = 'Basic dHkuMjAwNDAxMjA6';
    const headers = {'Authorization': auth};
    
    try {
        const resp = await httpGet('http://127.0.0.1:6171/v1/policies', headers);
        const data = JSON.parse(resp.body);
        const groups = data.filter(p => p.type === 'Selector' && POLICY_GROUPS.includes(p.name));
        
        const lines = [];
        lines.push('📡 社交节点推荐');
        lines.push('');
        
        for (const g of groups) {
            const name = g.name.includes('电报') ? 'Telegram' : 'Twitter/X';
            lines.push(`✅ ${name}`);
            lines.push(`最优节点: ${g.now}`);
            lines.push('');
        }
        
        $done({title: 'TG/X节点推荐', content: lines.join('\n')});
    } catch (e) {
        $done({title: 'TG/X节点推荐', content: '读取失败: ' + e.message});
    }
}

main();