import { ingredients, recipes, byId, tags, isUserRecipe } from './catalog.js';

export const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const defaults = () => ({
  dinnerDays:[0,1,2,3,4], dinnerPeople:2, guests:{}, lunchDays:[], lunchPeople:2, splitLunch:true,
  budget:70, theme:'', excluded:[], excludedIngredients:[], lessPreferredIngredients:[], dinnerLeftovers:false, shoppingZip:'94080', pantry:{}, prices:{},
});

export function slotsFor(config) {
  const dinnerDays=[...config.dinnerDays].sort((a,b)=>a-b), slots=[];
  for(let i=0;i<dinnerDays.length;i++) {
    const day=dinnerDays[i], days=[day];
    if(config.dinnerLeftovers && i+1<dinnerDays.length && dinnerDays[i+1]-day<=2)days.push(dinnerDays[++i]);
    const portions=Object.fromEntries(days.map(d=>[d,config.guests[d] || config.dinnerPeople]));
    slots.push({id:'d'+day,day,type:'dinner',servings:Object.values(portions).reduce((a,b)=>a+b,0),days,portions});
  }
  const days = [...config.lunchDays].sort((a,b) => a-b);
  const batches = config.splitLunch && days.length > 3 ? [days.slice(0,3),days.slice(3)] : [days];
  batches.forEach((batch,index) => {
    if (batch.length) slots.push({
      id:'l'+index, day:batch[0], type:'lunch', servings:batch.length*config.lunchPeople,
      days:batch, prepDay:batch[0]-1, people:config.lunchPeople,
    });
  });
  return slots.sort((a,b) => a.day-b.day || a.type.localeCompare(b.type));
}

export function eligibility(recipe, slot, config) {
  return (recipe.use === 'both' || recipe.use === slot.type) &&
    !tags(recipe).some(tag => config.excluded.includes(tag)) &&
    !Object.keys(recipe.parts).some(id => config.excludedIngredients?.includes(id));
}

export function grocery(assignments, config, details=true) {
  const combineNeutralOils = !config.excludedIngredients?.some(id=>id==='oil'||id==='peanutOil');
  const groceryId = id => combineNeutralOils && id==='peanutOil' ? 'oil' : id;
  const needs = {};
  for (const {recipeId,servings} of assignments) {
    const recipe = byId[recipeId];
    for (const [ingredientId,quantity] of Object.entries(recipe.parts)) {
      const id=groceryId(ingredientId);
      needs[id] = (needs[id] || 0) + quantity * servings / recipe.servings;
    }
  }
  const pantry = {};
  for (const [ingredientId,amount] of Object.entries(config.pantry)) {
    const id=groceryId(ingredientId);
    pantry[id]=pantry[id]==='enough' || amount==='enough' ? 'enough' : (pantry[id]||0)+amount;
  }
  const lines = [];
  let cents = 0, waste = 0;
  for (const id of new Set([...Object.keys(needs),...Object.keys(pantry)])) {
    const item = ingredients[id];
    if (!item) continue;
    const need = needs[id] || 0;
    const onHand = pantry[id] === 'enough' ? need : (pantry[id] || 0);
    const net = Math.max(0,need-onHand);
    const price = config.prices[id] ?? item.cents;
    const packs = Math.max(0, Math.ceil(net/item.pack - 1e-10));
    const remaining = Math.max(0,packs*item.pack-net) + Math.max(0,onHand-need);
    const cost = packs*price;
    cents += cost;
    waste += remaining/item.pack*price*item.risk;
    if (details && (need || remaining)) lines.push({
      ...item,...(combineNeutralOils&&id==='oil'?{name:'Neutral cooking oil'}:{}),unpriced:item.unpriced && config.prices[id]==null,need,packs,cost,remaining,usedPantry:Math.min(onHand,need),
      signature:[id,item.pack,packs].join(':')
    });
  }
  lines.sort((a,b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  return {lines,cents,waste};
}

const matchesTheme = (id, theme) => tags(byId[id]).includes(theme);
const themeMet = (assignments, theme) => !theme || assignments.some(slot => matchesTheme(slot.recipeId,theme));

const stapleIds=new Set(['oil','salt','blackPepper','rice','garlic','onion','ginger','sugar']);
const flavorIds=['coconut','curry','gochujang','pesto','peanut','miso','tomato'];
// Distinguish the dish from the grocery basket. A tomato sauce can be shared
// across dishes; two different recipes for red-sauce pasta still eat similarly.
function describeDish(recipe) {
  const normalize = value => value.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu,'');
  const title = normalize(recipe.name);
  const names = normalize(Object.keys(recipe.parts).map(id=>ingredients[id]?.name || id).join(' '));
  const isPasta = /\b(?:pasta|spaghetti|rigatoni|penne|linguine|fettuccine|lasagna|gnocchi|orzo|mac(?:aroni)?)\b/;
  const redSauce = /\b(?:bolognese|marinara|arrabbiata|pomodoro|puttanesca|red sauce)\b/;
  if (/\b(?:dal|daal|dahl|dhal)\b/.test(title) ||
      (/indian/i.test(recipe.cuisine) && /\blentils?\b/.test(title) && /\b(?:lentils?|moong)\b/.test(names) &&
       /\b(?:curry powder|turmeric|garam masala)\b/.test(names) && !/\b(?:salad|patty|burger)\b/.test(title))) {
    return {family:'dal',format:'lentil stew'};
  }
  if (isPasta.test(title) || (redSauce.test(title) && isPasta.test(names)) ||
      (/italian/i.test(recipe.cuisine) && isPasta.test(names) && !/\b(?:soup|stew)\b/.test(title))) {
    const format='pasta';
    if (redSauce.test(title)) return {format,family:'red-sauce pasta'};
    if (/\bpesto\b/.test(title) || /\bbasil pesto\b/.test(names)) return {format,family:'pesto pasta'};
    if (!/\b(?:salad|salsa)\b/.test(title) && (
      /\b(?:tomato|tomatoes|ratatouille)\b/.test(title) ||
      /\b(?:crushed tomatoes|canned diced tomatoes|passata|tomato sauce)\b/.test(names)
    )) return {format,family:'red-sauce pasta'};
    if (/\b(?:alfredo|cream(?:y)?|mac and cheese)\b/.test(title)) return {format,family:'creamy pasta'};
    return {format};
  }
  const format = title.match(/\b(tacos?|burritos?|burgers?|salads?|curr(?:y|ies)|soups?|sandwich(?:es)?|noodles?|pizzas?|chilis?|stir[ -]fr(?:y|ies)|bowls?)\b/)?.[1];
  return {format:format?.replace(/ies$/,'y').replace(/ches$/,'ch').replace(/s$/,'')};
}

function primaryProtein(recipe) {
  const protein=String(recipe.protein ?? '').toLowerCase();
  if (protein!=='seafood') return /^(?:chicken|turkey|beef|pork|lamb|tofu|eggs|lentils|beans|chickpeas|paneer)$/.test(protein) ? protein : '';
  const fish = Object.keys(recipe.parts).map(id=>ingredients[id]?.name || '').join(' ').toLowerCase();
  return fish.match(/\b(?:salmon|tuna|cod|shrimp|tilapia|trout|sardines?)\b/)?.[0] || '';
}

function createVarietyContext(recent=[]) {
  const dishes = new Map(recipes.map(recipe=>[recipe.id,{...describeDish(recipe),protein:primaryProtein(recipe)}]));
  const history = recent.length && typeof recent[0]==='string' ? [{distance:1,recipeIds:recent}] : recent;
  const weeks = history.map(({distance,recipeIds})=>{
    const ids = new Set(recipeIds);
    const descriptors = [...ids].map(id=>dishes.get(id)).filter(Boolean);
    const proteins = new Map();
    for (const {protein} of descriptors) {
      if (protein) proteins.set(protein,(proteins.get(protein) || 0)+1);
    }
    return {distance,ids,proteins,families:new Set(descriptors.map(dish=>dish.family).filter(Boolean)),
      formats:new Set(descriptors.map(dish=>dish.format).filter(Boolean))};
  });
  const repeatCosts = new Map();
  for (const [id,{family,format,protein}] of dishes) {
    let cost=0;
    for (const week of weeks) {
      const adjacent=week.distance===1;
      if (week.ids.has(id)) cost+=adjacent?5000:2100;
      else if (family && week.families.has(family)) cost+=adjacent?4200:1500;
      else if (format && week.formats.has(format)) cost+=adjacent?550:190;
      const previousCount=week.proteins.get(protein) || 0;
      cost+=Math.min(3,Math.max(0,previousCount-1))*(adjacent?280:100);
    }
    repeatCosts.set(id,cost);
  }
  return {dishes,repeatCosts};
}

function dishRepeatPenalty(assignments, {dishes,repeatCosts}) {
  let cost=0;
  const families=new Map(), formats=new Map(), proteins=new Map();
  for (const {recipeId} of assignments) {
    const {family,format,protein}=dishes.get(recipeId) || {};
    cost+=repeatCosts.get(recipeId) || 0;
    if (family) {
      cost+=(families.get(family) || 0)*4200;
      families.set(family,(families.get(family) || 0)+1);
    }
    if (format) {
      cost+=(formats.get(format) || 0)*550;
      formats.set(format,(formats.get(format) || 0)+1);
    }
    if (protein) {
      const count=proteins.get(protein) || 0;
      if (count) cost+=350+Math.max(0,count-1)*1800;
      proteins.set(protein,count+1);
    }
  }
  return cost;
}

export function varietyPenalty(assignments,config={}) {
  const meals=assignments.filter(s=>s.type==='dinner').sort((a,b)=>a.day-b.day);
  let penalty=0;
  for(let i=0;i<meals.length;i++)for(let j=0;j<i;j++){
    const a=byId[meals[i].recipeId],b=byId[meals[j].recipeId];
    const adjacent=i===j+1;
    const ai=Object.keys(a.parts).filter(id=>!stapleIds.has(id)),bi=Object.keys(b.parts).filter(id=>!stapleIds.has(id));
    const overlap=ai.filter(id=>bi.includes(id)).length/Math.max(1,Math.min(ai.length,bi.length));
    const sharedFlavor=flavorIds.some(id=>a.parts[id]&&b.parts[id]);
    penalty+=(a.cuisine===b.cuisine?(adjacent?650:250):0)+(a.protein===b.protein?(adjacent?250:80):0);
    if(sharedFlavor)penalty+=adjacent?2200:1400;
    if(overlap>=.5)penalty+=adjacent?1800:900;
  }
  for(const slot of assignments)penalty+=Object.keys(byId[slot.recipeId].parts).filter(id=>config.lessPreferredIngredients?.includes(id)).length*3000;
  return penalty;
}
function userRecipeCredit(assignments, config) {
  const saved = assignments.filter(slot => isUserRecipe(byId[slot.recipeId]));
  if (!saved.length) return 0;

  const weeklyNeeds = new Map();
  for (const {recipeId,servings} of assignments) {
    const recipe = byId[recipeId];
    for (const [id,quantity] of Object.entries(recipe.parts)) {
      if (stapleIds.has(id) || !ingredients[id]?.risk) continue;
      weeklyNeeds.set(id, (weeklyNeeds.get(id) || 0) + quantity * servings / recipe.servings);
    }
  }

  let credit = 0;
  for (const {recipeId,servings} of saved) {
    const recipe = byId[recipeId];
    let reusedPacks = 0;
    for (const [id,quantity] of Object.entries(recipe.parts)) {
      if (!weeklyNeeds.has(id)) continue;
      const item = ingredients[id];
      const needed = quantity * servings / recipe.servings;
      const onHand = config.pantry[id] === 'enough' ? needed : (config.pantry[id] || 0);
      const usedElsewhere = Math.max(0, weeklyNeeds.get(id) - needed);
      reusedPacks += Math.min(needed, usedElsewhere + onHand) / item.pack * item.risk;
    }
    // Favor a saved meal outright, then give it extra credit for putting perishables to use.
    credit += 1900 + 750 * Math.min(1, reusedPacks);
  }
  return credit;
}

function score(assignments,basket,variety,config) {
  return basket.waste*.35 + basket.cents*.10 + varietyPenalty(assignments,config) +
    dishRepeatPenalty(assignments,variety) - userRecipeCredit(assignments,config);
}

export function generate(config, locked={}, recent=[]) {
  const slots = slotsFor(config);
  if (!slots.length) return {error:'Select at least one dinner or lunch day.'};
  if (config.theme && config.excluded.includes(config.theme)) return {error:'Your requested theme is also excluded.'};
  const pinned = Object.values(locked);
  const eligible = slots.map(slot => recipes.filter(item =>
    eligibility(item,slot,config) && (locked[slot.id] ? item.id === locked[slot.id] : !pinned.includes(item.id))
  ));
  if (eligible.some(list => !list.length)) return {error:'A meal slot has no eligible recipe. Check exclusions and locked meals.'};
  if (config.theme && !eligible.some(list => list.some(item => matchesTheme(item.id,config.theme)))) {
    return {error:'No eligible recipe matches that theme for these meal slots.'};
  }

  const variety=createVarietyContext(recent);
  function search(width) {
    let beam = [{assignments:[],rank:0,cents:0,key:''}];
    for (let index=0; index<slots.length; index++) {
      const next = [];
      for (const state of beam) {
        for (const item of eligible[index]) {
          if (state.assignments.some(value => value.recipeId === item.id)) continue;
          const assignments = [...state.assignments,{...slots[index],recipeId:item.id}];
          const themed = themeMet(assignments,config.theme);
          if (index === slots.length-1 && !themed) continue;
          const basket = grocery(assignments,config,false);
          next.push({assignments,basket,themed,cents:basket.cents,rank:score(assignments,basket,variety,config),
            key:state.key+':'+item.id});
        }
      }
      const byRank = next.sort((a,b) => a.rank-b.rank || a.key.localeCompare(b.key));
      const retained = new Set(byRank.filter(value => value.themed).slice(0,width));
      for (const value of byRank.filter(value => !value.themed).slice(0,width)) retained.add(value);
      const byCost = [...next].sort((a,b) => a.cents-b.cents || a.rank-b.rank || a.key.localeCompare(b.key));
      for (const value of byCost.slice(0,Math.ceil(width/3))) retained.add(value);
      beam = [...retained];
    }
    return beam;
  }

  const cap = Math.round(config.budget*100);
  let candidates = search(72);
  if (!candidates.some(item => item.cents <= cap)) candidates.push(...search(216));
  candidates.sort((a,b) => (a.cents > cap)-(b.cents > cap) ||
    (a.cents > cap ? a.cents-b.cents : a.rank-b.rank) || a.key.localeCompare(b.key));
  const distinct = new Set();
  const options = candidates.filter(item => {
    const key = item.assignments.map(slot => slot.type+':'+slot.recipeId).sort().join('|');
    if (distinct.has(key)) return false;
    distinct.add(key);
    return true;
  }).slice(0,3).map(item => ({...item,basket:grocery(item.assignments,config)}));
  return options.length ? {options} : {error:'Could not fill this week with distinct eligible meals. Try fewer slots or fewer exclusions.'};
}

export function swaps(assignments, id, config, recent=[]) {
  const slot = assignments.find(item => item.id === id);
  if (!slot) return [];
  const variety=createVarietyContext(recent);
  return recipes.filter(item => eligibility(item,slot,config) &&
    !assignments.some(other => other.recipeId === item.id)
  ).flatMap(item => {
    const next = assignments.map(other => other.id === id ? {...other,recipeId:item.id} : other);
    if (!themeMet(next,config.theme)) return [];
    const basket = grocery(next,config);
    return [{recipeId:item.id,assignments:next,basket,rank:score(next,basket,variety,config)}];
  }).sort((a,b) => (a.basket.cents > config.budget*100)-(b.basket.cents > config.budget*100) ||
    a.rank-b.rank || a.recipeId.localeCompare(b.recipeId));
}

export const isMeat = item => item?.unit==='g' && (item.aisle==='Meat & fish' || (!/stock|broth|sauce/i.test(item.name) && /\b(chicken|beef|turkey|pork|lamb|salmon|shrimp|fish|steak)\b/i.test(item.name)));
// Canonical storage stays in grams/milliliters; every editable surface converts both ways.
export const displayUnit = item => isMeat(item)?'lb':item.unit==='g'?'oz':item.unit==='mL'?'fl oz':item.unit;
const unitFactor = item => isMeat(item)?453.59237:item.unit==='g'?28.349523125:item.unit==='mL'?29.5735295625:1;
export const toDisplay = (value,item) => value/unitFactor(item);
export const fromDisplay = (value,item) => value*unitFactor(item);
export const ingredientAmount = (value,item) => item.unit==='g' && value>0 && value<5 ? amount(value,'g') : amount(toDisplay(value,item),displayUnit(item));

export const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const amount = (value,unit) => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value) +
  (unit === 'each' ? '' : ' '+unit);

export function weekKey(date = new Date()) {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - (monday.getDay()+6)%7);
  return dateKey(monday);
}
const dateKey = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
export function dateAt(week, offset) {
  const date = new Date(week+'T12:00:00');
  date.setDate(date.getDate()+offset);
  return date;
}
export const shiftWeek = (week,direction) => dateKey(dateAt(week,direction*7));
export const dateLabel = (week,offset,options) => dateAt(week,offset).toLocaleDateString('en-US',options);
