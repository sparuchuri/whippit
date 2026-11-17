export const collectionFormat = 'whippit-recipe-collection-v1';
const legacyFormat = 'whippit-tiktok-v1';
const text = (value,limit) => typeof value==='string' ? value.trim().slice(0,limit) : '';
const number = (value,max) => Number.isInteger(value) && value>=1 && value<=max ? value : null;

export function collectionSourceKey(raw) {
  const url = new URL(raw);
  if (url.protocol!=='https:' || url.username || url.password) throw new Error('Use an HTTPS source URL without login credentials.');
  const host = url.hostname.toLowerCase().replace(/^www\./,'');
  const video = host==='tiktok.com' && url.pathname.match(/^\/@([a-zA-Z0-9_.]+)\/video\/(\d{15,25})\/?$/);
  if (video) return 'tiktok-'+video[2];
  const nyt = host==='cooking.nytimes.com' && url.pathname.match(/^\/recipes\/(\d+)(?:-[^/]+)?\/?$/);
  if (nyt) return 'https://cooking.nytimes.com/recipes/'+nyt[1];
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.*|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname=url.pathname.replace(/\/+$/,'') || '/';
  return url.href;
}

export function collectionCredit(item) {
  const label=item.publisher || (item.creator ? 'TikTok' : 'Recipe collection');
  const author=item.author || (item.creator ? '@'+item.creator : '');
  return author && author!==label ? label+' · '+author : label;
}

const softSourceKey = (name,publisher,author) => [name,publisher,author].map(value=>
  value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()).join('\n');
function existingKey(recipe) {
  if (recipe.source?.url) {
    try { return collectionSourceKey(recipe.source.url); } catch { return null; }
  }
  return recipe.collectionId || null;
}

export async function prepareCollection(bundle, imported=[], saved=[]) {
  if (![collectionFormat,legacyFormat].includes(bundle?.format) || !Array.isArray(bundle.recipes)) {
    throw new Error('Use a JSON object with "format": "'+collectionFormat+'" and a "recipes" array. See the example below.');
  }
  if (!bundle.recipes.length || bundle.recipes.length>500) throw new Error('Include 1 to 500 recipes per file.');
  const seen = new Set([...imported.map(row=>row.id),...saved.map(existingKey).filter(Boolean)]);
  const sources = [];
  let duplicates = 0;
  for (const [index,row] of bundle.recipes.entries()) {
    const fail = message => new Error('Recipe '+(index+1)+': '+message);
    if (!row || typeof row!=='object' || Array.isArray(row)) throw fail('expected a recipe object.');
    const name = text(row.name ?? row.title,100);
    if (!name) throw fail('add a "name".');
    const source = row.source && typeof row.source==='object' ? row.source : {};
    const rawUrl = row.url ?? source.url ?? '';
    if (typeof rawUrl!=='string' || rawUrl.length>2000) throw fail('add a valid HTTPS URL.');
    const url = rawUrl.trim();
    let key;
    if (url) {
      try {key=collectionSourceKey(url);} catch {throw fail('use a valid HTTPS source URL.');}
    }
    const creator = key?.startsWith('tiktok-') ? new URL(url).pathname.split('/')[1].slice(1) : '';
    if (bundle.format===legacyFormat && !creator) throw fail('legacy TikTok collections require a TikTok video URL.');
    const sourceLabel = text(row.source,120) || text(source.label,120);
    const publisher = text(row.publisher,120) || sourceLabel || text(bundle.source,120) || text(bundle.publisher,120) ||
      (creator ? 'TikTok' : url ? new URL(url).hostname.replace(/^www\./,'') : '');
    const author = text(row.author ?? source.author,120) || (creator ? '@'+creator : '');
    if (!publisher && !author) throw fail('add a source or author for attribution.');
    const lines = (value,label,maxLength) => {
      if (value==null) return [];
      if (!Array.isArray(value) || value.some(line=>typeof line!=='string')) throw fail('"'+label+'" must be an array of text lines.');
      if (value.length>40 || value.some(line=>line.length>maxLength)) throw fail('"'+label+'" can have up to 40 lines of '+maxLength+' characters.');
      return value.map(line=>line.trim()).filter(Boolean);
    };
    const items=lines(row.items ?? row.ingredients,'items',400);
    const steps=lines(row.steps ?? row.instructions,'steps',1000);
    if (!url && (!items.length || !steps.length)) throw fail('recipes without a source URL need ingredients and steps.');
    const identity = key || softSourceKey(name,publisher,author);
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
    const hash = [...new Uint8Array(bytes)].slice(0,16).map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const id = creator ? key : 'collection-'+hash;
    if (seen.has(identity) || seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(identity);
    seen.add(id);
    const incomplete = row.stepsStatus==='partial' || row.stepsStatus==='missing';
    const stepsNote = text(row.stepsNote,500) || (incomplete ? 'The imported steps are incomplete. Check the original recipe for the full method.' : '');
    sources.push({
      id,origin:'user',name,url,publisher:publisher || 'Personal recipe',author,items,steps,
      servings:number(row.servings,48),minutes:number(row.minutes,720),
      servingsLabel:text(row.servingsLabel,100),stepsNote,
      cuisine:text(row.cuisine,45),
    });
  }
  return {sources,duplicates};
}
