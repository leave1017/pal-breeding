# Pal icons

The grid looks for `assets/pals/<paldex>.webp` — zero-padded to three digits, so
Lamball (#1) is `001.webp` and Frostallion (#200) is `200.webp`.

Variant forms share their base form's Paldex number (Gumoss and Gumoss Flower are
both #12). To give a variant its own icon, add the pal's slug instead:
`gumoss-flower.webp`. The slug is the `slug` field in `data/pals.json`, and it is
checked first, so a slug file always wins over the number file.

Any Pal without a file falls back to a tile showing its Paldex number. Missing
icons never break the grid, so the set can be filled in a few at a time.

Recommended: 128×128 webp, transparent background, under ~8 KB each.

**Before adding files here:** Pal artwork belongs to Pocketpair, Inc. This site is
an unofficial fan project and says so on every page, but the decision to host game
artwork is the site owner's to make.
