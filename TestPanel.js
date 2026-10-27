// 测试用$httpAPI获取节点列表

$httpAPI.get('/v1/proxies', (data) => {
    if (!data) {
        $done({
            title: 'TG/X 节点推荐',
            content: 'API返回空数据'
        });
        return;
    }
    
    try {
        const proxies = data.proxies || {};
        const names = Object.keys(proxies);
        $done({
            title: 'TG/X 节点推荐',
            content: '获取到' + names.length + '个节点\n' + names.slice(0, 5).join('\n')
        });
    } catch (e) {
        $done({
            title: 'TG/X 节点推荐',
            content: '解析失败: ' + e.message + '\n数据: ' + JSON.stringify(data).substring(0, 100)
        });
    }
});