# WhippIt

A private meal-planning PWA at https://whippit.sparuchuri.chatgpt.site.

- Plan dinners and batch lunches, reuse ingredients, preview swaps, and shop from one combined list.
- Sign in with ChatGPT. Weeks, grocery checks, custom recipes, favorites, pantry and price preferences sync to the account's managed D1 records.
- Keep working offline with a device cache and queued edits. Independent records merge; overlapping edits require an explicit choice.
- Review and import your previous device data without deleting the original copy.
- Discover **554 verified publisher recipes**, each rated at least 4.5/5 with at least 25 ratings. Search by dish, cuisine, ingredient or mood and favorite source recipes. Source ingredients and ratings were checked November 17, 2026.
- The **48 starter planner recipes** remain available immediately. Publisher recipes enter the planner through ingredient/serving review, because publisher measurements and grocery packages are not interchangeable. They are not represented as 554 pre-normalized planner recipes. Imported cooking instructions stay at the publisher.
- Paste text or import a supported public recipe link, review grocery mappings, and save your own recipes. New grocery prices are optional and clearly marked as missing from a partial estimate.
- Use the phone setup sheet, bottom navigation, large touch targets, recipe mood chips and accessible dialogs.

Package prices are editable examples, not live store prices. Publisher rating scores describe the original source recipe, not WhippIt's starter adaptations or a user's altered recipe.

## Development

Node 24+ is used for the built-in SQLite integration tests and local QA. The production app has no package dependencies.

```sh
npm test
npm start
npm run build
```

The build emits one Worker entrypoint and the D1 migration package under `dist/`. `.openai/hosting.json` retains the existing Sites identity and `DB` binding. D1 migrations live in `drizzle/`; applied migration history is immutable.

The normal development server has no signed-in identity. For isolated local QA only, create an ignored `.whippit-preview-test` marker before starting the development server; this uses an in-memory SQLite database and a clearly named preview account. The preview server and fixture are never bundled into the production Worker. `/__qa` on the development server renders 390px and 320px frames.

## Verification and remaining limits

20 automated checks cover account ownership, unsafe-origin rejection, optimistic concurrency, offline/reload recovery, account switching, catalog quality, meal constraints, servings and grocery math. Browser QA exercised migration, account sync between two preview clients, imported recipes, favorites, dinner/lunch plans, grocery checks/copy, and phone layouts.

Production deployment and the live `DB.account_documents` schema were verified. The cloud browser has no signed-in ChatGPT session, so the production OAuth round-trip and a physical iPhone Safari/home-screen session remain unverified. They are explicitly tracked in [WORK_QUEUE.md](WORK_QUEUE.md).

The complete current source is saved in the existing Sites deployment repository. The GitHub mirror at `sparuchuri/whippit` still has the previous phone-design release: the integration rejected this update with HTTP 403 (Resource not accessible by integration). See [WORK_QUEUE.md](WORK_QUEUE.md), [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), and [recipe provenance](docs/RESEARCH_NOTES.md).
