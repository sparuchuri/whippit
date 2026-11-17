# WhippIt publisher recipe research

This dataset is user-directed metadata research for the WhippIt meal planner. It contains factual recipe metadata and ingredient lists from publicly readable publisher pages. It does not contain publisher cooking instructions, introductions, comments, review text, or article prose. Cooking directions remain on the publisher's canonical page.

## Source fields

- `name`: publisher recipe title, HTML entities decoded.
- `source.label`, `source.url`, `canonicalURL`, `publisher`: attribution and canonical source.
- `source.rating`, `rating`, `ratingScale`, `ratingCount`: the recipe's aggregate publisher score and rating count, normalized to a five-point scale. Individual review scores are not used.
- `source.accessedAt`: UTC retrieval time.
- `originalYield`: original publisher yield text. `servings` is its first numeric value; `yieldRequiresReview` marks ambiguous units or ranges.
- `minutes`, `prepMinutes`, `cookMinutes`, `timeSource`: publisher durations, with total time preferred. No cooking-time defaults are invented.
- `items`: exact ingredient facts from publisher Recipe JSON-LD, with markup/entities removed. Quantities are not changed or converted here.
- `cuisine`, `category`, `keywords`: publisher labels.
- `image`: one publisher image URL for linked browsing cards, where provided. Images are not downloaded.
- `author`: publisher recipe author, when present.
- `use`: a conservative browsing suggestion, not a food-storage guarantee.
- `steps`: deliberately empty; link to source for preparation.
- `requiresGroceryReview`: always true. Raw source ingredients must be normalized/reviewed before automatic grocery math.

## Inclusion and quality

The harvesting threshold is at least 4.5/5 with at least 25 publisher ratings, a readable ingredient list, a numeric yield, and a published total duration or prep/cook durations. URLs are drawn from publishers' own public sitemaps. Recipe metadata is parsed from the publisher's own Recipe JSON-LD. Candidate URLs favor dinners, substantial lunches, soups, stews, pasta, noodles, rice dishes, and main proteins. Desserts, drinks, condiments, snacks and clearly marked sides are excluded. Final meal-category auditing and canonical-link deduplication follow extraction.

No blocked or paywalled page is bypassed. Serious Eats' detailed sitemap returned HTTP 402, so it was not harvested. NYT Cooking was not used for bulk extraction without confirmed public access. These brands remain valid sources for individually supplied links or authorized access in the app.

The fetch log records each attempted URL and its outcome. Checkpoints are cumulative. Unknown ratings, yields, ingredient lists, and times are skipped rather than fabricated. Ingredient mapping ambiguity is preserved for the app to show explicitly.

## Publisher-quality context

- RecipeTin Eats describes its recipes as tried and tested and focuses on practical everyday ingredients: https://www.recipetineats.com/nagi-recipetin-eats/ .
- The Woks of Life is a family-authored Chinese cooking publication with restaurant cooking experience and published cookbooks: https://thewoksoflife.com/about/ .
- Love & Lemons states each site recipe is developed and tested repeatedly in the author's home kitchen: https://www.loveandlemons.com/jeanine-donofrio/ .

Publisher ratings are community ratings, not independent lab scores. The verified label means the metadata was retrieved from the publisher and passed the stated threshold; it does not mean WhippIt personally cooked the recipe.


### November 17 publisher additions
Serious Eats: 3-Ingredient Stovetop Mac and Cheese (4.6/60 ratings), Easy One-Pot Chicken Tinga (4.7/28), checked on publisher pages. Chicken and Chickpea Masala was excluded (4.1/44).
NYT Cooking: Oven-Roasted Chicken Shawarma and Chana Masala. Original pages could not be retrieved; rating and ingredient metadata from the public Chive listings recorded in each record's ratingEvidenceUrl. These are explicitly secondary, not directly verified publisher ratings. Shawarma's secondary yield is suspect and requires original-source review. No publisher directions or images copied. Ingredient lists are condensed factual grocery metadata.
