# All Mangas Reader Or AMR Next

A lightweight, privacy-respecting Firefox and Chromium extension for reading and
tracking manga from many sources. All data lives locally in your browser; the only
network calls are to the manga sources you grant access to and (optionally) GitHub
for backup sync.

## Features

**Library & tracking**

- Track titles with read / latest chapter numbers that survive mirror domain changes
- Star ratings, user categories with filtering, reading-history timeline
- Detail view per title; sort by recently read / added / title / latest chapter
- Bulk actions (multi-select to categorize, mark manual, or remove)
- Duplicate detection + merge
- Manual / "Do Not Scan" titles with hand-set chapter counts (for dead or
  hard-to-scrape sources)
- Automatic + per-source update checks, with failures surfaced in the UI

**Sources & discovery**

- Multi-source search across every supported site at once, showing each mirror's
  latest hosted chapter
- "Check mirrors" — find which supported sites carry a title, freshest first
- Re-link a title to a new source/mirror without losing progress
- Generic, config-driven adapters for the **Madara** and **MangaStream/ts** WordPress
  theme families (adding a site in either is usually a config row, not new code),
  plus dedicated MangaDex and Mgeko adapters
- Automatic cover fetching with graceful fallback

**Reader**

- Continuous and single-page modes, LTR / RTL / vertical (webtoon) direction
- Page-fit modes, page-number overlay, configurable preload
- Or open chapters directly in the source site in your browser (Ctrl/middle-click)

**Backup & sync**

- Human-readable JSON import/export
- Optional GitHub Gist sync (token stored locally; private gists)

## Repository layout

- `apps/extension/` — the WXT + Svelte 5 extension (MV3)
- `packages/` — shared contracts, the source SDK, and source adapters
- `tooling/` — browser tests and the source-probe triage tool
- `docs/` — product and engineering plans (see `docs/planning/AUDIT_AND_RELEASE_PLAN.md`)
- `archive/` — previous implementations (not built)

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Install

```powershell
npm install
```

## Development

```powershell
npm run dev          # Chromium
npm run dev:firefox  # Firefox
```

WXT launches a development browser with the extension loaded and hot-reload.

## Build

```powershell
npm run build
npm run build:firefox
```

Build output is generated under `apps/extension/.output/`.

## Validate

```powershell
npm run check        # format, typecheck, build (both), then tests
```

## Loading a build manually

- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  pick any file in `apps/extension/.output/firefox-mv3/`.
- **Chromium:** `chrome://extensions` → enable Developer mode → Load unpacked →
  `apps/extension/.output/chrome-mv3/`.

After loading, open the extension and grant source access so it can fetch from the
manga sites you use.

### Android (Firefox)

Firefox for Android supports extensions, and the same `firefox-mv3` build runs there
unchanged. The cleanest path is installing the **AMO-signed `.xpi`** once published:
open the AMO listing (or a Firefox Add-on Collection containing it) in Firefox for
Android and tap **Add to Firefox**. After install, open the dashboard and grant source
access so it can fetch from the manga sites you read.

For an unsigned local build you must use remote debugging: enable USB debugging on the
phone, connect it to a desktop, and use `about:debugging` → **This Firefox** → **Load
Temporary Add-on** targeting the connected device. Temporary add-ons are cleared when
Firefox restarts, so the signed XPI is the only persistent option. See
[docs/ANDROID.md](docs/ANDROID.md) for install options, limitations, and a test checklist.

## Source triage

`tooling/source-probe/` probes candidate mirror sites for reachability, anti-scrape
posture (Cloudflare / Turnstile / DDoS-Guard / captcha), and CMS template, scoring
each for adapter viability:

```powershell
npm run probe -w @amr/source-probe
```

## Releases

Releases are automated with release-please and published as GitHub Releases with
Chromium/Firefox zips and SHA-256 checksums. The extension can check GitHub for a
newer version but never downloads or executes update code automatically.

## Documentation

Start with [docs/README.md](docs/README.md). The living roadmap and feature status
is in [docs/planning/AUDIT_AND_RELEASE_PLAN.md](docs/planning/AUDIT_AND_RELEASE_PLAN.md).

## License

Licensed under the **GNU General Public License v3.0 or later** (see [LICENSE](LICENSE)).

This is a ground-up rewrite of the original All Mangas Reader and remains GPL-3.0 as a
derivative work. If you distribute a modified version, you must keep it under the GPL
and make the source available.
