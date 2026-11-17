# Whippit

Plan a week's dinners and optional meal-prep lunches, then shop from one package-priced grocery list. The current release saves each week in the browser used to open it.

- Select dinner nights and servings, including different servings on guest nights.
- Add weekday lunches, choose portions per day, and pick one batch or two.
- Request a theme, exclude cuisines, styles or ingredients, confirm pantry stock, and adjust price estimates.
- Preview a complete week or a swap, pin favorite meals, and check off or copy the grocery list.
- Install the PWA from an HTTPS deployment. On iPhone use Safari's **Add to Home Screen**.

## Develop in Codex cloud

Node 20 or newer is sufficient. The app has no package dependencies or build step.

```sh
npm test
npm start
```

Open the forwarded port 4173 for a preview. Any static host can serve the app, including a project subpath on GitHub Pages. Publish the root and use HTTPS for the service worker.

## Planner

The versioned browser storage adapter lives in `storage.js`. The independent planner and recipe catalog live in `planner.js` and `catalog.js`. Grocery quantities aggregate dinner servings and lunch-batch servings before pantry subtraction and package rounding. Prices are illustrative and editable. The planner caps its search and ranks feasible weeks by projected perishable remainder, purchase cost and variety. A plan above target requires an explicit save.

For lunch prep, the default uses a second batch for four or five selected weekdays. For a single long batch, the UI calls out when to freeze later portions and links to USDA guidance.

## Next milestones

1. Review the meal planning and grocery flow on phone and desktop. Tune the recipe catalog and package estimates with actual shopping receipts.
2. Add sign-in and a cloud storage adapter keyed by account and week. Migrate saved browser weeks with explicit confirmation and use revision checks for concurrent edits.
3. Consider a grocery-cart handoff after confirming supported retailer access.
