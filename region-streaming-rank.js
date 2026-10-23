/**
 * 地区节点流媒体+延迟综合排名脚本 v1.2
 * 修正API路径，优化测试逻辑
 * 
 * 综合评分 = 流媒体通过率 * 60% + 延迟得分 * 40%
 * 智能策略：先测当前节点，流媒体不达标才遍历其他节点
 */

const REGION_GROUPS = ['香港节点', '美国节点', '日本节点', '台湾节点', '新加坡节点', '韩国节点']

const DELAY_TEST_URL = 'http://www.gstatic.com/generate_204'

const STREAMING_TESTS = [
  { name: 'Netflix', url: 'https://www.netflix.com/title/80113701' },
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Disney+', url: 'https://www.disneyplus.com/' },
]

const STREAMING_WEIGHT = 60
const DELAY_WEIGHT = 40
const STREAMING_THRESHOLD = 2
const MAX_EXTRA_TEST = 2

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

async function getAllPolicyGroups() {
  try {
    const result = await httpAPI('GET', '/v1/policy_groups')
    return result || []
  } catch (e) {
    console.log('获取策略组列表失败: ' + e.message)
    return []
  }
}

async function getCurrentPolicy(groupName) {
  try {
    const result = await httpAPI('GET', `/v1/policy_groups/select?group_name=${encodeURIComponent(groupName)}`)
    return result.policy || null
  } catch (e) {
    console.log(`获取${groupName}当前策略失败: ${e.message}`)
    return null
  }
}

async function getGroupNodes(groupName) {
  try {
    const allGroups = await getAllPolicyGroups()
    const group = allGroups.find(g => g.name === groupName || g.group_name === groupName)
    if (group) {
      return group.policies || group.nodes || group.list || []
    }
    return []
  } catch (e) {
    console.log(`获取${groupName}节点列表失败: ${e.message}`)
    return []
  }
}

function setPolicy(groupName, policyName) {
  try {
    $surge.setSelectGroupPolicy(groupName, policyName)
    return true
  } catch (e) {
    console.log(`切换${groupName}到${policyName}失败: ${e.message}`)
    return false
  }
}

async function testDelay() {
  const start = Date.now()
  try {
    await $httpClient.get(DELAY_TEST_URL, { timeout: 5000 })
    return Date.now() - start
  } catch (e) {
    return 9999
  }
}

async function testStreaming() {
  let passCount = 0
  for (const test of STREAMING_TESTS) {
    try {
      const res = await $httpClient.get(test.url, { timeout: 6000 })
      if (res.status >= 200 && res.status < 400) {
        passCount++
      }
    } catch (e) {
      // 失败不计分
    }
  }
  return passCount
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function calcScore(delay, streamingPass) {
  const streamingScore = (streamingPass / STREAMING_TESTS.length) * STREAMING_WEIGHT
  const delayScore = Math.max(0, Math.min(40, (1000 - delay) / 1000 * DELAY_WEIGHT))
  return streamingScore + delayScore
}

async function testNode(groupName, nodeName) {
  setPolicy(groupName, nodeName)
  await sleep(1500)  // 等待切换生效
  
  const delay = await testDelay()
  const streamingPass = await testStreaming()
  const score = calcScore(delay, streamingPass)
  
  console.log(`  节点 ${nodeName}: 延迟=${delay}ms, 流媒体=${streamingPass}/${STREAMING_TESTS.length}, 评分=${score.toFixed(1)}`)
  
  return {
    node: nodeName,
    delay: delay,
    streamingPass: streamingPass,
    score: score
  }
}

async function main() {
  $notification.post('地区节点综合排名', '开始测试...', '请稍候')

  const regionResults = []

  for (const groupName of REGION_GROUPS) {
    console.log(`\n=== 测试 ${groupName} ===`)

    const currentNode = await getCurrentPolicy(groupName)
    console.log(`当前节点: ${currentNode}`)

    if (!currentNode) {
      regionResults.push({
        group: groupName,
        bestNode: '获取失败',
        delay: '-',
        streaming: '-',
        score: 0,
        switched: false
      })
      continue
    }

    // 测试当前节点
    const currentResult = await testNode(groupName, currentNode)
    
    let bestResult = currentResult
    let switched = false

    // 如果流媒体不达标，尝试其他节点
    if (currentResult.streamingPass < STREAMING_THRESHOLD) {
      console.log(`  当前节点流媒体不达标(${currentResult.streamingPass}/${STREAMING_TESTS.length})，尝试备选节点...`)
      
      const allNodes = await getGroupNodes(groupName)
      console.log(`  ${groupName} 共有 ${allNodes.length} 个节点`)
      
      const candidates = allNodes.filter(n => n !== currentNode).slice(0, MAX_EXTRA_TEST)
      
      for (const candidate of candidates) {
        const candidateResult = await testNode(groupName, candidate)
        
        if (candidateResult.score > bestResult.score) {
          bestResult = candidateResult
        }
      }
    }

    // 切换到最优节点
    if (bestResult.node !== currentNode) {
      setPolicy(groupName, bestResult.node)
      switched = true
      console.log(`  切换到最优节点: ${bestResult.node}`)
    }

    regionResults.push({
      group: groupName,
      bestNode: bestResult.node,
      delay: `${bestResult.delay}ms`,
      streaming: `${bestResult.streamingPass}/${STREAMING_TESTS.length}`,
      score: bestResult.score,
      switched: switched
    })
  }

  // 按综合评分排序
  regionResults.sort((a, b) => b.score - a.score)

  // 发送结果通知
  let message = ''
  let switchCount = 0
  for (let i = 0; i < regionResults.length; i++) {
    const r = regionResults[i]
    const switchMark = r.switched ? '🔄' : '✅'
    message += `${switchMark} #${i+1} ${r.group}: ${r.bestNode}\n   延迟${r.delay} 流媒体${r.streaming} 评分${r.score.toFixed(1)}\n`
    if (r.switched) switchCount++
  }
  $notification.post('地区节点综合排名完成', `测试${regionResults.length}个地区，切换${switchCount}个`, message)

  console.log('\n=== 最终排名 ===')
  for (let i = 0; i < regionResults.length; i++) {
    const r = regionResults[i]
    const mark = r.switched ? '已切换' : '保持'
    console.log(`#${i+1} ${r.group}: ${r.bestNode} (延迟${r.delay}, 流媒体${r.streaming}, 评分${r.score.toFixed(1)}) [${mark}]`)
  }

  $done()
}

main().catch(err => {
  console.log('脚本错误: ' + err.message)
  $notification.post('地区节点排名失败', err.message, '')
  $done()
})
