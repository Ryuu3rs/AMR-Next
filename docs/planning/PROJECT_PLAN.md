# All Mangas Reader Extension Plan

Last updated: 2026-06-09

## Direction

Build a fast, local-first manga reader extension for Firefox and Chromium.

Current work excludes:

- VPS infrastructure
- hosted API
- accounts and remote sync
- public profiles
- competitive leaderboards
- Chrome Web Store publishing

Those ideas are preserved in [../future/HOSTED_PLATFORM.md](../future/HOSTED_PLATFORM.md)
but do not affect the extension architecture or schedule.

## Stack

- WXT
- Svelte 5
- strict TypeScript
- npm workspaces
- Dexie and IndexedDB
- Zod
- Vitest
- Playwright for Chromium
- WebDriver and `web-ext` for Firefox

## Product Priorities

P0:

- supported-site detection
- automatic library add on chapter visits
- add by URL
- source adapters
- continuous and single-page reader
- progress and resume
- local library
- automated Firefox and Chromium tests

P1:

- search
- scheduled chapter updates
- bookmarks
- history
- import and export
- generic site templates

P2:

- achievements
- statistics
- goals
- local share cards

## Repository

```text
apps/
  extension/
packages/
  contracts/
  source-sdk/
  sources/
  test-fixtures/
tooling/
  browser-tests/
archive/
  legacy-vue/
  parity-svelte/
  platform-prototype/
  stable-reference/
docs/
```

## Product Rules

- Reading works without an account, website, or server.
- A supported chapter visit auto-adds the manga unless disabled.
- Auto-add shows an undo action.
- Reader content opens in an extension-owned page.
- Original website DOM is not destroyed.
- Source failures are isolated.
- Generic source templates are declarative and cannot execute JavaScript.
- No global host permission is requested at install time.
- No remote executable code is permitted.

## Distribution

GitHub Releases is the only active distribution target.

Chromium:

- publish a ZIP containing the unpacked extension
- users extract it and choose `Load unpacked`
- in-extension release check links to the newest GitHub Release

Firefox:

- build an XPI
- use Mozilla unlisted signing when required for normal Firefox installation
- attach the signed XPI to the GitHub Release
- in-extension release check links to the newest GitHub Release

There is no custom code updater.

## Delivery

### Stage 0: Workspace

- preserve previous work
- archive old tracks
- create WXT extension
- create shared packages
- add strict checks

### Stage 1: Reader Slice

- MangaDex adapter
- chapter detection
- auto-add
- reader
- progress
- browser restart and resume tests

### Stage 2: Local Product

- library
- search
- updates
- source permissions
- settings
- import and export

### Stage 3: Source Coverage

- representative HTML, API, CMS, and local-server adapters
- generic source wizard
- source health automation

### Stage 4: Local Fun Features

- history
- achievements
- statistics
- goals
- share cards

## Acceptance Criteria

- Firefox and Chromium builds come from the same source.
- Automated tests install and inspect both browser packages.
- Failed tests produce logs, screenshots, traces, and redacted storage.
- Reading and progress never depend on a server.
- One broken adapter cannot break other sources.
- Production bundles contain no legacy framework code.
- GitHub release artifacts are reproducible from a tag.
