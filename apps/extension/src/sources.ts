import type { SourceLinkRecord } from "@amr/contracts"
import { createBoundedRequestClient, type SourceContext, type SourceManga } from "@amr/source-sdk"
import { sourceAdapters, madaraOrigins } from "@amr/sources"
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
            ...madaraOrigins.map(o => o.replace(/\/\*$/, ""))
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

export async function resolveChapterUrl(url: string) {
    const parsedUrl = new URL(url)
    const source = findSource(parsedUrl)

    if (!source || source.match(parsedUrl) !== "chapter") {
        throw new Error("This chapter is not supported")
    }

    return source.resolveChapter({ url: parsedUrl }, createSourceContext(source.manifest.requestRateLimit))
}

export async function searchManga(query: string) {
    const params = new URLSearchParams({
        title: query,
        limit: "12",
        "includes[]": "cover_art"
    })
    const res = await fetch(`https://api.mangadex.org/manga?${params}`)
    if (!res.ok) throw new Error(`MangaDex search failed: ${res.status}`)
    const json = (await res.json()) as {
        data: Array<{
            id: string
            attributes: { title: Record<string, string>; status: string }
            relationships: Array<{ type: string; attributes?: { fileName?: string } }>
        }>
    }
    return json.data.map(m => {
        const cover = m.relationships.find(r => r.type === "cover_art")
        const fileName = cover?.attributes?.fileName
        return {
            id: m.id,
            title: m.attributes.title["en"] ?? Object.values(m.attributes.title)[0] ?? "Unknown",
            coverUrl: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : undefined,
            status: m.attributes.status
        }
    })
}

export type MangaSearchResult = Awaited<ReturnType<typeof searchManga>>[number]

export async function getMangaChapters(mangaId: string) {
    const params = new URLSearchParams({
        limit: "100",
        "translatedLanguage[]": "en",
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

export async function listMangaChapters(manga: LibraryManga, link: SourceLinkRecord) {
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
            languages: link.language ? [link.language] : ["en"],
            limit: 500
        },
        createSourceContext(source.manifest.requestRateLimit)
    )
}
