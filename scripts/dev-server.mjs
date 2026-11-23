import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(ROOT, '.' + (path === '/' ? '/index.html' : path));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) throw new Error('Forbidden');
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Страница не найдена');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Карта ЛПР: http://localhost:${PORT}`));
