import { ingredients, tags } from './catalog.js';

const aliases = {
  chicken:['chicken breasts','boneless skinless chicken breast','chicken breast fillets','chicken'],
  groundChicken:['minced chicken','ground chicken'],
  steak:['beef','flank steak','sirloin','sirloin steak'],
  pepper:['pepper','peppers','bell pepper','red bell pepper','green bell pepper','capsicum'],
  onion:['onion','onions','yellow onion'], scallion:['scallion','spring onion','green onion'],
  freshTomato:['tomato','tomatoes','roma tomato'], tomato:['crushed tomatoes','canned crushed tomatoes'],
  rice:['rice','white rice','jasmine rice','basmati rice','long grain rice','short grain rice','uncooked rice'],
  pasta:['pasta','spaghetti','penne','rigatoni','dry pasta'],
  spinach:['spinach','baby spinach leaves'], greenbean:['green bean','string beans'],
  chickpea:['chickpeas','garbanzo beans','garbanzos'], blackbean:['black beans','canned black beans'],
  egg:['egg','large egg','large eggs'], garlic:['garlic','garlic clove','clove garlic','cloves garlic'],
  ginger:['ginger','ginger root'], salt:['kosher salt','sea salt','table salt'],
  blackPepper:['black pepper','ground pepper','freshly ground black pepper'],
  oil:['vegetable oil','olive oil','avocado oil','neutral oil','canola oil','extra virgin olive oil','oil'],
  soy:['light soy sauce','low sodium soy sauce','reduced sodium soy sauce'],
  yogurt:['greek yogurt','plain yogurt'], moong:['moong dal','yellow lentils'],
  redLentil:['red lentils','dry red lentils'], udon:['udon','udon noodles'],
  broth:['broth','vegetable stock'], bread:['bread','bread slices','white bread'],
};
const fractions = {'½':' 1/2','¼':' 1/4','¾':' 3/4','⅓':' 1/3','⅔':' 2/3','⅛':' 1/8','⅜':' 3/8','⅝':' 5/8','⅞':' 7/8','⅕':' 1/5'};
const gramsPerCup = {
  rice:185, pasta:100, orzo:190, redLentil:190, moong:200, spinach:30, broccoli:90, carrot:120,
  mushroom:70, freshTomato:180, sweetPotato:130, cabbage:90, chickpea:165, blackbean:175,
  yogurt:245, cheddar:113, feta:150, peas:145, tomato:240, sugar:200, honey:340,
  peanutButter:258, peanut:145, butter:227, cornstarch:128, pesto:240, mayo:225, miso:275,
};
const gramsPerTsp = {salt:6,curry:2,paprika:2,cumin:2,oregano:1,garam:2,turmeric:3,sesame:3,chiliFlake:2,blackPepper:2,gochugaru:2};
const unitValues = {
  g:['g',1], gram:['g',1], grams:['g',1], kg:['g',1000], kilogram:['g',1000], kilograms:['g',1000],
  oz:['g',28.34952], ounce:['g',28.34952], ounces:['g',28.34952], lb:['g',453.59237], lbs:['g',453.59237], pound:['g',453.59237], pounds:['g',453.59237],
  ml:['mL',1], milliliter:['mL',1], milliliters:['mL',1], l:['mL',1000], liter:['mL',1000], liters:['mL',1000], 'fl oz':['mL',29.5735],
  cup:['mL',236.588], cups:['mL',236.588], tbsp:['mL',14.78675], tablespoon:['mL',14.78675], tablespoons:['mL',14.78675],
  tsp:['mL',4.928917], teaspoon:['mL',4.928917], teaspoons:['mL',4.928917],
  each:['each',1], clove:['each',1], cloves:['each',1], slice:['each',1], slices:['each',1],
};
const packageWords = new Set(['can','cans','bag','bags','pack','packs','package','packages','bunch','bunches']);
const knownUnits = [...Object.keys(unitValues),...packageWords].sort((a,b) => b.length-a.length);
const measurement = new RegExp('^(' + knownUnits.join('|') + ')(?:\\.|\\b)', 'i');
const numberPart = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)\b/;
const clean = value => String(value ?? '').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const keyName = value => clean(value).toLowerCase().replace(/[,().]/g,'').replace(/\s+/g,' ').replace(/s\b/g,'');
const toNum = value => value.trim().split(/\s+/).reduce((total,part) => {
  const [first,second] = part.split('/').map(Number);
  return total + (second == null ? first : first/second);
},0);

export function parseIngredient(raw) {
  const value = clean(raw.replace(/[½¼¾⅓⅔⅛⅜⅝⅞⅕]/g,char => fractions[char])).replace(/^[-•*]\s*/,'');
  const prefix = value.match(numberPart)?.[0];
  let name = prefix ? value.slice(prefix.length).trim() : value;
  let measured = '';
  // Retain package descriptions such as “1 (15 oz) can of chickpeas” for review.
  name = name.replace(/^\s*\([^)]*\)\s*/,'');
  const unit = name.match(measurement)?.[0]?.replace(/\.$/,'')?.toLowerCase();
  if (unit) {
    measured = unit;
    name = name.slice(name.match(measurement)[0].length).trim();
  }
  const short = name.split(/[,;(]/,1)[0].replace(/^(of |boneless skinless |skinless boneless )/i,'').trim();
  const nameKey = keyName(short);
  const known = Object.values(ingredients).find(item =>
    [item.name,item.id,...(aliases[item.id] || [])].some(alias => keyName(alias) === nameKey));
  const readQuantity = prefix ? toNum(prefix) : null;
  const explicitRange = /^\s*(?:-|to\b)/i.test(value.slice(prefix?.length ?? 0));
  const quantity = known && readQuantity > 0 && !explicitRange
    ? canonicalQuantity(known,readQuantity,measured)
    : null;
  return {raw,name:short || name,id:known?.id || '',quantity,readQuantity,measured};
}

function canonicalQuantity(item,value,measured) {
  if (packageWords.has(measured)) {
    if (['chickpea','blackbean','coconut','tomato'].includes(item.id)) return round(value*item.pack);
    return null;
  }
  const rule = unitValues[measured] || (measured ? null : ['each',1]);
  if (!rule) return null;
  if (rule[0] === item.unit) return round(value*rule[1]);
  if (rule[0] !== 'mL' || item.unit !== 'g') return null;
  if (gramsPerTsp[item.id] != null) return round(value*rule[1]/4.928917*gramsPerTsp[item.id]);
  if (gramsPerCup[item.id] != null) return round(value*rule[1]/236.588*gramsPerCup[item.id]);
  return null;
}
const round = value => Math.round(value*100)/100;

export function pasteDraft(text) {
  const input = text.trim().replace(/[ \t]+(?=(?:ingredients|directions|instructions|method|steps)\s*:)/gi,'\n');
  const servingsMatch = input.match(/\b(?:serves?|makes|for|yield\s*[:=]?)\s+(\d+)\b|\b(\d+)\s+(?:servings|portions)\b/i);
  const timeMatch = input.match(/\b(\d+)\s*(?:minutes|mins?|m)\b/i);
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const draft = {name:'',servings:Number(servingsMatch?.[1] || servingsMatch?.[2] || 2),minutes:Number(timeMatch?.[1] || 30),items:[],steps:[]};
  const ingredientStart = /^ingredients\s*[:.-]?\s*/i;
  const stepStart = /^(?:directions|instructions|method|steps)\s*[:.-]?\s*/i;
  const seemsMeasured = value => /^[-•*]?\s*(?:[\d½¼¾⅓⅔⅛⅜⅝⅞]|\.[\d])/.test(value);
  const ingredientLines = value => value.split(/\s*;\s*|\s*,\s*(?=(?:and\s+)?\d)|\s+and\s+(?=\d)/i)
    .map(line => line.replace(/^and\s+/i,'').trim()).filter(Boolean);
  let section = 'title';
  for (const raw of lines) {
    if (ingredientStart.test(raw)) {
      section='ingredients';
      draft.items.push(...ingredientLines(raw.replace(ingredientStart,'')));
    } else if (stepStart.test(raw)) {
      section='steps';
      const step=raw.replace(stepStart,'');
      if (step) draft.steps.push(step);
    } else if (section==='steps') {
      draft.steps.push(raw.replace(/^\d+[.)]\s*/,''));
    } else if (/^(?:serves?|yield|cook time|prep time|total time)\b/i.test(raw)) {
      continue;
    } else if (section==='ingredients') {
      draft.items.push(...ingredientLines(raw));
    } else if (seemsMeasured(raw)) {
      section='ingredients';
      draft.items.push(...ingredientLines(raw));
    } else if (!draft.name) {
      const first = raw.split(/[.;:]\s+(?=\d)/);
      draft.name=first.shift().replace(/^(?:recipe|title)\s*:\s*/i,'')
        .replace(/\s*\(?\b(?:serves?|for)\s+\d+\)?\s*$/i,'').trim();
      if (first.length) {
        const [items,...steps] = first.join('; ').split(/\.\s+(?=[A-Z])/);
        draft.items.push(...ingredientLines(items));
        draft.steps.push(...steps);
        section = steps.length ? 'steps' : 'ingredients';
      }
    } else {
      draft.steps.push(raw);
    }
  }
  return draft;
}

export function recipeMatches(item, query) {
  const labels = [item.name,item.cuisine,item.protein,item.source?.label,...tags(item),
    ...Object.keys(item.parts).map(id=>ingredients[id]?.name)];
  if (item.minutes <= 30) labels.push('quick fast weeknight');
  if (item.use !== 'dinner') labels.push('meal prep lunch batch');
  if (tags(item).includes('Comfort food')) labels.push('cozy warming hearty');
  const haystack = keyName(labels.filter(Boolean).join(' '));
  const words = keyName(query.replace(/[^\p{L}\p{N} ]/gu,' ')).split(' ').filter(Boolean);
  return words.every(word => haystack.includes(word));
}

// An import suggestion preserves source units when a canonical grocery match is uncertain.
// The review screen always shows the original ingredient alongside this proposal.
export function suggestIngredient(raw) {
  let parsed=parseIngredient(raw);
  if(parsed.id && parsed.quantity>0)return {...parsed,unit:ingredients[parsed.id].unit};
  const text=clean(raw.replace(/[½¼¾⅓⅔⅛⅜⅝⅞⅕]/g,char=>fractions[char]));
  const simplified=text.replace(/\b(?:small|medium|large|finely|freshly|grated|chopped|minced|diced|boneless|skinless)\b/gi,'').replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
  const match=parseIngredient(simplified);
  if(match.id&&match.quantity>0)return {...match,raw,unit:ingredients[match.id].unit};
  const prefix=text.match(numberPart)?.[0], quantity=prefix?toNum(prefix):null;
  if(!quantity||/^\s*(?:-|to\b|or\b)/i.test(text.slice(prefix.length)))return {...parsed,quantity:null,needsReview:true};
  let rest=text.slice(prefix.length).trim();
  const metric=rest.match(/^\((\d+(?:\.\d+)?)\s*(g|kg|ml|mL|oz|ounce|ounces)\)/i);
  let unit='',amount=quantity;
  if(metric){const rule=unitValues[metric[2].toLowerCase()];unit=rule?.[0];amount=quantity*Number(metric[1])*(rule?.[1]||1);rest=rest.slice(metric[0].length).trim().replace(/^(?:can|cans|package|packages)\b\s*/i,'');}
  else{
    const measured=rest.match(measurement)?.[0]?.replace(/\.$/,'').toLowerCase();
    if(measured){rest=rest.slice(rest.match(measurement)[0].length).trim();const rule=unitValues[measured];
      if(rule){unit=rule[0];amount=quantity*rule[1];}else return {...parsed,quantity:null,needsReview:true};
    }else{unit='each';}
  }
  const name=rest.replace(/^of\s+/i,'').split(/[,;(]/)[0].trim();
  if(!name || /\bor\b/i.test(name))return {...parsed,quantity:null,needsReview:true};
  return {raw,name,id:'custom',quantity:round(amount),unit,customName:name,pack:round(amount),price:'',needsReview:true};
}
