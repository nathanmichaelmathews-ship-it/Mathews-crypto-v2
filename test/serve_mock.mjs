// test/serve_mock.mjs — local dev server with the mocked upstreams: serves index.html + /api/* through api/hub.js.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import '../test/mock_fetch.mjs';
const hub = (await import('../api/hub.js')).default;
const prices = (await import('../api/prices.js')).default;
const html = readFileSync(new URL('../index.html', import.meta.url));
function wrap(res) { return { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(o) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return this; }, send(s) { res.end(s); return this; }, end() { res.end(); return this; } }; }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/' || u.pathname === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  if (u.pathname === '/prices.json') { await prices({ url: req.url, method: req.method }, wrap(res)); return; }
  if (u.pathname.startsWith('/api/')) { const fn = u.pathname.replace('/api/', ''); u.searchParams.set('fn', fn); await hub({ url: '/api/hub?' + u.searchParams.toString(), method: req.method }, wrap(res)); return; }
  res.statusCode = 404; res.end('not found');
});
server.listen(3123, () => console.log('mock hub on http://localhost:3123'));
