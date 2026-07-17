import type { LiveScope } from "../live"
import type { RuntimeRequest } from "../runtime"

// One entry per RuntimeRequest type whose handler mutates data that a live-bus
// subscriber (App.svelte's library/reader tab, reader/App.svelte) cares about.
// The dispatcher (entrypoints/background.ts) looks this up after a handler
// resolves successfully and calls publishLive(scopes, ...) automatically - see
// that file for the exact call site.
//
// A type is deliberately absent from this map (and present in READ_ONLY_TYPES
// instead) when either:
//   - it doesn't mutate anything (a genuine read), or
//   - it mutates storage that no LiveScope-driven UI reads (e.g. sync config,
//     analytics events, community profile/rank - none of "library", "chapters",
//     "progress" cover them, and inventing a scope for them would just cause
//     spurious refreshes), or
//   - the mutation it causes is already published from elsewhere, so an entry
//     here would double-publish:
//       - "page:capture" and "chapter:open-in-reader" both funnel through
//         captureChapter(), which itself calls publishLive() on success (see
//         background/capture.ts) - same for the auto-capture path in
//         entrypoints/background.ts's tabs.onUpdated listener, which doesn't
//         go through the dispatcher at all.
//       - "reader:chapters" can trigger scheduleChapterListRefresh(), which
//         publishes from background/chapter-cache.ts once its bulkPut commits.
//       - "updates:check" only kicks off checkUpdates() fire-and-forget; the
//         actual per-title mutations publish from inside that loop (see
//         handlers/updates-sources.ts).
//       - "library:link-url"'s synchronous part (linking the manga to a new
//         source/URL) is covered here with ["library"], but its fire-and-forget
//         background chapter fetch publishes manually from within the handler
//         (handlers/library.ts) since it completes after the response already
//         went out.
//   - "settings:update" specifically: settings already live under a single
//     "settings" key in storage.local, so pages watch storage.onChanged for
//     that key directly instead of going through the live bus (see
//     entrypoints/app/App.svelte and entrypoints/reader/App.svelte).
export const MUTATION_SCOPES: Partial<Record<RuntimeRequest["type"], LiveScope[]>> = {
    "library:remove": ["library"],
    "library:clear": ["all"],
    "library:clear-history": ["all"],
    "library:rate": ["library"],
    "library:manual": ["library"],
    "library:hold": ["library"],
    "library:nsfw": ["library"],
    "library:categories": ["library"],
    "library:numbers": ["library"],
    "library:dismiss": ["library"],
    "library:merge": ["library", "chapters", "progress"],
    "library:cleanup:apply": ["library", "chapters", "progress"],
    "library:relink": ["library", "chapters"],
    "library:link-url": ["library"],
    "library:switch": ["library", "chapters"],
    "library:covers:backfill": ["library"],
    "library:note": ["library"],
    "library:reading-prefs": ["library"],
    "data:import": ["all"],
    "data:seed": ["all"],
    "data:backup:restore": ["all"],
    "sync:pull": ["all"],
    "reader:progress": ["progress"],
    "bookmark:toggle": ["progress"],
    "bookmark:remove": ["progress"],
    "chapter:download": ["library"],
    "chapter:download:remove": ["library"],
    "chapter:track": ["library", "chapters"]
}

// Every RuntimeRequest type that either performs no mutation, or mutates data
// outside the live bus's scope (see the comment above MUTATION_SCOPES for why
// each of these is here rather than there). Kept as an explicit set (rather
// than "everything not in MUTATION_SCOPES") so mutation-scopes.test.ts can
// assert every type is accounted for exactly once with no gaps.
export const READ_ONLY_TYPES: ReadonlySet<RuntimeRequest["type"]> = new Set<RuntimeRequest["type"]>([
    "library:list",
    "library:get",
    "library:cleanup:scan",
    "stats:get",
    "history:list",
    "chapter:adjacent",
    "activity:get",
    "data:export",
    "data:import:preview",
    "data:backup:list",
    "sync:status",
    "sync:config",
    "sync:push",
    "manga:search",
    "manga:chapters",
    "manga:genres",
    "source:permission:check",
    "sources:list",
    "sources:ping",
    "sources:health",
    "updates:check",
    "updates:get",
    "extension-update:check",
    "updates:new-chapters",
    "page:current",
    "page:capture",
    "reader:resolve",
    "chapter:siblings",
    "analytics:record",
    "analytics:summary",
    "reader:chapters",
    "reader:progress:get",
    "bookmark:pages",
    "bookmark:list",
    "chapter:open-in-reader",
    "chapter:download:get",
    "downloads:list",
    "community:status",
    "community:register",
    "community:toggle",
    "community:sync",
    "community:rate",
    "community:manga-stats",
    "settings:get",
    "settings:update"
])
