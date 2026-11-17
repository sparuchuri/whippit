import {ingredients} from './catalog.js';
import {readPantryProfile, writePantryProfile} from './storage.js';

const seasonings = new Set(['salt','blackPepper','cumin','curry','paprika','sesame','gochugaru',
  'chiliFlake','garam','turmeric','mustardSeed','oregano']);
const condiments = new Set(['oil','soy','sesameOil','riceVinegar','oysterSauce','gochujang',
  'hotSauce','chiliOil','pesto','mayo','curryRoux','peanutButter','honey']);
const aliases = {
  oil:['olive oil','extra virgin olive oil','evoo','vegetable oil','canola oil','avocado oil','neutral oil'],
  soy:['regular soy sauce','light soy sauce','low sodium soy sauce','kikkoman soy sauce'],
  salt:['kosher salt','sea salt','table salt'],
  blackPepper:['black pepper','black peppercorns','ground pepper'],
  cumin:['cumin powder','cumin'],
  curry:['curry powder'],
  paprika:['smoked paprika powder'],
  sesame:['sesame seed'],
  sesameOil:['sesame oil'],
  chiliFlake:['chili flakes','chilli flakes','red pepper flakes'],
  turmeric:['turmeric','turmeric powder'],
  oregano:['oregano'],
  mayo:['mayo'],
  rice:['white rice','jasmine rice','basmati rice','dry rice'],
  pasta:['pasta','dry pasta'],
  chickpea:['chickpeas','canned chickpeas','garbanzo beans'],
  blackbean:['black beans','canned black beans'],
  coconut:['canned coconut milk'],
  redLentil:['red lentils','dry red lentils'],
  moong:['moong dal','split yellow moong dal'],
  orzo:['orzo'],
  pesto:['pesto'],
};
const normalize = text => text.normalize('NFKD').toLowerCase().replace(/\p{Diacritic}/gu,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const eligible = item => item.aisle === 'Pantry' || item.id.startsWith('custom_');
const esc = text => String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function ingredientLookup() {
  const lookup = new Map();
  for (const item of Object.values(ingredients).filter(eligible)) {
    for (const label of [item.name,item.name.split(',')[0],...(aliases[item.id] || [])]) {
      const key = normalize(label);
      if (!lookup.has(key)) lookup.set(key,item.id);
    }
  }
  return lookup;
}

export function parsePantryList(text) {
  const lookup = ingredientLookup();
  const items = new Set(), unmatched = new Map();
  const input = text.replace(/\r/g,'').replace(/\n\s*(?:[-*•]|\d+[.)])\s+/g,'\n');
  for (const raw of input.split(/[,;\n•]+/).slice(0,200)) {
    const label = raw.trim()
      .replace(/^(?:[-*]\s+|\d+[.)]\s+)/,'')
      .replace(/^(?:ingredients?|items?|pantry|seasonings?|spices?|sauces?|condiments?|oils?|dry goods|canned goods)\s*:\s*/i,'')
      .replace(/^(?:in (?:my|the) (?:pantry|cabinet)(?: i have)?|i (?:already )?have|we (?:already )?have|there (?:is|are)|and)\s*:?\s+/i,'')
      .replace(/^(?:(?:\d+(?:\.\d+)?|a|an|one|two|three)\s+(?:cans?|jars?|bottles?|bags?|boxes?|packs?|tins?)(?:\s+of)?\s+)/i,'')
      .replace(/^[“"'‘]+|[”"'’]+$/g,'').trim();
    const key = normalize(label);
    if (!key || /^(?:ingredient|ingredients|item|items|name|pantry|seasonings|spices|sauces|condiments|oils|dry goods|canned goods)$/.test(key)) continue;
    if (lookup.has(key)) {
      items.add(lookup.get(key));
      continue;
    }
    const joined = label.split(/\s+and\s+/i).map(normalize);
    if (joined.length>1 && joined.every(part=>lookup.has(part))) {
      joined.forEach(part=>items.add(lookup.get(part)));
    } else {
      unmatched.set(key,label.replace(/[.!]+$/,'').slice(0,100));
    }
  }
  return {items:[...items],unmatched:[...unmatched.values()]};
}

export function withPantryProfile(config, profile) {
  const pantry = Object.fromEntries((profile?.items || [])
    .filter(id=>Object.hasOwn(ingredients,id) && eligible(ingredients[id])).map(id=>[id,'enough']));
  return {...config,pantry:{...pantry,...config.pantry}};
}

export function createPantryProfile(onSave) {
  const dialog = document.createElement('dialog');
  dialog.id = 'pantry-profile';
  dialog.setAttribute('aria-labelledby','pantry-profile-title');
  document.body.append(dialog);

  return function openPantryProfile() {
    const initial = readPantryProfile();
    const selected = new Set(initial.items), extras = new Map(initial.unmatched.map(name=>[normalize(name),name]));
    const available = Object.values(ingredients).filter(eligible).sort((a,b)=>a.name.localeCompare(b.name));
    // An item entered before it existed in the catalog can match a later imported recipe.
    for (const [key,label] of extras) {
      const {items} = parsePantryList(label);
      if (items.length) {
        items.forEach(id=>selected.add(id));
        extras.delete(key);
      }
    }
    dialog.innerHTML = `<div class="dialog-top"><h2 id="pantry-profile-title" tabindex="-1">My pantry</h2>
      <button type="button" id="close-pantry" aria-label="Close pantry">×</button></div>
      <p>Check the shelf-stable ingredients you keep on hand. Whippit assumes you have enough until you uncheck them or enter a quantity in Plan setup.</p>
      <form id="profile-pantry-form">
        <label class="search-label">Paste or type a pantry list
          <textarea id="pantry-list" rows="3" maxlength="12000" placeholder="I have soy sauce, olive oil, cumin and black pepper"></textarea>
        </label>
        <div class="actions pantry-import-actions">
          <button type="button" id="parse-pantry">Match ingredients</button>
          <label class="search-label">Upload a text or CSV list <input id="pantry-file" type="file" accept=".txt,.csv,text/plain,text/csv"></label>
        </div>
        <details><summary>Start with photos of your cabinets</summary>
          <p>Attach photos in ChatGPT and use this prompt. Copy the result into the box above, or save it as a text file to upload.</p>
          <blockquote>List the seasonings, sauces, oils and shelf-stable foods you can clearly identify. Use one ingredient per line. Keep distinct items like dark soy sauce and regular soy sauce separate. Omit anything you can’t read.</blockquote>
        </details>
        <p id="pantry-feedback" class="form-message" role="status"></p>
        <div id="pantry-options"></div>
        <button type="submit" class="primary">Save pantry</button>
      </form>`;

    const options = dialog.querySelector('#pantry-options');
    const input = dialog.querySelector('#pantry-list');
    const feedback = dialog.querySelector('#pantry-feedback');
    function drawOptions() {
      const groups = [
        ['Seasonings',available.filter(item=>seasonings.has(item.id))],
        ['Sauces, oils & condiments',available.filter(item=>condiments.has(item.id))],
        ['Dry goods, canned foods & other items',available.filter(item=>!seasonings.has(item.id)&&!condiments.has(item.id))],
      ];
      options.innerHTML = groups.map(([label,items])=>`<fieldset><legend>${esc(label)}</legend><div class="checks pantry-checks">${items.map(item=>
        `<label><input type="checkbox" data-ingredient="${esc(item.id)}" ${selected.has(item.id)?'checked':''}>${esc(item.name)}</label>`).join('')}</div></fieldset>`).join('') +
        (extras.size ? `<fieldset><legend>Other items you listed</legend><p class="muted">Saved here for reference until matched to a Whippit ingredient.</p><div class="checks pantry-checks">${[...extras].map(([key,label])=>
          `<label><input type="checkbox" data-extra="${esc(key)}" checked>${esc(label)}</label>`).join('')}</div></fieldset>` : '');
    }
    function applyList() {
      if (!input.value.trim()) return;
      const result = parsePantryList(input.value);
      result.items.forEach(id=>selected.add(id));
      result.unmatched.forEach(name=>{
        if (extras.size<200) extras.set(normalize(name),name);
      });
      input.value = '';
      drawOptions();
      feedback.textContent = `Matched ${result.items.length} · ${result.unmatched.length} to review below.`;
    }
    options.onchange = event=>{
      const {checked,dataset} = event.target;
      if (dataset.ingredient) {
        if (checked) selected.add(dataset.ingredient);
        else selected.delete(dataset.ingredient);
      }
      if (dataset.extra && !checked) extras.delete(dataset.extra);
      if (dataset.extra && checked) extras.set(dataset.extra,event.target.parentElement.textContent.trim());
    };
    dialog.querySelector('#parse-pantry').onclick = applyList;
    dialog.querySelector('#pantry-file').onchange = async event=>{
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size>12000 || !/\.(?:txt|csv)$/i.test(file.name)) throw new Error('Choose a .txt or .csv list under 12 KB.');
        const list = await file.text();
        if (!dialog.open || dialog.querySelector('#pantry-list')!==input) return;
        input.value = [input.value,list].filter(Boolean).join('\n').slice(0,input.maxLength);
        applyList();
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        event.target.value = '';
      }
    };
    dialog.querySelector('form').onsubmit = event=>{
      event.preventDefault();
      applyList();
      if (!writePantryProfile({items:[...selected].sort(),unmatched:[...extras.values()]})) {
        feedback.textContent = 'Could not save to this device. Keep this page open while Whippit syncs.';
        return;
      }
      dialog.close();
      onSave();
    };
    dialog.querySelector('#close-pantry').onclick = ()=>dialog.close();
    drawOptions();
    dialog.showModal();
    dialog.querySelector('h2').focus();
  };
}
