import { byId, ingredients, staples, categories, recipes, tags } from './catalog.js';
import { dayNames, defaults, generate, swaps, grocery, money, amount, weekKey, dateLabel, shiftWeek, slotsFor, eligibility, ingredientAmount, displayUnit, toDisplay, fromDisplay } from './planner.js';
import {readWeeks,writeWeeks,initializeStorage,subscribeSync,readPreferences,writePreferences,readPantryProfile,readLibrary as readSavedLibrary} from './storage.js';
import {setupAccountUI} from './account-ui.js';
import {createPantryProfile, withPantryProfile} from './pantry-profile.js';
import {createRecipeLibrary} from './recipe-library.js';
import {recipeMatches} from './recipe-tools.js';
import {icon,dishMark} from './ui.js';

const $ = selector => document.querySelector(selector);
const form = $('#form'), results = $('#results'), dialog = $('#detail');
await initializeStorage();
const setup = $('#setup-dialog');
document.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon);});
const weeks = readWeeks();
let formDirty=false;
const openPantry = createPantryProfile(()=>{
  lastPantry = JSON.stringify(readPantryProfile());
  render();
  announce('Pantry saved. Your grocery list uses what you have on hand.');
});
const shoppingConfig = config => withPantryProfile(config,readPantryProfile());
setupAccountUI(openPantry);
$('#open-pantry').onclick = openPantry;
let week = weekKey(), view = 'week', options = [], optionIndex = 0, draft = null;
let current = weeks[week] || null;
let generation = null;
const field = name => form.elements.namedItem(name);
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const checked = bool => bool ? 'checked' : '';
const dayButtons = (name, count) => dayNames.slice(0,count).map((nameOfDay,i) =>
  `<label title="${nameOfDay}"><span>${nameOfDay.slice(0,2)}</span><input type="checkbox" name="${name}" value="${i}" aria-label="${nameOfDay} ${name === 'dinnerDay' ? 'dinner' : 'lunch'}"></label>`
).join('');
const selected = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
const checkValues = (name,values) => form.querySelectorAll(`input[name="${name}"]`).forEach(el => {el.checked=values.includes(el.value);});
const list = values => values.map(value => `<li>${value}</li>`).join('');
const active = () => draft || current;
const cap = config => Math.round(config.budget*100);

$('#dinner-days').innerHTML = dayButtons('dinnerDay',7);
$('#lunch-days').innerHTML = dayButtons('lunchDay',5);
$('#guests').innerHTML = dayNames.map((day,i) => `<label class="field">${day}<input type="number" name="guest${i}" min="1" max="8" placeholder="Default" aria-label="${day} dinner servings"></label>`).join('');
const library = createRecipeLibrary({
  beforeSave:readConfig,
  afterSave(settings) {
    populateCatalogFields();
    fill(settings);
    announce('Recipe added to My recipes.');
    render();
  },
  onOpen(id) {
    const item = byId[id];
    if (item) showRecipeDetails(item,item.servings);
  },
  notify:announce,
});
function populateCatalogFields() {
  field('theme').innerHTML = '<option value="">Any theme</option>'+categories.map(tag => `<option>${esc(tag)}</option>`).join('');
  $('#exclusions').innerHTML = categories.map(tag => `<label><input type="checkbox" name="exclude" value="${esc(tag)}">${esc(tag)}</label>`).join('');
  $('#ingredients').innerHTML = Object.values(ingredients).map(item => `<label><input type="checkbox" name="excludeIngredient" value="${item.id}">${esc(item.name)}</label>`).join('');
  $('#less-preferred').innerHTML = Object.values(ingredients).map(item => `<label><input type="checkbox" name="lessPreferredIngredient" value="${esc(item.id)}">${esc(item.name)}</label>`).join('');
  $('#pantry').innerHTML = staples.map(id => `<label><input type="checkbox" name="pantry" value="${id}">${esc(ingredients[id].name)} on hand</label>`).join('');
  $('#prices').innerHTML = Object.values(ingredients).map(item => `<div><label class="field">${esc(item.name)} · ${ingredientAmount(item.pack,item)} ($)<input type="number" min="0" max="999" step=".01" name="price-${item.id}" placeholder="${item.unpriced?'Add price':(item.cents/100).toFixed(2)}"></label><label class="field">On hand (${displayUnit(item)})<input type="number" min="0" max="100000" step="any" name="stock-${item.id}" placeholder="0" aria-label="${esc(item.name)} on hand (${displayUnit(item)})"></label></div>`).join('');
}
populateCatalogFields();

function announce(message='') {
  $('#status').textContent = message;
  $('#status').classList.toggle('status',Boolean(message));
  if (setup.open) $('#setup-status').textContent = message;
}
function openSetup() {
  $('#setup-status').textContent='';
  setup.showModal();
  $('#setup-title').focus();
  setup.scrollTop=0;
}
function fill(config) {
  config={...defaults(),...config};
  field('dinnerLeftovers').checked=config.dinnerLeftovers;
  field('shoppingZip').value=config.shoppingZip;
  checkValues('lessPreferredIngredient',config.lessPreferredIngredients);
  checkValues('dinnerDay',config.dinnerDays.map(String));
  checkValues('lunchDay',(config.lunchDays.length ? config.lunchDays : [0,1,2,3,4]).map(String));
  checkValues('exclude',config.excluded);
  checkValues('excludeIngredient',config.excludedIngredients || []);
  checkValues('pantry',Object.keys(config.pantry).filter(id => config.pantry[id] === 'enough'));
  for (const name of ['dinnerPeople','lunchPeople','budget','theme']) field(name).value = config[name];
  field('lunchEnabled').checked = Boolean(config.lunchDays.length);
  field('splitLunch').checked = config.splitLunch;
  dayNames.forEach((_,i) => {field('guest'+i).value = config.guests[i] || '';});
  for (const id of Object.keys(ingredients)) {
    field('price-'+id).value = config.prices[id] == null ? '' : (config.prices[id]/100).toFixed(2);
    field('stock-'+id).value = typeof config.pantry[id] === 'number' ? Number(toDisplay(config.pantry[id],ingredients[id]).toFixed(4)) : '';
  }
  $('#lunch-settings').hidden = !field('lunchEnabled').checked;
}
function readConfig() {
  const guests = {}, pantry = {}, prices = {};
  for (const day of selected('dinnerDay')) if (field('guest'+day).value) guests[day] = Number(field('guest'+day).value);
  for (const id of Object.keys(ingredients)) {
    if (Number(field('stock-'+id).value)) pantry[id] = fromDisplay(Number(field('stock-'+id).value),ingredients[id]);
    if (field('price-'+id).value !== '') prices[id] = Math.round(Number(field('price-'+id).value)*100);
  }
  for (const id of selected('pantry')) pantry[id] = 'enough';
  return {
    dinnerDays:selected('dinnerDay').map(Number), lunchDays:field('lunchEnabled').checked ? selected('lunchDay').map(Number) : [],
    dinnerPeople:Number(field('dinnerPeople').value), lunchPeople:Number(field('lunchPeople').value), guests,
    shoppingZip:field('shoppingZip').value, dinnerLeftovers:field('dinnerLeftovers').checked, lessPreferredIngredients:selected('lessPreferredIngredient'),
    splitLunch:field('splitLunch').checked, budget:Number(field('budget').value), theme:field('theme').value,
    excluded:selected('exclude'), excludedIngredients:selected('excludeIngredient'), pantry, prices
  };
}
function preserveChecks() {
  const next = new Set(grocery(draft.assignments,shoppingConfig(draft.config)).lines.filter(item => item.packs).map(item => item.signature));
  draft.checked = (current?.checked || []).filter(signature => next.has(signature));
}
function preview(config, locks, option) {
  draft = {config,locks,assignments:option.assignments,checked:[]};
  preserveChecks();
}
function commit() {
  if (!draft) return;
  current = draft;
  weeks[week] = current;
  const saved = writeWeeks(weeks);
  writePreferences(current.config);
  draft = null;
  options = [];
  formDirty=false;
  announce(saved ? 'Week saved.' : 'Browser storage is unavailable. This week is open for this session.');
  render();
}
function summary(plan,basket) {
  const delta = cap(plan.config)-basket.cents;
  const unpriced=basket.lines.filter(line=>line.packs&&line.unpriced).length;
  const stats = [plan.assignments.filter(slot=>slot.type==='dinner').reduce((n,s)=>n+(s.days?.length||1),0)+' dinners'];
  if (plan.config.lunchDays.length) stats.push(plan.config.lunchDays.length+' lunch days');
  return `<div class="summary ${delta < 0 ? 'over' : ''}"><div><b>${stats.join(' · ')}</b><small>${unpriced?'Partial estimate':delta === 0 ? 'On target' : money(Math.abs(delta))+(delta > 0 ? ' below target' : ' over target')} · ${unpriced?unpriced+' items still need prices':'Automatic estimate · ZIP '+esc(plan.config.shoppingZip || '94080')}</small></div><strong>${money(basket.cents)}${unpriced?' +':''}</strong></div>`;
}
function prepText(slot) {
  const prep = dateLabel(week,slot.prepDay,{weekday:'long',month:'short',day:'numeric'});
  const days = slot.days.map(day => dayNames[day].slice(0,3)).join(', ');
  return `Prep ${prep} · ${days} · ${slot.servings} portions`;
}
function meal(slot,plan,displayDay=slot.day) {
  const leftover=slot.type==='dinner'&&displayDay!==slot.day;
  const batch=slot.type==='dinner'&&slot.days?.length>1;
  const item = byId[slot.recipeId], locked = Boolean(plan.locks[slot.id]);
  return `<article class="meal panel ${slot.type === 'lunch' ? 'prep' : ''}">
    <div class="date-badge">${slot.type === 'lunch' ? 'Lunch<b>prep</b>' : dayNames[displayDay].slice(0,3)+'<b>'+dateAtDay(displayDay)+'</b>'}</div>
    ${dishMark(item)}
    <div><div class="meal-cuisine">${esc(item.cuisine)}</div><button class="meal-title" data-recipe="${slot.id}">${esc(item.name)}</button>
    <p class="muted">${slot.type === 'lunch' ? esc(prepText(slot)) : leftover?'Leftovers · '+(slot.portions?.[displayDay]||plan.config.dinnerPeople)+' servings · cooked '+dayNames[slot.day]:batch?'Cook '+slot.servings+' servings · save '+(slot.servings-slot.portions[slot.day])+' for '+dayNames[slot.days[1]]:slot.servings+' '+(slot.servings===1?'serving':'servings')}${leftover?'':' · '+item.minutes+' min'}</p></div>
    ${leftover?'<p class="muted">No cooking tonight</p>':`<div class="actions"><button data-lock="${slot.id}" aria-pressed="${locked}" aria-label="${locked ? 'Unlock' : 'Lock'} ${esc(item.name)}" ${draft ? 'disabled' : ''}>${locked ? 'Locked ✓' : 'Keep'}</button>
    <button data-swap="${slot.id}" aria-label="Swap ${esc(item.name)}" ${locked || draft ? 'disabled' : ''}>${slot.days?.length>1?'Swap batch':'Swap'}</button></div>`}</article>`;
}
const dateAtDay = day => dateLabel(week,day,{day:'numeric'});
function renderWeek(plan,basket) {
  const dinner = plan.assignments.filter(slot => slot.type === 'dinner');
  const lunches = plan.assignments.filter(slot => slot.type === 'lunch');
  const reused = basket.lines.filter(item => item.risk && item.need && plan.assignments.filter(slot => byId[slot.recipeId].parts[item.id]).length > 1);
  return summary(plan,basket) + (draft ? `<div class="actions plan-actions"><button id="save" class="primary">${basket.cents > cap(plan.config) ? 'Save over target' : 'Save week'}</button>
    ${options.length > 1 ? `<button id="alternative">Next option (${optionIndex+1}/${options.length})</button>` : ''}<button id="cancel">Discard preview</button></div>` : '') +
    (reused.length ? `<p class="tag reuse-note">${icon('sparkles')}<span>Doing double duty · ${reused.slice(0,4).map(item => esc(item.name)).join(', ')}</span></p>` : '') +
    (dinner.length ? `<div class="section-title"><h2>What’s for dinner?</h2><span class="muted">${dinner.length} cooking sessions</span></div><div class="meal-list">${dinner.flatMap(item=>(item.days||[item.day]).map(day=>({item,day}))).sort((a,b)=>a.day-b.day).map(({item,day})=>meal(item,plan,day)).join('')}</div>` : '') +
    (lunches.length ? `<div class="section-title"><h2>Lunch, ready to go.</h2><span class="muted">${lunches.length} prep batches</span></div><div class="meal-list">${lunches.map(item => meal(item,plan)).join('')}</div>
    ${lunches.some(slot => slot.days.at(-1)-slot.prepDay > 3) ? '<p class="notice">Freeze portions for lunches more than 3 days after prep. <a href="https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely/" target="_blank" rel="noopener noreferrer">USDA storage guidance</a></p>' : ''}` : '');
}
function renderShop(plan,basket) {
  const buy = basket.lines.filter(item => item.packs);
  const groups = [...new Set(buy.map(item => item.aisle))];
  const remaining = basket.lines.filter(item => item.remaining > 0 && item.risk);
  const pantry = basket.lines.filter(item => item.usedPantry);
  const checkedCount = buy.filter(item => plan.checked.includes(item.signature)).length;
  return summary(plan,basket)+`<div class="section-title"><h2>Shopping list</h2><p class="muted">${checkedCount} of ${buy.length} checked</p></div>
    <div class="actions"><button id="copy">Copy list</button>${draft ? '<button data-go-week>Review and save this preview</button>' : ''}</div>`+
    groups.map(aisle => `<section class="panel shop-group"><h3>${esc(aisle)}</h3>${buy.filter(item => item.aisle === aisle).map(item =>
      `<label class="shop-row ${plan.checked.includes(item.signature) ? 'checked' : ''}"><input type="checkbox" data-item="${item.signature}" ${checked(plan.checked.includes(item.signature))} ${draft ? 'disabled' : ''}>
      <span class="item">${esc(item.name)}<br><small class="muted">${item.packs} × ${ingredientAmount(item.pack,item)} pack</small></span><span class="price">${item.unpriced?'Price needed':money(item.cost)}</span></label>`).join('')}</section>`).join('')+
    (!buy.length ? '<p class="muted">Your pantry covers the planned ingredients.</p>' : '')+
    (pantry.length ? `<section class="panel shop-group"><h3>Using from your pantry</h3>${pantry.map(item => `<div class="leftover"><span>${esc(item.name)}</span><span>${ingredientAmount(item.usedPantry,item)}</span></div>`).join('')}</section>` : '')+
    (remaining.length ? `<section class="panel shop-group"><h3>Expected perishable leftovers</h3>${remaining.map(item => `<div class="leftover"><span>${esc(item.name)}</span><span>${ingredientAmount(item.remaining,item)}</span></div>`).join('')}</section>` : '');
}
function render() {
  $('#date').textContent = dateLabel(week,0,{month:'short',day:'numeric'})+' – '+dateLabel(week,6,{month:'short',day:'numeric'});
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  $('.intro').classList.toggle('compact',view !== 'week' || Boolean(active()));
  $('#week-tools').hidden = view === 'recipes';
  $('#open-setup').hidden = view !== 'week';
  const titles={week:'Good food.<br><em>Less fuss.</em>',shop:'One list.<br><em>All sorted.</em>',recipes:'Your next<br><em>favorite meal.</em>'};
  const intros={week:'A week of dinners, lunches ready to go, and one happy little grocery list.',shop:'Everything for your week, grouped by aisle. Tap as you shop.',recipes:'Find something that fits your mood. Save the ones you love.'};
  $('#intro-title').innerHTML=titles[view];
  $('#intro-copy').textContent=intros[view];
  $('#intro-eyebrow').textContent=view === 'week' ? 'A little planning. A lot of delicious.' : view === 'shop' ? 'A happier grocery run' : 'GOOD THINGS ARE COOKING';
  if (view === 'recipes') {
    library.render(results);
    return;
  }
  const plan = active();
  if (!plan) {
    results.innerHTML = `<section class="panel empty"><span class="empty-icon" aria-hidden="true">${view === 'week' ? '🍋' : '🧺'}</span><h2>${view === 'week' ? 'Let’s make it a delicious week.' : 'A little planning comes first.'}</h2><p>Pick your days, people, and budget. We’ll put together meals that share ingredients and keep waste down.</p><button class="primary" ${view === 'shop' ? 'data-go-week' : 'data-setup'}>${icon('sparkles')}${view === 'week' ? 'Plan my week' : 'Go to my week'}</button><div class="empty-steps"><span>① Pick your vibe</span><span>② Make it yours</span><span>③ Shop once</span></div></section>`;
    return;
  }
  const basket = grocery(plan.assignments,shoppingConfig(plan.config));
  results.innerHTML = view === 'week' ? renderWeek(plan,basket) : renderShop(plan,basket);
}
function changeWeek(delta) {
  if (draft && !confirm('Discard this unsaved preview and change weeks?')) return;
  if (generation) {
    generation.cancel();
    generation=null;
    form.querySelector('[type=submit]').disabled=false;
  }
  week = shiftWeek(week,delta);
  draft = null;
  options = [];
  current = weeks[week] || null;
  fill(current?.config || readPreferences() || defaults());
  announce();
  render();
}
function showDialog(title,html) {
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = html;
  if(!dialog.open) dialog.showModal();
}
function showRecipe(id) {
  const slot = active().assignments.find(item => item.id === id);
  if (slot) showRecipeDetails(byId[slot.recipeId],slot.servings,slot.type === 'lunch'||slot.days?.length>1);
}
function showRecipeDetails(item,servings,forLunch=false) {
  const storage = forLunch ? '<p class="notice">Portion into shallow containers and refrigerate or freeze promptly. Freeze any portions you’ll eat more than 3 days after prep. <a href="https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely/" target="_blank" rel="noopener noreferrer">USDA guidance</a></p>' : '';
  const steps = item.steps.length
    ? `<ol class="dialog-list">${list(item.steps.map(esc))}</ol>`
    : '<p>Open the original recipe above for cooking instructions.</p>';
  showDialog(item.name,`<div class="recipe-detail-meta"><p class="muted">${item.minutes} min · ${servings} servings</p>${library.favoriteButton(item)}</div>
    ${library.attribution(item)}${storage}
    <h3>Ingredients</h3><ul class="dialog-list">${list(Object.entries(item.parts).map(([key,value]) => esc(ingredients[key].name)+' · '+ingredientAmount(value*servings/item.servings,ingredients[key])))}</ul>
    ${item.ingredientNotes?.length?'<h3>Recipe notes</h3><ul class="dialog-list">'+list(item.ingredientNotes.map(esc))+'</ul>':''}<h3>Steps</h3>${item.stepsNote?`<p class="notice">${esc(item.stepsNote)}</p>`: ''}${steps}`);
}
function showSwaps(id) {
  const plan = current, currentBasket = grocery(plan.assignments,shoppingConfig(plan.config));
  const alternatives = swaps(plan.assignments,id,shoppingConfig(plan.config));
  showDialog('Swap this meal',alternatives.length
    ? '<label class="search-label">Find a swap <input id="swap-search" type="search" placeholder="Recipe or ingredient"></label><div id="swap-options"></div>'
    : '<p>There are no eligible swaps with these preferences.</p>');
  if (!alternatives.length) return;
  const swapList=$('#swap-options');
  function renderOptions(query) {
    swapList.innerHTML=alternatives.filter(option=>recipeMatches(byId[option.recipeId],query)).map(option => {
      const delta = option.basket.cents-currentBasket.cents;
      const remainder = option.basket.waste-currentBasket.waste;
      return `<div class="swap-option"><div><b>${esc(byId[option.recipeId].name)}</b><p class="muted">${money(option.basket.cents)} total · ${delta ? (delta > 0 ? '+' : '−')+money(Math.abs(delta)) : 'same cost'} · ${remainder < -1 ? 'less' : remainder > 1 ? 'more' : 'similar'} estimated perishable remainder</p></div><button data-pick="${option.recipeId}" aria-label="Preview ${esc(byId[option.recipeId].name)}">Preview</button></div>`;
    }).join('') || '<p>No swaps match this search.</p>';
  }
  renderOptions('');
  $('#swap-search').oninput=event=>renderOptions(event.target.value);
  swapList.onclick = event => {
    const chosen = event.target.dataset.pick;
    if (!chosen) return;
    options = [];
    preview(plan.config,plan.locks,alternatives.find(option => option.recipeId === chosen));
    dialog.close();
    announce('Review the swap and save to update your week.');
    render();
    $('#save')?.focus();
  };
}
function startPlan(config,locks,previous) {
  let worker;
  try {
    worker=new Worker(new URL('./planner-worker.js',import.meta.url),{type:'module'});
  } catch { /* A browser can still plan if it disallows workers. */ }
  let resolveResult, fallback;
  const result=new Promise(resolve=>{resolveResult=resolve;});
  const useFallback=()=>{
    worker?.terminate();
    fallback=setTimeout(()=>{
      try { resolveResult(generate(config,locks,previous)); }
      catch { resolveResult({error:'The planner couldn’t finish. Adjust the selections and try again.'}); }
    },30);
  };
  if (worker) {
    worker.onmessage=event=>{worker.terminate();resolveResult(event.data);};
    worker.onerror=event=>{event.preventDefault();useFallback();};
    worker.postMessage({config,locks,previous,custom:library.custom()});
  } else useFallback();
  return {result,cancel(){worker?.terminate();clearTimeout(fallback);resolveResult(null);}};
}
field('lunchEnabled').addEventListener('change',() => {$('#lunch-settings').hidden = !field('lunchEnabled').checked;});
$('#suggest').addEventListener('click',() => {
  const config = readConfig();
  const slots=slotsFor(config);
  const suggestions = categories.filter(theme => theme !== config.theme && !config.excluded.includes(theme))
    .map(theme => ({theme,count:recipes.filter(item => tags(item).includes(theme) && slots.some(slot=>eligibility(item,slot,config))).length}))
    .filter(item => item.count).sort((a,b) => b.count-a.count || a.theme.localeCompare(b.theme));
  if (suggestions.length) {
    field('theme').value = suggestions[0].theme;
    announce('Suggested theme: '+suggestions[0].theme+'.');
  } else announce('Choose meal days and loosen exclusions to find a theme.');
});
form.addEventListener('submit',async event => {
  event.preventDefault();
  if (generation) return;
  const config = readConfig();
  writePreferences(config);formDirty=false;
  const ids = new Set(slotsFor(config).map(slot=>slot.id));
  const missingLocks = Object.keys(current?.locks || {}).filter(id => !ids.has(id));
  if (missingLocks.length) { announce('Unlock meals you want to remove before changing their dates.'); return; }
  const locks = current?.locks || {};
  const previous = [shiftWeek(week,-1),shiftWeek(week,-2)].flatMap(key => (weeks[key]?.assignments || []).map(item => item.recipeId));
  const job = startPlan(shoppingConfig(config),locks,previous);
  generation = job;
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.innerHTML=icon('sparkles')+'Planning your week…';
  submit.setAttribute('aria-busy','true');
  announce('Planning meals and checking grocery packages…');
  const proposal = await job.result;
  if (generation !== job) return;
  generation = null;
  submit.disabled = false;
  submit.innerHTML=icon('sparkles')+'Generate week';
  submit.removeAttribute('aria-busy');
  if (!proposal) return;
  if (proposal.error) {announce(proposal.error);return;}
  options = proposal.options;
  optionIndex = 0;
  preview(config,locks,options[0]);
  view='week';
  setup.close();
  announce('Review the proposed week, then save it.');
  render();
  $('#status').scrollIntoView({block:'start',behavior:'instant'});
  $('#save')?.focus({preventScroll:true});
});
$('#prev').onclick = () => changeWeek(-1);
$('#next').onclick = () => changeWeek(1);
$('#close').onclick = () => dialog.close();
$('#open-setup').onclick = openSetup;
$('#close-setup').onclick = () => setup.close();
$('#dialog-content').addEventListener('click',event=>{
  const id=event.target.dataset.favorite;
  if(id) library.markFavorite(id);
});
document.querySelector('nav').addEventListener('click',event => {
  const button=event.target.closest('[data-view]');
  if (!button) return;
  view = button.dataset.view;
  if (!generation) announce();
  render();
  window.scrollTo({top:0,behavior:'instant'});
});
results.addEventListener('click',async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-setup')) {openSetup();return;}
  if (button.hasAttribute('data-go-week')) {view='week';render();return;}
  if (button.id === 'save') {commit();return;}
  if (button.id === 'cancel') {draft=null;options=[];announce('Preview discarded.');render();return;}
  if (button.id === 'alternative') {
    optionIndex = (optionIndex+1)%options.length;
    preview(draft.config,draft.locks,options[optionIndex]);
    render();
    return;
  }
  if (button.dataset.recipe) {showRecipe(button.dataset.recipe);return;}
  if (button.dataset.swap) {showSwaps(button.dataset.swap);return;}
  if (button.dataset.lock) {
    if (generation) {announce('Wait for the current plan to finish before changing locks.');return;}
    const id = button.dataset.lock;
    const locks = {...current.locks};
    if (locks[id]) delete locks[id];
    else locks[id] = current.assignments.find(item => item.id === id).recipeId;
    current = {...current,locks};
    weeks[week] = current;
    if (!writeWeeks(weeks)) announce('Browser storage is unavailable.');
    render();
    return;
  }
  if (button.id === 'copy') {
    const lines = grocery(active().assignments,shoppingConfig(active().config)).lines.filter(item => item.packs);
    const text = lines.map(item => `${item.aisle}: ${item.name} — ${item.packs} × ${ingredientAmount(item.pack,item)}`).join('\n');
    try {await navigator.clipboard.writeText(text);announce('Shopping list copied.');}
    catch {showDialog('Copy shopping list',`<textarea aria-label="Shopping list" rows="12" style="width:100%" readonly>${esc(text)}</textarea>`);$('#dialog-content textarea').select();}
  }
});
results.addEventListener('change',event => {
  const input = event.target;
  const signature = input.dataset.item;
  if (!current || draft || !signature) return;
  const checks = new Set(current.checked);
  if (input.checked) checks.add(signature); else checks.delete(signature);
  current = {...current,checked:[...checks]};
  weeks[week] = current;
  if (!writeWeeks(weeks)) announce('Browser storage is unavailable.');
  render();
  results.querySelector(`input[data-item="${signature}"]`)?.focus();
});

fill(current?.config || readPreferences() || defaults());
form.addEventListener('change',()=>{formDirty=true; if(form.checkValidity())writePreferences(readConfig());});
let lastPantry=JSON.stringify(readPantryProfile());
let lastRemote=JSON.stringify(readWeeks());
let lastLibrary=JSON.stringify(library.custom());
let lastSavedLibrary=JSON.stringify(readSavedLibrary());
subscribeSync(status=>{
  if(!status.remote)return;
  const updated=readWeeks(),signature=JSON.stringify(updated);
  const pantrySignature=JSON.stringify(readPantryProfile()), pantryChanged=pantrySignature!==lastPantry;
  lastPantry=pantrySignature;
  const settings=readConfig();
  const savedLibrarySignature=JSON.stringify(readSavedLibrary());
  const libraryChanged=savedLibrarySignature!==lastSavedLibrary;
  lastSavedLibrary=savedLibrarySignature;
  library.reload();
  // Sync can add ingredients, so refresh form choices while retaining the current input.
  const librarySignature=JSON.stringify(library.custom());
  if(librarySignature!==lastLibrary){populateCatalogFields();fill(settings);lastLibrary=librarySignature;}
  if(signature!==lastRemote){
    for(const key of Object.keys(weeks))delete weeks[key];Object.assign(weeks,updated);
    current=weeks[week] || null;lastRemote=signature;
    if(!draft&&!formDirty)fill(current?.config || readPreferences() || defaults());
    if(!draft)render();
  }else if(pantryChanged && view!=='recipes'){
    render();
  }else if(libraryChanged&&view==='recipes'&&!document.querySelector('#recipe-editor').open){
    library.refresh();
  }
});
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
