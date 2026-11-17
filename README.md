# Whippit

Plan a week of dinners and optional batch-prep lunches, then shop from one list with whole-package estimates.

- Use a phone-first layout with bottom navigation, a focused setup sheet, large tap targets and grocery check-offs.
- Browse 48 recipes, including 30 adaptations linked to their original publishers or cooking creators. Search by ingredient, cuisine, or mood.
- Paste a recipe or import a supported recipe page. Review servings, ingredient quantities and grocery matches before saving. Open the publisher's page for imported cooking instructions.
- Favorite any recipe and find it again under Favorites. Recipes you add also appear as options in the planner and in eligible meal swaps.
- Pick meal days, set serving counts, request a theme, exclude foods, and adjust pantry stock or prices to match your store.
- Reuse groceries across meals, preview dinner swaps, check off a shopping trip, and copy the combined list.

Meal plans, recipes you add, and favorites currently save in your browser. Shelf prices are editable examples. Adapted cards use Whippit's own steps and package quantities.

## Develop in Codex cloud

Node 20 or newer is sufficient.

```sh
npm test
npm start
```

Open the forwarded port 4173. The development server serves the app and its recipe link importer. Link import reads structured metadata from supported publishers, and pasted text works for other public sources or your own notes.

`npm run build` produces a single Worker entrypoint at `dist/server/index.js` for ChatGPT Sites. It serves the app and the recipe-link endpoint. The private hosted Site uses a separate deployment repository. This GitHub repo remains the app source.

## Next milestones

1. Add cloud storage for weeks, user recipes, favorites and price preferences. Migrate existing browser data with review and handle edits from two devices without silently overwriting work.
2. Associate synced data with a remembered ChatGPT or Google account. Verify signed-in, signed-out and reconnect flows on phone and desktop.
3. Run the same core journeys after sync is implemented, including offline recovery and simultaneous edits. The responsive design pass is implemented and checked at 320px and 390px frame widths and desktop size. Physical iPhone Safari testing is still needed.

See `DEVELOPMENT_PLAN.md` for the next implementation and acceptance checks.
