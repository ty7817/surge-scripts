/**
 * 流量统计面板 v3.1 功能完整版
 * 保留全部功能，优化稳定性
 */

let params = getParams($argument)

;(async () => {

  try {
    let traffic = await httpAPI("/v1/traffic")
    let netInterfaces = traffic.interface || {}

    /* 获取所有网络界面，过滤lo0 */
    let allNet = Object.keys(netInterfaces).filter(k => k !== "lo0")
    if (allNet.length === 0) allNet = ["en0"]

    /* 读取上次选择的网络 */
    let savedNet = $persistentStore.read("TRAFFIC_NET") || ""
    let index = allNet.indexOf(savedNet)
    if (index < 0) index = 0

    /* 点击切换 */
    if ($trigger == "button" && allNet.length > 1) {
      index = (index + 1) % allNet.length
      $persistentStore.write(allNet[index], "TRAFFIC_NET")
    }

    let netName = allNet[index]
    let network = netInterfaces[netName] || {}

    let upload = formatSize(network.out || 0)
    let download = formatSize(network.in || 0)
    let upSpeed = formatSpeed(network.outCurrentSpeed || 0)
    let downSpeed = formatSpeed(network.inCurrentSpeed || 0)
    let upMax = formatSpeed(network.outMaxSpeed || 0)
    let downMax = formatSpeed(network.inMaxSpeed || 0)

    /* 判断网络类型 */
    let netType = "WiFi"
    if (netName.indexOf("pdp_ip") === 0) netType = "蜂窝"

    $done({
      title: `流量统计 | ${netType}`,
      content: `上传 ➟ ${upload} (${upSpeed})\n` +
               `下载 ➟ ${download} (${downSpeed})\n` +
               `峰值 ➟ ↑${upMax} ↓${downMax}`,
      icon: params.icon || "gauge",
      "icon-color": params.color || "#34c759"
    })

  } catch (e) {
    $done({
      title: "流量统计",
      content: "加载中...",
      icon: "gauge",
      "icon-color": "#ff9500"
    })
  }

})()

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0B"
  let k = 1024
  let units = ["B", "KB", "MB", "GB", "TB"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= units.length) i = units.length - 1
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + units[i]
}

function formatSpeed(bytes) {
  if (!bytes || bytes === 0) return "0B/s"
  let k = 1024
  let units = ["B/s", "KB/s", "MB/s", "GB/s"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= units.length) i = units.length - 1
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + units[i]
}

function httpAPI(path) {
  return new Promise((resolve, reject) => {
    $httpAPI("GET", path, null, (result) => {
      resolve(result)
    })
  })
}

function getParams(param) {
  if (!param) return {}
  try {
    return Object.fromEntries(
      param.split("&").map(item => item.split("=")).map(([k, v]) => [k, decodeURIComponent(v)])
    )
  } catch (e) {
    return {}
  }
}
