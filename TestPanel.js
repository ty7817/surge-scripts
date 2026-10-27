// 测试能否获取节点列表
const API_BASE = 'http://127.0.0.1:6171';
const API_AUTH = 'Basic dHkuMjAwNDAxMjA6';

$httpClient.get({
    url: API_BASE + '/v1/proxies',
    headers: { 'Authorization': API_AUTH }
}, (err, resp, data) => {
    if (err) {
        $done({
            title: 'TG/X 节点推荐',
            content: 'API调用失败: ' + err
        });
        return;
    }
    
    try {
        const json = JSON.parse(data);
        const proxies = json.proxies || {};
        const names = Object.keys(proxies);
        $done({
            title: 'TG/X 节点推荐',
            content: '获取到' + names.length + '个节点\n' + names.slice(0, 5).join('\n')
        });
    } catch (e) {
        $done({
            title: 'TG/X 节点推荐',
            content: 'JSON解析失败: ' + e.message + '\n返回: ' + data.substring(0, 100)
        });
    }
});