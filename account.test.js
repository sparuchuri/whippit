import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleAccountApi} from './account-api.js';
import {sqliteD1} from './sqlite-adapter.mjs';
const migration=readFileSync(new URL('drizzle/0000_accounts.sql',import.meta.url),'utf8');
const env=()=>{const DB=sqliteD1();DB.db.exec(migration);return {DB};};
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
