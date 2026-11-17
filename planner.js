import { ingredients, recipes, byId, tags } from './catalog.js';

export const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const defaults = () => ({
  dinnerDays:[0,1,2,3,4], dinnerPeople:2, guests:{}, lunchDays:[], lunchPeople:2, splitLunch:true,
  budget:70, theme:'', excluded:[], excludedIngredients:[], pantry:{}, prices:{},
});

export function slotsFor(config) {
  const slots = config.dinnerDays.map(day => ({
    id:'d'+day, day, type:'dinner', servings:config.guests[day] || config.dinnerPeople, days:[day]
  }));
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
  const needs = {};
  for (const {recipeId,servings} of assignments) {
    const recipe = byId[recipeId];
    for (const [id,quantity] of Object.entries(recipe.parts)) {
      needs[id] = (needs[id] || 0) + quantity * servings / recipe.servings;
    }
  }
  const lines = [];
  let cents = 0, waste = 0;
  for (const id of new Set([...Object.keys(needs),...Object.keys(config.pantry)])) {
    const item = ingredients[id];
    if (!item) continue;
    const need = needs[id] || 0;
    const onHand = config.pantry[id] === 'enough' ? need : (config.pantry[id] || 0);
    const net = Math.max(0,need-onHand);
    const price = config.prices[id] ?? item.cents;
    const packs = Math.max(0, Math.ceil(net/item.pack - 1e-10));
    const remaining = Math.max(0,packs*item.pack-net) + Math.max(0,onHand-need);
    const cost = packs*price;
    cents += cost;
    waste += remaining/item.pack*price*item.risk;
    if (details && (need || remaining)) lines.push({
      ...item,unpriced:item.unpriced && config.prices[id]==null,need,packs,cost,remaining,usedPantry:Math.min(onHand,need),
      signature:[id,item.pack,packs].join(':')
    });
  }
  lines.sort((a,b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  return {lines,cents,waste};
}

const matchesTheme = (id, theme) => tags(byId[id]).includes(theme);
const themeMet = (assignments, theme) => !theme || assignments.some(slot => matchesTheme(slot.recipeId,theme));

function score(assignments,basket,previous) {
  const dinners = assignments.filter(item => item.type === 'dinner');
  const repeatedProtein = dinners.filter((item,index) =>
    index > 0 && byId[item.recipeId].protein === byId[dinners[index-1].recipeId].protein
  ).length;
  return basket.waste + basket.cents*.10 + repeatedProtein*75 +
    assignments.filter(item => previous.includes(item.recipeId)).length*50;
}

export function generate(config, locked={}, previous=[]) {
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
          next.push({assignments,basket,themed,cents:basket.cents,rank:score(assignments,basket,previous),
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

export function swaps(assignments, id, config) {
  const slot = assignments.find(item => item.id === id);
  if (!slot) return [];
  return recipes.filter(item => eligibility(item,slot,config) &&
    !assignments.some(other => other.recipeId === item.id)
  ).flatMap(item => {
    const next = assignments.map(other => other.id === id ? {...other,recipeId:item.id} : other);
    if (!themeMet(next,config.theme)) return [];
    const basket = grocery(next,config);
    return [{recipeId:item.id,assignments:next,basket,rank:score(next,basket,[])}];
  }).sort((a,b) => (a.basket.cents > config.budget*100)-(b.basket.cents > config.budget*100) ||
    a.rank-b.rank || a.recipeId.localeCompare(b.recipeId));
}

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
