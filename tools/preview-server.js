// 手元で確認するための静的ファイルサーバー(公開には使わない)
// 使い方: node tools/preview-server.js app 5178 → http://127.0.0.1:5178/
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || 'app');
const port = Number(process.argv[3]) || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css; charset=utf-8' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`preview on http://127.0.0.1:${port}`));
