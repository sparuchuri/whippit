const prefix='whippit:account:v2:';
const legacyWeeks='whippit:weeks:v1',legacyLibrary='whippit:recipe-library:v1';
const empty=()=>({documents:{},pending:{},conflicts:{}});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let state=empty(),user=null,accountId='guest',busy=false,timer,phase='connecting',message='',storageOk=true,accountChanged=false;
const listeners=new Set();
function emit(remote=false){for(const fn of listeners)fn({...syncStatus(),remote});}
function save(){try{localStorage.setItem(prefix+accountId,JSON.stringify(state));storageOk=true;return true;}catch{storageOk=false;message='Device storage is full. Keep this page open until sync completes.';emit();return false;}}
const value=key=>state.documents[key]?.value??null;
function setValue(key,next){
  if(same(value(key),next))return storageOk;
  const old=state.documents[key] || {key,version:0,value:null};
  state.documents[key]={...old,value:next};
  state.pending[key]={key,baseVersion:state.pending[key]?.baseVersion??old.version,value:next};
  const ok=save();phase=accountChanged?'account-changed':user?'pending':'local';emit();schedule();return ok;
}
function schedule(){clearTimeout(timer);if(user&&!accountChanged)timer=setTimeout(()=>syncNow(),700);}
export function subscribeSync(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function syncStatus(){return {user,phase,message,pending:Object.keys(state.pending).length,conflicts:Object.keys(state.conflicts).length,storageOk};}
export function readWeeks(){return Object.fromEntries(Object.entries(state.documents).filter(([key,doc])=>key.startsWith('week:')&&doc.value).map(([key,doc])=>[key.slice(5),doc.value]));}
export function writeWeeks(weeks){let ok=true;for(const [key,plan]of Object.entries(weeks))ok=setValue('week:'+key,plan)&&ok;return ok;}
export function readLibrary(){return {custom:Object.entries(state.documents).filter(([key,doc])=>key.startsWith('recipe:')&&doc.value).map(([,doc])=>doc.value),favorites:Object.entries(state.documents).filter(([key,doc])=>key.startsWith('favorite:')&&doc.value===true).map(([key])=>key.slice(9))};}
export function writeLibrary(data){let ok=true;for(const pack of data.custom)ok=setValue('recipe:'+pack.recipe.id,pack)&&ok;
 const favorites=new Set(data.favorites);for(const id of new Set([...readLibrary().favorites,...favorites]))ok=setValue('favorite:'+id,favorites.has(id))&&ok;return ok;}
export function readRecipeSources(){
 return Object.entries(state.documents).filter(([key,doc])=>key.startsWith('recipe-source:')&&doc.value).map(([,doc])=>doc.value);
}
export function writeRecipeSources(sources){
 let ok=true;
 for(const source of sources)ok=setValue('recipe-source:'+source.id,source)&&ok;
 return ok;
}
export const readPreferences=()=>value('preferences:default');
export const writePreferences=config=>setValue('preferences:default',config);
export function legacySummary(){
 if(load('whippit:migrated:'+accountId,false))return null;
 const weeks=load(legacyWeeks,{}),library=load(legacyLibrary,{});
 const summary={weeks:Object.keys(weeks).length,recipes:library.custom?.length || 0,favorites:library.favorites?.length || 0};
 return summary.weeks+summary.recipes+summary.favorites?summary:null;
}
export function importDeviceData(){
 const weeks=load(legacyWeeks,{}),library=load(legacyLibrary,{custom:[],favorites:[]});
 for(const [key,plan]of Object.entries(weeks)){
   const id='week:'+key;
   if(value(id)&&!same(value(id),plan)){state.conflicts[id]={local:plan,remote:state.documents[id],migration:true};continue;}
   setValue(id,plan);
 }
 const existing=readLibrary();writeLibrary({custom:[...existing.custom,...(library.custom || []).filter(pack=>!existing.custom.some(p=>p.recipe.id===pack.recipe.id))],favorites:[...new Set([...existing.favorites,...(library.favorites || [])])]});
 try{localStorage.setItem('whippit:migrated:'+accountId,'true');}catch{}
 save();emit(true);schedule();
}
export function conflictDetails(){return Object.entries(state.conflicts).map(([key,c])=>({key,...c}));}
export function resolveConflict(key,choice){
 const conflict=state.conflicts[key];if(!conflict)return;
 const local=conflict.local,remote=conflict.remote;
 state.documents[key]=remote;delete state.pending[key];delete state.conflicts[key];
 if(choice==='local')setValue(key,local);save();emit(true);schedule();
}
export function prepareSignOut(){
 if(Object.keys(state.pending).length&&!confirm('Some changes have not synced yet. They will stay on this device for this account. Sign out?'))return false;
 try{localStorage.removeItem('whippit:last-account');}catch{}
 return true;
}
async function api(path,options={}){
 const response=await fetch(path,{...options,cache:'no-store',signal:AbortSignal.timeout(10000)});
 const data=await response.json();if(!response.ok){const error=new Error(data.error || 'Sync is unavailable.');error.status=response.status;error.code=data.code;throw error;}return data;
}
function acceptRemote(doc){
 const pending=state.pending[doc.key];
 if(!pending){state.documents[doc.key]=doc;return;}
 if(same(pending.value,doc.value)){state.documents[doc.key]=doc;delete state.pending[doc.key];delete state.conflicts[doc.key];return;}
 if(doc.version!==pending.baseVersion)state.conflicts[doc.key]={local:pending.value,remote:doc};
}
export async function syncNow(){
 if(!user||busy||accountChanged)return;
 busy=true;phase='syncing';message='';emit();
 try{
   // Pull first so independent documents from other devices are visible before writing.
   const remote=await api('/api/state');
   if(remote.userId!==user.id){const error=new Error('Account changed');error.code='ACCOUNT_CHANGED';throw error;}
   remote.documents.forEach(acceptRemote);save();emit(true);
   for(let batch=0;batch<25;batch++){
     const changes=Object.values(state.pending).filter(c=>!state.conflicts[c.key]).slice(0,25).map(c=>structuredClone(c));
     if(!changes.length)break;
     const result=await api('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUserId:user.id,changes})});
     if(result.userId!==user.id){const error=new Error('Account changed');error.code='ACCOUNT_CHANGED';throw error;}
     for(const doc of result.accepted){
       const sent=changes.find(c=>c.key===doc.key),pending=state.pending[doc.key];
       if(pending&& !same(pending.value,sent.value)){
         state.documents[doc.key]={...doc,value:pending.value};pending.baseVersion=doc.version;
       }else{state.documents[doc.key]=doc;delete state.pending[doc.key];}
       delete state.conflicts[doc.key];
     }
     for(const doc of result.conflicts){state.conflicts[doc.key]={local:state.pending[doc.key]?.value,remote:doc};}
     save();
   }
   phase=Object.keys(state.conflicts).length?'conflict':Object.keys(state.pending).length?'pending':'synced';
 }catch(error){if(error.code==='ACCOUNT_CHANGED'){accountChanged=true;clearTimeout(timer);phase='account-changed';message='Your account changed. Reload to continue. Unsynced changes are kept for the original account.';}else{phase=error.status===401?'signed-out':'offline';message=error.status===401?'Sign in again to continue syncing.':navigator.onLine?'Could not reach account sync. Changes are kept on this device.':'You’re offline. Changes will sync when you reconnect.';}}
 finally{busy=false;save();emit(true);if(phase==='pending')schedule();}
}
export async function initializeStorage(){
 try{
   const session=await api('/api/session');user=session.user;
   accountId=user?.id || 'guest';
   state=load(prefix+accountId,empty());
   if(!state.documents||!state.pending||!state.conflicts)state=empty();
   if(user){localStorage.setItem('whippit:last-account',JSON.stringify(user));phase='syncing';await syncNow();}
   else{localStorage.removeItem('whippit:last-account');phase='local';}
 }catch{
   user=load('whippit:last-account',null);accountId=user?.id || 'guest';state=load(prefix+accountId,empty());
   if(!state.documents||!state.pending||!state.conflicts)state=empty();phase='offline';message='You’re viewing the copy saved on this device.';
 }
 if(!user&& !Object.keys(state.documents).length && legacySummary())importDeviceData();
 window.addEventListener('online',()=>syncNow());
 window.addEventListener('offline',()=>{phase='offline';emit();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow();});
 setInterval(()=>{if(document.visibilityState==='visible'&&user)syncNow();},45000);
 emit();
 return syncStatus();
}
