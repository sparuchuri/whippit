import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionCredit,collectionFormat,prepareCollection} from './recipe-collection.js';

test('mixed recipe collections keep publisher and author, review notes, and user origin',async()=>{
  const file={format:collectionFormat,source:'NYT Cooking',recipes:[
    {name:'Dal',url:'https://cooking.nytimes.com/recipes/7517-dal',author:'Recipe author',
      servings:4,servingsLabel:'4 to 6',items:['1 cup dry lentils'],steps:['Rinse the lentils.'],stepsStatus:'partial'},
    {name:'Rice',source:{label:'Family recipes',author:'Sam'},ingredients:['1 cup rice'],instructions:['Cook until tender.']},
  ]};
  const {sources}=await prepareCollection(file);
  assert.equal(collectionCredit(sources[0]),'NYT Cooking · Recipe author');
  assert.equal(sources[0].origin,'user');
  assert.equal(sources[0].servingsLabel,'4 to 6');
  assert.match(sources[0].stepsNote,/incomplete/);
  assert.equal(collectionCredit(sources[1]),'Family recipes · Sam');
  assert.deepEqual(sources[1].steps,['Cook until tender.']);
  assert.equal((await prepareCollection(file,sources)).duplicates,2);
});

test('legacy TikTok imports preserve video keys and skip existing saved links',async()=>{
  const file={format:'whippit-tiktok-v1',recipes:[
    {name:'Gnocchi',url:'https://www.tiktok.com/@somecook/video/7701102965385383199'},
  ]};
  const {sources}=await prepareCollection(file);
  assert.equal(sources[0].id,'tiktok-7701102965385383199');
  assert.equal(collectionCredit(sources[0]),'TikTok · @somecook');
  assert.equal((await prepareCollection(file,[],[{source:{url:file.recipes[0].url+'?utm_source=copy'}}])).duplicates,1);
});

test('source links deduplicate across tracking parameters and reject non-HTTPS links',async()=>{
  const file={format:collectionFormat,recipes:[
    {name:'Soup',url:'https://example.com/soup?utm_source=chat'},
    {name:'Soup',url:'https://example.com/soup/'},
  ]};
  assert.equal((await prepareCollection(file)).duplicates,1);
  file.recipes.push({name:'Bad link',url:'javascript:alert(1)'});
  await assert.rejects(prepareCollection(file),/Recipe 3: use a valid HTTPS/);
});
