import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const types = {
  'html':'text/html; charset=utf-8','css':'text/css; charset=utf-8','js':'text/javascript; charset=utf-8',
  'webmanifest':'application/manifest+json','svg':'image/svg+xml','png':'image/png'
};
const files = new Set(['index.html','style.css','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png',
  'sw.js','app.js','catalog.js','planner.js','storage.js']);
const port = Number(process.env.PORT || 4173);
createServer(async (request,response) => {
  const path = new URL(request.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(path)) {response.writeHead(404).end('Not found');return;}
  try {
    const bytes = await readFile(new URL(path,import.meta.url));
    response.writeHead(200,{'Content-Type':types[path.split('.').at(-1)],'Cache-Control':'no-store'}).end(bytes);
  } catch {
    response.writeHead(500).end('Could not serve this file');
  }
}).listen(port,'0.0.0.0',() => console.log('Whippit preview on port '+port));
