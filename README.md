# All Mangas Reader Or AMR Next

A lightweight, privacy-respecting Firefox and Chromium extension for reading and
tracking manga from many sources. All data lives locally in your browser; the only
network calls are to the manga sources you grant access to and (optionally) GitHub
for backup sync.

## Features

**Library & tracking**

- Track titles with read / latest chapter numbers that survive mirror domain changes
- Star ratings, **tags with one-click source-genre suggestions**, user categories with filtering, reading-history timeline
- **List and grid views** with **per-page pagination** (10/15/20/50/100 items); filter by status (unread/reading/completed/manual)
- **Grouped reading history** (by title, expandable to chapters reached)
- **Command palette (Ctrl/Cmd-K)** to jump to any tab or library title
- Detail view per title; sort by recently read / added / title / latest chapter
- Bulk actions (multi-select to categorize, mark manual, add tags, or remove)
- Duplicate detection + merge
- Manual / "Do Not Scan" titles with hand-set chapter counts (for dead or hard-to-scrape sources)
- Automatic + per-source update checks, with failures surfaced in the UI
- **Reading-time estimate** (total + this week) and **activity heatmap** showing daily chapter completion

**Sources & discovery**

- Multi-source search across every supported site at once, showing each mirror's latest hosted chapter
- **Source health indicator** (green/red/grey dots showing live/unreachable/unchecked)
- **Search skips recently-confirmed-dead sources** within 24h
- "Check mirrors" — find which supported sites carry a title, freshest first
- Re-link a title to a new source/mirror without losing progress
- Generic, config-driven adapters for the **Madara**, **MangaStream/ts**, and **MangaBuddy** WordPress theme families (adding a site is usually a config row, not new code), plus dedicated adapters for MangaDex, MangaPark, and Mgeko
- **Automatic cover fetching cached as data URLs** to bypass referer-blocking on source CDNs
- **Per-title genre suggestions** extracted from source pages (one-click bulk-add to tags)

**Reader**

- Continuous and single-page modes, LTR / RTL / vertical (webtoon) direction
- Page-fit modes, page-number overlay, configurable preload
- **Next/Prev chapter nav** resolved from the source + **mark-read-to-latest**
- **Graceful fallback:** when a source's images won't load (anti-scrape, spoiler pages, CDN blocks), open the chapter on the source site while still recording progress
- **Offline downloads** for offline reading
- Or open chapters directly in the source site in your browser (Ctrl/middle-click)

**Backup & sync**

- Human-readable JSON import/export
- Optional GitHub Gist sync (token stored locally; private gists)

## Repository layout

- `apps/extension/` — the WXT + Svelte 5 extension (MV3)
- `packages/` — shared contracts, the source SDK, and source adapters
- `tooling/` — browser tests and the source-probe triage tool
- `docs/` — architecture and development docs (see [docs/README.md](docs/README.md))
- `archive/` — previous implementations (not built)

## Installing (end users)

Download the latest release from the [Releases page](https://github.com/Ryuu3rs/AMR-Next/releases).

### Firefox

1. Download `amrextension-X.X.X-firefox.xpi`
2. Open Firefox and go to `about:addons`
3. Click the gear icon → **Install Add-on From File…**
4. Select the `.xpi` file — Firefox will prompt you to confirm
5. Open the AMR panel and grant source access when prompted

> **Note:** Unsigned extensions can only be permanently installed in Firefox Developer Edition or Nightly. In regular Firefox, the `.xpi` installs as a temporary add-on (cleared on restart) unless it has been signed by Mozilla. A signed release will be submitted to AMO once the extension is ready for public listing.

### Firefox for Android

Firefox for Android supports the same `.xpi`. Once a signed AMO listing exists, install directly from the add-on page in Firefox for Android. For local testing, use remote debugging via `about:debugging` on a connected desktop — see [docs/ANDROID.md](docs/ANDROID.md).

### Chrome / Chromium / Edge / Brave

Chrome no longer allows installing packed extensions from outside the Web Store (Google removed that in 2018). Until the extension is published on the Chrome Web Store, manual install requires developer mode:

1. Download `amrextension-X.X.X-chrome.zip` and **unzip it** to a permanent folder (don't delete it — Chrome loads it live from that folder)
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** and select the unzipped folder
5. Open the AMR panel and grant source access when prompted

> The extension stays loaded as long as the folder exists. If you move or delete the folder it will stop working — just re-load it from the new location.

---

## Requirements (developers)

- Node.js 22 or newer
- npm 11 or newer

## Install (developers)

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

## Supported sources

Built-in adapters cover:

- **MangaDex** — full API, multi-language
- **MangaPark** — chapter and series browsing
- **MangaBuddy / MangaPuma / MangaMirror** — shared theme adapter
- **Mgeko** — Mgeko and mirrors
- **Madara family** — dozens of WordPress Madara sites (config-driven)
- **MangaStream / ts family** — additional WordPress template family

Add a new site in the appropriate family by adding a single config row in `packages/sources/src/`. See [docs/architecture/SOURCE_ADAPTERS.md](docs/architecture/SOURCE_ADAPTERS.md).

## Contributing

1. Fork → branch from `main` → open a PR
2. Run `npm run check` (format + typecheck + build + tests) before submitting
3. Adapters: one file per site family, config-driven where possible
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) — releases are automated from commit messages

## Source triage

`tooling/source-probe/` probes candidate mirror sites for reachability, anti-scrape
posture (Cloudflare / Turnstile / DDoS-Guard / captcha), and CMS template, scoring
each for adapter viability:

```powershell
npm run probe -w @amr/source-probe
```

## Releases

Published as GitHub Releases with Chrome zip, Firefox `.xpi`, and a sources archive.
The extension periodically checks GitHub for newer versions but never downloads or
executes update code automatically — it only notifies you in the panel.

## Documentation

See [docs/README.md](docs/README.md) for architecture, source adapter authoring, and development guides.

## License

Licensed under the **GNU General Public License v3.0 or later** (see [LICENSE](LICENSE)).

This is a ground-up rewrite of the original All Mangas Reader and remains GPL-3.0 as a
derivative work. If you distribute a modified version, you must keep it under the GPL
and make the source available.
