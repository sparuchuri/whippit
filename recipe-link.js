const publishers = new Map(Object.entries({
  'budgetbytes.com':'Budget Bytes','recipetineats.com':'RecipeTin Eats','thewoksoflife.com':'The Woks of Life',
  'indianhealthyrecipes.com':'Swasthi’s Recipes','justonecookbook.com':'Just One Cookbook','maangchi.com':'Maangchi',
  'tiffycooks.com':'Tiffy Cooks','pickuplimes.com':'Pick Up Limes','allrecipes.com':'Allrecipes','seriouseats.com':'Serious Eats',
  'smittenkitchen.com':'Smitten Kitchen','skinnytaste.com':'Skinnytaste','eatingwell.com':'EatingWell','foodnetwork.com':'Food Network',
  'damndelicious.net':'Damn Delicious','loveandlemons.com':'Love & Lemons','minimalistbaker.com':'Minimalist Baker',
  'sallysbakingaddiction.com':'Sally’s Baking Addiction','simplyrecipes.com':'Simply Recipes',
  'thekitchn.com':'The Kitchn','bbcgoodfood.com':'Good Food','101cookbooks.com':'101 Cookbooks',
}));
const labelForHost = hostname => publishers.get(hostname.replace(/^www\./,''));
const recipeUrl = raw => {
  if (typeof raw !== 'string' || raw.length > 1200) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !labelForHost(url.hostname)) return null;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
};
const entities = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
function plainText(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(full,entity) => {
    if (entity[0] !== '#') return entities[entity] ?? full;
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/\s+/g,' ').trim();
}
const clampNumber = (value,min,max,fallback) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;

export function extractRecipe(html, inputUrl) {
  const url = recipeUrl(inputUrl);
  if (!url) return null;
  const scripts = html.matchAll(/<script\b[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    let root;
    try { root=JSON.parse(match[1].trim()); } catch { continue; }
    const nodes = [root];
    let scanned = 0;
    while (nodes.length && scanned++ < 6000) {
      const node = nodes.pop();
      if (!node || typeof node !== 'object') continue;
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (types.some(type => type === 'Recipe' || type === 'https://schema.org/Recipe') && Array.isArray(node.recipeIngredient)) {
        const items = node.recipeIngredient.map(plainText).filter(Boolean).slice(0,60).map(line => line.slice(0,250));
        const name = plainText(node.name).slice(0,100);
        if (name && items.length) {
          const titleYield = String(node.recipeYield ?? '').match(/\b\d+\b/)?.[0];
          const time = String(node.totalTime ?? node.cookTime ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
          const minutes = time ? Number(time[1] || 0)*60 + Number(time[2] || 0) : null;
          return {
            name,items,servings:clampNumber(Number(titleYield),1,48,2),
            minutes:clampNumber(minutes,1,720,30),steps:[],
            source:{url:url.href,label:labelForHost(url.hostname),kind:'link'},
            cuisine:plainText(Array.isArray(node.recipeCuisine) ? node.recipeCuisine[0] : node.recipeCuisine).slice(0,45),
            reviewYield:!clampNumber(Number(titleYield),1,48,null)
          };
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === 'object') nodes.push(child);
    }
  }
  return null;
}

async function readPrefix(body,limit) {
  const reader = body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0, value = '';
  try {
    while (size < limit) {
      const chunk = await reader.read();
      if (chunk.done) return value + decoder.decode();
      const bytes = chunk.value.subarray(0,limit-size);
      size += bytes.length;
      value += decoder.decode(bytes,{stream:true});
    }
    return value + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function json(payload,status=200) {
  return new Response(JSON.stringify(payload),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
export async function handleRecipeImport(request, fetcher=globalThis.fetch) {
  if (request.method !== 'POST') return json({error:'Send a recipe URL using POST.'},405);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({error:'Send a recipe URL as JSON.'},415);
  }
  let raw;
  try { raw=JSON.parse(await readPrefix(request.body,2048))?.url; }
  catch { return json({error:'Enter a complete recipe link.'},400); }
  let url = recipeUrl(raw);
  if (!url) return json({error:'This site is outside the supported recipe publishers. Paste the recipe text to add it and keep the source link.'},422);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),8000);
  try {
    for (let count=0;count<=3;count++) {
      const response = await fetcher(url.href,{
        redirect:'manual',signal:controller.signal,
        headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Whippit/0.2 recipe metadata import'}
      });
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        url = location ? recipeUrl(new URL(location,url).href) : null;
        if (!url) break;
        continue;
      }
      if (!response.ok || !/html|xhtml/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel().catch(() => {});
        break;
      }
      const result = extractRecipe(await readPrefix(response.body,2_000_000),url.href);
      if (result) return json(result);
      break;
    }
  } catch {
    return json({error:'The publisher did not respond. Paste the recipe text to review the ingredients.'},422);
  } finally {
    clearTimeout(timer);
  }
  return json({error:'The publisher did not provide a readable recipe here. Paste the text and keep the original link.'},422);
}
