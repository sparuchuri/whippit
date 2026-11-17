import {syncStatus,subscribeSync,syncNow,legacySummary,importDeviceData,conflictDetails,resolveConflict,prepareSignOut,readHousehold,changeHousehold} from './storage.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={'household-changed':'Household changed — reload required','account-changed':'Account changed — reload required',connecting:'Connecting…',syncing:'Syncing…',synced:'All changes synced',pending:'Saving changes…',offline:'Saved on this device',conflict:'Review sync conflicts','signed-out':'Sign in to sync',local:'Saved on this device'};
function description(key,value){
 if(!value)return 'Removed';
 if(key.startsWith('week:'))return `${value.assignments?.length || 0} meals · ${value.checked?.length || 0} groceries checked`;
 if(key.startsWith('recipe:'))return value.recipe?.name || 'Recipe';
 if(key==='pantry:profile')return (value.items?.length || 0)+(value.unmatched?.length || 0)+' pantry items';
 if(key.startsWith('favorite:'))return value?'Favorite':'Not favorited';
 return `Dinner for ${value.dinnerPeople || 2} · $${value.budget || 0} grocery target`;
}
export function setupAccountUI(openPantry){
 const button=document.querySelector('#account-button'),banner=document.querySelector('#account-banner');
 const dialog=document.createElement('dialog');dialog.id='account-dialog';dialog.setAttribute('aria-labelledby','account-title');document.body.append(dialog);
 const householdDialog=document.createElement('dialog');
 householdDialog.setAttribute('aria-labelledby','household-title');
 document.body.append(householdDialog);
 function householdFrame(body){
  householdDialog.innerHTML=`<div class="dialog-top"><h2 id="household-title" tabindex="-1">Household</h2><button type="button" data-close aria-label="Close household">×</button></div>${body}`;
  householdDialog.querySelector('[data-close]').onclick=()=>householdDialog.close();
  if(!householdDialog.open)householdDialog.showModal();
  householdDialog.querySelector('h2').focus();
 }
 async function openHousehold(){
  householdFrame('<p role="status">Loading household…</p>');
  try {
   const {household,invitations}=await readHousehold();
   if(!householdDialog.open)return;
   const active=household?.active;
   let body='<p>Share weekly plans, grocery checklists, recipes, and the pantry with one other person. Favorites stay personal.</p>';
   if(household?.role==='owner'){
    body+=`<p><strong>${escape(household.email)}</strong> · ${active?'Member':'Invitation pending'}</p>
     <p>${active?'Both accounts can edit this household’s plans and pantry.':'Ask them to sign in to Whippit with this email and open Household to accept.'}</p>
     <button type="button" data-action="remove" data-id="${escape(household.id)}">${active?'Remove member':'Cancel invitation'}</button>`;
   }else if(household?.role==='member'){
    body+=`<p>Sharing with <strong>${escape(household.ownerName)}</strong>.</p>
     <p>Leaving returns you to your personal plans and pantry.</p>
     <button type="button" data-action="leave" data-id="${escape(household.id)}">Leave household</button>`;
   }else{
    body+=invitations.map(invite=>`<section class="migration"><h3>Invitation from ${escape(invite.owner_name)}</h3>
     <p>You’ll switch to their plans, pantry, and recipes. Your personal workspace will be available if you leave.</p>
     <button type="button" data-action="accept" data-id="${escape(invite.id)}">Accept invitation</button></section>`).join('');
    body+=`<form id="household-invite"><label class="search-label">Their ChatGPT sign-in email
     <input type="email" name="email" maxlength="254" required autocomplete="off"></label>
     <p class="muted">The invitation appears in Whippit after they sign in. Once accepted, they can view and edit your existing plans, pantry, and recipes.</p>
     <button type="submit" class="primary">Invite to household</button></form>`;
   }
   householdFrame(body+'<p class="form-message" role="status" id="household-status"></p>');
   async function mutate(action,details){
    const status=householdDialog.querySelector('#household-status');
    const controls=[...householdDialog.querySelectorAll('[data-action],button[type=submit]')];
    controls.forEach(button=>{button.disabled=true;});
    status.textContent='Saving…';
    try {
     await changeHousehold(action,details);
     if(action==='invite'||action==='remove')await openHousehold();
    }catch(error){
     status.textContent=error.message;
     controls.forEach(button=>{button.disabled=false;});
    }
   }
   const form=householdDialog.querySelector('#household-invite');
   if(form)form.onsubmit=event=>{event.preventDefault();mutate('invite',{email:form.elements.email.value});};
   householdDialog.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>mutate(button.dataset.action,{id:button.dataset.id}));
  }catch(error){if(householdDialog.open)householdFrame(`<p role="status">${escape(error.message)}</p>`);}
 }
 function render(){
  const s=syncStatus(),legacy=legacySummary();
  button.innerHTML=`<span class="sync-dot ${s.phase==='synced'?'good':s.phase==='offline'||s.phase==='conflict'?'warning':''}" aria-hidden="true"></span><span>${s.user? s.phase==='synced'?'Synced':s.phase==='offline'?'Offline':s.phase==='conflict'?'Review sync':'Account':'Profile'}</span>`;
  button.setAttribute('aria-label',s.user?'Account: '+names[s.phase]:'Profile and pantry');
  banner.hidden=!(s.user&&legacy);
  if(!banner.hidden)banner.innerHTML=`<div><strong>Bring your saved meals with you.</strong><p>${legacy.weeks} weeks, ${legacy.recipes} recipes and ${legacy.favorites} favorites are saved on this device.</p></div><button id="review-migration">Review import</button>`;
  banner.querySelector('#review-migration')?.addEventListener('click',()=>{draw();dialog.showModal();});
 }
 function draw(){
  const s=syncStatus(),legacy=legacySummary();
  dialog.innerHTML=`<div class="dialog-top"><h2 id="account-title">Your account</h2><button aria-label="Close account" data-close>×</button></div>
  ${s.user?`<p><strong>${escape(s.user.name)}</strong></p><p class="muted">${escape(s.user.email)}</p><div class="account-state"><strong>${names[s.phase]}</strong><p>${s.pending?s.pending+' changes waiting to sync.':'Plans, recipes, favorites and preferences stay with your account.'}</p>${s.message?`<p class="notice">${escape(s.message)}</p>`:''}</div>
  <div class="actions">${['account-changed','household-changed'].includes(s.phase)?'<button data-reload>Reload for current account</button>':'<button data-sync>Sync now</button>'}<a class="button-link" target="_top" href="/signout-with-chatgpt?return_to=%2F" id="sign-out">Sign out</a></div>`:
  `<p>Keep your plans, recipes and shopping list together on every device.</p><a class="button-link primary" target="_top" href="/signin-with-chatgpt?return_to=%2F">Continue with ChatGPT</a><p class="muted">Your current device copy stays here until you choose to bring it into your account.</p>`}
  <section class="migration"><h3>Kitchen profile</h3><p>Save seasonings, sauces and dry goods you keep on hand.</p><button type="button" data-pantry>My pantry</button></section>
  ${s.user?'<section class="migration"><h3>Household</h3><p>Invite someone to share your kitchen in Whippit.</p><button type="button" data-household>Manage household</button></section>':''}
  ${s.user&&legacy?`<section class="migration"><h3>Import this device’s saved data</h3><p>${legacy.weeks} weeks · ${legacy.recipes} recipes · ${legacy.favorites} favorites</p><p class="muted">New items will be added to this account. If a saved week differs, you’ll choose which version to keep. The original device copy stays intact.</p><button class="primary" data-migrate>Import saved data</button></section>`:''}
  ${conflictDetails().map(c=>`<section class="sync-conflict"><h3>${c.key.startsWith('week:')?'Week of '+escape(c.key.slice(5)):c.key.startsWith('recipe:')?'Recipe changes':c.key.startsWith('favorite:')?'Favorite change':c.key==='pantry:profile'?'Pantry changes':'Preferences'}</h3><p>These changes overlap with another saved version. Choose the version to keep.</p><p><strong>This device:</strong> ${escape(description(c.key,c.local))}</p><p><strong>Account:</strong> ${escape(description(c.key,c.remote.value))}</p><div class="actions"><button data-resolve="${escape(c.key)}" data-choice="local">Keep this device’s version</button><button data-resolve="${escape(c.key)}" data-choice="remote">Keep account version</button></div></section>`).join('')}`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-pantry]').onclick=openPantry;
  dialog.querySelector('[data-household]')?.addEventListener('click',openHousehold);
  dialog.querySelector('[data-reload]')?.addEventListener('click',()=>location.reload());
  dialog.querySelector('[data-sync]')?.addEventListener('click',async event=>{event.target.disabled=true;event.target.textContent='Syncing…';await syncNow();draw();});
  dialog.querySelector('[data-migrate]')?.addEventListener('click',()=>{importDeviceData();draw();});
  dialog.querySelector('#sign-out')?.addEventListener('click',event=>{if(!prepareSignOut())event.preventDefault();});
  dialog.querySelectorAll('[data-resolve]').forEach(el=>el.onclick=()=>{resolveConflict(el.dataset.resolve,el.dataset.choice);draw();});
 }
 button.onclick=()=>{draw();dialog.showModal();};
 subscribeSync(render);render();
}
