const TG_URL = 'https://api.telegram.org/';
const X_URL = 'https://api.x.com/robots.txt';
const PROBE_CONCURRENCY = 8;
const PROBE_TIMEOUT = 5;

function api(method, path, body) {
    return new Promise((resolve, reject) => {
        try {
            $httpAPI(method, path, body || {}, (error, result) => {
                if (error) reject(new Error(typeof error === 'string' ? error : error.message || 'API error'));
                else resolve(result);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function extractGroupNames(result) {
    if (!result || typeof result !== 'object') return [];
    const containers = [
        result['policy-groups'], result.policy_groups, result.policyGroups,
        result.groups, result.items
    ];
    for (const c of containers) {
        if (Array.isArray(c)) return c;
    }
    return [];
}

function extractOptionsFromGroup(group) {
    if (!group || typeof group !== 'object') return [];
    if (Array.isArray(group.options)) return group.options;
    if (Array.isArray(group.sub-policies)) return group['sub-policies'];
    if (Array.isArray(group.policies)) return group.policies;
    return [];
}

async function getAllNodes() {
    const result = await api('GET', 'v1/policy_groups');
    const groups = extractGroupNames(result);
    
    const allNodes = new Set();
    for (const g of groups) {
        const gType = (g.type || g.kind || '').toLowerCase();
        if (['select', 'url-test', 'fallback', 'load-balance', 'smart'].includes(gType)) {
            const options = extractOptionsFromGroup(g);
            for (const opt of options) {
                if (typeof opt === 'string') allNodes.add(opt);
                else if (opt && opt.name) allNodes.add(opt.name);
            }
        }
    }
    
    // 去掉内置节点
    const builtins = ['DIRECT', 'REJECT', 'REJECT-DROP', 'GLOBAL', 'FINAL', 'PROXY'];
    for (const b of builtins) allNodes.delete(b);
    
    return Array.from(allNodes);
}

function testNodesWithAPI(nodes, testUrl) {
    return new Promise((resolve) => {
        api('POST', 'v1/policies/test', { policy_names: nodes, url: testUrl })
            .then(result => {
                // 尝试从结果中提取延迟
                const delays = {};
                if (result && typeof result === 'object') {
                    // 格式可能是 {节点名: 延迟ms} 或 {节点名: {latency: xxx}}
                    for (const node of nodes) {
                        const v = result[node];
                        if (typeof v === 'number') delays[node] = v;
                        else if (v && typeof v === 'object') {
                            delays[node] = v.latency || v.delay || v.rtt || null;
                        }
                    }
                }
                resolve(delays);
            })
            .catch(() => resolve(null)); // API失败返回null，降级到直接探测
    });
}

function testNodesDirect(nodes, testUrl) {
    return new Promise((resolve) => {
        const delays = {};
        let cursor = 0;
        let active = 0;
        let settled = 0;
        
        function pump() {
            while (active < PROBE_CONCURRENCY && cursor < nodes.length) {
                const node = nodes[cursor++];
                active++;
                const start = Date.now();
                $httpClient.head({
                    url: testUrl,
                    policy: node,
                    timeout: PROBE_TIMEOUT,
                    'auto-redirect': false
                }, (error, response) => {
                    active--;
                    settled++;
                    if (!error && response && response.status > 0) {
                        delays[node] = Date.now() - start;
                    }
                    if (settled === nodes.length) resolve(delays);
                });
            }
        }
        pump();
    });
}

async function testNodes(nodes, testUrl) {
    // 先尝试用API批量测试
    const apiResult = await testNodesWithAPI(nodes, testUrl);
    if (apiResult && Object.keys(apiResult).length > 0) {
        return apiResult;
    }
    // 降级到直接探测
    return await testNodesDirect(nodes, testUrl);
}

async function main() {
    try {
        const nodes = await getAllNodes();
        
        if (nodes.length === 0) {
            $done({title: 'TG/X节点推荐', content: '未找到可用节点\n请检查配置'});
            return;
        }
        
        // 并发测试TG和X
        const [tgDelays, xDelays] = await Promise.all([
            testNodes(nodes, TG_URL),
            testNodes(nodes, X_URL)
        ]);
        
        // 整理结果
        const results = [];
        for (const node of nodes) {
            const tg = tgDelays[node] || 99999;
            const x = xDelays[node] || 99999;
            const avg = (tg + x) / 2;
            results.push({name: node, tg, x, avg});
        }
        
        // 排序
        results.sort((a, b) => a.avg - b.avg);
        
        // 生成输出
        const lines = [];
        lines.push('🏆 TG/X 节点排名');
        lines.push(`共测试 ${nodes.length} 个节点`);
        lines.push('');
        
        for (let i = 0; i < Math.min(results.length, 10); i++) {
            const r = results[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const tg = r.tg >= 99999 ? '超时' : Math.round(r.tg) + 'ms';
            const x = r.x >= 99999 ? '超时' : Math.round(r.x) + 'ms';
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
            content: '测试失败: ' + e.message + '\n请刷新重试'
        });
    }
}

main();