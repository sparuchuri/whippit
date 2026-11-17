import { byId, ingredients, staples, categories, recipes, tags } from './catalog.js';
import { dayNames, defaults, generate, swaps, grocery, money, amount, weekKey, dateLabel, shiftWeek } from './planner.js';
import { readWeeks, writeWeeks } from './storage.js';

const $ = selector => document.querySelector(selector);
const form = $('#form'), results = $('#results'), dialog = $('#detail');
const weeks = readWeeks();
let week = weekKey(), view = 'week', options = [], optionIndex = 0, draft = null;
let current = weeks[week] || null;
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
field('theme').innerHTML = '<option value="">Any theme</option>'+categories.map(tag => `<option>${esc(tag)}</option>`).join('');
$('#exclusions').innerHTML = categories.map(tag => `<label><input type="checkbox" name="exclude" value="${esc(tag)}">${esc(tag)}</label>`).join('');
$('#ingredients').innerHTML = Object.values(ingredients).map(item => `<label><input type="checkbox" name="excludeIngredient" value="${item.id}">${esc(item.name)}</label>`).join('');
$('#pantry').innerHTML = staples.map(id => `<label><input type="checkbox" name="pantry" value="${id}">${esc(ingredients[id].name)} on hand</label>`).join('');
$('#prices').innerHTML = Object.values(ingredients).map(item => `<div><label class="field">${esc(item.name)} · ${amount(item.pack,item.unit)} ($)<input type="number" min="0" max="999" step=".01" name="price-${item.id}" placeholder="${(item.cents/100).toFixed(2)}"></label><label class="field">On hand (${item.unit})<input type="number" min="0" max="100000" step=".25" name="stock-${item.id}" placeholder="0" aria-label="${esc(item.name)} on hand (${item.unit})"></label></div>`).join('');

function announce(message='') {
  $('#status').textContent = message;
  $('#status').classList.toggle('status',Boolean(message));
}
function fill(config) {
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
    field('stock-'+id).value = typeof config.pantry[id] === 'number' ? config.pantry[id] : '';
  }
  $('#lunch-settings').hidden = !field('lunchEnabled').checked;
}
function readConfig() {
  const guests = {}, pantry = {}, prices = {};
  for (const day of selected('dinnerDay')) if (field('guest'+day).value) guests[day] = Number(field('guest'+day).value);
  for (const id of Object.keys(ingredients)) {
    if (Number(field('stock-'+id).value)) pantry[id] = Number(field('stock-'+id).value);
    if (field('price-'+id).value !== '') prices[id] = Math.round(Number(field('price-'+id).value)*100);
  }
  for (const id of selected('pantry')) pantry[id] = 'enough';
  return {
    dinnerDays:selected('dinnerDay').map(Number), lunchDays:field('lunchEnabled').checked ? selected('lunchDay').map(Number) : [],
    dinnerPeople:Number(field('dinnerPeople').value), lunchPeople:Number(field('lunchPeople').value), guests,
    splitLunch:field('splitLunch').checked, budget:Number(field('budget').value), theme:field('theme').value,
    excluded:selected('exclude'), excludedIngredients:selected('excludeIngredient'), pantry, prices
  };
}
function preserveChecks() {
  const next = new Set(grocery(draft.assignments,draft.config).lines.filter(item => item.packs).map(item => item.signature));
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
  draft = null;
  options = [];
  announce(saved ? 'Week saved.' : 'Browser storage is unavailable. This week is open for this session.');
  render();
}
function summary(plan,basket) {
  const delta = cap(plan.config)-basket.cents;
  const stats = [plan.assignments.filter(slot => slot.type === 'dinner').length+' dinners'];
  if (plan.config.lunchDays.length) stats.push(plan.config.lunchDays.length+' lunch days');
  return `<div class="summary ${delta < 0 ? 'over' : ''}"><div><b>${stats.join(' · ')}</b><small>${delta === 0 ? 'On target' : money(Math.abs(delta))+(delta > 0 ? ' below target' : ' over target')} · Sample grocery estimate</small></div><strong>${money(basket.cents)}</strong></div>`;
}
function prepText(slot) {
  const prep = dateLabel(week,slot.prepDay,{weekday:'long',month:'short',day:'numeric'});
  const days = slot.days.map(day => dayNames[day].slice(0,3)).join(', ');
  return `Prep ${prep} · ${days} · ${slot.servings} portions`;
}
function meal(slot,plan) {
  const item = byId[slot.recipeId], locked = Boolean(plan.locks[slot.id]);
  return `<article class="meal panel ${slot.type === 'lunch' ? 'prep' : ''}">
    <div class="date-badge">${slot.type === 'lunch' ? 'Batch' : dayNames[slot.day].slice(0,3)+' '+dateAtDay(slot.day)}</div>
    <div><button class="meal-title" data-recipe="${slot.id}">${esc(item.name)}</button>
    <p class="muted">${slot.type === 'lunch' ? esc(prepText(slot)) : slot.servings+' servings'} · ${item.minutes} min · ${esc(item.cuisine)}</p></div>
    <div class="actions"><button data-lock="${slot.id}" aria-label="${locked ? 'Unlock' : 'Lock'} ${esc(item.name)}" ${draft ? 'disabled' : ''}>${locked ? 'Unlock' : 'Lock'}</button>
    <button data-swap="${slot.id}" aria-label="Swap ${esc(item.name)}" ${locked || draft ? 'disabled' : ''}>Swap</button></div></article>`;
}
const dateAtDay = day => dateLabel(week,day,{day:'numeric'});
function renderWeek(plan,basket) {
  const dinner = plan.assignments.filter(slot => slot.type === 'dinner');
  const lunches = plan.assignments.filter(slot => slot.type === 'lunch');
  const reused = basket.lines.filter(item => item.risk && item.need && plan.assignments.filter(slot => byId[slot.recipeId].parts[item.id]).length > 1);
  return summary(plan,basket) + (draft ? `<div class="actions"><button id="save" class="primary">${basket.cents > cap(plan.config) ? 'Save over target' : 'Save week'}</button>
    ${options.length > 1 ? `<button id="alternative">Next option (${optionIndex+1}/${options.length})</button>` : ''}<button id="cancel">Discard preview</button></div>` : '') +
    (reused.length ? `<p class="tag">Shared across recipes · ${reused.slice(0,4).map(item => esc(item.name)).join(', ')}</p>` : '') +
    (dinner.length ? `<div class="section-title"><h2>Dinners</h2></div><div class="meal-list">${dinner.map(item => meal(item,plan)).join('')}</div>` : '') +
    (lunches.length ? `<div class="section-title"><h2>Lunch prep</h2></div><div class="meal-list">${lunches.map(item => meal(item,plan)).join('')}</div>
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
      <span class="item">${esc(item.name)}<br><small class="muted">${item.packs} × ${amount(item.pack,item.unit)} pack</small></span><span class="price">${money(item.cost)}</span></label>`).join('')}</section>`).join('')+
    (!buy.length ? '<p class="muted">Your pantry covers the planned ingredients.</p>' : '')+
    (pantry.length ? `<section class="panel shop-group"><h3>Using from your pantry</h3>${pantry.map(item => `<div class="leftover"><span>${esc(item.name)}</span><span>${amount(item.usedPantry,item.unit)}</span></div>`).join('')}</section>` : '')+
    (remaining.length ? `<section class="panel shop-group"><h3>Expected perishable leftovers</h3>${remaining.map(item => `<div class="leftover"><span>${esc(item.name)}</span><span>${amount(item.remaining,item.unit)}</span></div>`).join('')}</section>` : '');
}
function render() {
  $('#date').textContent = dateLabel(week,0,{month:'short',day:'numeric'})+' – '+dateLabel(week,6,{month:'short',day:'numeric'});
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  $('#settings').hidden = view === 'shop';
  const plan = active();
  if (!plan) {
    results.innerHTML = `<section class="panel empty"><h2>${view === 'week' ? 'Plan your meals' : 'Your grocery list starts with a plan'}</h2><p>Choose your days, servings and budget to see recipes and package quantities for the week.</p>${view === 'shop' ? '<button data-go-week>Go to Week</button>' : ''}</section>`;
    return;
  }
  const basket = grocery(plan.assignments,plan.config);
  results.innerHTML = view === 'week' ? renderWeek(plan,basket) : renderShop(plan,basket);
}
function changeWeek(delta) {
  if (draft && !confirm('Discard this unsaved preview and change weeks?')) return;
  week = shiftWeek(week,delta);
  draft = null;
  options = [];
  current = weeks[week] || null;
  fill(current?.config || defaults());
  announce();
  render();
}
function showDialog(title,html) {
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = html;
  dialog.showModal();
}
function showRecipe(id) {
  const slot = active().assignments.find(item => item.id === id), item = byId[slot.recipeId];
  const storage = slot.type === 'lunch' ? '<p class="notice">Portion into shallow containers and refrigerate or freeze promptly. Freeze any portions you’ll eat more than 3 days after prep. <a href="https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely/" target="_blank" rel="noopener noreferrer">USDA guidance</a></p>' : '';
  showDialog(item.name,`<p class="muted">${item.minutes} min · ${slot.servings} servings</p>${storage}
    <h3>Ingredients</h3><ul class="dialog-list">${list(Object.entries(item.parts).map(([key,value]) => esc(ingredients[key].name)+' · '+amount(value*slot.servings/2,ingredients[key].unit)))}</ul>
    <h3>Steps</h3><ol class="dialog-list">${list(item.steps.map(esc))}</ol>`);
}
function showSwaps(id) {
  const plan = current, currentBasket = grocery(plan.assignments,plan.config);
  const alternatives = swaps(plan.assignments,id,plan.config);
  showDialog('Swap this meal', alternatives.length ? alternatives.map(option => {
    const delta = option.basket.cents-currentBasket.cents;
    const remainder = option.basket.waste-currentBasket.waste;
    return `<div class="swap-option"><div><b>${esc(byId[option.recipeId].name)}</b><p class="muted">${money(option.basket.cents)} total · ${delta ? (delta > 0 ? '+' : '−')+money(Math.abs(delta)) : 'same cost'} · ${remainder < -1 ? 'less' : remainder > 1 ? 'more' : 'similar'} estimated perishable remainder</p></div><button data-pick="${option.recipeId}">Preview</button></div>`;
  }).join('') : '<p>There are no eligible swaps with these preferences.</p>');
  $('#dialog-content').onclick = event => {
    const id = event.target.dataset.pick;
    if (!id) return;
    options = [];
    preview(plan.config,plan.locks,alternatives.find(option => option.recipeId === id));
    dialog.close();
    announce('Review the swap and save to update your week.');
    render();
  };
}
field('lunchEnabled').addEventListener('change',() => {$('#lunch-settings').hidden = !field('lunchEnabled').checked;});
$('#suggest').addEventListener('click',() => {
  const config = readConfig();
  const suggestions = categories.filter(theme => theme !== config.theme && !config.excluded.includes(theme))
    .map(theme => ({theme,count:recipes.filter(item => tags(item).includes(theme) &&
      (config.dinnerDays.length || (config.lunchDays.length && item.use === 'both')) &&
      !tags(item).some(tag => config.excluded.includes(tag)) &&
      !Object.keys(item.parts).some(id => config.excludedIngredients.includes(id))).length}))
    .filter(item => item.count).sort((a,b) => b.count-a.count || a.theme.localeCompare(b.theme));
  if (suggestions.length) {
    field('theme').value = suggestions[0].theme;
    announce('Suggested theme: '+suggestions[0].theme+'.');
  } else announce('Choose meal days and loosen exclusions to find a theme.');
});
form.addEventListener('submit',event => {
  event.preventDefault();
  const config = readConfig(), ids = new Set(config.dinnerDays.map(day => 'd'+day));
  if (config.lunchDays.length) ids.add('l0');
  if (config.splitLunch && config.lunchDays.length > 3) ids.add('l1');
  const missingLocks = Object.keys(current?.locks || {}).filter(id => !ids.has(id));
  if (missingLocks.length) { announce('Unlock meals you want to remove before changing their dates.'); return; }
  const locks = current?.locks || {};
  const previous = [shiftWeek(week,-1),shiftWeek(week,-2)].flatMap(key => (weeks[key]?.assignments || []).map(item => item.recipeId));
  const proposal = generate(config,locks,previous);
  if (proposal.error) {announce(proposal.error);return;}
  options = proposal.options;
  optionIndex = 0;
  preview(config,locks,options[0]);
  announce('Review the proposed week, then save it.');
  render();
  if (matchMedia('(max-width: 660px)').matches) $('#status').scrollIntoView({block:'start'});
});
$('#prev').onclick = () => changeWeek(-1);
$('#next').onclick = () => changeWeek(1);
$('#close').onclick = () => dialog.close();
dialog.addEventListener('close',() => {$('#dialog-content').onclick = null;});
document.querySelector('nav').addEventListener('click',event => {
  if (!event.target.dataset.view) return;
  view = event.target.dataset.view;
  render();
});
results.addEventListener('click',async event => {
  const button = event.target.closest('button');
  if (!button) return;
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
    const lines = grocery(active().assignments,active().config).lines.filter(item => item.packs);
    const text = lines.map(item => `${item.aisle}: ${item.name} — ${item.packs} × ${amount(item.pack,item.unit)}`).join('\n');
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

fill(current?.config || defaults());
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
