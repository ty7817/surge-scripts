var subs = [
  {name: "良心云", url: "https://liangxin.xyz/api/v1/liangxin?OwO=b70caf2736c09389862f6308d6d60ff0"},
  {name: "赔钱", url: "https://dasho.xn--cp3a08l.com/api/v1/pq/d48f7e0117d75b38f55c2f3be4e81162"},
  {name: "顺畅", url: "https://scyydsbgw.xm-pass.one/feed/yhDhUOC8AYK8VIVCHgKZoKVSPBSeh1SY"},
  {name: "一分", url: "https://login.yfjc.xyz/api/v1/client/subscribe?token=5b38f7bed2857c419b4334a1a8a6cca0"}
];
function fmt(b){if(!b||isNaN(b))return"?";var g=b/1073741824;if(g>=1024)return(g/1024).toFixed(1)+"T";return g.toFixed(1)+"G"}
function fd(t){if(!t||isNaN(t))return"未知";var d=new Date(t*1000);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function dl(t){if(!t||isNaN(t))return"";var d=Math.ceil((t*1000-Date.now())/86400000);if(d<0)return" 已过期";return" 剩"+d+"天"}
var res=[],dn=0,finished=false;
function done(){if(finished)return;finished=true;$done({title:"订阅流量",content:res.join("\n"),icon:"crown","icon-color":"#FF9500"})}
setTimeout(done,10000);
for(var i=0;i<subs.length;i++){(function(idx){var s=subs[idx];$httpClient.get({url:s.url,headers:{"User-Agent":"clash.meta"}},function(e,r,d){dn++;var l="";if(!e&&r&&r.headers){var info=r.headers["subscription-userinfo"]||r.headers["Subscription-Userinfo"];if(info){var p={};var parts=info.split(";");for(var j=0;j<parts.length;j++){var kv=parts[j].trim().split("=");if(kv.length===2&&kv[1]!=="")p[kv[0]]=parseFloat(kv[1])}var u=(p.upload||0)+(p.download||0),t=p.total;if(t&&!isNaN(t)){var pc=(u/t*100).toFixed(0);l=s.name+": "+fmt(u)+"/"+fmt(t)+" "+pc+"%\n到期:"+fd(p.expire)+dl(p.expire)}else{l=s.name+": "+fmt(u)+" 已用"}}else if(r.status===403){l=s.name+": 被拦截(CF)"}else{l=s.name+": 无流量信息"}}else{l=s.name+": 连接失败"}res[idx]=l;if(dn===subs.length)done()})})(i)}