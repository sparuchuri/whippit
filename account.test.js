import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleAccountApi} from './account-api.js';
import {sqliteD1} from './sqlite-adapter.mjs';
const migration=readFileSync(new URL('drizzle/0000_accounts.sql',import.meta.url),'utf8');
const env=()=>{const DB=sqliteD1();DB.db.exec(migration);DB.db.exec(readFileSync(new URL('drizzle/0001_households.sql',import.meta.url),'utf8'));return {DB};};
function request(path,user='alice',changes){return new Request('https://whippit.test'+path,{method:changes?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@test.invalid'}:{}),origin:'https://whippit.test','content-type':'application/json'},body:changes?JSON.stringify({expectedUserId:user,changes}):undefined});}
const write=(environment,user,key,value,baseVersion=0)=>handleAccountApi(request('/api/sync',user,[{key,value,baseVersion}]),environment).then(r=>r.json());
test('account identity is required and stored records are isolated by authenticated user',async()=>{
 const e=env();assert.equal((await handleAccountApi(request('/api/state',null),e)).status,401);
 await write(e,'alice','favorite:lemon-chicken',true);
 const alice=await (await handleAccountApi(request('/api/state','alice'),e)).json();
 const bob=await (await handleAccountApi(request('/api/state','bob'),e)).json();
 assert.equal(alice.documents.length,1);assert.equal(bob.documents.length,0);
 const result=await write(e,'bob','favorite:lemon-chicken',false);assert.equal(result.accepted[0].value,false);
 assert.equal((await (await handleAccountApi(request('/api/state','alice'),e)).json()).documents[0].value,true);
});
test('stale edits are returned as conflicts without overwriting current account values',async()=>{
 const e=env();await write(e,'alice','favorite:chicken',true);
 let result=await write(e,'alice','favorite:chicken',false,1);assert.equal(result.accepted[0].version,2);
 result=await write(e,'alice','favorite:chicken',true,1);assert.equal(result.accepted.length,0);assert.equal(result.conflicts[0].value,false);assert.equal(result.conflicts[0].version,2);
 result=await write(e,'alice','favorite:chicken',true,2);assert.equal(result.accepted[0].version,3);
});
test('duplicate creation and retries preserve the winning version; independent documents merge',async()=>{
 const e=env();const first=await write(e,'alice','favorite:a',true);assert.equal(first.accepted[0].version,1);
 assert.equal((await write(e,'alice','favorite:a',false)).conflicts[0].value,true);
 await write(e,'alice','favorite:b',true);assert.equal((await (await handleAccountApi(request('/api/state'),e)).json()).documents.length,2);
});
test('cross-origin writes, invalid documents and oversized batches are rejected',async()=>{
 const e=env();const req=request('/api/sync','alice',[{key:'favorite:a',value:true,baseVersion:0}]);req.headers.set('origin','https://evil.test');
 assert.equal((await handleAccountApi(req,e)).status,403);
 assert.equal((await handleAccountApi(request('/api/sync','alice',[{key:'week:2026-11-16',value:{},baseVersion:0}]),e)).status,422);
 assert.equal((await handleAccountApi(request('/api/sync','alice',[{key:'user:bob',value:true,baseVersion:0}]),e)).status,422);
});

test('account mismatch or missing expectation rejects writes before accessing storage',async()=>{
 for(const expectedUserId of ['alice',undefined]){
  const e=env();const req=request('/api/sync','bob',[{key:'favorite:private-alice',value:true,baseVersion:0}]);
  const changed=new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({expectedUserId,changes:[{key:'favorite:private-alice',value:true,baseVersion:0}]})});
  const response=await handleAccountApi(changed,e);assert.equal(response.status,409);assert.equal((await response.json()).code,'ACCOUNT_CHANGED');
  assert.equal((await (await handleAccountApi(request('/api/state','bob'),e)).json()).documents.length,0);
 }
});

test('TikTok source drafts sync to only their owning account',async()=>{
 const e=env();
 const id='tiktok-7701102965385383199';
 const draft={id,name:'Greek lemon chicken',url:'https://www.tiktok.com/@creator/video/7701102965385383199',items:[],steps:[]};
 const result=await write(e,'alice','recipe-source:'+id,draft);
 assert.deepEqual(result.accepted[0].value,draft);
 const response=await handleAccountApi(request('/api/state','bob'),e);
 assert.deepEqual((await response.json()).documents,[]);
});

test('pantry profiles sync separately from weekly preferences and remain account scoped',async()=>{
 const e=env();
 const profile={items:['soy','cumin'],unmatched:['Dark soy sauce']};
 const result=await write(e,'alice','pantry:profile',profile);
 assert.deepEqual(result.accepted[0].value,profile);
 assert.deepEqual((await (await handleAccountApi(request('/api/state','bob'),e)).json()).documents,[]);
 const invalid=request('/api/sync','alice',[{key:'pantry:profile',value:{items:['soy'],unmatched:[42]},baseVersion:1}]);
 assert.equal((await handleAccountApi(invalid,e)).status,422);
});

test('attributed collection entries sync in the same account as older TikTok entries',async()=>{
 const e=env();
 const id='collection-0123456789abcdef0123456789abcdef';
 const draft={id,name:'Dal',url:'https://cooking.nytimes.com/recipes/7517-dal',items:[],steps:[],publisher:'NYT Cooking',author:'Recipe author'};
 const result=await write(e,'alice','recipe-source:'+id,draft);
 assert.deepEqual(result.accepted[0].value,draft);
 assert.deepEqual((await (await handleAccountApi(request('/api/state','bob'),e)).json()).documents,[]);
});

test('household invitations are email-bound and share plans and pantry only after acceptance',async()=>{
 const e=env();
 const info=who=>handleAccountApi(request('/api/household',who),e).then(r=>r.json());
 const read=(who,householdId)=>{
  const req=request('/api/state',who);
  if(householdId)req.headers.set('x-whippit-household',householdId);
  return handleAccountApi(req,e).then(r=>r.json());
 };
 const mutate=(who,action,details={})=>handleAccountApi(new Request('https://whippit.test/api/household',{
  method:'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@test.invalid',
   origin:'https://whippit.test','content-type':'application/json'},
  body:JSON.stringify({action,expectedUserId:who,...details}),
 }),e);
 await write(e,'alice','pantry:profile',{items:['oil'],unmatched:[]});
 await write(e,'bob','pantry:profile',{items:['soy'],unmatched:[]});
 await write(e,'alice','favorite:private',true);
 assert.equal((await mutate('alice','invite',{email:' BOB@test.invalid '})).status,200);
 const pending=(await info('bob')).invitations[0];
 assert.equal((await info('carol')).invitations.length,0);
 assert.deepEqual((await read('bob')).documents[0].value.items,['soy']);
 assert.equal((await mutate('carol','accept',{id:pending.id})).status,409);
 assert.equal((await mutate('bob','accept',{id:pending.id})).status,200);
 assert.equal((await read('bob')).code,'HOUSEHOLD_CHANGED');
 const shared=await read('bob',pending.id);
 assert.equal(shared.householdId,pending.id);
 assert.deepEqual(shared.documents.map(doc=>doc.key),['pantry:profile']);
 assert.deepEqual(shared.documents[0].value.items,['oil']);
 const stale=request('/api/sync','bob',[{key:'pantry:profile',value:{items:['oil','salt'],unmatched:[]},baseVersion:1}]);
 assert.equal((await handleAccountApi(stale,e)).status,409);
 const memberWrite=()=>new Request(stale.url,{method:'POST',headers:stale.headers,body:JSON.stringify({
   expectedUserId:'bob',expectedHouseholdId:pending.id,changes:[
    {key:'pantry:profile',value:{items:['oil','salt'],unmatched:[]},baseVersion:1},
    {key:'favorite:member',value:true,baseVersion:0},
   ],
 })});
 assert.equal((await handleAccountApi(memberWrite(),e)).status,200);
 const owner=await read('alice');
 assert.deepEqual(owner.documents.find(doc=>doc.key==='pantry:profile').value.items,['oil','salt']);
 assert.equal(owner.documents.some(doc=>doc.key==='favorite:member'),false);
 assert.equal((await mutate('alice','remove',{id:pending.id})).status,200);
 assert.equal((await handleAccountApi(memberWrite(),e)).status,409);
 assert.deepEqual((await read('bob')).documents.find(doc=>doc.key==='pantry:profile').value.items,['soy']);
});
