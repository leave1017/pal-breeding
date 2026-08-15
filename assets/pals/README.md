# Pal icons

The grid looks for `assets/pals/<slug>.webp`, then `assets/pals/<paldex>.webp`
zero-padded to three digits, then falls back to a tile showing the Paldex number.
Missing icons never break the grid, so a partial set is fine.

`slug` is the field of the same name in `data/pals.json` — `lamball`,
`eidrolon-ignis`, `gumoss-flower`. Slugs are unique per Pal, which the number
files are not: variants share their base form's Paldex number.

## Filling this folder

```bash
node scripts/fetch-icons.mjs          # downloads what is missing
node scripts/fetch-icons.mjs --force  # re-downloads everything
```

The script reads icon URLs from the same dataset the element data comes from and
saves the images here. Files are committed to the repo rather than hot-linked, so
the site does not depend on — or spend — another site's bandwidth. Re-running it
only fetches what is absent, so an interrupted run just needs running again.

## Before you run it

Pal artwork belongs to **Pocketpair, Inc.** This site is an unofficial fan project
and says so on every page, and fan sites commonly host this artwork — but that is
tolerance, not permission, and the rights holder can ask for it to come down.
Hosting it here is a deliberate choice by the site owner, not something the build
does on its own.
