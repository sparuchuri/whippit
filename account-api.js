// Identity is supplied by the Sites authentication gateway, never by a browser payload.
export function accountIdentity(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  const email=request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  let name=request.headers.get('oai-authenticated-user-full-name') || '';
  if (request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8') {
    try {name=decodeURIComponent(name);} catch {name='';}
  }
  return {id,email,name:name || email};
}
const accountJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','Vary':'Cookie'
}});
const documentKey=/^(?:week:\d{4}-\d{2}-\d{2}|recipe:[\w-]{1,100}|recipe-source:tiktok-\d{15,25}|favorite:[\w-]{1,100}|preferences:default|pantry:profile)$/;
function validDocument(key,value) {
  if (!documentKey.test(key)) return false;
  if (value===null) return true;
  if (key.startsWith('favorite:')) return typeof value==='boolean';
  if (!value || typeof value!=='object' || Array.isArray(value)) return false;
  if (key==='pantry:profile') return Array.isArray(value.items) && value.items.length<=1000 &&
    value.items.every(id=>typeof id==='string'&&/^[\w-]{1,100}$/.test(id)) &&
    Array.isArray(value.unmatched) && value.unmatched.length<=200 &&
    value.unmatched.every(item=>typeof item==='string'&&item.length<=100);
  if (key.startsWith('week:')) return Array.isArray(value.assignments) && value.assignments.length<=14 &&
    value.config && Array.isArray(value.config.dinnerDays) && Array.isArray(value.config.lunchDays) &&
    Array.isArray(value.checked) && value.locks && value.assignments.every(s=>typeof s.recipeId==='string' && /^[\w-]+$/.test(s.recipeId) && Number.isFinite(s.servings) && s.servings>0 && s.servings<=500);
  if (key.startsWith('recipe-source:')) return value.id===key.slice(14) &&
    typeof value.name==='string' && typeof value.url==='string' && Array.isArray(value.items) && Array.isArray(value.steps);
  if (key.startsWith('recipe:')) return value.recipe?.id===key.slice(7) &&
    typeof value.recipe.name==='string' && Array.isArray(value.recipe.steps) && value.recipe.parts &&
    Number.isFinite(value.recipe.servings) && value.recipe.servings>0 && Array.isArray(value.ingredients);
  return Array.isArray(value.dinnerDays) && Array.isArray(value.lunchDays);
}
const documentRow=row=>({key:row.document_key,version:row.revision,value:JSON.parse(row.payload),updatedAt:row.updated_at});

export async function handleAccountApi(request,env) {
  const path=new URL(request.url).pathname;
  const user=accountIdentity(request);
  if (path==='/api/session') {
    if(request.method!=='GET') return accountJson({error:'Method not allowed.'},405);
    return accountJson({user,storageAvailable:Boolean(env?.DB)});
  }
  if(!user) return accountJson({error:'Sign in to sync your account.'},401);
  if(!env?.DB) return accountJson({error:'Account storage is temporarily unavailable.'},503);
  if(path==='/api/state' && request.method==='GET') {
    const result=await env.DB.prepare('SELECT document_key, payload, revision, updated_at FROM account_documents WHERE user_id = ?').bind(user.id).all();
    return accountJson({userId:user.id,documents:result.results.map(documentRow)});
  }
  if(path!=='/api/sync' || request.method!=='POST') return accountJson({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') {
    return accountJson({error:'Account changes must come from this app.'},403);
  }
  if(!request.headers.get('content-type')?.startsWith('application/json')) return accountJson({error:'Expected JSON.'},415);
  if(Number(request.headers.get('content-length'))>1_000_000) return accountJson({error:'This sync is too large.'},413);
  let input;
  try {
    const reader=request.body.getReader(),chunks=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();return accountJson({error:'This sync is too large.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    input=JSON.parse(new TextDecoder().decode(bytes));
  } catch {return accountJson({error:'Could not read the changes.'},400);}
  if(!input || typeof input!=='object' || input.expectedUserId!==user.id) {
    return accountJson({error:'Your account changed. Reload to continue.',code:'ACCOUNT_CHANGED'},409);
  }
  if(!Array.isArray(input.changes) || !input.changes.length || input.changes.length>40 ||
    new Set(input.changes.map(c=>c.key)).size!==input.changes.length ||
    !input.changes.every(c=>Number.isSafeInteger(c.baseVersion) && c.baseVersion>=0 && validDocument(c.key,c.value) && JSON.stringify(c.value).length<150000)) {
    return accountJson({error:'Some changes are invalid. Your local copy has been kept.'},422);
  }
  const statements=[],now=new Date().toISOString();
  for(const c of input.changes) {
    statements.push(env.DB.prepare(`INSERT INTO account_documents (user_id, document_key, payload, revision, updated_at)
      SELECT ?, ?, ?, 1, ? WHERE ? = 0
      ON CONFLICT(user_id, document_key) DO UPDATE SET payload=excluded.payload, revision=account_documents.revision+1, updated_at=excluded.updated_at
      WHERE account_documents.revision = ?`).bind(user.id,c.key,JSON.stringify(c.value),now,c.baseVersion,c.baseVersion));
    // Updates of an existing version use a separate guarded UPDATE; the INSERT above handles only version zero.
    statements.push(env.DB.prepare('UPDATE account_documents SET payload=?, revision=revision+1, updated_at=? WHERE user_id=? AND document_key=? AND revision=? AND ? > 0')
      .bind(JSON.stringify(c.value),now,user.id,c.key,c.baseVersion,c.baseVersion));
    statements.push(env.DB.prepare('SELECT document_key, payload, revision, updated_at FROM account_documents WHERE user_id=? AND document_key=?').bind(user.id,c.key));
  }
  const result=await env.DB.batch(statements),accepted=[],conflicts=[];
  input.changes.forEach((change,i)=>{
    const row=result[i*3+2].results?.[0];
    const document=row?documentRow(row):{key:change.key,version:0,value:null};
    if((result[i*3].meta?.changes || 0)+(result[i*3+1].meta?.changes || 0)>0) accepted.push(document);
    else conflicts.push(document);
  });
  return accountJson({userId:user.id,accepted,conflicts});
}
