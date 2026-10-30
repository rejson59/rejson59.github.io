// Celowo wyłącznie localhost: to nie jest serwer produkcyjny ani publiczny dostawca tożsamości.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const routes = new Map([
  ['/projekt-a/', ['index.html', 'text/html; charset=utf-8']],
  ['/projekt-b/', ['index.html', 'text/html; charset=utf-8']],
  ['/projekt-a/callback.html', ['index.html', 'text/html; charset=utf-8']],
  ['/projekt-b/callback.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const base = fileURLToPath(new URL('./public/', import.meta.url));
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const route = req.method === 'GET' ? routes.get(pathname) : null;
  if (!route) { res.writeHead(404); return res.end('Not found'); }
  try {
    const bytes = await readFile(base + route[0]);
    res.writeHead(200, {'content-type':route[1], 'cache-control':'no-store', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src http://localhost:8080; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
    res.end(bytes);
  } catch { res.writeHead(500); res.end('Uruchom npm run build.'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Demo wyłącznie lokalne: http://localhost:4173/projekt-a/'));
