# WhippIt delivery checklist

Updated November 17, 2026. Existing private app: https://whippit.sparuchuri.chatgpt.site.

## Account and server sync
- [x] Integrate the hosted ChatGPT sign-in and stable account identity.
- [x] Store weeks, grocery checkmarks, personal recipes, favorites, pantry and price preferences per account in managed D1.
- [x] Offer reviewed migration of device data and preserve the original copy.
- [x] Cache offline edits, retry on reconnect, and show accurate sync status.
- [x] Detect overlapping edits and present an explicit conflict choice.
- [x] Verify missing identity is rejected, users are isolated, and unsafe-origin writes fail.
- [x] Verify offline/reload recovery and conflict resolution with isolated SQLite-backed clients.
- [x] Verify account sync between two browser preview clients.
- [ ] Complete the production OAuth round-trip with a real signed-in browser session. The test browser currently has no ChatGPT login.

## Recipes
- [x] Preserve text/link imports and favorites.
- [x] Add 554 distinct, rated publisher recipes: RecipeTin Eats 329; The Woks of Life 174; Love & Lemons 51.
- [x] Require verified ratings >=4.5/5 with >=25 ratings; preserve source URL, date, yield, quantities and cook time.
- [x] Exclude duplicate sources already represented by starter adaptations, duplicate titles, techniques, stocks and side-only recipes.
- [x] Add searchable Discover, Ready to plan, Favorites and My recipes views, with incremental rendering for responsiveness.
- [x] Show publisher ratings and original ingredients; link to original cooking instructions.
- [x] Require serving/ingredient review before a source recipe enters the planner. Keep unknown prices explicit.
- [x] Verify imports, favorite persistence, scaling and combined grocery quantities.

## UX and accessibility
- [x] Preserve the new phone design, bottom navigation and focused plan setup sheet.
- [x] Add account status, migration review and conflict dialogs with accessible focus.
- [x] Exercise recipe search, imports, plan generation, saved weeks, grocery checks/copy and sync in the browser.
- [x] Verify main layouts at 390px and 320px with no horizontal overflow.
- [x] Preserve input values and avoid refreshing recipe controls unnecessarily during sync.
- [ ] Verify physical iPhone Safari and home-screen installation; no physical device is available here.

## Release
- [x] Pass 20 automated checks and build the Worker.
- [x] Provision and verify the live account database and its schema.
- [x] Preserve and merge the other thread's newer mobile UX work.
- [x] Publish the final 554-recipe catalog release to the existing private app.
- [ ] Mirror the checked implementation and this queue to GitHub. The connected integration rejected writes with HTTP 403 (Resource not accessible by integration); the complete release remains saved in the Sites source repository.
- [x] Save the cumulative research draft and pause the old 500-recipe automation at its completed target.

## Optional next phase
- [ ] Expand audited grocery-ready mappings for source recipes.
- [ ] Expand beyond 1,000 verified recipes after core acceptance checks. The initial 500-recipe target is exceeded; this is a stretch goal.

## November 17 repair and publisher additions
- [x] Require expectedUserId to match authenticated identity before any sync writes.
- [x] Stop retries on account mismatch; preserve pending edits in the original account cache and offer reload.
- [x] Regression-test account switching between pull and push, plus missing expected identity.
- [x] Add two Serious Eats recipes with directly checked ratings and two NYT Cooking recipes with explicitly labeled Chive metadata. Catalog now 558; NYT original pages were inaccessible.
- [x] Browser-check publisher search, source disclosures, reviewed recipe save and grocery check persistence.
- [x] Preserve dinner/lunch eligibility when opening a source recipe for review.
- [ ] Signed-in production round-trip remains blocked by the cloud browser sign-in gate; physical iPhone verification remains outstanding.

## November 17: dinner variety and preferences
- [x] Penalize similar dinners rather than reward repeated coconut dishes.
- [x] Optional cook-once dinner batches with explicit leftover nights and combined portions.
- [x] Configurable shopping ZIP; less-preferred ingredients distinct from exclusions.
- [x] Display meat weights in pounds, including pantry and reviewed recipe quantities.
- [x] 27 automated checks; preview batch scheduling, saving and preferences verified.
- [ ] Connect a supported store-price provider and unattended weekly updates; current prices are estimates.
- [x] GitHub access restored; source mirroring supported.
