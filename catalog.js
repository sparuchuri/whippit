import { extraIngredients, curatedRecipes } from './curated.js';

const entries = [
  ['chicken','Chicken breast','Meat & fish',454,'g',649,1],
  ['salmon','Salmon','Meat & fish',340,'g',1099,1],
  ['turkey','Ground turkey','Meat & fish',454,'g',599,1],
  ['spinach','Baby spinach','Produce',142,'g',299,1],
  ['pepper','Bell peppers','Produce',3,'each',399,1],
  ['broccoli','Broccoli florets','Produce',340,'g',329,1],
  ['lemon','Lemon','Produce',1,'each',79,1],
  ['lime','Lime','Produce',1,'each',59,1],
  ['carrot','Carrots','Produce',454,'g',169,.35],
  ['onion','Yellow onion','Produce',1,'each',109,.35],
  ['mushroom','Mushrooms','Produce',227,'g',329,1],
  ['potato','Baby potatoes','Produce',680,'g',399,.35],
  ['rice','Rice, dry','Pantry',907,'g',349,0],
  ['pasta','Pasta, dry','Pantry',454,'g',179,0],
  ['chickpea','Chickpeas, drained','Pantry',240,'g',129,0],
  ['blackbean','Black beans, drained','Pantry',240,'g',129,0],
  ['coconut','Coconut milk','Pantry',400,'mL',249,0],
  ['tomato','Crushed tomatoes','Pantry',425,'g',179,0],
  ['tortilla','Tortillas','Bakery',8,'each',279,.35],
  ['yogurt','Plain Greek yogurt','Dairy',454,'g',399,.35],
  ['feta','Feta','Dairy',170,'g',399,.35],
  ['cheddar','Cheddar','Dairy',227,'g',349,.35],
  ['tofu','Firm tofu','Refrigerated',397,'g',289,.35],
  ['oil','Cooking oil','Pantry',500,'mL',549,0],
  ['salt','Salt','Pantry',500,'g',179,0],
  ['cumin','Ground cumin','Pantry',45,'g',249,0],
  ['curry','Curry powder','Pantry',40,'g',299,0],
  ['soy','Soy sauce','Pantry',296,'mL',279,0],
  ['paprika','Smoked paprika','Pantry',45,'g',279,0],
];
export const ingredients = Object.fromEntries([...entries,...extraIngredients].map(([id,name,aisle,pack,unit,cents,risk]) => [id,{id,name,aisle,pack,unit,cents,risk}]));
export const staples = ['oil','salt','cumin','curry','soy','paprika'];
const recipe = (id,name,cuisine,protein,minutes,use,parts,steps,styles=[]) => ({
  id,name,cuisine,protein,minutes,use,servings:2,parts:{oil:15,salt:2,...parts},steps,styles
});
const rice = 'Cook the rice according to its package directions.';
const pasta = 'Cook pasta in salted water until al dente. Reserve a little cooking water before draining.';
const chicken = 'Cook the chicken until it reaches 165°F in the thickest part.';
export const recipes = [
  recipe('lemon-chicken','Lemon Chicken & Spinach Rice','Mediterranean','Chicken',35,'dinner',{chicken:360,spinach:70,rice:150,lemon:1,onion:.5},[rice,'Slice the onion and chicken. Sauté onion in oil until soft, then add chicken.',chicken,'Wilt the spinach in the skillet. Squeeze over lemon and serve over rice.']),
  recipe('bean-tacos','Smoky Black Bean Tacos','Mexican-inspired','Beans',25,'dinner',{blackbean:240,pepper:1,tortilla:4,lime:1,cumin:3,cheddar:50},['Slice the pepper and sauté in oil until tender.','Add drained beans, cumin and a splash of water. Simmer until hot.','Warm tortillas and fill with beans, peppers, cheddar and lime.'],['Vegetarian']),
  recipe('spinach-curry','Coconut Chickpea & Spinach Curry','Indian-inspired','Chickpeas',30,'both',{chickpea:240,spinach:75,coconut:200,rice:140,curry:6,onion:.5},[rice,'Sauté diced onion in oil. Stir in curry powder for 30 seconds.','Add chickpeas and coconut milk. Simmer 12 minutes, then wilt in spinach. Serve with rice.'],['Vegetarian']),
  recipe('ginger-ish','Soy Chicken & Pepper Bowls','East Asian-inspired','Chicken',30,'both',{chicken:340,pepper:1,rice:150,carrot:100,soy:25},[rice,'Slice the vegetables and chicken. Sear chicken in oil, then add vegetables.',chicken,'Add soy sauce and toss until glazed. Serve over rice.']),
  recipe('mushroom-pasta','Mushroom, Spinach & Feta Pasta','Italian-inspired','Cheese',25,'dinner',{mushroom:227,spinach:65,pasta:180,feta:70,lemon:.5},[pasta,'Sauté sliced mushrooms in oil until golden. Stir in spinach to wilt.','Toss with the pasta, lemon, feta and a splash of reserved water.'],['Vegetarian']),
  recipe('salmon-tray','Lemon Salmon & Broccoli Tray Bake','Mediterranean','Seafood',30,'dinner',{salmon:340,broccoli:220,potato:300,lemon:1},['Heat the oven to 425°F. Halve the potatoes, toss with oil and roast for 15 minutes.','Add broccoli and salmon to the tray. Roast until salmon reaches 145°F and the vegetables are tender.','Finish with fresh lemon.'],['Sheet pan']),
  recipe('tofu-broccoli','Soy Tofu & Broccoli Rice Bowls','East Asian-inspired','Tofu',32,'both',{tofu:397,broccoli:200,rice:140,soy:25,carrot:100},[rice,'Pat tofu dry and cube it. Brown in a skillet with oil.','Add chopped broccoli and carrots with a splash of water. Cover until tender, then toss with soy sauce. Serve over rice.'],['Vegetarian']),
  recipe('turkey-skillet','Turkey & Pepper Rice Skillet','Mexican-inspired','Turkey',35,'both',{turkey:340,pepper:1,rice:140,tomato:210,cumin:3,onion:.5},['Sauté diced onion and pepper. Add turkey and break it up as it cooks.','Stir in rice, tomato, cumin and water according to the rice package. Cover and simmer until rice is tender.','Confirm the turkey reaches 165°F and season to taste.'],['One-pot']),
  recipe('feta-chickpea','Lemon Chickpea & Feta Bowls','Mediterranean','Chickpeas',30,'both',{chickpea:240,rice:140,feta:70,carrot:130,lemon:1,spinach:60},[rice,'Roast sliced carrots and drained chickpeas with oil at 425°F until carrots are tender.','Fill bowls with rice, spinach, carrots and chickpeas. Finish with lemon and feta.'],['Vegetarian']),
  recipe('turkey-pasta','Turkey Tomato Pasta','Italian-inspired','Turkey',30,'both',{turkey:340,pasta:180,tomato:425,onion:.5,paprika:3},[pasta,'Cook diced onion in oil until soft. Brown turkey until it reaches 165°F.','Stir in tomatoes and paprika and simmer 10 minutes. Toss with the cooked pasta.']),
  recipe('blackbean-bowl','Sweet Pepper & Black Bean Bowls','Mexican-inspired','Beans',25,'both',{blackbean:240,pepper:1,rice:140,lime:1,yogurt:70,cumin:3},[rice,'Cook sliced pepper in oil. Stir in drained beans and cumin and warm through.','Serve on rice with lime. Pack yogurt separately for reheating.'],['Vegetarian']),
  recipe('paprika-chicken','Paprika Chicken & Roast Potatoes','Mediterranean','Chicken',40,'dinner',{chicken:360,potato:380,carrot:180,yogurt:75,paprika:4},['Heat oven to 425°F. Cut potatoes and carrots and toss with oil and paprika. Roast 15 minutes.','Add the chicken pieces and roast until the chicken reaches 165°F and potatoes are tender.','Serve with a little yogurt.'],['Sheet pan']),
  recipe('potato-curry','Potato, Pepper & Coconut Curry','Indian-inspired','Chickpeas',35,'both',{potato:320,pepper:1,coconut:200,chickpea:240,curry:7,onion:.5},['Sauté diced onion, pepper and curry powder in oil.','Add diced potato, coconut milk and enough water to cover halfway. Simmer until potatoes are tender.','Add drained chickpeas and simmer another five minutes.'],['Vegetarian','One-pot']),
  recipe('tomato-chickpea','Tomato & Chickpea Pasta','Italian-inspired','Chickpeas',28,'both',{chickpea:240,pasta:180,tomato:425,spinach:70,onion:.5},[pasta,'Sauté onion in oil, then add tomatoes and chickpeas. Simmer until thickened.','Wilt in spinach and toss with the pasta.'],['Vegetarian']),
  recipe('salmon-rice','Soy Salmon & Carrot Rice Bowls','East Asian-inspired','Seafood',30,'dinner',{salmon:340,rice:150,carrot:180,soy:24,lime:1},[rice,'Slice carrots thin and sauté in oil. Brush salmon with soy sauce.','Roast salmon at 425°F until it reaches 145°F. Serve over the rice with carrots and lime.']),
  recipe('tofu-curry','Coconut Tofu & Greens','Indian-inspired','Tofu',30,'both',{tofu:397,coconut:200,spinach:75,rice:140,curry:6},[rice,'Cube tofu and brown in oil. Stir in curry powder, coconut milk and a splash of water.','Simmer about 10 minutes, then wilt in spinach. Serve on rice.'],['Vegetarian']),
  recipe('pepper-quesadilla','Pepper, Mushroom & Cheddar Quesadillas','Mexican-inspired','Cheese',25,'dinner',{pepper:1,mushroom:115,cheddar:110,tortilla:4,lime:1},['Slice peppers and mushrooms and sauté until tender.','Fill tortillas with vegetables and cheddar. Toast both sides in a skillet until the cheese melts.','Cut into wedges and serve with lime.'],['Vegetarian']),
  recipe('broccoli-pasta','Lemon Broccoli Pasta','Italian-inspired','Cheese',25,'both',{broccoli:240,pasta:180,feta:80,lemon:1},[pasta,'Steam or sauté bite-size broccoli until just tender.','Toss broccoli with pasta, feta, oil, lemon and enough pasta water to loosen.'],['Vegetarian']),
];
recipes.push(...curatedRecipes);
export const byId = Object.fromEntries(recipes.map(item => [item.id,item]));
export const categories = [];

export const tags = item => [item.cuisine,...item.styles,...(item.protein === 'Seafood' ? ['Seafood'] : [])].filter(Boolean);
function refreshCategories() {
  categories.splice(0,categories.length,...[...new Set(recipes.flatMap(tags))].sort());
}
refreshCategories();

export function registerRecipe(recipe, customIngredients=[]) {
  if (byId[recipe.id]) return;
  for (const item of customIngredients) ingredients[item.id] = item;
  recipes.push(recipe);
  byId[recipe.id] = recipe;
  refreshCategories();
}
