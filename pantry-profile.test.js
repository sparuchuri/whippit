import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePantryList,withPantryProfile} from './pantry-profile.js';
import {ingredients} from './catalog.js';
import {parseIngredient} from './recipe-tools.js';
import {defaults,grocery} from './planner.js';

test('pasted sentences and photo-derived lists match pantry aliases without guessing at distinct sauces',()=>{
  assert.deepEqual(parsePantryList('I have soy sauce, olive oil, cumin and black pepper'),{
    items:['soy','oil','cumin','blackPepper'],unmatched:[],
  });
  assert.deepEqual(parsePantryList('Sauces:\r\n- Kikkoman soy sauce\r\n- Dark soy sauce\r\n- black vinegar\r\n- 2 cans of chickpeas; soy sauce'),{
    items:['soy','darkSoy','chickpea'],unmatched:['black vinegar'],
  });
});

test('profile pantry changes package purchases while a weekly amount takes precedence',()=>{
  const plan=[{recipeId:'spinach-curry',servings:2}];
  const profile={items:['coconut','curry','spinach','missing'],unmatched:[]};
  const config=defaults();
  const initial=grocery(plan,withPantryProfile(config,profile));
  assert.equal(initial.lines.find(item=>item.id==='coconut').packs,0);
  assert.equal(initial.lines.find(item=>item.id==='spinach').packs,1);
  assert.deepEqual(config.pantry,{});
  const withWeeklyStock=withPantryProfile({...config,pantry:{coconut:1}},profile);
  assert.equal(grocery(plan,withWeeklyStock).lines.find(item=>item.id==='coconut').packs,1);
});


test('expanded staples match recipe imports and equivalent older custom grocery items',()=>{
  assert.equal(parseIngredient('1 tbsp Chinese cooking wine').id,'shaoxing');
  assert.equal(parseIngredient('1 tsp ground white pepper').quantity,2.4);
  assert.equal(parseIngredient('1 cup plain flour').id,'flour');
  const id='custom_test_dark_soy';
  ingredients[id]={id,name:'Dark soy sauce',aisle:'Other groceries',unit:'mL',pack:500,cents:449,risk:0};
  try {
    const profile={items:['darkSoy'],unmatched:[]};
    assert.equal(withPantryProfile(defaults(),profile).pantry[id],'enough');
    assert.equal(withPantryProfile(defaults(),profile).pantry.soy,undefined);
  } finally {
    delete ingredients[id];
  }
});
