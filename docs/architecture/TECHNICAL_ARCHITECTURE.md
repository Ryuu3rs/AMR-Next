# AMR Technical Architecture

Last updated: 2026-06-09

## Scope

This architecture covers the local Firefox and Chromium extension only. Hosted
services are deferred.

## Entry Points

WXT generates browser-specific manifests and bundles:

- background worker
- popup
- full application page
- reader page
- source-aware content scripts

The extension uses Manifest V3. Firefox-specific manifest values are generated only for
Firefox builds.

## Modules

### Domain

- manga
- source links
- chapters
- pages
- progress
- bookmarks
- history
- achievements
- source health

Domain code imports no browser or Svelte APIs.

### Application Services

- `LibraryService`
- `SearchService`
- `ReaderService`
- `UpdateService`
- `HistoryService`
- `AchievementService`
- `DiagnosticsService`

Services depend on repository and source adapter interfaces.

### Platform

- browser API wrapper
- permissions
- alarms
- tabs
- runtime messages
- content script registration
- declarative network rules
- notifications
- GitHub release check

### UI

- popup
- application shell
- library
- search
- updates
- achievements
- sources
- settings
- reader

Svelte components call application services. They do not call IndexedDB or third-party
sites directly.

## Source SDK

```ts
interface SourceAdapter {
    manifest: SourceManifest
    match(url: URL): SourcePageMatch
    search(input: SearchInput, context: SourceContext): Promise<SearchResult[]>
    resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga>
    listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]>
    resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter>
}
```

`SourceManifest` contains:

- stable ID
- display name
- domains
- languages
- capabilities
- request rate limit
- optional permissions
- optional reviewed network rules
- fixture version

`SourceContext` provides:

- bounded request client
- HTML parser
- JSON validator
- safe script-literal parser
- clock
- logger
- optional current-page snapshot

Adapters cannot access storage, Svelte state, runtime messages, or arbitrary browser
APIs.

## Generic Source Templates

Generic templates are declarative:

- domains
- CSS selectors
- text or allowed attribute extraction
- URL resolution
- chapter ordering
- pagination selector
- language

Templates cannot include JavaScript, executable expressions, unrestricted headers,
cookie access, or remote code.

## Page Detection

1. Background receives a tab URL.
2. Source registry checks domain and URL patterns.
3. Unmatched tabs receive no content script.
4. Matched tabs receive a minimal source detector.
5. Confirmed manga or chapter metadata is resolved.
6. Chapter visits upsert the local library when auto-add is enabled.
7. Reader opens as an extension-owned page.

The original website DOM remains intact.

## Storage

Dexie tables:

- `manga`
- `sourceLinks`
- `chapters`
- `progress`
- `bookmarks`
- `historyEvents`
- `achievementState`
- `updateJobs`
- `sourceHealth`
- `migrationState`

Preferences use `browser.storage.local`.

Rules:

- normalized records only
- no framework proxies
- no image DOM objects
- no raw HTML persistence
- no full chapter list embedded inside a manga record
- versioned migrations
- versioned import and export envelopes

## Runtime Messages

Message areas:

- `app:*`
- `library:*`
- `source:*`
- `reader:*`
- `updates:*`
- `diagnostics:*`

Every request has:

- schema version
- request ID
- validated payload
- validated sender
- typed success or error response

There is no generic dispatcher that executes arbitrary method names.

## Request Client

Features:

- abort signal
- timeout
- source rate limit
- bounded retry with jitter
- response size limit
- MIME validation
- redirect limit
- structured timing
- redacted diagnostics

Default limits:

- metadata timeout: 15 seconds
- image resolution timeout: 20 seconds
- transient retries: two
- HTML response: 5 MB
- JSON response: 10 MB

## Reader Pipeline

- adapter returns final page descriptors
- current page is prioritized
- continuous mode loads viewport plus lookahead
- default concurrency is four
- errors retry independently
- object URLs are revoked
- decoded images outside the retention window are released
- progress uses intersection observation

Custom image headers require reviewed declarative network rules or a controlled
extension fetch path.

## Update Scheduler

- browser alarm starts a bounded update window
- work is grouped by source
- source rate limits apply
- recently checked records are skipped
- failures back off
- each run has manga and duration budgets
- unfinished work resumes on a later alarm

There is no permanent background loop.

## Achievements

Local events:

- manga added
- chapter started
- page changed
- chapter completed
- status changed
- bookmark added
- reading day completed

Definitions contain:

- ID
- title
- description
- icon
- points
- hidden state
- progress reducer
- unlock predicate
- version

Achievement data remains local.

## GitHub Release Check

The extension may request the latest GitHub Release metadata:

- tag
- release URL
- publication date
- release notes summary

The response is validated and cached. The extension may notify the user and open the
release page. It never downloads, installs, or executes release code.

## Boundaries

- Svelte components do not fetch source sites.
- source adapters do not call extension APIs.
- repositories do not contain UI state.
- background code does not contain parsing logic.
- archive code is never imported by active packages.
