import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {assetTypes} from './build-site.mjs';
import {handleRecipeImport} from './recipe-link.js';

const port = Number(process.env.PORT || 4173);
createServer(async (request,response) => {
  const url = new URL(request.url,'http://localhost');
  if (url.pathname === '/api/recipe-import') {
    const chunks = [];
    let count = 0;
    for await (const chunk of request) {
      count += chunk.length;
      if (count > 2048) {
        response.writeHead(413,{'Content-Type':'application/json'}).end('{"error":"The recipe link is too long."}');
        return;
      }
      chunks.push(chunk);
    }
    const imported = await handleRecipeImport(new Request(url,{
      method:request.method,headers:request.headers,
      body:request.method === 'POST' ? Buffer.concat(chunks) : undefined
    }));
    response.writeHead(imported.status,Object.fromEntries(imported.headers)).end(await imported.text());
    return;
  }
  const path = url.pathname.slice(1) || 'index.html';
  if (!Object.hasOwn(assetTypes,path)) {response.writeHead(404).end('Not found');return;}
  try {
    const bytes = await readFile(new URL(path,import.meta.url));
    response.writeHead(200,{'Content-Type':assetTypes[path],'Cache-Control':'no-store'}).end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(500).end('Could not serve this file');
  }
}).listen(port,'0.0.0.0',() => console.log('Whippit preview on port '+port));
