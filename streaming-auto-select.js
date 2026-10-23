/**
 * 流媒体智能选点脚本
 * 功能：根据每个流媒体策略组的需求，自动测试并切换到最合适的节点
 * 触发：手动触发 / 每天早上8点定时执行
 * 特点：只在非视频播放时段执行，不干扰媒体流
 */

const API_HOST = 'http://127.0.0.1:6171'
const API_PASS = 'ty.20040120'

// 流媒体策略组与区域偏好映射
// key: 策略组名称, value: 优先区域列表（按优先级排序）
const STREAMING_GROUPS = {
  '油管视频': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '奈飞视频': ['美国节点', '日本节点', '新加坡节点', '台湾节点'],
  'TikTok短视频': ['美国节点', '日本节点', '新加坡节点'],
  '推特X': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '动漫漫画': ['日本节点', '台湾节点', '香港节点', '新加坡节点'],
  'Emby影院': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  'AI服务': ['美国节点', '日本节点', '新加坡节点'],
  '电报信息': ['新加坡节点', '日本节点', '香港节点', '台湾节点', '美国节点'],
  '谷歌服务': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '全球媒体': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
}

// 机场节点（延迟测试后排序）
const AIRPORT_GROUPS = ['良心云', '赔钱', '顺畅', '一分']

async function api(path) {
  const res = await fetch(`${API_HOST}${path}`, {
    headers: { 'Authorization': `Bearer ${API_PASS}` }
  })
  return res.json()
}

async function testDelay(policyName) {
  try {
    const data = await api(`/policy/${encodeURIComponent(policyName)}/test`)
    return data.delay || 9999
  } catch (e) {
    return 9999
  }
}

async function getPolicyGroup(groupName) {
  try {
    const data = await api(`/groups/${encodeURIComponent(groupName)}`)
    return data
  } catch (e) {
    return null
  }
}

async function setPolicy(groupName, policyName) {
  try {
    await api(`/groups/${encodeURIComponent(groupName)}/policy/${encodeURIComponent(policyName)}`)
    return true
  } catch (e) {
    return false
  }
}

async function main() {
  const results = []
  const switchLog = []

  $notification.post('流媒体智能选点', '开始测试节点延迟', '请稍候...')

  for (const [groupName, preferredRegions] of Object.entries(STREAMING_GROUPS)) {
    // 获取策略组信息
    const group = await getPolicyGroup(groupName)
    if (!group || !group.options || group.options.length === 0) {
      results.push({ group: groupName, status: '跳过(策略组不存在)' })
      continue
    }

    const currentPolicy = group.current
    let bestPolicy = null
    let bestDelay = 9999

    // 按区域偏好测试节点
    for (const regionGroup of preferredRegions) {
      const regionGroupData = await getPolicyGroup(regionGroup)
      if (!regionGroupData || !regionGroupData.options) continue

      // 测试该区域下所有节点
      for (const node of regionGroupData.options) {
        // 跳过 DIRECT 和 REJECT
        if (node === 'DIRECT' || node === 'REJECT') continue
        if (node.includes('直连')) continue

        const delay = await testDelay(node)
        if (delay < bestDelay && delay < 500) {
          bestDelay = delay
          bestPolicy = node
        }
      }

      // 如果在当前区域找到了可用节点，就不再测试下一个区域
      if (bestPolicy) break
    }

    // 如果区域组没有找到节点，测试机场节点
    if (!bestPolicy) {
      for (const airport of AIRPORT_GROUPS) {
        const airportData = await getPolicyGroup(airport)
        if (!airportData || !airportData.options) continue

        // 测试前5个节点
        const nodes = airportData.options.slice(0, 5)
        for (const node of nodes) {
          if (node === 'DIRECT' || node === 'REJECT') continue
          if (node.includes('直连')) continue

          const delay = await testDelay(node)
          if (delay < bestDelay && delay < 500) {
            bestDelay = delay
            bestPolicy = node
          }
        }
        if (bestPolicy) break
      }
    }

    // 执行切换
    if (bestPolicy && bestPolicy !== currentPolicy) {
      const success = await setPolicy(groupName, bestPolicy)
      if (success) {
        switchLog.push({
          group: groupName,
          from: currentPolicy,
          to: bestPolicy,
          delay: `${bestDelay}ms`
        })
        results.push({
          group: groupName,
          status: `已切换 → ${bestPolicy} (${bestDelay}ms)`
        })
      } else {
        results.push({ group: groupName, status: '切换失败' })
      }
    } else if (bestPolicy === currentPolicy) {
      results.push({ group: groupName, status: `保持 ${currentPolicy} (${bestDelay}ms)` })
    } else {
      results.push({ group: groupName, status: '未找到可用节点' })
    }

    // 间隔1秒，避免请求过快
    await new Promise(r => setTimeout(r, 1000))
  }

  // 发送结果通知
  if (switchLog.length > 0) {
    let message = ''
    for (const item of switchLog) {
      message += `${item.group}: ${item.from} → ${item.to} (${item.delay})\n`
    }
    $notification.post('流媒体选点完成', `切换了${switchLog.length}个策略组`, message)
  } else {
    $notification.post('流媒体选点完成', '所有策略组已是最优节点', '无需切换')
  }

  // 打印详细结果到日志
  console.log('=== 流媒体智能选点结果 ===')
  for (const r of results) {
    console.log(`${r.group}: ${r.status}`)
  }

  $done()
}

main().catch(err => {
  console.log('脚本错误: ' + err.message)
  $notification.post('流媒体选点失败', err.message, '')
  $done()
})
