import {handleAccountApi} from './account-api.js';
import {sqliteD1} from './sqlite-adapter.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {assetTypes} from './build-site.mjs';
import {handleRecipeImport} from './recipe-link.js';

const port = Number(process.env.PORT || 4173);
// Local QA fixture only; this development server is never bundled into the Worker.
const previewTest=existsSync(new URL('.whippit-preview-test',import.meta.url));
const previewDB=previewTest?sqliteD1():null;
if(previewDB)for(const name of ['0000_accounts','0001_households'])previewDB.db.exec(await readFile(new URL('drizzle/'+name+'.sql',import.meta.url),'utf8'));

createServer(async (request,response) => {
  const url = new URL(request.url,'http://'+request.headers.host);
  if(url.pathname==='/__qa'){response.writeHead(200,{'Content-Type':'text/html'}).end('<title>WhippIt responsive QA</title><style>body{margin:0;display:flex;gap:20px;background:#ddd}iframe{height:900px;border:0}</style><iframe title="390 pixel phone" src="/" width="390"></iframe><iframe title="320 pixel phone" src="/" width="320"></iframe>');return;}
  if (['/api/session','/api/state','/api/sync','/api/household','/api/recipe-import'].includes(url.pathname)) {
    const chunks = [];
    let count = 0;
    for await (const chunk of request) {
      count += chunk.length;
      if (count > 1_000_000) {
        response.writeHead(413,{'Content-Type':'application/json'}).end('{"error":"The recipe link is too long."}');
        return;
      }
      chunks.push(chunk);
    }
    const incoming=new Request(url,{
      method:request.method,headers:request.headers,
      body:request.method === 'POST' ? Buffer.concat(chunks) : undefined
    });
    if(previewTest){incoming.headers.set('oai-authenticated-user-id','preview-test-account');incoming.headers.set('oai-authenticated-user-email','preview@example.invalid');incoming.headers.set('oai-authenticated-user-full-name','Preview test account');}
    const imported = url.pathname==='/api/recipe-import'?await handleRecipeImport(incoming):await handleAccountApi(incoming,previewDB?{DB:previewDB}:{});
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
