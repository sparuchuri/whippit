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
const documentKey=/^(?:week:\d{4}-\d{2}-\d{2}|recipe:[\w-]{1,100}|recipe-source:(?:tiktok-\d{15,25}|collection-[a-f0-9]{32})|favorite:[\w-]{1,100}|preferences:default|pantry:profile)$/;
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
    typeof value.name==='string' && typeof value.url==='string' && Array.isArray(value.items) && Array.isArray(value.steps) &&
    (key.startsWith('recipe-source:tiktok-') || (typeof value.publisher==='string' && typeof value.author==='string'));
  if (key.startsWith('recipe:')) return value.recipe?.id===key.slice(7) &&
    typeof value.recipe.name==='string' && Array.isArray(value.recipe.steps) && value.recipe.parts &&
    Number.isFinite(value.recipe.servings) && value.recipe.servings>0 && Array.isArray(value.ingredients);
  return Array.isArray(value.dinnerDays) && Array.isArray(value.lunchDays);
}
const documentRow=row=>({key:row.document_key,version:row.revision,value:JSON.parse(row.payload),updatedAt:row.updated_at});

const memberScope = (db,userId) => db.prepare('SELECT id, owner_id FROM households WHERE member_id=?').bind(userId);
const householdChanged = () => accountJson({error:'Your household changed. Reload to switch your workspace.',code:'HOUSEHOLD_CHANGED'},409);

async function handleHousehold(request,db,user) {
  const email=user.email.trim().toLowerCase();
  if (request.method==='GET') {
    const results=await db.batch([
      db.prepare('SELECT id, owner_id, owner_name, invited_email, member_id FROM households WHERE owner_id=? OR member_id=?').bind(user.id,user.id),
      db.prepare('SELECT id, owner_name FROM households WHERE invited_email=? AND member_id IS NULL AND owner_id<>?').bind(email,user.id),
    ]);
    const row=results[0].results[0];
    const household=row ? {id:row.id,role:row.owner_id===user.id?'owner':'member',ownerName:row.owner_name,
      email:row.invited_email,active:Boolean(row.member_id)} : null;
    return accountJson({household,invitations:household ? [] : results[1].results});
  }
  if (request.method!=='POST') return accountJson({error:'Method not allowed.'},405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return accountJson({error:'Expected JSON.'},415);
  const input=await readAccountJson(request,4096);
  if (!input || input.expectedUserId!==user.id) return accountJson({error:'Your account changed. Reload to continue.',code:'ACCOUNT_CHANGED'},409);
  const id=typeof input.id==='string' ? input.id : '';
  let statement;
  switch(input.action) {
    case 'invite': {
      const address=typeof input.email==='string' ? input.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length>254 || address===email) {
        return accountJson({error:'Enter the other person’s ChatGPT sign-in email.'},400);
      }
      statement=db.prepare(`INSERT INTO households (id,owner_id,owner_name,invited_email)
        SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM households WHERE owner_id=? OR member_id=?)`)
        .bind(crypto.randomUUID(),user.id,user.name.slice(0,100),address,user.id,user.id);
      break;
    }
    case 'accept':
      statement=db.prepare(`UPDATE households SET member_id=? WHERE id=? AND invited_email=?
        AND owner_id<>? AND member_id IS NULL AND NOT EXISTS (SELECT 1 FROM households WHERE owner_id=? OR member_id=?)`)
        .bind(user.id,id,email,user.id,user.id,user.id);
      break;
    case 'remove':
      statement=db.prepare('DELETE FROM households WHERE id=? AND owner_id=?').bind(id,user.id);
      break;
    case 'leave':
      statement=db.prepare('DELETE FROM households WHERE id=? AND member_id=?').bind(id,user.id);
      break;
    default: return accountJson({error:'Unknown household action.'},400);
  }
  const [result]=await db.batch([statement]);
  return result.meta?.changes ? accountJson({ok:true}) : accountJson({
    error:'This change is no longer available. Refresh Household and try again.'},409);
}

async function readAccountJson(request,limit) {
  if (Number(request.headers.get('content-length'))>limit || !request.body) return null;
  const reader=request.body.getReader(),chunks=[];
  let size=0;
  for(;;) {
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.length;
    if(size>limit){await reader.cancel();return null;}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleAccountApi(request,env) {
  const path=new URL(request.url).pathname;
  const user=accountIdentity(request);
  if (path==='/api/session') {
    if(request.method!=='GET') return accountJson({error:'Method not allowed.'},405);
    const scope=user && env?.DB ? (await memberScope(env.DB,user.id).all()).results[0] : null;
    return accountJson({user,householdId:scope?.id || null,storageAvailable:Boolean(env?.DB)});
  }
  if(!user) return accountJson({error:'Sign in to sync your account.'},401);
  if(!env?.DB) return accountJson({error:'Account storage is temporarily unavailable.'},503);
  if(path==='/api/state' && request.method==='GET') {
    const [scope,result]=await env.DB.batch([
      memberScope(env.DB,user.id),
      env.DB.prepare(`SELECT document_key,payload,revision,updated_at FROM account_documents
        WHERE (user_id=COALESCE((SELECT owner_id FROM households WHERE member_id=?),?) AND document_key NOT LIKE 'favorite:%')
        OR (user_id=? AND document_key LIKE 'favorite:%')`).bind(user.id,user.id,user.id),
    ]);
    const householdId=scope.results[0]?.id || null;
    if((request.headers.get('x-whippit-household') || null)!==householdId)return householdChanged();
    return accountJson({userId:user.id,householdId,documents:result.results.map(documentRow)});
  }
  if(path==='/api/household' && request.method==='GET') return handleHousehold(request,env.DB,user);
  if(!['/api/sync','/api/household'].includes(path) || request.method!=='POST') return accountJson({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') {
    return accountJson({error:'Account changes must come from this app.'},403);
  }
  if(path==='/api/household') {
    try {return await handleHousehold(request,env.DB,user);}
    catch(error){if(error instanceof SyntaxError)return accountJson({error:'Could not read the household change.'},400);throw error;}
  }
  if(!request.headers.get('content-type')?.startsWith('application/json')) return accountJson({error:'Expected JSON.'},415);
  let input;
  try {
    input=await readAccountJson(request,1_000_000);
    if(!input)return accountJson({error:'This sync is empty or too large.'},413);
  } catch {return accountJson({error:'Could not read the changes.'},400);}
  if(!input || typeof input!=='object' || input.expectedUserId!==user.id) {
    return accountJson({error:'Your account changed. Reload to continue.',code:'ACCOUNT_CHANGED'},409);
  }
  if(!Array.isArray(input.changes) || !input.changes.length || input.changes.length>40 ||
    new Set(input.changes.map(c=>c.key)).size!==input.changes.length ||
    !input.changes.every(c=>Number.isSafeInteger(c.baseVersion) && c.baseVersion>=0 && validDocument(c.key,c.value) && JSON.stringify(c.value).length<150000)) {
    return accountJson({error:'Some changes are invalid. Your local copy has been kept.'},422);
  }
  const scope=(await memberScope(env.DB,user.id).all()).results[0];
  const householdId=scope?.id || null;
  if ((input.expectedHouseholdId ?? null)!==householdId) return householdChanged();
  const guard="COALESCE((SELECT id FROM households WHERE member_id=?),'')=?";
  const scopeArgs=[user.id,householdId || ''];
  const statements=[memberScope(env.DB,user.id)],now=new Date().toISOString();
  for(const c of input.changes) {
    const owner=c.key.startsWith('favorite:') ? user.id : (scope?.owner_id || user.id);
    const payload=JSON.stringify(c.value);
    statements.push(env.DB.prepare(`INSERT INTO account_documents (user_id, document_key, payload, revision, updated_at)
      SELECT ?, ?, ?, 1, ? WHERE ? = 0 AND ${guard}
      ON CONFLICT(user_id, document_key) DO UPDATE SET payload=excluded.payload, revision=account_documents.revision+1, updated_at=excluded.updated_at
      WHERE account_documents.revision = ?`).bind(owner,c.key,payload,now,c.baseVersion,...scopeArgs,c.baseVersion));
    statements.push(env.DB.prepare(`UPDATE account_documents SET payload=?, revision=revision+1, updated_at=?
      WHERE user_id=? AND document_key=? AND revision=? AND ? > 0 AND ${guard}`)
      .bind(payload,now,owner,c.key,c.baseVersion,c.baseVersion,...scopeArgs));
    statements.push(env.DB.prepare(`SELECT document_key, payload, revision, updated_at FROM account_documents
      WHERE user_id=? AND document_key=? AND ${guard}`).bind(owner,c.key,...scopeArgs));
  }
  const [scopeAtWrite,...result]=await env.DB.batch(statements);
  if ((scopeAtWrite.results[0]?.id || null)!==householdId) return householdChanged();
  const accepted=[],conflicts=[];
  input.changes.forEach((change,i)=>{
    const row=result[i*3+2].results?.[0];
    const document=row?documentRow(row):{key:change.key,version:0,value:null};
    if((result[i*3].meta?.changes || 0)+(result[i*3+1].meta?.changes || 0)>0) accepted.push(document);
    else conflicts.push(document);
  });
  return accountJson({userId:user.id,householdId,accepted,conflicts});
}
