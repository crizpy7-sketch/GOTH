import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('.');
const types = {'.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp', '.json':'application/json'};
createServer(async (req,res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if (!path.startsWith(root+sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('GOTH: http://127.0.0.1:4173'));
