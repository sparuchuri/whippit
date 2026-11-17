import test from 'node:test';
import assert from 'node:assert/strict';
import { recipes, registerRecipe, byId } from './catalog.js';
import { defaults,grocery,generate } from './planner.js';
import { parseIngredient,pasteDraft,recipeMatches } from './recipe-tools.js';
import { extractRecipe,handleRecipeImport } from './recipe-link.js';

test('30 real source links make the collection searchable by vibe, ingredient, and format', () => {
  const sourced=recipes.filter(item=>item.source);
  assert.equal(sourced.length,30);
  assert.ok(sourced.every(item=>new URL(item.source.url).protocol==='https:'));
  assert.ok(sourced.filter(item=>item.source.video).length>=2);
  assert.ok(sourced.some(item=>recipeMatches(item,'spicy Korean tofu')));
  assert.ok(sourced.some(item=>recipeMatches(item,'quick lunch chickpea')));
  assert.ok(sourced.some(item=>recipeMatches(item,'cozy lentils')));
});

test('paste converts known measures while ambiguous weights are available for review', () => {
  const draft=pasteDraft('Lemon chicken bowl for 4\nIngredients: 350 g chicken breast, 1½ cups rice, 1 lemon\nSteps: Roast chicken with lemon. Serve with rice.');
  assert.equal(draft.servings,4);
  assert.equal(draft.name,'Lemon chicken bowl');
  assert.deepEqual(draft.items.map(line=>parseIngredient(line).quantity),[350,277.5,1]);
  assert.equal(draft.steps.length,1);
  assert.equal(parseIngredient('1 bag spinach').quantity,null);
  assert.equal(parseIngredient('2-3 cloves garlic').quantity,null);
  assert.equal(parseIngredient('1 (15-ounce) can chickpeas').quantity,240);
});

test('custom servings scale into whole packages and lunch-only recipes stay out of dinners', () => {
  const recipe={id:'test-lunch',name:'Herby rice',use:'lunch',cuisine:'Test recipe',styles:[],protein:'Other',
    servings:4,minutes:30,parts:{rice:100},steps:['Cook the rice.']};
  registerRecipe(recipe);
  assert.equal(byId[recipe.id].servings,4);
  const config={...defaults(),dinnerDays:[],lunchDays:[0,1],lunchPeople:2,theme:'Test recipe'};
  assert.equal(generate(config).options[0].assignments[0].recipeId,recipe.id);
  const basket=grocery([{recipeId:recipe.id,servings:6}],config);
  assert.equal(basket.lines[0].need,150);
  assert.equal(basket.lines[0].packs,1);
  assert.match(generate({...config,dinnerDays:[0],lunchDays:[]}).error,/No eligible/);
});

const sampleRecipe = {'@context':'https://schema.org','@graph':[{'@type':'Recipe',name:'Chicken &amp; broccoli',
  recipeYield:'4 plates',totalTime:'PT1H5M',recipeIngredient:['300 g chicken breast','1 lemon'],
  recipeInstructions:['Original published directions.']}]};
const sampleMarkup='<script type="application/ld+json">'+JSON.stringify(sampleRecipe)+'</script>';
const sampleUrl='https://www.budgetbytes.com/oven-fajitas/';
const makeRequest=url=>new Request('https://whippit.example/api/recipe-import',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})
});
test('link importer reads a recipe graph and credits the original directions', () => {
  const draft=extractRecipe(sampleMarkup,sampleUrl+'?tracking=1');
  assert.equal(draft.name,'Chicken & broccoli');
  assert.equal(draft.servings,4);
  assert.equal(draft.minutes,65);
  assert.deepEqual(draft.items,['300 g chicken breast','1 lemon']);
  assert.deepEqual(draft.steps,[]);
  assert.equal(draft.source.url,sampleUrl);
});

test('link import fences off arbitrary domains and redirects', async () => {
  const disallowed=await handleRecipeImport(makeRequest('https://www.budgetbytes.com.evil.example/recipe'), () => assert.fail());
  assert.equal(disallowed.status,422);
  let calls=0;
  const redirected=await handleRecipeImport(makeRequest(sampleUrl),() => {
    calls++;
    return new Response(null,{status:302,headers:{Location:'https://localhost/private'}});
  });
  assert.equal(redirected.status,422);
  assert.equal(calls,1);
  const result=await handleRecipeImport(makeRequest(sampleUrl),() => new Response(sampleMarkup,{headers:{'Content-Type':'text/html'}}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).source.label,'Budget Bytes');
});
