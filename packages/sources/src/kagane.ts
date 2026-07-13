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

const SOURCE_ID = "kagane"
// kagane.to is a Next.js App Router site sitting behind a Cloudflare managed
// challenge on every request (verified via curl: a bare GET to any kagane.to
// path, including /api/integrity, comes back 403 with `Cf-Mitigated: challenge`).
// Its data API host (yuzuki.kagane.to) and image CDN (kstatic.to) are NOT behind
// that challenge — plain requests to them succeed with no cookies/session needed.
const ORIGIN = "https://kagane.to"
const DOMAIN = "kagane.to"
const API_ORIGIN = "https://yuzuki.kagane.to"
const LANGUAGE = "en"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const SERIES_RE = new RegExp(`^/series/(${UUID})/?$`, "i")
const CHAPTER_RE = new RegExp(`^/series/(${UUID})/reader/(${UUID})/?$`, "i")

function isDomain(url: URL): boolean {
    return matchesSourceDomain(url.hostname, [DOMAIN])
}

function extractSeriesId(url: URL): string | undefined {
    if (!isDomain(url)) return undefined
    return url.pathname.match(SERIES_RE)?.[1]?.toLowerCase()
}

function extractChapterIds(url: URL): { seriesId: string; chapterId: string } | undefined {
    if (!isDomain(url)) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    if (!m?.[1] || !m[2]) return undefined
    return { seriesId: m[1].toLowerCase(), chapterId: m[2].toLowerCase() }
}

function seriesUrl(seriesId: string): string {
    return `${ORIGIN}/series/${seriesId}`
}

function readerUrl(seriesId: string, chapterId: string): string {
    return `${ORIGIN}/series/${seriesId}/reader/${chapterId}`
}

function coverUrlFromImageId(imageId: string): string {
    return `${API_ORIGIN}/api/v2/image/${imageId}/compressed`
}

const STATUS_MAP: Record<string, "ongoing" | "completed" | "hiatus" | "cancelled"> = {
    ongoing: "ongoing",
    completed: "completed",
    hiatus: "hiatus",
    cancelled: "cancelled",
    canceled: "cancelled"
}

function mapStatus(value: string | undefined): "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled" {
    if (!value) return "unknown"
    return STATUS_MAP[value.toLowerCase()] ?? "unknown"
}

function toTimestamp(value: string | undefined, fallback: number): number {
    if (!value) return fallback
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? fallback : parsed
}

// ---- Series metadata — GET /api/v2/series/{id} on the (non-gated) API host ----

const seriesAltTitleSchema = z.object({ title: z.string() })
const seriesCoverSchema = z.object({ image_id: z.string() })
const seriesGenreSchema = z.object({ genre_name: z.string() })

const seriesDetailSchema = z.object({
    series_id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    content_rating: z.string().optional(),
    publication_status: z.string().optional(),
    format: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    series_alternate_titles: z.array(seriesAltTitleSchema).optional(),
    series_covers: z.array(seriesCoverSchema).optional(),
    genres: z.array(seriesGenreSchema).optional()
})
type SeriesDetail = z.infer<typeof seriesDetailSchema>

function seriesCoverUrl(data: SeriesDetail): string | undefined {
    const imageId = data.series_covers?.[0]?.image_id
    return imageId ? coverUrlFromImageId(imageId) : undefined
}

function mapSeriesDetail(data: SeriesDetail, now: number): SourceManga {
    const coverUrl = seriesCoverUrl(data)
    return {
        manga: {
            id: `${SOURCE_ID}:manga:${data.series_id}`,
            title: data.title,
            normalizedTitle: data.title.toLocaleLowerCase("en"),
            ...(data.description ? { description: data.description } : {}),
            ...(coverUrl ? { coverUrl } : {}),
            authors: [],
            status: mapStatus(data.publication_status),
            addedAt: toTimestamp(data.created_at, now),
            updatedAt: toTimestamp(data.updated_at, now)
        },
        sourceId: SOURCE_ID,
        sourceMangaId: data.series_id,
        url: seriesUrl(data.series_id)
    }
}

async function fetchSeries(seriesId: string, context: SourceContext): Promise<SeriesDetail> {
    const url = new URL(`${API_ORIGIN}/api/v2/series/${seriesId}`)
    return context.request.getJson(url, seriesDetailSchema)
}

// ---- Search — POST /api/v2/search/series on the (non-gated) API host ----

const searchItemSchema = z.object({
    series_id: z.string(),
    title: z.string(),
    alternate_titles: z.array(z.string()).optional(),
    cover_image_id: z.string().optional(),
    latest_chapters: z.array(z.object({ chapter_no: z.string().optional() })).optional()
})
const searchResponseSchema = z.object({
    content: z.array(searchItemSchema)
})

// ---- Chapter list — parsed from the series page's embedded RSC data ----
//
// The series page (kagane.to/series/{id}) server-renders the FULL chapter list
// (every chapter, not just the visible pagination page) into a Next.js React
// Flight payload: `self.__next_f.push([1, "...escaped JSON..."])`. That payload
// is a JSON string embedded inside a JS string literal inside the HTML, so every
// quote is backslash-escaped twice over (`\\\"key\\\":\\\"value\\\"`). This page
// sits behind kagane.to's Cloudflare challenge — see the module doc comment.

const rscChapterSchema = z.object({
    book_id: z.string(),
    title: z.string().optional(),
    volume_no: z.number().nullable().optional(),
    chapter_no: z.string(),
    sort_no: z.number(),
    published_on: z.string().optional()
})

// Collapse runs of backslashes immediately before a quote back to a bare quote.
// Turns the doubly-escaped Flight payload back into parseable JSON without having
// to implement the RSC wire format itself.
function normalizeFlightJson(html: string): string {
    return html.replace(/\\+"/g, '"')
}

// Walk forward from a `{` and return the text of the balanced object it opens
// (respecting quoted strings so a `{`/`}` inside a string value doesn't confuse
// the depth count).
function extractBalancedObject(text: string, startIdx: number): string | undefined {
    if (text[startIdx] !== "{") return undefined
    let depth = 0
    let inString = false
    for (let i = startIdx; i < text.length && i < startIdx + 20_000; i++) {
        const ch = text[i]
        if (inString) {
            if (ch === "\\") {
                i++
                continue
            }
            if (ch === '"') inString = false
            continue
        }
        if (ch === '"') {
            inString = true
            continue
        }
        if (ch === "{") depth++
        else if (ch === "}") {
            depth--
            if (depth === 0) return text.slice(startIdx, i + 1)
        }
    }
    return undefined
}

function extractChapterList(html: string, seriesId: string): SourceChapter[] {
    const normalized = normalizeFlightJson(html)
    const mangaId = `${SOURCE_ID}:manga:${seriesId}`
    const chapters: SourceChapter[] = []
    const seen = new Set<string>()
    const anchor = '"book_id":"'
    let searchFrom = 0

    for (;;) {
        const keyIdx = normalized.indexOf(anchor, searchFrom)
        if (keyIdx === -1) break
        const objStart = keyIdx - 1
        searchFrom = keyIdx + anchor.length
        if (normalized[objStart] !== "{") continue

        const objText = extractBalancedObject(normalized, objStart)
        if (!objText) continue

        let raw: unknown
        try {
            raw = JSON.parse(objText)
        } catch {
            continue
        }
        const parsed = rscChapterSchema.safeParse(raw)
        if (!parsed.success) continue
        const data = parsed.data
        if (seen.has(data.book_id)) continue
        seen.add(data.book_id)

        const chapterNumber = Number(data.chapter_no)
        const publishedAt = data.published_on ? Date.parse(data.published_on) : NaN

        chapters.push({
            id: `${SOURCE_ID}:chapter:${data.book_id}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: data.book_id,
            title: data.title?.trim() || `Chapter ${data.chapter_no}`,
            url: readerUrl(seriesId, data.book_id),
            sortKey: data.sort_no,
            ...(Number.isFinite(chapterNumber) ? { chapterNumber } : {}),
            ...(data.volume_no != null ? { volumeNumber: data.volume_no } : {}),
            language: LANGUAGE,
            ...(Number.isFinite(publishedAt) ? { publishedAt } : {})
        })
    }

    return chapters.sort((a, b) => a.sortKey - b.sortKey)
}

// ---- Chapter page manifest — integrity token + DRM-gated book manifest ----
//
// The reader page itself never embeds the page list — it's fetched client-side
// via a two-step handshake that mirrors the site's own reader:
//   1. POST kagane.to/api/integrity (empty body) -> { token, exp }
//   2. POST yuzuki.kagane.to/api/v2/books/{chapterId}?is_datasaver=false with
//      header `x-integrity-token: <token>` -> { cache_url, manifest: { pages } }
// Step 1 sits behind kagane.to's Cloudflare challenge, so it can fail with a 403
// from a background fetch — that surfaces as SourceRequestError(status=403),
// which the extension's isBotBlocked() treats as a bot-block signal.

const integrityResponseSchema = z.object({ token: z.string(), exp: z.number() })
const manifestPageSchema = z.object({
    page_id: z.string(),
    page_no: z.number(),
    ext: z.string()
})
const manifestResponseSchema = z.object({
    cache_url: z.string(),
    manifest: z.object({ pages: z.array(manifestPageSchema) })
})

async function fetchPageManifest(
    chapterId: string,
    context: SourceContext
): Promise<z.infer<typeof manifestResponseSchema>> {
    const integrity = await context.request.postJson(new URL(`${ORIGIN}/api/integrity`), {}, integrityResponseSchema)

    const manifestUrl = new URL(`${API_ORIGIN}/api/v2/books/${chapterId}`)
    manifestUrl.searchParams.set("is_datasaver", "false")
    return context.request.postJson(manifestUrl, {}, manifestResponseSchema, {
        headers: { "x-integrity-token": integrity.token }
    })
}

function pageUrls(chapterId: string, manifest: z.infer<typeof manifestResponseSchema>): { id: string; url: string }[] {
    const chapterRecordId = `${SOURCE_ID}:chapter:${chapterId}`
    return [...manifest.manifest.pages]
        .sort((a, b) => a.page_no - b.page_no)
        .map((page, i) => ({
            id: `${chapterRecordId}:page:${i + 1}`,
            url: `${manifest.cache_url}/api/v2/books/page/${chapterId}/${page.page_id}.${page.ext}`
        }))
}

export const kaganeAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Kagane",
        domains: [DOMAIN],
        languages: [LANGUAGE],
        capabilities: ["manga", "chapters", "pages"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterIds(url)) return "chapter"
        if (extractSeriesId(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const seriesId = input.url ? extractSeriesId(input.url) : input.sourceMangaId?.toLowerCase()
        if (!seriesId) throw new SourceError("invalid-input", "A valid Kagane series URL is required")
        const data = await fetchSeries(seriesId, context)
        return mapSeriesDetail(data, context.now())
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const seriesId = input.manga.sourceMangaId
        if (!seriesId) throw new SourceError("invalid-input", "A valid Kagane series id is required")
        const html = await context.request.getText(new URL(seriesUrl(seriesId)))
        const chapters = extractChapterList(html, seriesId)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const seriesId = input.sourceMangaId ?? (input.url ? extractSeriesId(input.url) : undefined)
        if (!seriesId) return undefined
        try {
            const data = await fetchSeries(seriesId, context)
            return seriesCoverUrl(data)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        const seriesId = input.sourceMangaId ?? (input.url ? extractSeriesId(input.url) : undefined)
        if (!seriesId) return []
        try {
            const data = await fetchSeries(seriesId, context)
            return [...new Set((data.genres ?? []).map(g => g.genre_name.trim()).filter(Boolean))]
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${API_ORIGIN}/api/v2/search/series`)
            url.searchParams.set("page", "0")
            url.searchParams.set("size", "20")
            const response = await context.request.postJson(url, { title: query }, searchResponseSchema)
            return response.content.map(item => {
                const latestChapter = item.latest_chapters?.[0]?.chapter_no
                return {
                    sourceId: SOURCE_ID,
                    sourceMangaId: item.series_id,
                    title: item.title,
                    url: seriesUrl(item.series_id),
                    ...(item.cover_image_id ? { coverUrl: coverUrlFromImageId(item.cover_image_id) } : {}),
                    ...(latestChapter ? { latestChapter } : {}),
                    ...(item.alternate_titles && item.alternate_titles.length > 0
                        ? { altTitles: item.alternate_titles }
                        : {})
                }
            })
        } catch {
            return []
        }
    },

    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const parsed = extractChapterIds(url)
        if (!parsed) return null
        return { sourceMangaId: parsed.seriesId, mangaUrl: seriesUrl(parsed.seriesId) }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parsed = extractChapterIds(input.url)
        if (!parsed) throw new SourceError("unsupported-url", "This chapter URL is not supported")
        const { seriesId, chapterId } = parsed

        const [seriesData, chapterList, manifest] = await Promise.all([
            fetchSeries(seriesId, context),
            context.request
                .getText(new URL(seriesUrl(seriesId)))
                .then(html => extractChapterList(html, seriesId))
                .catch(() => [] as SourceChapter[]),
            fetchPageManifest(chapterId, context)
        ])

        const manga = mapSeriesDetail(seriesData, context.now())
        const chapterRecord = chapterList.find(c => c.sourceChapterId === chapterId)
        const chapterRecordId = `${SOURCE_ID}:chapter:${chapterId}`

        const chapter: SourceChapter = chapterRecord ?? {
            id: chapterRecordId,
            mangaId: manga.manga.id,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterId,
            title: "Chapter",
            url: readerUrl(seriesId, chapterId),
            sortKey: 0,
            language: LANGUAGE
        }

        const pages = pageUrls(chapterId, manifest)

        context.logger.debug("Resolved Kagane chapter", { chapterId, pageCount: pages.length })

        return { manga, chapter, pages }
    }
}
