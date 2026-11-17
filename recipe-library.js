import {sourceRecipes} from './source-catalog.js';
import {readLibrary,writeLibrary,readRecipeSources,writeRecipeSources} from './storage.js';
import { byId, categories, ingredients, recipes, registerRecipe, isUserRecipe } from './catalog.js';
import { amount, displayUnit, toDisplay, fromDisplay } from './planner.js';
import { parseIngredient, pasteDraft, recipeMatches, suggestIngredient } from './recipe-tools.js';
import { icon, dishMark } from './ui.js';

const sourceById=Object.fromEntries(sourceRecipes.map(item=>[item.id,item]));
const sourceMatch=(item,query)=>{
 let haystack=[item.name,item.cuisine,item.category,item.publisher,item.publisher==='NYT Cooking'?'ny times new york times':'',item.keywords,...item.items].join(' ').toLowerCase();
 if(item.minutes<=30)haystack+=' quick fast weeknight';
 if(/soup|stew|curry|bake|brais|chili/i.test(haystack))haystack+=' cozy comfort warming hearty';
 if(/chilli|chili|spicy|sichuan|gochujang/i.test(haystack))haystack+=' spicy';
 if(item.publisher==='Love & Lemons'||/vegetarian|vegan/i.test(haystack))haystack+=' vegetarian veggie';
 return query.toLowerCase().split(/\s+/).filter(Boolean).every(word=>haystack.includes(word));
};
const $ = selector => document.querySelector(selector);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function safeExternalUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

const useLabel = item => ({both:'Dinner or prep lunch',dinner:'Dinner',lunch:'Prep lunch'}[item.use]);
function sourceDescription(item) {
  if (item.source?.kind === 'publisher') return item.source.label;
  if (item.source?.kind === 'link') return item.source.label;
  if (item.source) return 'Adapted from ' + item.source.label;
  return item.custom ? 'My recipe' : 'Whippit original';
}
function editorRows(draft) {
  return (draft.items.length ? draft.items : ['']).map(line => {
    const parsed = suggestIngredient(line);
    return {customName:parsed.name,unit:'g',pack:'',price:'',...parsed};
  });
}
function editorCuisine(value) {
  const match = categories.find(tag => tag.toLowerCase() === value?.toLowerCase());
  if (match) return match;
  const aliases = {indian:'Indian-inspired',chinese:'Chinese-inspired',japanese:'Japanese-inspired',
    korean:'Korean-inspired',italian:'Italian-inspired',thai:'Thai-inspired',mexican:'Mexican-inspired'};
  return aliases[value?.toLowerCase()] || value || '';
}

export function createRecipeLibrary({beforeSave,afterSave,onOpen,notify}) {
  const data = readLibrary();
  for (const pack of data.custom) if (pack?.recipe?.id && Array.isArray(pack.ingredients)) {
    registerRecipe(pack.recipe,pack.ingredients);
  }
  const favorites = new Set(data.favorites);
  const editor = document.createElement('dialog');
  editor.id='recipe-editor';
  editor.setAttribute('aria-labelledby','recipe-editor-title');
  document.body.append(editor);

  let filter = 'all', query = '', lunchOnly = false, root = null, visibleLimit=36;
  let editorRun = 0;
  editor.addEventListener('close',() => {editorRun++;});

  function persist() {
    if(!writeLibrary({custom:data.custom,favorites:[...favorites]})) notify('Device storage is full. Keep this page open until sync completes.');
  }
  const favoriteButton = item => `<button type="button" class="favorite" data-favorite="${escapeHtml(item.id)}"
    aria-pressed="${favorites.has(item.id)}" aria-label="Favorite ${escapeHtml(item.name)}" title="Favorite recipe">${icon('heart')}</button>`;
  function markFavorite(id) {
    if (!byId[id] && !sourceById[id]) return;
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    persist();
    if (root?.querySelector('#recipe-grid')) renderGrid(id);
    document.querySelectorAll(`#detail [data-favorite="${CSS.escape(id)}"]`).forEach(button => {
      button.setAttribute('aria-pressed',String(favorites.has(id)));
      button.innerHTML = icon('heart');
    });
  }

  function renderGrid(focusId) {
    if(filter==='collection'){renderCollection();return;}
    const visible = [...recipes,...sourceRecipes].filter(item =>
      (filter !== 'ready' || !sourceById[item.id]) &&
      (filter !== 'favorites' || favorites.has(item.id)) &&
      (filter !== 'mine' || item.custom) &&
      (!lunchOnly || item.use !== 'dinner') && (sourceById[item.id]?sourceMatch(item,query):recipeMatches(item,query))
    ).sort((a,b) => Number(isUserRecipe(b))-Number(isUserRecipe(a)) ||
      Number(Boolean(b.rating))-Number(Boolean(a.rating)) ||
      a.name.localeCompare(b.name));
    const grid = root.querySelector('#recipe-grid');
    root.querySelector('#recipe-count').textContent = visible.length + (visible.length === 1 ? ' recipe' : ' recipes');
    grid.innerHTML = visible.length ? visible.slice(0,visibleLimit).map(item => `<article class="panel recipe-card">
      <div class="recipe-card-top">${dishMark(item)}${favoriteButton(item)}</div>
      <span class="tag">${escapeHtml(item.cuisine || (sourceById[item.id]?'Publisher recipe':'Personal recipe'))}</span>
      <h3><button type="button" data-open-recipe="${escapeHtml(item.id)}" class="meal-title">${escapeHtml(item.name)}</button></h3>
      <p class="muted">${item.minutes || '—'} min · ${useLabel(item)}</p>${item.rating?`<p class="publisher-rating">★ ${item.rating.toFixed(1)} <span>(${item.ratingCount.toLocaleString()} ratings${item.secondaryMetadata?' · via secondary source':''})</span></p>`:''}<p class="recipe-source">${escapeHtml(sourceDescription(item))}${sourceById[item.id]?' · Source recipe':isUserRecipe(item)&&item.source?' · Added by you':''}</p>
      </article>`).join('') :
      '<div class="panel empty"><p>No recipes match. Try a different search or add one of your own.</p></div>';
    if(visible.length>visibleLimit)grid.insertAdjacentHTML('beforeend',`<button class="load-more" type="button" id="more-recipes">Show more recipes (${visible.length-visibleLimit} remaining)</button>`);
    if (focusId) (grid.querySelector(`[data-favorite="${CSS.escape(focusId)}"]`) || root.querySelector('[data-library-filter][aria-pressed=true]'))?.focus();
  }

  function render(container) {
    root=container;
    root.innerHTML=`<div class="library-heading"><div><h2>Your recipe box</h2><p class="muted">${sourceRecipes.length} rated recipes from trusted kitchens, plus your own favorites.</p></div>
      <button type="button" class="primary" id="add-recipe">+ Add recipe</button></div>
      <div class="panel library-controls"><label class="search-label">Search recipes
      <input id="recipe-search" type="search" placeholder="Try spicy tofu, cozy, or chicken" value="${escapeHtml(query)}"></label>
      <div class="library-filters" aria-label="Recipe filters">
      ${[['all','Discover'],['ready','Ready to plan'],['favorites','Favorites'],['mine','My recipes'],['collection','TikTok collection']].map(([id,label]) =>
        `<button type="button" data-library-filter="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}
      <label class="toggle"><input id="prep-only" type="checkbox" ${lunchOnly?'checked':''}> Lunch prep</label></div>
      <div class="vibe-chips" aria-label="Recipe moods">${[['cozy','☕ Cozy'],['spicy','🌶 Spicy'],['quick','⚡ Quick'],['vegetarian','🥬 Veggie']].map(([value,label])=>`<button type="button" data-vibe="${value}" aria-pressed="${query===value}">${label}</button>`).join('')}</div></div>
      <p class="muted" id="recipe-count" role="status"></p><div id="recipe-grid" class="recipe-grid"></div>`;
    root.querySelector('#add-recipe').onclick = openEditor;
    root.querySelector('#recipe-search').oninput = event => {query=event.target.value;visibleLimit=36;updateVibes();renderGrid();};
    function updateVibes() {root.querySelectorAll('[data-vibe]').forEach(button=>button.setAttribute('aria-pressed',String(query===button.dataset.vibe)));}
    root.querySelector('.vibe-chips').onclick=event=>{
      const button=event.target.closest('[data-vibe]');
      if(!button)return;
      query=query===button.dataset.vibe?'':button.dataset.vibe;
      root.querySelector('#recipe-search').value=query;
      updateVibes();renderGrid();
    };
    root.querySelector('#prep-only').onchange = event => {lunchOnly=event.target.checked;renderGrid();};
    root.querySelector('.library-filters').onclick = event => {
      const id = event.target.dataset.libraryFilter;
      if (!id) return;
      filter=id;visibleLimit=36;
      root.querySelectorAll('[data-library-filter]').forEach(button =>
        button.setAttribute('aria-pressed',String(button.dataset.libraryFilter===filter)));
      renderGrid();
    };
    root.querySelector('#recipe-grid').onclick = event => {
      const button = event.target.closest('button');
      if (button?.dataset.favorite) markFavorite(button.dataset.favorite);
      if (button?.dataset.openRecipe) {const id=button.dataset.openRecipe;if(id.startsWith('tiktok-'))openCollectionSource(id);else if(sourceById[id])openSource(sourceById[id]);else onOpen(id);}
      if(button?.id==='more-recipes'){visibleLimit+=36;renderGrid();}
    };
    renderGrid();
  }

  function renderCollection() {
    const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    const sources=readRecipeSources().filter(item=>terms.every(term=>
      [item.name,item.creator,...item.items].join(' ').toLowerCase().includes(term)));
    const grid=root.querySelector('#recipe-grid');
    root.querySelector('#recipe-count').textContent=sources.length+' TikTok sources';
    grid.innerHTML=sources.slice(0,visibleLimit).map(item=>`<article class="panel recipe-card">
      <h3><button type="button" data-open-recipe="${escapeHtml(item.id)}" class="meal-title">${escapeHtml(item.name)}</button></h3>
      <p class="muted">@${escapeHtml(item.creator)} · ${item.items.length?'Ingredients to review':'See original video'}</p>
    </article>`).join('') || '<div class="panel empty"><p>No TikTok sources match. Use Add recipe to import a collection file.</p></div>';
    if(sources.length>visibleLimit)grid.insertAdjacentHTML('beforeend','<button class="load-more" type="button" id="more-recipes">Show more recipes</button>');
  }

  function openCollectionSource(id) {
    const item=readRecipeSources().find(source=>source.id===id);
    if(!item)return;
    const saved=recipes.find(recipe=>recipe.source?.url===item.url);
    frame(escapeHtml(item.name),`<p class="muted">@${escapeHtml(item.creator)}</p>
      <p>Your import · Review the original video for any missing ingredients, servings or instructions.</p>
      <div class="actions"><a class="button-link" href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer">Open TikTok video ↗</a>
      <button class="primary" id="collection-review">${saved?'Open saved recipe':'Review for planner'}</button></div>
      ${item.items.length?`<h3>Ingredients to review</h3><ul class="dialog-list">${item.items.map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul>`:''}`);
    $('#collection-review').onclick=()=>saved?(editor.close(),onOpen(saved.id)):showDraft({...item,reviewYield:!item.servings,servings:item.servings||'',minutes:item.minutes||'',
      source:{kind:'link',label:'@'+item.creator,url:item.url}});
  }

  function openCollectionImport() {
    frame('Import TikTok collection',`<form id="collection-import">
      <p>Choose a Whippit collection JSON file. Sources are saved in your recipe box for review.</p>
      <label class="search-label">Collection file <input id="collection-file" type="file" accept=".json,application/json" required></label>
      <div class="form-message" id="collection-status" role="status"></div>
      <button type="submit" class="primary">Import collection</button></form>`);
    $('#collection-import').onsubmit=async event=>{
      event.preventDefault();
      const status=$('#collection-status');
      try{
        const file=$('#collection-file').files[0];
        if(!file||file.size>1_000_000)throw new Error('Choose a collection JSON file under 1 MB.');
        const bundle=JSON.parse(await file.text());
        if(bundle?.format!=='whippit-tiktok-v1'||!Array.isArray(bundle.recipes)||bundle.recipes.length>500)
          throw new Error('This file is not a supported Whippit collection.');
        const existing=new Set([...readRecipeSources().map(item=>item.id),...recipes.flatMap(item=>{
          const match=item.source?.url?.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
          return match?['tiktok-'+match[1]]:[];
        })]);
        const sources=[];
        for(const row of bundle.recipes){
          const match=typeof row?.url==='string' && row.url.match(/^https:\/\/www\.tiktok\.com\/@([a-zA-Z0-9_.]+)\/video\/(\d{15,25})$/);
          if(!match||typeof row.name!=='string'||!row.name.trim())throw new Error('A collection entry has an invalid title or video URL.');
          const id='tiktok-'+match[2];
          if(existing.has(id))continue;
          const lines=value=>Array.isArray(value)?value.filter(line=>typeof line==='string').slice(0,40).map(line=>line.slice(0,400)):[];
          sources.push({id,origin:'user',url:row.url,creator:match[1],name:row.name.trim().slice(0,100),
            items:lines(row.items),steps:lines(row.steps),
            servings:Number.isInteger(row.servings)&&row.servings>=1&&row.servings<=48?row.servings:null,
            minutes:Number.isInteger(row.minutes)&&row.minutes>=1&&row.minutes<=720?row.minutes:null});
          existing.add(id);
        }
        const stored=writeRecipeSources(sources);
        filter='collection';query='';lunchOnly=false;visibleLimit=36;
        render(root);
        status.textContent=stored?`Imported ${sources.length} sources. ${bundle.recipes.length-sources.length} already in your recipe box.`:
          'Device storage is full. Keep this page open until sync completes.';
        status.tabIndex=-1;status.focus();
      }catch(error){status.textContent=error instanceof SyntaxError?'This file is not valid JSON.':error.message;}
    };
  }

  function openSource(item) {
    frame(escapeHtml(item.name),`<div class="source-intro"><p class="publisher-rating">★ ${item.rating.toFixed(2)} / 5 · ${item.ratingCount.toLocaleString()} ${item.secondaryMetadata?'ratings reported by Chive':'publisher ratings'}</p><p>${escapeHtml(item.publisher)} · ${item.minutes || '—'} min · Original yield: ${escapeHtml(item.originalYield)}</p><p class="muted">${item.secondaryMetadata?'Secondary listing checked':'Publisher rating checked'} ${escapeHtml(item.source.accessedAt?.slice(0,10))}. Cooking instructions and notes stay with the publisher.</p></div>
    <p class="notice">${item.secondaryMetadata?'NYT Cooking may require a subscription. Ratings and ingredient metadata are from Chive, not directly verified with NYT. Check the original servings and quantities.':'Ingredient wording is condensed for grocery review.'}</p><div class="actions"><a class="button-link" href="${escapeHtml(safeExternalUrl(item.source.url))}" target="_blank" rel="noopener noreferrer">Open original recipe ↗</a><button class="primary" id="source-to-planner">Add to my planner</button></div>
    <p class="notice">Review the original servings and grocery quantities before using this recipe in a plan.</p><h3>Ingredients for review</h3><ul class="dialog-list">${item.items.map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul>`);
    editor.querySelector('#source-to-planner').onclick=()=>showDraft({...item,steps:[],reviewYield:item.yieldRequiresReview,source:{...item.source,kind:'link'}});
  }

  function frame(title,content) {
    editor.innerHTML=`<div class="dialog-top"><h2 id="recipe-editor-title">${title}</h2>
      <button type="button" class="editor-close" aria-label="Close recipe editor">×</button></div>${content}`;
    editor.querySelector('.editor-close').onclick=() => editor.close();
    if (!editor.open) editor.showModal();
    const titleElement=editor.querySelector('#recipe-editor-title');titleElement.tabIndex=-1;titleElement.focus();
  }

  function openEditor() {
    frame('Add a recipe',`<form id="recipe-import-form">
      <label class="search-label">Recipe text or link <textarea id="recipe-input" required maxlength="12000" rows="7"
        placeholder="Lemon chicken bowl for 2&#10;Ingredients: 350 g chicken breast, 1 cup rice, 1 lemon&#10;Steps: Cook the rice. Roast the chicken with lemon."></textarea></label>
      <label class="search-label">Source link for pasted text <input id="recipe-source" type="url" maxlength="1200" placeholder="https://…"></label>
      <p class="muted">Import a link from a supported recipe publisher, or paste the ingredients and steps from your own notes.</p>
      <div id="import-status" role="status" class="form-message"></div>
      <div class="actions"><button type="submit" class="primary">Review recipe</button>
      <button type="button" id="recipe-blank">Enter details manually</button><button type="button" id="recipe-collection">Import TikTok collection file</button></div></form>`);
    const form = $('#recipe-import-form');
    $('#recipe-collection').onclick=openCollectionImport;
    $('#recipe-blank').onclick=() => showDraft({items:[],name:'',steps:[],servings:2,minutes:30});
    form.onsubmit=async event => {
      event.preventDefault();
      const input = $('#recipe-input').value.trim();
      const sourceUrl = safeExternalUrl($('#recipe-source').value);
      const status = $('#import-status');
      if ($('#recipe-source').value && !sourceUrl) {
        status.textContent='Enter an HTTPS source link.';
        return;
      }
      if (!input) {status.textContent='Enter a recipe or a link.';return;}
      if (!/^https?:\/\/\S+$/i.test(input)) {
        const draft = pasteDraft(input);
        if (sourceUrl) draft.source={url:sourceUrl,label:'Source link',kind:'link'};
        showDraft(draft);
        return;
      }
      const run = ++editorRun;
      const submit=form.querySelector('[type=submit]');
      submit.disabled=true;
      status.textContent='Reading the recipe page…';
      try {
        const response = await fetch('./api/recipe-import',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:input}),
          signal:AbortSignal.timeout(11000)
        });
        const draft=await response.json();
        if (!response.ok) throw new Error(draft.error || 'Could not read this recipe.');
        if (run===editorRun && editor.open) showDraft(draft);
      } catch (error) {
        if (run!==editorRun || !editor.open) return;
        $('#recipe-source').value=safeExternalUrl(input);
        $('#recipe-input').value='';
        status.textContent=error instanceof SyntaxError || error.name === 'TimeoutError'
          ? 'Link import is unavailable for this page. Paste the recipe text to continue.'
          : error.message;
        $('#recipe-input').focus();
      } finally {
        submit.disabled=false;
      }
    };
  }

  function showDraft(draft) {
    let rows = editorRows(draft);
    frame('Review recipe',`<form id="recipe-review">
      <p class="muted">Review the serving count and match each ingredient to a grocery item. Use the displayed grocery units.</p>
      ${draft.reviewYield?'<p class="notice">Check the source’s serving count before saving.</p>':''}
      <label class="search-label">Recipe name <input id="draft-name" value="${escapeHtml(draft.name)}" required maxlength="100"></label>
      <div class="editor-grid">
      <label class="search-label">Original servings <input id="draft-yield" type="number" min="1" max="48" value="${draft.servings}" required></label>
      <label class="search-label">Total minutes <input id="draft-time" type="number" min="1" max="720" value="${draft.minutes || 30}" required></label>
      <label class="search-label">Cuisine <input id="draft-cuisine" value="${escapeHtml(editorCuisine(draft.cuisine))}" maxlength="45" list="cuisine-choices"></label>
      <datalist id="cuisine-choices">${categories.map(tag=>`<option value="${escapeHtml(tag)}"></option>`).join('')}</datalist>
      <label class="search-label">Plan for <select id="draft-use"><option value="both">Dinner or prep lunch</option><option value="dinner">Dinner</option><option value="lunch">Prep lunch</option></select></label></div>
      <label class="search-label">Tags <input id="draft-tags" maxlength="120" placeholder="Spicy, vegetarian, one-pot"></label>
      <fieldset class="ingredient-editor"><legend>Ingredients</legend><div id="draft-ingredients"></div>
      <button type="button" id="draft-add">Add ingredient</button></fieldset>
      <label class="search-label">Cooking steps <textarea id="draft-steps" rows="4" maxlength="10000" placeholder="One step per line">${escapeHtml((draft.steps || []).join('\n'))}</textarea></label>
      ${draft.source ? `<p class="muted">Source · ${escapeHtml(draft.source.label)}. The original instructions open from the recipe card.</p>` : ''}
      <label class="toggle"><input id="draft-favorite" type="checkbox"> Add to favorites</label>
      <div id="review-error" role="alert" class="form-message"></div>
      <button type="submit" class="primary full">Save recipe</button></form>`);
    $('#draft-use').value=['both','dinner','lunch'].includes(draft.use)?draft.use:'both';
    const list = $('#draft-ingredients');
    const choices = Object.values(ingredients).sort((a,b)=>a.name.localeCompare(b.name));
    const rowItem=row=>ingredients[row.id] || {name:row.customName||'',unit:row.unit||'g',aisle:'Other groceries'};
    function drawRows(focusIndex) {
      list.innerHTML=rows.map((row,index) => `<section class="editor-ingredient" data-row="${index}">
        ${row.raw ? `<p class="muted">From recipe · ${escapeHtml(row.raw)}</p>` : ''}
        <div class="ingredient-fields"><label class="search-label">Grocery item ${index+1}
        <select data-field="id" aria-label="Grocery item ${index+1}">
        <option value="">Choose an item</option><option value="note" ${row.id==='note'?'selected':''}>Recipe note (not on shopping list)</option><option value="custom" ${row.id==='custom'?'selected':''}>New grocery item</option>
        ${choices.map(item=>`<option value="${item.id}" ${row.id===item.id?'selected':''}>${escapeHtml(item.name)} · ${displayUnit(item)}</option>`).join('')}</select></label>
        <label class="search-label">Amount${row.id&&row.id!=='note'?' ('+displayUnit(rowItem(row))+')':''}
        <input type="number" data-field="quantity" aria-label="Quantity for ingredient ${index+1}" value="${row.quantity==null||row.quantity===''?'':Number(toDisplay(Number(row.quantity),rowItem(row)).toFixed(4))}" min=".01" max="100000" step="any"></label>
        <button type="button" data-remove="${index}" class="remove-ingredient" aria-label="Remove ingredient ${index+1}">×</button></div>
        ${row.id==='custom' ? `<div class="editor-grid">
          <label class="search-label">Item name <input data-field="customName" maxlength="60" value="${escapeHtml(row.customName)}"></label>
          <label class="search-label">Unit <select data-field="unit">${['g','mL','each'].map(unit=>`<option value="${unit}" ${unit===row.unit?'selected':''}>${unit==='g'?'oz (weight)':unit==='mL'?'fl oz (volume)':'each'}</option>`).join('')}</select></label>
          <label class="search-label">Pack size (${displayUnit(rowItem(row))}) <input data-field="pack" type="number" min=".01" step="any" value="${row.pack?Number(toDisplay(Number(row.pack),rowItem(row)).toFixed(4)):''}"></label>
          <label class="search-label">Pack price ($, optional) <input data-field="price" type="number" min="0" max="999" step=".01" value="${escapeHtml(row.price)}"></label></div>` : ''}
        </section>`).join('');
      if (focusIndex != null) list.querySelector(`[data-row="${focusIndex}"] select`)?.focus();
    }
    list.oninput=event => {
      const el = event.target, row = el.closest('[data-row]');
      if (!row || !el.dataset.field) return;
      const target=rows[Number(row.dataset.row)];
      target[el.dataset.field] = ['quantity','pack'].includes(el.dataset.field) && el.value!=='' ? fromDisplay(Number(el.value),rowItem(target)) : el.value;
    };
    list.onchange=event => {
      if (event.target.dataset.field==='unit'){drawRows();return;}
      if (event.target.dataset.field!=='id') return;
      const index=Number(event.target.closest('[data-row]').dataset.row);
      const parsed=parseIngredient(rows[index].raw);
      rows[index].id=event.target.value;
      rows[index].quantity=parsed.id===event.target.value ? parsed.quantity : '';
      drawRows(index);
    };
    list.onclick=event => {
      if (!event.target.hasAttribute('data-remove')) return;
      const index=Number(event.target.dataset.remove);
      rows.splice(index,1);
      drawRows(Math.min(index,rows.length-1));
      if (!rows.length) $('#draft-add').focus();
    };
    $('#draft-add').onclick=() => {
      rows.push(...editorRows({items:['']}));
      drawRows(rows.length-1);
    };
    drawRows();
    $('#recipe-review').onsubmit=event => {
      event.preventDefault();
      const error=$('#review-error');
      const name=$('#draft-name').value.trim();
      const steps=$('#draft-steps').value.split(/\n/).map(value=>value.trim()).filter(Boolean);
      if (!name || !rows.length || (!steps.length && !draft.source?.url)) {
        error.textContent='Add a name, at least one ingredient, and cooking steps or a source link.';
        return;
      }
      const parts={}, customIngredients=[], ingredientNotes=[];
      for (const [index,row] of rows.entries()) {
        if(row.id==='note'){ingredientNotes.push(row.raw || row.customName);continue;}
        const quantity=Number(row.quantity);
        if (!row.id || !Number.isFinite(quantity) || quantity<=0) {
          error.textContent='Choose the grocery item and enter the amount for ingredient '+(index+1)+'.';
          return;
        }
        let id=row.id;
        if (id==='custom') {
          const itemName=row.customName.trim(), pack=Number(row.pack), cents=Math.round(Number(row.price)*100);
          if (!itemName || !Number.isFinite(pack) || pack<=0 || !Number.isFinite(cents) || cents<0) {
            error.textContent='Enter a name and pack size for ingredient '+(index+1)+'.';
            return;
          }
          const existing=Object.values(ingredients).find(item=>item.id.startsWith('custom_')&&item.name.toLowerCase()===itemName.toLowerCase()&&item.unit===row.unit);
          id=existing?.id || 'custom_'+crypto.randomUUID();
          customIngredients.push(existing || {id,name:itemName,aisle:'Other groceries',pack,cents,unit:row.unit,risk:0.35,unpriced:row.price===''});
        }
        parts[id]=(parts[id] || 0)+quantity;
      }
      if(!Object.keys(parts).length){error.textContent='Add at least one measured grocery ingredient.';return;}
      const protein = [['chicken','Chicken'],['groundChicken','Chicken'],['turkey','Turkey'],
        ['steak','Beef'],['groundBeef','Beef'],['salmon','Seafood'],['tofu','Tofu'],['egg','Eggs'],
        ['blackbean','Beans'],['chickpea','Chickpeas']].find(([id])=>parts[id])?.[1] || 'Other';
      const styles = [...new Set($('#draft-tags').value.split(',')
        .map(value=>value.trim()).filter(Boolean).map(value=>categories.find(tag=>tag.toLowerCase()===value.toLowerCase()) ||
        value[0].toUpperCase()+value.slice(1)))].slice(0,8);
      const recipe={id:'recipe_'+crypto.randomUUID(),name,steps,parts,ingredientNotes,custom:true,origin:'user',
        servings:Number($('#draft-yield').value),minutes:Number($('#draft-time').value),
        cuisine:$('#draft-cuisine').value.trim() || 'Personal recipe',protein,use:$('#draft-use').value,styles,
        source:draft.source};
      const settings = beforeSave();
      registerRecipe(recipe,customIngredients);
      data.custom.push({recipe,ingredients:customIngredients});
      if ($('#draft-favorite').checked) favorites.add(recipe.id);
      persist();
      editor.close();
      filter='mine';query='';lunchOnly=false;
      afterSave(settings);
    };
  }

  return {
    render, markFavorite, favoriteButton, refresh:()=>{if(root?.querySelector("#recipe-grid"))renderGrid();}, custom:()=>data.custom,
    reload() {
      const fresh=readLibrary(); data.custom=fresh.custom;
      favorites.clear();fresh.favorites.forEach(id=>favorites.add(id));
      for(const pack of data.custom)if(pack?.recipe?.id&&Array.isArray(pack.ingredients))registerRecipe(pack.recipe,pack.ingredients);
    },
    attribution(item) {
      const url=safeExternalUrl(item.source?.url), video=safeExternalUrl(item.source?.video);
      if (!url) return `<p class="muted">${escapeHtml(sourceDescription(item))}</p>`;
      const label=item.source.kind==='link'?'Original recipe':'Adapted from '+item.source.label;
      return `<p class="recipe-source"><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(url)}">${escapeHtml(label)}</a>${video ? ` · <a target="_blank" rel="noopener noreferrer" href="${escapeHtml(video)}">Creator video</a>` : ''}</p>`;
    }
  };
}
