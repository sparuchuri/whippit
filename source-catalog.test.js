import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRecipes} from './source-catalog.js';
import {curatedRecipes} from './curated.js';
import {suggestIngredient} from './recipe-tools.js';
test('verified catalog meets the 500-recipe quality target without duplicate source links',()=>{
 assert.ok(sourceRecipes.length>=500);
 const canonical=url=>new URL(url).hostname.replace(/^www\./,'')+new URL(url).pathname.replace(/\/$/,'');
 const ids=new Set(),urls=new Set(),existing=new Set(curatedRecipes.map(r=>canonical(r.source.url)));
 for(const r of sourceRecipes){
  assert.ok(r.rating>=4.5&&r.rating<=5&&r.ratingCount>=25,r.name);assert.ok(r.items.length>1,r.name);
  assert.ok(r.source.accessedAt&&r.originalYield&&r.servings>0,r.name);
  assert.equal(r.steps.length,0,'Publisher directions must stay at the source');
  const url=canonical(r.source.url);assert.ok(!urls.has(url),url);assert.ok(!existing.has(url),url);assert.ok(!ids.has(r.id),r.id);ids.add(r.id);urls.add(url);
  if(/\d\s*(?:to|–|-)\s*\d/.test(r.originalYield))assert.equal(r.yieldRequiresReview,true,r.name);
 }
});
test('new ingredient suggestions preserve explicit measures and leave ambiguous ranges for review',()=>{
 assert.equal(suggestIngredient('500 g zucchini').quantity,500);
 assert.equal(suggestIngredient('500 g zucchini').unit,'g');
 assert.equal(suggestIngredient('1 - 2 lemons').quantity,null);
 assert.equal(suggestIngredient('salt to taste').quantity,null);
 assert.equal(suggestIngredient('2 tablespoons olive oil').id,'oil');
});

test('requested publishers are represented with transparent secondary provenance',()=>{
 for(const publisher of ['Serious Eats','NYT Cooking'])assert.ok(sourceRecipes.filter(r=>r.publisher===publisher).length>=2);
 for(const r of sourceRecipes.filter(r=>r.secondaryMetadata)){assert.ok(r.ratingEvidenceUrl);assert.equal(r.yieldRequiresReview,true);assert.ok(r.metadataSource.includes('secondary'));}
});
