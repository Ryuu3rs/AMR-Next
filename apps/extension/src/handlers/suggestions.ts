import { db, type LibraryManga } from "../database"
import { anilistProvider } from "../metadata/anilist"
import type { RecCandidate } from "../metadata/recommendations"
import { scoreSuggestions, type CommunityRec, type Suggestion } from "../suggestions"
import { communityConfigured, getCommunityProfile } from "../community"
import type { HandlerMap } from "../background/handler-types"

const SUGGESTIONS_KEY = "suggestions"

// Stale-while-revalidate window: a fresh cache is returned as-is, an older one is
// recomputed on the next request (or immediately when force is set).
const STALE_MS = 6 * 60 * 60 * 1000

// Bounds the AniList fan-out: one recommendations query per seed title, run one at a
// time. The provider rate-limits internally; capping the seed set keeps a large library
// from queuing dozens of calls per refresh.
const MAX_SEED_TITLES = 60

// Upper bound on how many suggestions are surfaced/cached at once. Kept generous so the
// Discover grid has real depth to lazy-load through; the podium takes the top 3 and the
// rest paginate.
const MAX_SUGGESTIONS = 120

type SuggestionsCache = {
    suggestions: Suggestion[]
    updatedAt: number
}

async function getSuggestionsCache(): Promise<SuggestionsCache | null> {
    const stored = await browser.storage.local.get(SUGGESTIONS_KEY)
    return (stored[SUGGESTIONS_KEY] as SuggestionsCache | undefined) ?? null
}

async function setSuggestionsCache(cache: SuggestionsCache): Promise<void> {
    await browser.storage.local.set({ [SUGGESTIONS_KEY]: cache })
}

// Per-seed AniList recommendations cache. AniList "readers also liked" lists are very
// stable, so caching each seed's recs for two weeks means a recompute (a Discover open, a
// mark-as-read, a background revalidate) only calls AniList for seeds it hasn't seen or that
// have expired - instead of re-fetching every seed every time. This is the difference
// between ~60 AniList requests per recompute and ~0 once warm.
const REC_CACHE_KEY = "anilistRecCache"
const REC_CACHE_TTL = 14 * 24 * 60 * 60 * 1000
const REC_CACHE_MAX = 300

type RecCacheEntry = { recs: RecCandidate[]; fetchedAt: number }
type RecCache = Record<string, RecCacheEntry>

async function getRecCache(): Promise<RecCache> {
    const stored = await browser.storage.local.get(REC_CACHE_KEY)
    const raw = stored[REC_CACHE_KEY] as RecCache | undefined
    return raw && typeof raw === "object" ? raw : {}
}

async function setRecCache(cache: RecCache): Promise<void> {
    let toStore = cache
    const keys = Object.keys(cache)
    if (keys.length > REC_CACHE_MAX) {
        // Keep the most-recently-fetched entries; drop the oldest.
        const kept = Object.entries(cache)
            .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
            .slice(0, REC_CACHE_MAX)
        toStore = Object.fromEntries(kept)
    }
    try {
        await browser.storage.local.set({ [REC_CACHE_KEY]: toStore })
    } catch (error) {
        console.warn("[AMR] AniList rec cache write failed", error)
    }
}

// Owned titles carrying an anilistId, deduped to the most recently read entry per id
// and capped to the most-recent MAX_SEED_TITLES so the fan-out stays bounded.
function selectSeedTitles(library: LibraryManga[]): LibraryManga[] {
    const byAnilistId = new Map<number, LibraryManga>()
    for (const manga of library) {
        if (typeof manga.anilistId !== "number") continue
        const existing = byAnilistId.get(manga.anilistId)
        if (!existing || (manga.lastReadAt ?? 0) > (existing.lastReadAt ?? 0)) {
            byAnilistId.set(manga.anilistId, manga)
        }
    }
    return [...byAnilistId.values()].sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)).slice(0, MAX_SEED_TITLES)
}

// Community co-read picks fold into the engine only when the profile is opted in and
// carries recs; otherwise suggestions degrade to the content-based signal.
async function loadCommunityRecs(): Promise<CommunityRec[] | undefined> {
    if (!communityConfigured) return undefined
    const profile = await getCommunityProfile()
    if (!profile.enabled) return undefined
    const recs = profile.recommendations ?? []
    if (recs.length === 0) return undefined
    return recs.map(rec => ({ title: rec.title, sourceId: rec.sourceId }))
}

async function computeSuggestions(): Promise<Suggestion[]> {
    const library = await db.manga.toArray()
    const seeds = selectSeedTitles(library)

    const anilistRecs = new Map<number, RecCandidate[]>()
    const fetchRecs = anilistProvider.getRecommendations?.bind(anilistProvider)
    if (fetchRecs) {
        const recCache = await getRecCache()
        const now = Date.now()
        let cacheDirty = false
        for (const seed of seeds) {
            const anilistId = seed.anilistId
            if (typeof anilistId !== "number" || anilistRecs.has(anilistId)) continue
            const cached = recCache[anilistId]
            if (cached && now - cached.fetchedAt < REC_CACHE_TTL) {
                // Fresh cache hit - no AniList call. (Empty recs are cached too, so a
                // no-recommendation title isn't re-fetched on every recompute.)
                if (cached.recs.length > 0) anilistRecs.set(anilistId, cached.recs)
                continue
            }
            const recs = await fetchRecs(anilistId)
            recCache[anilistId] = { recs, fetchedAt: now }
            cacheDirty = true
            if (recs.length > 0) anilistRecs.set(anilistId, recs)
        }
        if (cacheDirty) await setRecCache(recCache)
    }

    const communityRecs = await loadCommunityRecs()
    // Cap the surfaced list - a large library can aggregate 100+ candidates, which is slow
    // to render and more than anyone browses. The top slice by score is what matters.
    return scoreSuggestions({
        library,
        anilistRecs,
        ...(communityRecs ? { communityRecs } : {})
    }).slice(0, MAX_SUGGESTIONS)
}

// Shared across concurrent suggestions:get calls so the AniList fan-out runs once, not
// once per request (two popup/tab contexts or an alarm + a popup all hit the same SW).
let inflightCompute: Promise<Suggestion[]> | null = null

async function computeAndCache(prevCache: SuggestionsCache | null): Promise<Suggestion[]> {
    const suggestions = await computeSuggestions()
    // A recompute that yields nothing (AniList unreachable, no anilistId titles) must not
    // overwrite a good cache - fall back to it instead.
    if (suggestions.length === 0 && prevCache) return prevCache.suggestions
    try {
        await setSuggestionsCache({ suggestions, updatedAt: Date.now() })
    } catch (error) {
        // A persist failure (quota/IO) must not throw away a good in-hand result.
        console.warn("[AMR] Suggestions cache write failed", error)
    }
    return suggestions
}

export const suggestionsHandlers: HandlerMap = {
    "suggestions:get": async request => {
        let cache: SuggestionsCache | null = null
        try {
            // Inside the try so a cache-read failure degrades to [] like any other failure
            // instead of rejecting (the never-throw contract this handler advertises).
            cache = await getSuggestionsCache()
            if (cache && Date.now() - cache.updatedAt < STALE_MS && !request.force) {
                return cache.suggestions
            }

            // A force must always run a FRESH compute reflecting the current library. If a
            // non-force background revalidate is in flight it was computed from the PRE-change
            // snapshot, so force starts (and adopts) a new compute rather than reusing it. The
            // .finally guard only nulls out the promise that is still current, so a stale
            // revalidate resolving later can't clobber a newer inflight compute.
            if (!inflightCompute || request.force) {
                const thisPromise = computeAndCache(cache).finally(() => {
                    if (inflightCompute === thisPromise) inflightCompute = null
                })
                inflightCompute = thisPromise
            }
            // Stale-while-revalidate: if we hold ANY cached list and the caller didn't
            // force a refresh, return it instantly and let the (slow, AniList-rate-limited)
            // recompute finish in the background - the fresh list is served on the next
            // request. Only a cold start (no cache) or an explicit force waits for it.
            if (cache && !request.force) {
                void inflightCompute.catch(() => {})
                return cache.suggestions
            }
            return await inflightCompute
        } catch (error) {
            console.warn("[AMR] Suggestions computation failed", error)
            return cache?.suggestions ?? []
        }
    }
}
