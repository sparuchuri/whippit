import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {handleAccountApi} from './account-api.js';
import {sqliteD1} from './sqlite-adapter.mjs';
const source=readFileSync(new URL('storage.js',import.meta.url),'utf8').replace(/export /g,'')+'\npublicApi={initializeStorage,writeWeeks,readWeeks,writeLibrary,readLibrary,writePreferences,readPreferences,syncNow,syncStatus,conflictDetails,resolveConflict};';
const database=()=>{const DB=sqliteD1();DB.db.exec(readFileSync(new URL('drizzle/0000_accounts.sql',import.meta.url),'utf8'));return{DB};};
function client(db,user,cache=new Map()){
 const navigator={onLine:true};const identity={user,beforeSync:null};const context={publicApi:null,structuredClone,AbortSignal,URL,console,navigator,confirm:()=>true,
 localStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},
 document:{visibilityState:'visible',addEventListener(){}},window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){},setInterval(){},
 fetch:async(path,options={})=>{if(!navigator.onLine)throw new Error('offline');if(path==='/api/sync')identity.beforeSync?.();return handleAccountApi(new Request('https://whippit.test'+path,{...options,headers:{...options.headers,origin:'https://whippit.test','oai-authenticated-user-id':identity.user,'oai-authenticated-user-email':identity.user+'@test.invalid'}}),db);}};
 vm.runInNewContext(source,context);return{...context.publicApi,navigator,cache,identity};
}
test('offline favorites survive reload, sync on reconnect and appear on a second client',async()=>{
 const db=database(),a=client(db,'alice');await a.initializeStorage();a.navigator.onLine=false;
 a.writeLibrary({custom:[],favorites:['lemon-chicken']});await a.syncNow();assert.equal(a.syncStatus().phase,'offline');
 const reload=client(db,'alice',a.cache);reload.navigator.onLine=false;await reload.initializeStorage();assert.deepEqual([...reload.readLibrary().favorites],['lemon-chicken']);
 reload.navigator.onLine=true;await reload.syncNow();assert.equal(reload.syncStatus().pending,0);
 const b=client(db,'alice');await b.initializeStorage();assert.deepEqual([...b.readLibrary().favorites],['lemon-chicken']);
});
test('independent edits merge; same-document changes require an explicit conflict choice',async()=>{
 const db=database(),a=client(db,'alice'),b=client(db,'alice');await a.initializeStorage();await b.initializeStorage();
 a.writeLibrary({custom:[],favorites:['a']});b.writeLibrary({custom:[],favorites:['b']});await a.syncNow();await b.syncNow();await a.syncNow();
 assert.deepEqual([...a.readLibrary().favorites].sort(),['a','b']);
 const config={dinnerDays:[0],lunchDays:[],dinnerPeople:2,budget:70};a.writePreferences(config);await a.syncNow();await b.syncNow();
 a.writePreferences({...config,budget:80});b.writePreferences({...config,budget:90});await a.syncNow();await b.syncNow();
 assert.equal(b.syncStatus().phase,'conflict');assert.equal(b.conflictDetails()[0].remote.value.budget,80);
 b.resolveConflict('preferences:default','local');await b.syncNow();await a.syncNow();assert.equal(a.readPreferences().budget,90);
});
test('account switches never reuse another account pending edits or favorites',async()=>{
 const db=database(),a=client(db,'alice');await a.initializeStorage();a.navigator.onLine=false;a.writeLibrary({custom:[],favorites:['private-alice']});
 const b=client(db,'bob',a.cache);await b.initializeStorage();assert.equal(b.readLibrary().favorites.length,0);assert.equal(b.syncStatus().pending,0);
 const restored=client(db,'alice',a.cache);await restored.initializeStorage();assert.deepEqual([...restored.readLibrary().favorites],['private-alice']);
});

test('account switch between pull and push preserves old edits and never writes to new account',async()=>{
 const db=database(),a=client(db,'alice');await a.initializeStorage();
 a.writeLibrary({custom:[],favorites:['private-alice']});a.identity.beforeSync=()=>{a.identity.user='bob';};
 await a.syncNow();assert.equal(a.syncStatus().phase,'account-changed');assert.equal(a.syncStatus().pending,1);
 const b=client(db,'bob');await b.initializeStorage();assert.equal(b.readLibrary().favorites.length,0);
 await a.syncNow();assert.equal(a.syncStatus().phase,'account-changed');
 const restored=client(db,'alice',a.cache);await restored.initializeStorage();assert.deepEqual([...restored.readLibrary().favorites],['private-alice']);assert.equal(restored.syncStatus().pending,0);
});
