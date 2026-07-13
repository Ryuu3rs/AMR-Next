import type { MangaRecord, SourceLinkRecord } from "@amr/contracts"
import {
    createBoundedRequestClient,
    type SourceContext,
    type SourceManga,
    type SourceSearchResult
} from "@amr/source-sdk"
import { sourceRegistry } from "@amr/sources"
import type { LibraryManga } from "./database"
import { SOURCE_ORIGINS, sourceOrigins } from "./permissions"

export function findSource(url: URL) {
    return sourceRegistry.match(url)
}

const wrapFetch = (requestUrl: string, init: Parameters<typeof fetch>[1]) =>
    fetch(requestUrl, init).then(r => ({ ok: r.ok, status: r.status, url: r.url, text: () => r.text() }))

function createSourceContext(rateLimit?: { requests: number; intervalMs: number }): SourceContext {
    const request = createBoundedRequestClient({
        fetch: wrapFetch,
        // Wildcard patterns (e.g. *://*.mangadex.network/*) are manifest permission
        // entries for image CDNs — not valid URLs. Strip them; only exact origins
        // are needed by the bounded request client for API/HTML fetches.
        allowedOrigins: SOURCE_ORIGINS.filter(o => !o.startsWith("*://")).map(o => o.replace(/\/\*$/, "")),
        maxRequests: 20,
        maxResponseBytes: 10 * 1024 * 1024,
        timeoutMs: 15_000,
        cacheTtlMs: 60_000,
        ...(rateLimit ? { rateLimit } : {})
    })
    return {
        request,
        now: () => Date.now(),
        logger: {
            debug: (message, details) => console.debug(`[AMR source] ${message}`, details),
            warn: (message, details) => console.warn(`[AMR source] ${message}`, details)
        }
    }
}

// Resolve the canonical sourceMangaId from a manga page URL by delegating to
// the adapter. This handles sites like MangaDex where last path segment is an
// SEO slug, not the internal ID (/title/{uuid}/{slug} → returns the UUID).
// Falls back to last path segment for adapters that fail (e.g. CF-gated sites).
export async function resolveMangaUrl(url: URL): Promise<string> {
    const source = sourceRegistry.match(url)
    if (!source) throw new Error("No adapter for this URL")
    const result = await source.resolveManga({ url }, createSourceContext(source.manifest.requestRateLimit))
    if (!result.sourceMangaId) throw new Error("Adapter returned empty sourceMangaId")
    return result.sourceMangaId
}

export async function resolveCoverFor(manga: {
    sourceId: string
    sourceMangaId?: string
    mangaUrl?: string
}): Promise<string | undefined> {
    const source = sourceRegistry.get(manga.sourceId)
    if (!source?.resolveCover) return undefined
    const input: { sourceMangaId?: string; url?: URL } = {}
    if (manga.sourceMangaId) input.sourceMangaId = manga.sourceMangaId
    if (manga.mangaUrl) {
        try {
            input.url = new URL(manga.mangaUrl)
        } catch {
            // ignore malformed stored URL
        }
    }
    if (input.sourceMangaId === undefined && input.url === undefined) return undefined
    return source.resolveCover(input, createSourceContext(source.manifest.requestRateLimit))
}

export async function resolveGenresFor(manga: {
    sourceId: string
    sourceMangaId?: string
    mangaUrl?: string
}): Promise<string[]> {
    const source = sourceRegistry.get(manga.sourceId)
    if (!source?.resolveGenres) return []
    const input: { sourceMangaId?: string; url?: URL } = {}
    if (manga.sourceMangaId) input.sourceMangaId = manga.sourceMangaId
    if (manga.mangaUrl) {
        try {
            input.url = new URL(manga.mangaUrl)
        } catch {
            // ignore malformed stored URL
        }
    }
    if (input.sourceMangaId === undefined && input.url === undefined) return []
    try {
        return await source.resolveGenres(input, createSourceContext(source.manifest.requestRateLimit))
    } catch {
        return []
    }
}

export async function resolveChapterUrl(url: string) {
    const parsedUrl = new URL(url)
    const source = findSource(parsedUrl)

    if (!source || source.match(parsedUrl) !== "chapter") {
        throw new Error(`This chapter is not supported (${parsedUrl.hostname}${parsedUrl.pathname})`)
    }

    return source.resolveChapter({ url: parsedUrl }, createSourceContext(source.manifest.requestRateLimit))
}

// Resolve a chapter using pre-fetched HTML (tab injection fallback for bot-blocked sites).
// The chapter URL is served from `html`; any secondary requests use a limited normal client.
export async function resolveChapterFromHtml(urlStr: string, html: string) {
    const parsedUrl = new URL(urlStr)
    const source = findSource(parsedUrl)
    if (!source || source.match(parsedUrl) !== "chapter") {
        throw new Error(`This chapter is not supported (${parsedUrl.hostname}${parsedUrl.pathname})`)
    }

    const fallbackClient = createBoundedRequestClient({
        fetch: wrapFetch,
        allowedOrigins: SOURCE_ORIGINS.filter(o => !o.startsWith("*://")).map(o => o.replace(/\/\*$/, "")),
        maxRequests: 5,
        maxResponseBytes: 5 * 1024 * 1024,
        timeoutMs: 15_000
    })

    const context: SourceContext = {
        request: {
            getText: async (url, opts) => {
                // Match on origin+pathname so adapters that append query params (e.g. Madara
                // appends ?style=list) still get the pre-fetched HTML instead of re-fetching.
                if (url.origin + url.pathname === parsedUrl.origin + parsedUrl.pathname) return html
                return fallbackClient.getText(url, opts)
            },
            getJson: (url, schema, opts) => fallbackClient.getJson(url, schema, opts),
            postForm: (url, params, opts) => fallbackClient.postForm(url, params, opts),
            postJson: (url, body, schema, opts) => fallbackClient.postJson(url, body, schema, opts)
        },
        now: () => Date.now(),
        logger: {
            debug: (message, details) => console.debug(`[AMR source tab] ${message}`, details),
            warn: (message, details) => console.warn(`[AMR source tab] ${message}`, details)
        }
    }

    return source.resolveChapter({ url: parsedUrl }, context)
}

// Normalize a title the same way entrypoints/app/App.svelte's normTitle does
// (lowercase, non-alphanumeric runs collapsed to a single space, trimmed) so
// matching behaves consistently between the mirror-check UI and search here.
function normTitle(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

// Some per-site adapters' own search endpoints are fuzzy/broad server-side (e.g.
// typing "best" can return titles that don't contain "best" at all). Require every
// whitespace-separated token in the normalized query to appear as a substring
// somewhere in the normalized title — plain substring/token containment, no
// fuzzy scoring or edit-distance matching.
export function matchesQuery(title: string, query: string): boolean {
    const normalizedTitle = normTitle(title)
    const tokens = normTitle(query).split(" ").filter(Boolean)
    if (tokens.length === 0) return true
    return tokens.every(token => normalizedTitle.includes(token))
}

// A result passes if the query matches the main title OR any alt title the source
// surfaced (e.g. MangaDex's Japanese/romanized alternate titles). Results without
// altTitles behave exactly as before — title-only match.
function matchesQueryWithAltTitles(result: SourceSearchResult, query: string): boolean {
    if (matchesQuery(result.title, query)) return true
    return (result.altTitles ?? []).some(altTitle => matchesQuery(altTitle, query))
}

// Aggregate search across every adapter that supports it. Sources without
// granted host permission fail their origin check and are skipped (allSettled).
// sourceHealth is intentionally NOT used here — a source can be flagged dead for
// chapter fetching but still have a working search endpoint.
export async function searchManga(query: string): Promise<SourceSearchResult[]> {
    const searchable = sourceRegistry.list().filter(adapter => !!adapter.search)
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
    const settled = await Promise.allSettled(
        searchable.map(adapter =>
            withTimeout(adapter.search!(query, createSourceContext(adapter.manifest.requestRateLimit)), 10000)
        )
    )
    return settled
        .flatMap(result => (result.status === "fulfilled" ? result.value : []))
        .filter(result => matchesQueryWithAltTitles(result, query))
}

// Streaming variant — fires all adapters concurrently and calls onPartial as each
// adapter settles, then calls onDone when all are complete. Enables progressive UI.
export function searchMangaStreaming(
    query: string,
    onPartial: (results: SourceSearchResult[], sourceId: string) => void,
    onDone: () => void
): void {
    const searchable = sourceRegistry.list().filter(adapter => !!adapter.search)
    if (searchable.length === 0) {
        onDone()
        return
    }
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
    let remaining = searchable.length
    for (const adapter of searchable) {
        withTimeout(adapter.search!(query, createSourceContext(adapter.manifest.requestRateLimit)), 10000)
            .then(results => {
                const matched = results.filter(result => matchesQueryWithAltTitles(result, query))
                if (matched.length > 0) onPartial(matched, adapter.manifest.id)
            })
            .catch(() => {})
            .finally(() => {
                if (--remaining === 0) onDone()
            })
    }
}

export type MangaSearchResult = SourceSearchResult

// Fetch MangaDex chapters for the Home search chapter-list panel.
// Routes through the bounded request client via the MangaDex adapter (fixes I3).
export async function getMangaChapters(mangaId: string, language = "en") {
    const chapters = await listChaptersBySource("mangadex", mangaId, `https://mangadex.org/title/${mangaId}`)
    const filtered = language ? chapters.filter(ch => !ch.language || ch.language === language) : chapters
    return filtered
        .sort((a, b) => b.sortKey - a.sortKey)
        .map(ch => ({
            id: ch.sourceChapterId,
            title: ch.title,
            chapter: Number.isFinite(ch.sortKey) ? String(ch.sortKey) : undefined,
            url: ch.url
        }))
}

export type MangaChapter = Awaited<ReturnType<typeof getMangaChapters>>[number]

export async function checkSourcePermission(): Promise<boolean> {
    return browser.permissions.contains({ origins: sourceOrigins() })
}

export async function requestSourcePermission(): Promise<boolean> {
    return browser.permissions.request({ origins: sourceOrigins() })
}

// List chapters from an arbitrary source/mirror for a manga already in the
// library — used to switch a title to a different mirror (G8).
export async function listChaptersForSource(
    manga: LibraryManga,
    sourceId: string,
    sourceMangaId: string,
    mangaUrl: string
) {
    const source = sourceRegistry.get(sourceId)
    if (!source) throw new Error("That source is not supported")
    const sourceManga: SourceManga = { manga, sourceId, sourceMangaId, url: mangaUrl }
    return source.listChapters(
        { manga: sourceManga, limit: 500 },
        createSourceContext(source.manifest.requestRateLimit)
    )
}

// List chapters for a source/manga that may not be in the library (used by the
// reader for prev/next navigation).
export async function listChaptersBySource(sourceId: string, sourceMangaId: string, mangaUrl: string) {
    const source = sourceRegistry.get(sourceId)
    if (!source) throw new Error("That source is not supported")
    const stub: MangaRecord = {
        id: `${sourceId}:manga:${sourceMangaId}`,
        title: sourceMangaId,
        normalizedTitle: sourceMangaId,
        authors: [],
        status: "unknown",
        addedAt: 0,
        updatedAt: 0
    }
    const sourceManga: SourceManga = { manga: stub, sourceId, sourceMangaId, url: mangaUrl }
    return source.listChapters(
        { manga: sourceManga, limit: 500 },
        createSourceContext(source.manifest.requestRateLimit)
    )
}

export async function listMangaChapters(manga: LibraryManga, link: SourceLinkRecord, language = "en") {
    const source = sourceRegistry.get(link.sourceId)
    if (!source || !link.sourceMangaId) throw new Error("The source link cannot be refreshed")
    const sourceManga: SourceManga = {
        manga,
        sourceId: link.sourceId,
        sourceMangaId: link.sourceMangaId,
        url: link.url
    }
    return source.listChapters(
        {
            manga: sourceManga,
            languages: link.language ? [link.language] : [language],
            limit: 500
        },
        createSourceContext(source.manifest.requestRateLimit)
    )
}
