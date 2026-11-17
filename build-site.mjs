import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const assetTypes = {
  'index.html':'text/html; charset=utf-8',
  'style.css':'text/css; charset=utf-8',
  'manifest.webmanifest':'application/manifest+json',
  'icon.svg':'image/svg+xml',
  'icon-192.png':'image/png','icon-512.png':'image/png',
  'app.js':'text/javascript; charset=utf-8',
  'ui.js':'text/javascript; charset=utf-8',
  'catalog.js':'text/javascript; charset=utf-8',
  'curated.js':'text/javascript; charset=utf-8',
  'planner.js':'text/javascript; charset=utf-8',
  'planner-worker.js':'text/javascript; charset=utf-8',
  'recipe-tools.js':'text/javascript; charset=utf-8',
  'recipe-library.js':'text/javascript; charset=utf-8',
  'storage.js':'text/javascript; charset=utf-8',
  'sw.js':'text/javascript; charset=utf-8',
  'LICENSE':'text/plain; charset=utf-8',
};

async function build() {
  const files = await Promise.all(Object.entries(assetTypes).map(async ([name,type]) => {
    const data = await readFile(new URL(name,import.meta.url));
    const binary = type === 'image/png';
    return [name,{type,binary,data:data.toString(binary ? 'base64' : 'utf8')}];
  }));
  const input = await readFile(new URL('recipe-link.js',import.meta.url),'utf8');
  const assetCode = 'const assets = ' + JSON.stringify(Object.fromEntries(files)) + ';\n';
  const handler = `
export default {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/recipe-import') return handleRecipeImport(request);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    const entry = Object.hasOwn(assets,file) ? assets[file] : null;
    if (!entry) return new Response('Not found',{status:404});
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405});
    const body = entry.binary ? Uint8Array.from(atob(entry.data),char => char.charCodeAt(0)) : entry.data;
    return new Response(request.method === 'HEAD' ? null : body,{
      headers:{
        'Content-Type':entry.type,'X-Content-Type-Options':'nosniff',
        'Cache-Control':'no-cache',
        'Referrer-Policy':'strict-origin-when-cross-origin'
      }
    });
  }
};
`;
  const target = new URL('dist/server/',import.meta.url);
  await mkdir(fileURLToPath(target),{recursive:true});
  await writeFile(new URL('index.js',target), assetCode + input + '\n' + handler);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
