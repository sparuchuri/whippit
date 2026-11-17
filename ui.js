const paths = {
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 10h3m4 0h3m-10 3h3',
  basket:'m8 3-5 7m13-7 5 7M2 10h20l-3 11H5L2 10Zm7 4v3m6-3v3',
  book:'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 1Zm0 0v15M5 8h4M5 12h4m6-4h4m-4 4h4',
  sliders:'M4 4v16M12 4v16M20 4v16M1 8h6m2 8h6m2-6h6',
  sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  refresh:'M20 7a9 9 0 0 0-16-1L2 9m0-6v6h6m-4 8a9 9 0 0 0 16 1l2-3m0 6v-6h-6',
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.sparkles}"/></svg>`;
}
export function dishMark(item) {
  const name=(item.cuisine+' '+item.name).toLowerCase();
  const [emoji,tone] = /pasta|italian/.test(name) ? ['🍝','tomato']
    : /indian|curry|dal/.test(name) ? ['🍛','gold']
    : /korean|japanese|chinese|thai|noodle/.test(name) ? ['🍜','lavender']
    : /mexican|taco|burrito/.test(name) ? ['🌮','peach']
    : /salad|vegetarian|vegan/.test(name) ? ['🥗','mint']
    : /mediterranean|greek|wrap/.test(name) ? ['🥙','mint'] : ['🥘','gold'];
  return `<span class="dish-mark ${tone}" aria-hidden="true"><span>${emoji}</span></span>`;
}
