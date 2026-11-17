# Whippit execution checkpoint

## Goal

A fun, easy weekly meal planner on phone and desktop. Plan dinners and optional meal-prep lunches for chosen days, people, a rough grocery budget and preferred or excluded cuisines and meal types. Reuse ingredients to reduce package leftovers. Support manual text/link import, favorites, and a broad catalog of reliably sourced recipes. Work entirely in Codex cloud with GitHub source and managed ChatGPT Sites hosting.

## Current implementation

- Hosted privately at https://whippit.sparuchuri.chatgpt.site using Sites project `appgprj_6afbfbc3347c81919bbe847e5b0dde85`. Preserve that project and its access policy.
- GitHub source is https://github.com/sparuchuri/whippit. Sites also retains a separate deployment repository. Recover the latest Sites source through its supported source workflow before editing; reconcile GitHub changes before updating either repository.
- Plain JavaScript PWA with a single Worker build, no npm dependencies. `npm test` runs planner/import validation and `npm run build` packages the app and recipe-link API.
- Weekly planner, previews, locks, swaps, pantry subtraction, editable package estimates and a grocery checklist. Prices are examples, not live store prices. Grocery estimate is whole packages, not only the cost of consumed portions.
- 48 starter recipes, including 30 original adaptations with source links. Source inclusion does not establish a verified rating, and these entries do not count toward the quality target until revalidated. Personal imported recipes are stored separately.
- Search by cuisine, ingredients and mood, favorites, and text/link import with review of servings and normalized quantities. Imported instructions open at the source. Do not publish copied publisher instructions or photography.
- Responsive design with bottom phone navigation, a modal setup sheet, readable meal cards, mood chips, large control targets and themed recipe illustrations. Existing browser data keys are preserved.
- Current persistence is browser-local. The Site's ChatGPT access gate is live, but application data sync is not implemented.

## Next work, in order

### 1. Account-backed storage and sync

Use Sites' existing ChatGPT authentication instead of adding a second OAuth system or requiring a user-managed server. Read current Sites identity and storage documentation first. Platform identity headers identify a signed-in visitor. Use the stable Site-scoped authenticated user ID as the server data owner, never a client-supplied owner ID. Keep the private Site access policy.

Provision managed D1 through the supported hosting manifest and schema migration workflow. Confirm the exact binding and migration packaging contract for the existing Worker build before changing it. Do not create tables in request handlers or invent deployment metadata.

Store weeks, personal recipe/ingredient records, favorites, and pantry/price settings. Retain a local cache for offline reads and queued edits. Version writes with optimistic concurrency. Merge independent records; show a clear conflict decision when the same record changes on two devices. Keep the prior version available until the user resolves it. Avoid silent last-write-wins for whole meal plans.

Migrate existing browser data once after identity is established, preserving custom ingredient IDs and links from weeks to personal recipes. Keep a recoverable local copy. Handle an account switch without uploading another account's cached records. Display accurate Saved locally, Syncing, Synced, Offline changes pending, and Needs review states. Retry safely with idempotent operations. Do not expose session tokens, Site credentials or publisher keys to the browser or repository.

Acceptance checks

- The same authenticated account on two isolated browser clients shares a saved dinner-and-lunch week, a checked grocery item, a favorite and a custom recipe.
- Missing identity is rejected. One user's data cannot be read or overwritten by another user. Reject unsafe cross-origin mutations and validate payload sizes and shapes.
- An offline edit survives reload and is uploaded after reconnect without duplicating recipes or losing independent remote changes.
- Concurrent updates to one week produce a reviewable conflict. Unrelated weeks and independent favorites merge without conflict.
- Signing out or switching accounts does not mix cached data. Existing browser data is migrated without losing favorites or custom ingredients.
- Native deployment succeeds and a signed-in production browser journey passes. Report any production sign-in verification limit honestly.

### 2. Maintain the mobile experience

Keep the weekly plan visible without scrolling past a long settings form. Check 320px and 390px layouts, desktop and keyboard focus. Test dialogs, close/Escape, recipe editing, day selections, swaps, favorites, grocery check-offs and copy. Inputs use 16px text to avoid iOS focus zoom. Use at least 44px touch targets. Preserve safe-area padding and reduced-motion support. Verify iPhone Safari and home-screen installation when that browser is available.

### 3. Recipe quality and breadth

A separate scheduled research task is assembling a reviewable cumulative catalog, initially at least 500 distinct recipes. Only count verified publisher ratings of at least 4.5/5 from at least 25 ratings. Prefer NYT Cooking, Serious Eats and comparable established, tested sources. Record canonical source, rating/count/check date, original servings, quantities/units, minutes, cuisine, meal-prep suitability and a short original method summary. Respect paywalls, source limits and image rights. Social media may supply leads; verify the actual published recipe. Skip unverifiable ratings or amounts and deduplicate.

The scheduled research task is `Automation_2c1d0926c9248191b1506bb589e7e9c3`. It stores a reviewable draft rather than silently publishing recipes. Only expand beyond the first 500 toward 1,200 after sync, remembered sign-in and interaction polish are shipped. Validate ingredient normalization and package arithmetic before integrating a batch. A high source rating does not transfer to an altered recipe; label adaptations accurately. Do not fabricate ratings or imply all launch recipes meet the research standard.

### 4. Optional grocery cart integration

Research official Amazon Fresh/Whole Foods capabilities before implementing. Only add a cart integration if a supported API and suitable user authorization are available. The core app remains useful with a checklist and copied list. Do not promise an integration based on an undocumented endpoint.

## Verified before the mobile design release

- Eleven automated tests pass, covering lunch portions, grocery aggregation and package rounding, pantry subtraction, theme/exclusion/lock constraints, date boundaries, source links, search, pasted-unit conversion, custom recipe scaling and the guarded link importer.
- The same build in a cloud browser was tested at desktop size and in real iframe viewports of 390px and 320px. No horizontal overflow in the main layout or recipe editor at either phone width.
- Five dinners for two plus five lunches for two form two lunch batches of six and four portions. A sampled basket contained 19 purchase lines totaling $77.28 using editable sample prices and supplied pantry items.
- Saving a plan, keeping a meal, swap preview/discard, grocery checks, mood filtering, recipe details, favorites and pasted recipe review were exercised. Existing browser data remained after upgrade and reload.
- A real public Budget Bytes URL produced an editable ingredient draft through the Worker importer in the cloud preview before the design change.
- The production Site's private sign-in gate was verified, but the test browser does not have a signed-in ChatGPT session. Detailed interaction tests used the identical build in the managed preview. This is not a claim of physical iPhone Safari or authenticated production testing.
