// TG/X 节点测速推荐脚本
// 通过 Surge HTTP API 获取所有节点，分别测试访问 Telegram 和 Twitter 的延迟

const TG_URL = 'http://149.154.167.51';
const TW_URL = 'https://api.twitter.com/';
const API_BASE = 'http://127.0.0.1:6171';
const API_AUTH = 'Basic dHkuMjAwNDAxMjA6';

function getDelay(url, policy) {
    return new Promise((resolve) => {
        const start = Date.now();
        $httpClient.get({
            url: url,
            policy: policy,
            timeout: 8
        }, (err, resp, data) => {
            const ms = Date.now() - start;
            if (err) {
                resolve({ delay: 9999, ok: false });
            } else {
                resolve({ delay: ms, ok: true });
            }
        });
    });
}

function getAllProxies() {
    return new Promise((resolve) => {
        $httpClient.get({
            url: API_BASE + '/v1/proxies',
            headers: { 'Authorization': API_AUTH }
        }, (err, resp, data) => {
            if (err) {
                resolve([]);
                return;
            }
            try {
                const json = JSON.parse(data);
                const proxies = json.proxies || {};
                const list = [];
                for (let name in proxies) {
                    const p = proxies[name];
                    if (p.type !== 'Selector' && p.type !== 'URLTest' && p.type !== 'Fallback' && p.type !== 'LoadBalance') {
                        list.push(name);
                    }
                }
                resolve(list);
            } catch (e) {
                resolve([]);
            }
        });
    });
}

async function main() {
    const proxies = await getAllProxies();
    
    if (proxies.length === 0) {
        $done({
            title: 'TG/X 节点推荐',
            content: '未获取到节点列表'
        });
        return;
    }
    
    const testList = proxies.slice(0, 20);
    const results = [];
    
    for (const name of testList) {
        const tg = await getDelay(TG_URL, name);
        const tw = await getDelay(TW_URL, name);
        const total = tg.delay + tw.delay;
        results.push({
            name: name,
            tg: tg.delay,
            tw: tw.delay,
            total: total,
            ok: tg.ok && tw.ok
        });
    }
    
    results.sort((a, b) => a.total - b.total);
    
    let content = '共测试' + results.length + '个节点:\n';
    content += '🥇 最优: ' + results[0].name + '\n';
    content += '   TG:' + results[0].tg + 'ms  X:' + results[0].tw + 'ms\n';
    
    if (results.length > 1) {
        content += '🥈 次优: ' + results[1].name + '\n';
        content += '   TG:' + results[1].tg + 'ms  X:' + results[1].tw + 'ms\n';
    }
    
    if (results.length > 2) {
        content += '🥉 第三: ' + results[2].name + '\n';
        content += '   TG:' + results[2].tg + 'ms  X:' + results[2].tw + 'ms\n';
    }
    
    $done({
        title: 'TG/X 节点推荐',
        content: content
    });
}

main();