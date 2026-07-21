# AMR-Next 0.13.0

Hand-written release notes (paste into the GitHub release). The release-please
CHANGELOG lists every commit; this is the reader-facing summary.

## Data safety (read this first)

This release closes several ways your library or backups could silently lose
data. If you were on 0.12.0 or earlier, updating to 0.13.0 is strongly
recommended.

- **Upgrade no longer wipes a Firefox library.** The 0.12.0 cover migration did
  non-IndexedDB work in the middle of the upgrade transaction, which Firefox can
  abort - leaving the database stuck below its target version and the library
  unreadable. The migration now reads, decodes, then writes in one uninterrupted
  batch. A new automated cross-version upgrade test guards this in CI so a
  data-dropping migration can never ship silently again.
- **Backups no longer drop titles on restore.** An unnumbered chapter could push
  a manga's stored "latest chapter" to a non-finite sentinel that JSON turned
  into `null`, which import validation then rejected - the title vanished from a
  restored library. That whole class is closed: aggregation now filters to real
  chapter numbers, a one-time repair heals already-corrupt records on open, the
  export path strips any stray sentinel, and a database tripwire makes a
  regression fail the build instead of your backup.

## Reader

- **Fixed an endless background-tab reopen on Webtoons.** Clicking Next could
  reopen a source tab that closed and reopened without stopping until you closed
  the reader tab. A no-op chapter-list refresh no longer broadcasts an update
  event, which was feeding the loop.
- Reading stats (streaks, "today", reading days) now use your local day, so they
  match the activity heatmap instead of drifting by a day near midnight.

## Sources

- **mgeko**: search hit the wrong endpoint and returned nothing - now uses the
  site's real search path and parses results correctly.
- **mangafreak**: titles carried a " - MangaFreak" suffix; now reads the clean
  title, and the search endpoint/parsing is fixed.
- **madara sites**: chapter lists could come out in the wrong order on
  oldest-first sites - per-document order detection restored, so bonus chapters
  land in the right place.
- **fanfox**: chapter list and age gate fixed.
- Retired several dead source domains that only produced errors.

## Downloads

- A chapter download that had to re-resolve a page mid-way (expired URL) no
  longer mixes pages from two different resolutions into one saved chapter.

## Maintenance

- Repository now pins line endings and runs formatting on commit, so CI
  formatting failures stop recurring.
- All GitHub Actions moved off the deprecated Node 20 runtime; Dependabot keeps
  them current.

---

Both the Chrome (`chrome-mv3`) and Firefox (`firefox-mv3`) zips are attached, plus
`SHA256SUMS.txt`. The signed Firefox `.xpi` is attached once AMO review completes.
