# Pal icons

The grid looks for `assets/pals/<slug>.webp`, then `assets/pals/<paldex>.webp`
zero-padded to three digits, then falls back to a tile showing the Paldex number.
Missing icons never break the grid, so a partial set is fine.

`slug` is the field of the same name in `data/pals.json` — `lamball`,
`eidrolon-ignis`, `gumoss-flower`. Slugs are unique per Pal, which the number
files are not: variants share their base form's Paldex number.

## Where these came from

All 299 are in the repo already, taken from the icon set bundled with
[Palworld Pal Editor](https://github.com/KrisCris/Palworld-Pal-Editor), whose
files are named by the game's internal codename — the same key `data/pals.json`
carries — and resized here to 128px webp (about 3.7 KB each, 1.1 MB for the set).

`scripts/fetch-icons.mjs` downloads from paldb's CDN instead, and stays as a
fallback for Pals a future patch adds. That CDN refused every request from both
this project's build environment and from GitHub Actions runners, which is why
the committed set comes from the GitHub-hosted mirror.

Two names differ between the sets: `BluePlatypus` is filed as `Blueplatypus`,
and Gumoss Flower has no icon of its own, so it uses the base form's. The
conversion falls back from `Internal_Variant` to `Internal` for that reason.

## Before you run it

Pal artwork belongs to **Pocketpair, Inc.** This site is an unofficial fan project
and says so on every page, and fan sites commonly host this artwork — but that is
tolerance, not permission, and the rights holder can ask for it to come down.
Hosting it here is a deliberate choice by the site owner, not something the build
does on its own.
