import {registerRecipe} from './catalog.js';
import {generate} from './planner.js';

self.addEventListener('message', event => {
  const {config,locks,previous,custom} = event.data;
  try {
    for (const {recipe,ingredients} of custom) registerRecipe(recipe,ingredients);
    self.postMessage(generate(config,locks,previous));
  } catch {
    self.postMessage({error:'The planner couldn’t finish this week. Adjust the selections and try again.'});
  }
});
