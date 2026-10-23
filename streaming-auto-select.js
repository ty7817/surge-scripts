/**
 * 流媒体智能选点脚本 v2.0
 * 基于用户实际配置定制
 * 功能：根据每个流媒体策略组的区域偏好，自动测试区域节点组延迟，切换到最优区域
 * 触发：每天早上8点定时执行（非视频播放时段）
 * 特点：区域节点组已是url-test自动测速，脚本只需选区域
 */

const API_HOST = 'http://127.0.0.1:6171'
const API_PASS = 'ty.20040120'

// 流媒体策略组与区域偏好映射（根据用户实际配置定制）
// key: 策略组名称, value: 优先区域列表（按优先级排序，区域为SERVER页的节点组名）
const STREAMING_GROUPS = {
  '油管视频': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '奈飞视频': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  'TikTok短视频': ['美国节点', '日本节点', '新加坡节点', '香港节点'],
  '推特X': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '动漫漫画': ['香港节点', '新加坡节点', '美国节点', '台湾节点', '韩国节点'],  // 排除日本节点
  'Emby影院': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  'AI服务': ['美国节点', '日本节点', '⚙️ 我的节点'],
  '电报信息': ['新加坡节点', '日本节点', '香港节点', '台湾节点', '美国节点'],
  '谷歌服务': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  '全球媒体': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
  'GitHub': ['日本节点', '美国节点', '香港节点', '台湾节点', '新加坡节点'],
  'GameBus视频网站': ['美国节点', '日本节点', '新加坡节点', '台湾节点', '香港节点'],
}

// 延迟阈值（毫秒）
const DELAY_THRESHOLD = 500

async function api(path) {
  const res = await fetch(`${API_HOST}${path}`, {
    headers: { 'Authorization': `Bearer ${API_PASS}` }
  })
  return res.json()
}

async function getGroupDelay(groupName) {
  // 获取策略组信息，包含当前延迟
  try {
    const data = await api(`/groups/${encodeURIComponent(groupName)}`)
    if (data && data.overallDelay !== undefined) {
      return data.overallDelay
    }
    // 如果没有overallDelay，尝试测试当前节点
    if (data && data.current) {
      const testData = await api(`/policy/${encodeURIComponent(data.current)}/test`)
      return testData.delay || 9999
    }
    return 9999
  } catch (e) {
    return 9999
  }
}

async function getCurrentPolicy(groupName) {
  try {
    const data = await api(`/groups/${encodeURIComponent(groupName)}`)
    return data ? data.current : null
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

async function groupExists(groupName) {
  try {
    await api(`/groups/${encodeURIComponent(groupName)}`)
    return true
  } catch (e) {
    return false
  }
}

async function main() {
  const results = []
  const switchLog = []
  const regionDelayCache = {}

  $notification.post('流媒体智能选点 v2.0', '开始测试区域节点延迟', '请稍候...')

  // 预取所有区域节点组的延迟（缓存，避免重复测试）
  const allRegions = new Set()
  for (const regions of Object.values(STREAMING_GROUPS)) {
    for (const r of regions) allRegions.add(r)
  }

  for (const region of allRegions) {
    if (await groupExists(region)) {
      regionDelayCache[region] = await getGroupDelay(region)
      console.log(`区域 ${region} 延迟: ${regionDelayCache[region]}ms`)
    } else {
      regionDelayCache[region] = 9999
      console.log(`区域 ${region} 不存在`)
    }
  }

  console.log('=== 开始为每个流媒体策略组选点 ===')

  for (const [groupName, preferredRegions] of Object.entries(STREAMING_GROUPS)) {
    // 检查策略组是否存在
    if (!await groupExists(groupName)) {
      results.push({ group: groupName, status: '跳过(策略组不存在)' })
      continue
    }

    const currentPolicy = await getCurrentPolicy(groupName)
    let bestRegion = null
    let bestDelay = 9999

    // 按区域偏好选择延迟最低的区域
    for (const region of preferredRegions) {
      const delay = regionDelayCache[region] || 9999
      if (delay < bestDelay && delay < DELAY_THRESHOLD) {
        bestDelay = delay
        bestRegion = region
      }
    }

    // 如果偏好区域都超过阈值，选延迟最低的那个（即使超阈值）
    if (!bestRegion) {
      for (const region of preferredRegions) {
        const delay = regionDelayCache[region] || 9999
        if (delay < bestDelay) {
          bestDelay = delay
          bestRegion = region
        }
      }
    }

    // 执行切换
    if (bestRegion && bestRegion !== currentPolicy) {
      const success = await setPolicy(groupName, bestRegion)
      if (success) {
        switchLog.push({
          group: groupName,
          from: currentPolicy,
          to: bestRegion,
          delay: `${bestDelay}ms`
        })
        results.push({
          group: groupName,
          status: `已切换 → ${bestRegion} (${bestDelay}ms)`
        })
      } else {
        results.push({ group: groupName, status: '切换失败' })
      }
    } else if (bestRegion === currentPolicy) {
      results.push({ group: groupName, status: `保持 ${currentPolicy} (${bestDelay}ms)` })
    } else {
      results.push({ group: groupName, status: '未找到可用区域' })
    }

    // 间隔0.5秒
    await new Promise(r => setTimeout(r, 500))
  }

  // 发送结果通知
  if (switchLog.length > 0) {
    let message = ''
    for (const item of switchLog) {
      message += `${item.group}: ${item.from} → ${item.to} (${item.delay})\n`
    }
    $notification.post('流媒体选点完成', `切换了${switchLog.length}个策略组`, message)
  } else {
    $notification.post('流媒体选点完成', '所有策略组已是最优区域', '无需切换')
  }

  // 打印详细结果到日志
  console.log('=== 流媒体智能选点结果 ===')
  for (const r of results) {
    console.log(`${r.group}: ${r.status}`)
  }
  console.log('=== 区域延迟缓存 ===')
  for (const [region, delay] of Object.entries(regionDelayCache)) {
    console.log(`${region}: ${delay}ms`)
  }

  $done()
}

main().catch(err => {
  console.log('脚本错误: ' + err.message)
  $notification.post('流媒体选点失败', err.message, '')
  $done()
})
