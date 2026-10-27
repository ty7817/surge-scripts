// TGX Node Speed Test
var nodes = ['香港节点', '日本节点', '美国节点', '新加坡节点', '台湾节点', '韩国节点'];
var tgUrl = 'https://api.telegram.org/';
var xUrl = 'https://api.x.com/robots.txt';

function testNode(node, url, cb) {
  var start = Date.now();
  $httpClient.get({
    url: url,
    policy: node,
    timeout: 4000
  }, function(err, resp) {
    cb(err, Date.now() - start);
  });
}

function run() {
  var results = [];
  var index = 0;
  
  function next() {
    if (index >= nodes.length) {
      results.sort(function(a, b) {
        return a.avg - b.avg;
      });
      
      var txt = 'Best: ' + results[0].name + '\n';
      txt += 'TG: ' + results[0].tg + 'ms | X: ' + results[0].x + 'ms\n\n';
      txt += 'Ranking:\n';
      
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        txt += (i+1) + '. ' + r.name + ' (' + Math.round(r.avg) + 'ms)\n';
      }
      
      $done({
        title: 'TG/X Speed Test',
        content: txt
      });
      return;
    }
    
    var node = nodes[index];
    index++;
    
    testNode(node, tgUrl, function(err1, tgMs) {
      testNode(node, xUrl, function(err2, xMs) {
        var tg = err1 ? 9999 : tgMs;
        var x = err2 ? 9999 : xMs;
        var avg = (tg + x) / 2;
        results.push({ name: node, tg: tg, x: x, avg: avg });
        next();
      });
    });
  }
  
  next();
}

run();