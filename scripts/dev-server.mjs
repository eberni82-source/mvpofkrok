import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
export function publicPath(rawUrl) {
  const pathname=decodeURIComponent(new URL(rawUrl,'http://localhost').pathname);
  const parts=pathname.split('/').filter(Boolean);
  if(parts.some(part=>part.startsWith('.')||part.includes('\\')||part.includes('\0')))return null;
  const path=pathname==='/'?'index.html':parts.join('/');
  if(path!=='index.html'&&!['src','assets'].includes(parts[0]))return null;
  if(!TYPES[extname(path)])return null;
  return path;
}
export function createDevServer(root=PROJECT_ROOT) {
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',CSP);
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    const hostname=(req.headers.host||'').replace(/:\d+$/,'');
    if(!['localhost','127.0.0.1','[::1]'].includes(hostname)){res.writeHead(421);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    try {
      const path=publicPath(req.url);if(!path)throw new Error('Not public');
      const target=await realpath(resolve(root,path)),resolvedRoot=await realpath(root);
      if(!target.startsWith(resolvedRoot+sep)||!(await stat(target)).isFile())throw new Error('Not public');
      const body=await readFile(target);
      res.writeHead(200,{'Content-Type':TYPES[extname(target)]});
      res.end(req.method==='HEAD'?undefined:body);
    } catch {
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:'Страница не найдена');
    }
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4173);
  const server=createDevServer();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Порт ${port} занят. Остановите другой сервер или задайте PORT.`:error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Cursor: http://localhost:${port}`));
}
