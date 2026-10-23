/**
 * 流媒体智能选点脚本 v3.0
 * 修正API路径和切换方法
 * 使用Surge原生$httpAPI和$surge.setSelectGroupPolicy
 */

// 流媒体策略组与区域偏好映射（根据用户实际配置定制）
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

const DELAY_THRESHOLD = 500

// Surge原生HTTP API调用
function httpAPI(method, path, body) {
  return new Promise((resolve, reject) => {
    $httpAPI(method, path, body || {}, (result) => {
      if (result && result.error) {
        reject(new Error(result.error))
      } else {
        resolve(result)
      }
    })
  })
}

// 获取策略组当前选择
async function getCurrentPolicy(groupName) {
  try {
    const result = await httpAPI('GET', `/v1/policy_groups/select?group_name=${encodeURIComponent(groupName)}`)
    return result.policy || null
  } catch (e) {
    console.log(`获取${groupName}当前策略失败: ${e.message}`)
    return null
  }
}

// 触发策略组测速
async function triggerTest(groupName) {
  try {
    await httpAPI('POST', '/v1/policy_groups/test', { group_name: groupName })
    return true
  } catch (e) {
    console.log(`触发${groupName}测速失败: ${e.message}`)
    return false
  }
}

// 获取测速结果
async function getTestResults() {
  try {
    const result = await httpAPI('GET', '/v1/policy_groups/test_results')
    return result || {}
  } catch (e) {
    console.log(`获取测速结果失败: ${e.message}`)
    return {}
  }
}

// 切换策略组（使用Surge原生方法）
function setPolicy(groupName, policyName) {
  try {
    $surge.setSelectGroupPolicy(groupName, policyName)
    return true
  } catch (e) {
    console.log(`切换${groupName}到${policyName}失败: ${e.message}`)
    return false
  }
}

// 等待指定毫秒
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const results = []
  const switchLog = []

  $notification.post('流媒体智能选点 v3.0', '开始测试区域节点延迟', '请稍候...')

  // 收集所有需要测试的区域
  const allRegions = new Set()
  for (const regions of Object.values(STREAMING_GROUPS)) {
    for (const r of regions) allRegions.add(r)
  }

  console.log(`需要测试的区域: ${Array.from(allRegions).join(', ')}`)

  // 触发所有区域节点组测速
  for (const region of allRegions) {
    await triggerTest(region)
    await sleep(200)
  }

  // 等待测速完成
  console.log('等待测速完成...')
  await sleep(3000)

  // 获取测速结果
  const testResults = await getTestResults()
  console.log(`测速结果keys: ${Object.keys(testResults).join(', ')}`)

  // 解析各区域延迟
  const regionDelay = {}
  for (const region of allRegions) {
    if (testResults[region]) {
      const regionResult = testResults[region]
      let minDelay = 9999
      for (const policy in regionResult) {
        const delay = regionResult[policy]
        if (typeof delay === 'number' && delay < minDelay) {
          minDelay = delay
        }
      }
      regionDelay[region] = minDelay
    } else {
      regionDelay[region] = 9999
    }
    console.log(`区域 ${region} 最低延迟: ${regionDelay[region]}ms`)
  }

  // 为每个流媒体策略组选点
  for (const [groupName, preferredRegions] of Object.entries(STREAMING_GROUPS)) {
    const currentPolicy = await getCurrentPolicy(groupName)
    let bestRegion = null
    let bestDelay = 9999

    // 按区域偏好选择延迟最低的区域
    for (const region of preferredRegions) {
      const delay = regionDelay[region] || 9999
      if (delay < bestDelay && delay < DELAY_THRESHOLD) {
        bestDelay = delay
        bestRegion = region
      }
    }

    // 如果偏好区域都超过阈值，选延迟最低的那个
    if (!bestRegion) {
      for (const region of preferredRegions) {
        const delay = regionDelay[region] || 9999
        if (delay < bestDelay) {
          bestDelay = delay
          bestRegion = region
        }
      }
    }

    // 执行切换
    if (bestRegion && bestRegion !== currentPolicy) {
      const success = setPolicy(groupName, bestRegion)
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

    await sleep(300)
  }

  // 发送结果通知
  if (switchLog.length > 0) {
    let message = ''
    for (const item of switchLog) {
      message += `${item.group}: ${item.from} → ${item.to} (${item.delay})
`
    }
    $notification.post('流媒体选点完成', `切换了${switchLog.length}个策略组`, message)
  } else {
    $notification.post('流媒体选点完成', '所有策略组已是最优区域', '无需切换')
  }

  // 打印详细结果
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
