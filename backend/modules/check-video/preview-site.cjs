// Local preview of the main page (Cary, November 24, 2026): serves the repository's index.html and its images on
// http://localhost:8080 so the page talks to the local backend (http://127.0.0.1:3000, run-local.ps1 -Preview).
// Also serves the demo page at http://localhost:8080/demo. This computer only. Usage: node backend/modules/check-video/preview-site.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/demo') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return fs.createReadStream(path.join(__dirname, 'demo.html')).pipe(res); }
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  const type = TYPES[path.extname(name).toLowerCase()];
  const file = path.join(ROOT, name);
  if (!type || name.includes('..') || path.dirname(file) !== ROOT || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
}).listen(8080, '127.0.0.1', () => console.log('Main page preview: http://localhost:8080/'));
