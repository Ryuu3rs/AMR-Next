# All Mangas Reader

All Mangas Reader is being rebuilt as a lightweight Firefox and Chromium extension for
reading and tracking manga from supported websites.

## Current Status

The repository was cleaned and reorganized on 2026-06-09.

- Active implementation: `apps/extension/`
- Shared contracts: `packages/`
- Browser automation: `tooling/browser-tests/`
- Product and engineering plans: `docs/`
- Previous implementations: `archive/`

The current extension is an initial WXT and Svelte shell. Reader, library, source
adapter, and browser automation work follows the roadmap.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Install

```powershell
npm install
```

## Development

Chromium:

```powershell
npm run dev
```

Firefox:

```powershell
npm run dev:firefox
```

WXT launches a development browser with the extension loaded.

## Build

```powershell
npm run build
npm run build:firefox
```

Build output is generated under `apps/extension/.output/`.

## Validate

```powershell
npm run check
```

## Distribution

Releases are published through GitHub Releases.

- Chromium users download the ZIP, extract it, enable developer mode, and use
  `Load unpacked`.
- Firefox packages may be signed through Mozilla's unlisted signing flow and attached
  to GitHub Releases.
- The extension checks GitHub for available versions but never downloads or executes
  update code automatically.

## Documentation

Start with [docs/README.md](docs/README.md).

## Preservation

The complete pre-clean workspace is preserved in commit `1d032ef0` on branch
`archive/pre-clean-rewrite`.
