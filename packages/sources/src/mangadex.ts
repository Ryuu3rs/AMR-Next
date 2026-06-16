import {
    SourceError,
    matchesSourceDomain,
    type ListChaptersInput,
    type ResolveChapterInput,
    type ResolveMangaInput,
    type ResolvedChapter,
    type SourceAdapter,
    type SourceChapter,
    type SourceContext,
    type SourceManga,
    type SourcePageMatch,
    type SourceSearchResult
} from "@amr/source-sdk"
import { z } from "zod"

const SOURCE_ID = "mangadex"
const API_ORIGIN = "https://api.mangadex.org"
const WEB_ORIGIN = "https://mangadex.org"
const UPLOADS_ORIGIN = "https://uploads.mangadex.org"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_CHAPTERS = 500
const PAGE_SIZE = 100

const localizedStringsSchema = z.record(z.string(), z.string())
const relationshipSchema = z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.string(), z.unknown()).optional()
})
const mangaSchema = z.object({
    id: z.string(),
    type: z.literal("manga"),
    attributes: z.object({
        title: localizedStringsSchema,
        altTitles: z.array(localizedStringsSchema).optional(),
        status: z.enum(["ongoing", "completed", "hiatus", "cancelled"]).optional(),
        lastChapter: z.string().nullish(),
        createdAt: z.string(),
        updatedAt: z.string(),
        tags: z
            .array(
                z.object({
                    attributes: z.object({ name: localizedStringsSchema }).optional()
                })
            )
            .optional()
    }),
    relationships: z.array(relationshipSchema).optional()
})
const mangaResponseSchema = z.object({
    result: z.literal("ok"),
    data: mangaSchema
})
const mangaListSchema = z.object({
    result: z.literal("ok"),
    data: z.array(mangaSchema)
})
const chapterSchema = z.object({
    id: z.string(),
    type: z.literal("chapter"),
    attributes: z.object({
        chapter: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        translatedLanguage: z.string(),
        publishAt: z.string().optional(),
        readableAt: z.string().optional()
    }),
    relationships: z.array(relationshipSchema).optional()
})
const chapterResponseSchema = z.object({
    result: z.literal("ok"),
    data: chapterSchema
})
const chapterFeedSchema = z.object({
    result: z.literal("ok"),
    data: z.array(chapterSchema),
    limit: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
})
const atHomeSchema = z.object({
    result: z.literal("ok"),
    baseUrl: z.string().url(),
    chapter: z.object({
        hash: z.string().min(1),
        data: z.array(z.string().min(1))
    })
})

function extractId(url: URL, kind: "chapter" | "title"): string | undefined {
    if (!matchesSourceDomain(url.hostname, ["mangadex.org", "www.mangadex.org"])) {
        return undefined
    }

    const segments = url.pathname.split("/").filter(Boolean)
    const kindIndex = segments.indexOf(kind)
    const id = kindIndex === -1 ? undefined : segments[kindIndex + 1]
    return id !== undefined && UUID_PATTERN.test(id) ? id.toLowerCase() : undefined
}

function requireInputId(
    input: { url: URL | undefined; sourceId: string | undefined },
    kind: "chapter" | "title"
): string {
    const id = input.url === undefined ? input.sourceId : extractId(input.url, kind)
    const normalized = id?.replace(new RegExp(`^${SOURCE_ID}:(?:manga|chapter):`), "").toLowerCase()

    if (normalized === undefined || !UUID_PATTERN.test(normalized)) {
        throw new SourceError(
            input.url === undefined ? "invalid-input" : "unsupported-url",
            `A valid MangaDex ${kind === "title" ? "manga" : kind} ID or URL is required`
        )
    }
    return normalized
}

function pickLocalized(values: Record<string, string>, languages: readonly string[] = ["en"]): string {
    for (const language of languages) {
        const value = values[language]?.trim()
        if (value) {
            return value
        }
    }
    return (
        Object.keys(values)
            .sort()
            .map(key => values[key]?.trim())
            .find(Boolean) ?? ""
    )
}

function timestamp(value: string, fallback: number): number {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? fallback : parsed
}

function normalizeTitle(title: string): string {
    return title.trim().toLocaleLowerCase("en").replace(/\s+/g, " ")
}

function mangaUrl(id: string): string {
    return `${WEB_ORIGIN}/title/${id}`
}

function chapterUrl(id: string): string {
    return `${WEB_ORIGIN}/chapter/${id}`
}

function mapManga(data: z.infer<typeof mangaSchema>, now: number): SourceManga {
    const title = pickLocalized(data.attributes.title)
    if (!title) {
        throw new SourceError("invalid-response", `MangaDex manga ${data.id} has no title`)
    }

    const cover = data.relationships?.find(relationship => relationship.type === "cover_art")
    const fileName = cover?.attributes?.["fileName"]
    const coverUrl =
        typeof fileName === "string"
            ? `${UPLOADS_ORIGIN}/covers/${data.id}/${encodeURIComponent(fileName)}.256.jpg`
            : undefined

    return {
        manga: {
            id: `${SOURCE_ID}:manga:${data.id}`,
            title,
            normalizedTitle: normalizeTitle(title),
            ...(coverUrl === undefined ? {} : { coverUrl }),
            authors: [],
            status: data.attributes.status ?? "unknown",
            addedAt: timestamp(data.attributes.createdAt, now),
            updatedAt: timestamp(data.attributes.updatedAt, now)
        },
        sourceId: SOURCE_ID,
        sourceMangaId: data.id,
        url: mangaUrl(data.id)
    }
}

function chapterSortKey(chapter: string | null | undefined): number {
    if (!chapter) {
        return 0
    }
    const parsed = Number.parseFloat(chapter)
    return Number.isFinite(parsed) ? parsed : 0
}

function mapChapter(data: z.infer<typeof chapterSchema>, mangaId: string): SourceChapter {
    const number = data.attributes.chapter?.trim()
    const subtitle = data.attributes.title?.trim()
    const title = [number ? `Chapter ${number}` : "Oneshot", subtitle].filter(Boolean).join(": ")

    return {
        id: `${SOURCE_ID}:chapter:${data.id}`,
        mangaId: `${SOURCE_ID}:manga:${mangaId}`,
        sourceId: SOURCE_ID,
        sourceChapterId: data.id,
        title,
        url: chapterUrl(data.id),
        sortKey: chapterSortKey(number),
        language: data.attributes.translatedLanguage
    }
}

async function fetchManga(id: string, context: SourceContext): Promise<SourceManga> {
    const url = new URL(`/manga/${id}`, API_ORIGIN)
    url.searchParams.append("includes[]", "cover_art")
    const response = await context.request.getJson(url, mangaResponseSchema)
    return mapManga(response.data, context.now())
}

async function fetchChapter(id: string, context: SourceContext): Promise<z.infer<typeof chapterSchema>> {
    const response = await context.request.getJson(new URL(`/chapter/${id}`, API_ORIGIN), chapterResponseSchema)
    return response.data
}

function relatedMangaId(chapter: z.infer<typeof chapterSchema>): string {
    const mangaId = chapter.relationships?.find(relationship => relationship.type === "manga")?.id
    if (mangaId === undefined || !UUID_PATTERN.test(mangaId)) {
        throw new SourceError("invalid-response", `MangaDex chapter ${chapter.id} has no valid manga relationship`)
    }
    return mangaId.toLowerCase()
}

export const mangadexAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaDex",
        domains: ["mangadex.org", "www.mangadex.org"],
        languages: ["*"],
        capabilities: ["manga", "chapters", "pages"],
        requestRateLimit: {
            requests: 5,
            intervalMs: 1000
        },
        fixtureVersion: 1
    },

    match(url: URL): SourcePageMatch {
        if (extractId(url, "chapter") !== undefined) {
            return "chapter"
        }
        if (extractId(url, "title") !== undefined) {
            return "manga"
        }
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const id = requireInputId({ url: input.url, sourceId: input.sourceMangaId }, "title")
        return fetchManga(id, context)
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const id = input.sourceMangaId ?? (input.url ? extractId(input.url, "title") : undefined)
        if (!id) return undefined
        const manga = await fetchManga(id, context)
        return manga.manga.coverUrl
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        try {
            const id = input.sourceMangaId ?? (input.url ? extractId(input.url, "title") : undefined)
            if (!id) return []
            const url = new URL(`/manga/${id}`, API_ORIGIN)
            url.searchParams.append("includes[]", "cover_art")
            const response = await context.request.getJson(url, mangaResponseSchema)
            const names = (response.data.attributes.tags ?? [])
                .map(tag => (tag.attributes ? pickLocalized(tag.attributes.name) : ""))
                .map(name => name.trim())
                .filter(Boolean)
            return [...new Set(names)].slice(0, 15)
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        const url = new URL("/manga", API_ORIGIN)
        url.searchParams.set("title", query)
        url.searchParams.set("limit", "12")
        url.searchParams.append("includes[]", "cover_art")
        url.searchParams.append("order[relevance]", "desc")
        const response = await context.request.getJson(url, mangaListSchema)
        return response.data.map(item => {
            const cover = item.relationships?.find(r => r.type === "cover_art")
            const fileName = cover?.attributes?.["fileName"]
            const coverUrl =
                typeof fileName === "string"
                    ? `${UPLOADS_ORIGIN}/covers/${item.id}/${encodeURIComponent(fileName)}.256.jpg`
                    : undefined
            const lastChapter = item.attributes.lastChapter
            return {
                sourceId: SOURCE_ID,
                sourceMangaId: item.id,
                title: pickLocalized(item.attributes.title) ?? "Unknown",
                url: mangaUrl(item.id),
                ...(coverUrl ? { coverUrl } : {}),
                ...(lastChapter ? { latestChapter: lastChapter } : {})
            }
        })
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        if (input.manga.sourceId !== SOURCE_ID || !UUID_PATTERN.test(input.manga.sourceMangaId)) {
            throw new SourceError("invalid-input", "The manga does not belong to MangaDex")
        }

        const requestedLimit = Math.min(Math.max(input.limit ?? MAX_CHAPTERS, 1), MAX_CHAPTERS)
        const chapters: SourceChapter[] = []

        while (chapters.length < requestedLimit) {
            const pageLimit = Math.min(PAGE_SIZE, requestedLimit - chapters.length)
            const url = new URL(`/manga/${input.manga.sourceMangaId}/feed`, API_ORIGIN)
            url.searchParams.set("limit", String(pageLimit))
            url.searchParams.set("offset", String(chapters.length))
            url.searchParams.set("order[chapter]", "asc")
            for (const language of input.languages ?? []) {
                url.searchParams.append("translatedLanguage[]", language)
            }

            const response = await context.request.getJson(url, chapterFeedSchema)
            chapters.push(...response.data.map(chapter => mapChapter(chapter, input.manga.sourceMangaId)))

            if (response.data.length === 0 || response.offset + response.data.length >= response.total) {
                break
            }
        }

        return chapters.slice(0, requestedLimit)
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        const id = requireInputId({ url: input.url, sourceId: input.sourceChapterId }, "chapter")
        const chapterData = await fetchChapter(id, context)
        const mangaId = relatedMangaId(chapterData)
        const [manga, atHome] = await Promise.all([
            fetchManga(mangaId, context),
            context.request.getJson(new URL(`/at-home/server/${id}`, API_ORIGIN), atHomeSchema)
        ])
        const chapter = mapChapter(chapterData, mangaId)
        const pages = atHome.chapter.data.map((fileName, index) => ({
            id: `${chapter.id}:page:${index + 1}`,
            url: `${atHome.baseUrl}/data/${atHome.chapter.hash}/${encodeURIComponent(fileName)}`
        }))

        context.logger.debug("Resolved MangaDex chapter", {
            chapterId: id,
            pageCount: pages.length
        })

        return { manga, chapter, pages }
    }
}
