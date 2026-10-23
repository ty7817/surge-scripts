/**
 * 流量统计面板 v3.0 稳定版
 * 极简设计，确保不会卡住Surge
 */

;(async () => {

  try {
    let traffic = await httpAPI("/v1/traffic")
    let netInterfaces = traffic.interface || {}

    /* 找WiFi网络（en0），找不到就用第一个 */
    let netName = "en0"
    if (!netInterfaces[netName]) {
      let keys = Object.keys(netInterfaces).filter(k => k !== "lo0")
      netName = keys[0] || "en0"
    }

    let network = netInterfaces[netName] || {}

    let upload = formatSize(network.out || 0)
    let download = formatSize(network.in || 0)
    let upSpeed = formatSpeed(network.outCurrentSpeed || 0)
    let downSpeed = formatSpeed(network.inCurrentSpeed || 0)

    $done({
      title: "流量统计",
      content: `上传: ${upload} (${upSpeed})\n下载: ${download} (${downSpeed})`,
      icon: "gauge",
      "icon-color": "#34c759"
    })
  } catch (e) {
    $done({
      title: "流量统计",
      content: "加载失败",
      icon: "gauge",
      "icon-color": "#ff3b30"
    })
  }

})()

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0B"
  let k = 1024
  let units = ["B", "KB", "MB", "GB", "TB"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= units.length) i = units.length - 1
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + units[i]
}

function formatSpeed(bytes) {
  if (!bytes || bytes === 0) return "0B/s"
  let k = 1024
  let units = ["B/s", "KB/s", "MB/s"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= units.length) i = units.length - 1
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + units[i]
}

function httpAPI(path) {
  return new Promise((resolve, reject) => {
    if (typeof $httpAPI === "undefined") {
      reject("httpAPI not available")
      return
    }
    $httpAPI("GET", path, null, (result) => {
      resolve(result)
    })
  })
}
