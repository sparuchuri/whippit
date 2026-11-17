import test from 'node:test';
import assert from 'node:assert/strict';
import { byId, ingredients, recipes, tags } from './catalog.js';
import { defaults, slotsFor, grocery, generate, swaps, weekKey, shiftWeek, isMeat, toDisplay, fromDisplay, displayUnit, ingredientAmount } from './planner.js';

test('lunches use one scaled batch per prep session and can stand alone', () => {
  const config = {...defaults(),dinnerDays:[],lunchDays:[4,0,2,1,3],lunchPeople:2};
  const slots = slotsFor(config);
  assert.deepEqual(slots.map(({servings,days,prepDay}) => ({servings,days,prepDay})),[
    {servings:6,days:[0,1,2],prepDay:-1},{servings:4,days:[3,4],prepDay:2}
  ]);
  assert.equal(slotsFor({...config,splitLunch:false})[0].servings,10);
  assert.equal(generate(config).options[0].assignments.length,2);
});

test('groceries combine dinner and lunch yield, subtract pantry once and buy packs', () => {
  const config = {...defaults(),pantry:{spinach:39,rice:'enough'},prices:{spinach:301}};
  const selections = [{recipeId:'lemon-chicken',servings:2},{recipeId:'spinach-curry',servings:6}];
  const basket = grocery(selections,config);
  const spinach = basket.lines.find(item => item.id === 'spinach');
  assert.equal(spinach.need,295);
  assert.equal(spinach.packs,2);
  assert.equal(spinach.remaining,28);
  assert.equal(spinach.cost,602);
  assert.equal(basket.lines.find(item => item.id === 'rice').packs,0);
  assert.equal(basket.cents,basket.lines.reduce((total,item) => total+item.cost,0));
});

test('theme, exclusions, lock and guest servings survive generation and swaps', () => {
  const config = {...defaults(),excluded:['Seafood'],excludedIngredients:['mushroom'],
    dinnerDays:[0,1,2],guests:{0:4},lunchDays:[0,1,2],theme:'Indian-inspired'};
  const {options} = generate(config,{d0:'lemon-chicken'});
  const plan = options[0].assignments;
  const first = plan.find(item => item.id === 'd0');
  assert.equal(first.recipeId,'lemon-chicken');
  assert.equal(first.servings,4);
  assert.ok(plan.some(item => tags(byId[item.recipeId]).includes(config.theme)));
  assert.ok(plan.every(item => !tags(byId[item.recipeId]).includes('Seafood') && !byId[item.recipeId].parts.mushroom));
  for (const option of swaps(plan,'d1',config)) {
    assert.ok(option.assignments.some(item => tags(byId[item.recipeId]).includes(config.theme)));
    assert.equal(option.assignments.find(item => item.id === 'd0').recipeId,'lemon-chicken');
  }
  assert.match(generate({...config,excluded:[config.theme]}).error,/also excluded/);
});

test('over-budget results and empty plans are explicit', () => {
  const config = {...defaults(),budget:1,dinnerDays:[0]};
  assert.ok(generate(config).options[0].basket.cents > 100);
  assert.match(generate({...config,dinnerDays:[]}).error,/at least one/);
});

test('catalog includes priced packages and nonempty recipes', () => {
  for (const item of recipes) {
    assert.ok(item.steps.length >= 2);
    for (const id of Object.keys(item.parts)) assert.ok(ingredients[id].pack && Number.isInteger(ingredients[id].cents));
  }
});

test('calendar keys remain local across Sundays and year boundaries', () => {
  assert.equal(weekKey(new Date(2026,10,22,23,55)),'2026-11-16');
  assert.equal(shiftWeek('2026-12-28',1),'2027-01-04');
});


test('three dinners prioritize variety rather than three coconut cooks',()=>{
 const config={...defaults(),dinnerDays:[2,3,4],dinnerPeople:1};
 for(const plan of generate(config).options){
  assert.ok(plan.assignments.filter(s=>byId[s.recipeId].parts.coconut).length<=1);
  assert.ok(new Set(plan.assignments.map(s=>byId[s.recipeId].cuisine)).size>=2);
 }
});
test('dinner leftovers combine guest portions and groceries once, preserving swaps',()=>{
 const config={...defaults(),dinnerDays:[0,1,2,3,4],dinnerLeftovers:true,guests:{0:3,1:1}};
 const slots=slotsFor(config);
 assert.equal(slots.length,3);assert.deepEqual(slots[0].days,[0,1]);assert.equal(slots[0].servings,4);
 const plan=generate(config).options[0].assignments;
 const expanded=plan.flatMap(s=>s.days.map(day=>({...s,day,servings:s.portions[day]})));
 assert.deepEqual(grocery(plan,config),grocery(expanded,config));
 for(const swap of swaps(plan,'d0',config)){assert.deepEqual(swap.assignments[0].days,[0,1]);assert.equal(swap.assignments[0].servings,4);}
 assert.equal(slotsFor({...config,dinnerDays:[0,4]}).length,2);
});
test('less preferred ingredients discourage but do not ban locked recipes',()=>{
 const config={...defaults(),dinnerDays:[0,1,2],lessPreferredIngredients:['coconut']};
 assert.ok(generate(config).options[0].assignments.every(s=>!byId[s.recipeId].parts.coconut));
 assert.equal(generate(config,{d0:'spinach-curry'}).options[0].assignments[0].recipeId,'spinach-curry');
});
test('meat pounds convert without changing stored recipe or grocery math',()=>{
 assert.equal(toDisplay(453.59237,ingredients.chicken),1);
 assert.equal(fromDisplay(1,ingredients.chicken),453.59237);
 assert.equal(isMeat({name:'Chicken stock powder',unit:'g',aisle:'Pantry'}),false);
 assert.equal(toDisplay(28.349523125,ingredients.spinach),1);
 assert.equal(toDisplay(29.5735295625,ingredients.coconut),1);
 assert.equal(displayUnit(ingredients.coconut),'fl oz');
 assert.equal(fromDisplay(1,ingredients.coconut),29.5735295625);
 assert.equal(ingredientAmount(2,ingredients.salt),'2 g');
 assert.equal(ingredientAmount(28.349523125,ingredients.spinach),'1 oz');
 assert.equal(defaults().shoppingZip,'94080');
});

test('user recipes can beat cheaper suggestions while preserving budget and exclusions', async () => {
  const {registerRecipe} = await import('./catalog.js');
  const original = byId['lemon-chicken'];
  const custom = {...original,id:'recipe_user_priority_test',origin:'user',custom:true,
    parts:{...original.parts,coconut:400},
    source:{kind:'link',label:'Creator',url:'https://example.test/recipe'}};
  registerRecipe(custom);
  try {
    const prices = Object.fromEntries(Object.keys(ingredients).map(id=>[id,0]));
    const config = {...defaults(),dinnerDays:[0,1],budget:120,prices:{...prices,coconut:11000}};
    const suggestions = swaps([{id:'d0',day:0,type:'dinner',servings:2,recipeId:'bean-tacos'}],'d0',config);
    assert.ok(suggestions.findIndex(option=>option.recipeId===custom.id) <
      suggestions.findIndex(option=>option.recipeId===original.id));
    const generated = generate(config).options[0].assignments;
    assert.ok(generated.some(slot=>slot.recipeId===custom.id));
    const excluded = generate({...config,excludedIngredients:['chicken']}).options[0].assignments;
    assert.ok(excluded.every(slot=>slot.recipeId!==custom.id));
    const tooExpensive = generate({...config,budget:1}).options[0].assignments;
    assert.ok(tooExpensive.every(slot=>slot.recipeId!==custom.id));
  } finally {
    recipes.splice(recipes.indexOf(custom),1);
    delete byId[custom.id];
  }
});

test('a saved recipe that shares perishables with the week gets extra swap priority', async () => {
  const {registerRecipe} = await import('./catalog.js');
  const template = {...byId['lemon-chicken'],origin:'user',parts:{orzo:100,egg:2}};
  const saves = [
    {...template,id:'recipe_a_test_lemon',parts:{...template.parts,lemon:1}},
    {...template,id:'recipe_z_test_lime',parts:{...template.parts,lime:1}},
  ];
  saves.forEach(recipe=>registerRecipe(recipe));
  try {
    // Equalize cost and waste so the shared lime drives the ranking.
    const prices = Object.fromEntries(Object.keys(ingredients).map(id=>[id,0]));
    const config = {...defaults(),dinnerDays:[0,1],prices};
    const choices = swaps([
      {id:'d0',day:0,type:'dinner',servings:2,recipeId:'bean-tacos'},
      {id:'d1',day:1,type:'dinner',servings:2,recipeId:'lemon-chicken'},
    ],'d1',config);
    const [lemon,lime] = saves.map(recipe=>choices.find(option=>option.recipeId===recipe.id));
    assert.ok(lime.rank < lemon.rank);
  } finally {
    for (const recipe of saves) {
      recipes.splice(recipes.indexOf(recipe),1);
      delete byId[recipe.id];
    }
  }
});

test('rotate red-sauce pasta and dal by dish, including similarly named imports',async()=>{
  const {registerRecipe} = await import('./catalog.js');
  const saved=[
    {...byId['tomato-chickpea'],id:'recipe_test_weeknight_bolognese',name:'Creamy Weeknight Bolognese',origin:'user'},
    {...byId['sw-moong'],id:'recipe_test_spiced_lentils',name:'Spiced Lentils',origin:'user'},
  ];
  saved.forEach(recipe=>registerRecipe(recipe));
  try {
    const config={...defaults(),dinnerDays:[0,1],budget:100};
    const ids=plan=>plan.options[0].assignments.map(slot=>slot.recipeId);
    assert.ok(ids(generate(config)).some(id=>saved.some(recipe=>recipe.id===id)));
    const anchors=['turkey-pasta','bb-coconut-lentils'];
    const recent=[{distance:1,recipeIds:anchors}];
    assert.ok(ids(generate(config,{},recent)).every(id=>!saved.some(recipe=>recipe.id===id) && !anchors.includes(id)));
    assert.deepEqual(ids(generate(config,{d0:anchors[0],d1:anchors[1]},recent)),anchors);
    const extended={...config,dinnerDays:[0,1,2,3]};
    assert.ok(ids(generate(extended,{d0:anchors[0],d1:anchors[1]})).every(id=>!saved.some(recipe=>recipe.id===id)));
    const choices=history=>swaps([{id:'d0',day:0,type:'dinner',servings:2,recipeId:'bean-tacos'}],'d0',config,history);
    const rank=(options,id)=>options.find(option=>option.recipeId===id).rank;
    const sameWeek=choices([]);
    const afterPasta=choices([{distance:1,recipeIds:[anchors[0]]}]);
    assert.ok(rank(afterPasta,saved[0].id)-rank(sameWeek,saved[0].id) >
      rank(afterPasta,'broccoli-pasta')-rank(sameWeek,'broccoli-pasta'));
    const twoWeeks=choices([{distance:2,recipeIds:[anchors[0]]}]);
    assert.ok(rank(afterPasta,saved[0].id)>rank(twoWeeks,saved[0].id));
  } finally {
    for (const recipe of saved) {
      recipes.splice(recipes.indexOf(recipe),1);
      delete byId[recipe.id];
    }
  }
});
