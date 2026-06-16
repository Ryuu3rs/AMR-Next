import type { MangaRecord, SourceLinkRecord } from "@amr/contracts"
import {
    createBoundedRequestClient,
    type SourceContext,
    type SourceManga,
    type SourceSearchResult
} from "@amr/source-sdk"
import { sourceAdapters, madaraOrigins, mangaStreamOrigins, mangaBuddyOrigins } from "@amr/sources"
import type { LibraryManga } from "./database"
import { sourceOrigins } from "./permissions"

export function findSource(url: URL) {
    return sourceAdapters.find(adapter => adapter.match(url) !== "none")
}

function createSourceContext(rateLimit?: { requests: number; intervalMs: number }): SourceContext {
    const request = createBoundedRequestClient({
        fetch: (requestUrl, init) => fetch(requestUrl, init),
        allowedOrigins: [
            "https://api.mangadex.org",
            "https://www.mangaread.org",
            "https://www.mgeko.cc",
            ...madaraOrigins.map(o => o.replace(/\/\*$/, "")),
            ...mangaStreamOrigins.map(o => o.replace(/\/\*$/, "")),
            ...mangaBuddyOrigins.map(o => o.replace(/\/\*$/, ""))
        ],
        maxRequests: 20,
        maxResponseBytes: 10 * 1024 * 1024,
        timeoutMs: 20_000,
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

export async function resolveCoverFor(manga: {
    sourceId: string
    sourceMangaId?: string
    mangaUrl?: string
}): Promise<string | undefined> {
    const source = sourceAdapters.find(adapter => adapter.manifest.id === manga.sourceId)
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
    const source = sourceAdapters.find(adapter => adapter.manifest.id === manga.sourceId)
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
        throw new Error("This chapter is not supported")
    }

    return source.resolveChapter({ url: parsedUrl }, createSourceContext(source.manifest.requestRateLimit))
}

// Aggregate search across every adapter that supports it. Sources without
// granted host permission fail their origin check and are skipped (allSettled).
export async function searchManga(query: string): Promise<SourceSearchResult[]> {
    const stored = (await browser.storage.local.get("sourceHealth"))["sourceHealth"] as
        | Record<string, { alive: boolean; at: number }>
        | undefined
    const searchable = sourceAdapters.filter(adapter => {
        if (!adapter.search) return false
        const health = stored?.[adapter.manifest.id]
        return !(health && health.alive === false && Date.now() - health.at < 24 * 60 * 60 * 1000)
    })
    const settled = await Promise.allSettled(
        searchable.map(adapter => adapter.search!(query, createSourceContext(adapter.manifest.requestRateLimit)))
    )
    return settled.flatMap(result => (result.status === "fulfilled" ? result.value : []))
}

export type MangaSearchResult = SourceSearchResult

export async function getMangaChapters(mangaId: string, language = "en") {
    const params = new URLSearchParams({
        limit: "100",
        "translatedLanguage[]": language,
        "order[chapter]": "desc"
    })
    const res = await fetch(`https://api.mangadex.org/manga/${mangaId}/feed?${params}`)
    if (!res.ok) throw new Error(`MangaDex chapters failed: ${res.status}`)
    const json = (await res.json()) as {
        data: Array<{
            id: string
            attributes: { title: string | null; chapter: string | null; volume: string | null }
        }>
    }
    return json.data.map(ch => ({
        id: ch.id,
        title:
            ch.attributes.title && ch.attributes.title.trim()
                ? ch.attributes.title
                : `Chapter ${ch.attributes.chapter ?? "?"}`,
        chapter: ch.attributes.chapter ?? undefined,
        volume: ch.attributes.volume ?? undefined,
        url: `https://mangadex.org/chapter/${ch.id}`
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
    const source = sourceAdapters.find(adapter => adapter.manifest.id === sourceId)
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
    const source = sourceAdapters.find(adapter => adapter.manifest.id === sourceId)
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
    const source = sourceAdapters.find(adapter => adapter.manifest.id === link.sourceId)
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
