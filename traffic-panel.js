/**
 * 流量统计面板 v2.1 优化版
 * 功能：显示实时上传/下载流量、速度、峰值
 * 点击切换网络界面（WiFi/Cellular）
 */

let params = getParams($argument)

;(async () => {

  let traffic = (await httpAPI("/v1/traffic"))
  let netInterfaces = traffic.interface

  /* 获取所有网络界面 */
  let allNet = []
  for (var key in netInterfaces) {
    allNet.push(key)
  }

  /* 移除回环网络 lo0 */
  del(allNet, "lo0")

  let net
  let index
  if ($persistentStore.read("TRAFFIC_NETWORK") == null || allNet.includes($persistentStore.read("TRAFFIC_NETWORK")) == false) {
    index = 0
  } else {
    net = $persistentStore.read("TRAFFIC_NETWORK")
    for (let i = 0; i < allNet.length; ++i) {
      if (net == allNet[i]) {
        index = i
      }
    }
  }

  /* 点击切换网络界面 */
  if ($trigger == "button") {
    if (allNet.length > 1) index += 1
    if (index >= allNet.length) index = 0
    $persistentStore.write(allNet[index], "TRAFFIC_NETWORK")
  }

  net = allNet[index]
  let network = netInterfaces[net]

  let outCurrentSpeed = speedTransform(network.outCurrentSpeed)  // 上传速度
  let outMaxSpeed = speedTransform(network.outMaxSpeed)          // 最大上传速度
  let download = bytesToSize(network.in)                         // 下载流量
  let upload = bytesToSize(network.out)                          // 上传流量
  let inMaxSpeed = speedTransform(network.inMaxSpeed)             // 最大下载速度
  let inCurrentSpeed = speedTransform(network.inCurrentSpeed)    // 下载速度

  /* 判断网络类型 */
  let netType
  if (net == "en0") {
    netType = "WiFi"
  } else if (net == "pdp_ip0" || net == "pdp_ip1") {
    netType = "蜂窝"
  } else {
    netType = net
  }

  $done({
    title: "流量统计 | " + netType,
    content: `上传 ➟ ${upload} (${outCurrentSpeed})\n` +
             `下载 ➟ ${download} (${inCurrentSpeed})\n` +
             `峰值 ➟ ↑${outMaxSpeed} ↓${inMaxSpeed}`,
    icon: params.icon || "gauge",
    "icon-color": params.color || "#34c759"
  })

})()

function bytesToSize(bytes) {
  if (bytes === 0) return "0B"
  let k = 1024
  sizes = ["B", "KB", "MB", "GB", "TB"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= sizes.length) i = sizes.length - 1
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i]
}

function speedTransform(bytes) {
  if (bytes === 0) return "0B/s"
  let k = 1024
  sizes = ["B/s", "KB/s", "MB/s", "GB/s"]
  let i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i >= sizes.length) i = sizes.length - 1
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i]
}

function httpAPI(path = "", method = "GET", body = null) {
  return new Promise((resolve) => {
    $httpAPI(method, path, body, (result) => {
      resolve(result)
    })
  })
}

function getParams(param) {
  if (!param) return {}
  return Object.fromEntries(
    param
      .split("&")
      .map((item) => item.split("="))
      .map(([k, v]) => [k, decodeURIComponent(v)])
  )
}

function del(arr, num) {
  var l = arr.length
  for (var i = 0; i < l; i++) {
    if (arr[0] !== num) {
      arr.push(arr[0])
    }
    arr.shift(arr[0])
  }
  return arr
}
