import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePantryList,withPantryProfile} from './pantry-profile.js';
import {defaults,grocery} from './planner.js';

test('pasted sentences and photo-derived lists match pantry aliases without guessing at distinct sauces',()=>{
  assert.deepEqual(parsePantryList('I have soy sauce, olive oil, cumin and black pepper'),{
    items:['soy','oil','cumin','blackPepper'],unmatched:[],
  });
  assert.deepEqual(parsePantryList('Sauces:\r\n- Kikkoman soy sauce\r\n- Dark soy sauce\r\n- 2 cans of chickpeas; soy sauce'),{
    items:['soy','chickpea'],unmatched:['Dark soy sauce'],
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
