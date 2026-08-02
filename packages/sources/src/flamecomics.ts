import {
    SourceError,
    UNNUMBERED_SORT_KEY,
    decodeHtmlEntities,
    matchesSourceDomain,
    parseChapterNumber,
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
import type { MangaRecord } from "@amr/contracts"

const SOURCE_ID = "flamecomics"
const ORIGIN = "https://flamecomics.xyz"
const DOMAIN = "flamecomics.xyz"
const CDN = "https://cdn.flamecomics.xyz"
const LANGUAGE = "en"

// Next.js app since the 2025 redesign. Series are numeric ids, chapters a hex
// token: /series/<seriesId> and /series/<seriesId>/<token>.
const seriesRe = /^\/series\/(\d+)\/?\s*$/
const chapterRe = /^\/series\/(\d+)\/([0-9a-f]{6,})\/?\s*$/i

type ParsedChapter = { seriesId: string; token: string }

function isDomain(url: URL): boolean {
    return matchesSourceDomain(url.hostname, [DOMAIN])
}

function parseChapterUrl(url: URL): ParsedChapter | null {
    if (!isDomain(url)) return null
    const m = url.pathname.match(chapterRe)
    if (m?.[1] && m[2]) return { seriesId: m[1], token: m[2] }
    return null
}

function parseSeriesId(url: URL): string | undefined {
    if (!isDomain(url)) return undefined
    return url.pathname.match(seriesRe)?.[1]
}

type NextChapterEntry = {
    chapter?: string | number
    title?: string | null
    token?: string
    release_date?: number
    chapter_id?: number
}

type NextSeries = {
    series_id?: number
    title?: string
    altTitles?: string[]
    description?: string
    language?: string
    status?: string
    author?: string[]
    tags?: string[]
    cover?: string
}

type NextChapterPage = {
    series_id?: number
    chapter?: string | number
    chapter_title?: string | null
    token?: string
    release_date?: number
    images?: Record<string, { name?: string }>
    title?: string
    cover?: string
}

type NextPageProps = {
    series?: NextSeries
    chapters?: NextChapterEntry[]
    chapter?: NextChapterPage
}

function extractNextData(html: string): NextPageProps | null {
    const m = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (!m?.[1]) return null
    try {
        const parsed = JSON.parse(m[1]) as { props?: { pageProps?: NextPageProps } }
        return parsed.props?.pageProps ?? null
    } catch {
        return null
    }
}

function coverUrl(seriesId: string, cover: string | undefined): string | undefined {
    return cover ? `${CDN}/uploads/images/series/${seriesId}/${cover}` : undefined
}

function mapStatus(status: string | undefined): MangaRecord["status"] {
    switch ((status ?? "").toLowerCase()) {
        case "ongoing":
            return "ongoing"
        case "completed":
            return "completed"
        case "hiatus":
            return "hiatus"
        case "dropped":
        case "cancelled":
        case "canceled":
            return "cancelled"
        default:
            return "unknown"
    }
}

// String label for the id/url token even when unnumbered; the sortKey is derived
// separately so an unnumbered chapter is never pinned to a bogus number.
function chapterLabel(raw: string | number | undefined): string | undefined {
    const parsed = parseChapterNumber(raw == null ? undefined : String(raw))
    return parsed === undefined ? undefined : String(parsed)
}

function buildChapter(seriesId: string, entry: NextChapterEntry): SourceChapter | null {
    const token = entry.token
    if (!token) return null
    const mangaId = `${SOURCE_ID}:manga:${seriesId}`
    const numLabel = chapterLabel(entry.chapter)
    const subtitle = decodeHtmlEntities(String(entry.title ?? "").trim())
    const title = numLabel
        ? subtitle
            ? `Chapter ${numLabel}: ${subtitle}`
            : `Chapter ${numLabel}`
        : subtitle || `Chapter ${token}`
    return {
        id: `${SOURCE_ID}:chapter:${seriesId}-${token}`,
        mangaId,
        sourceId: SOURCE_ID,
        sourceChapterId: `${seriesId}/${token}`,
        title,
        url: `${ORIGIN}/series/${seriesId}/${token}`,
        sortKey: parseChapterNumber(entry.chapter == null ? undefined : String(entry.chapter)) ?? UNNUMBERED_SORT_KEY,
        language: LANGUAGE
    }
}

function seriesTitle(series: NextSeries | undefined, seriesId: string): string {
    const title = series?.title ? decodeHtmlEntities(series.title).trim() : ""
    return title || `Series ${seriesId}`
}

const browserHeaders = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
}

async function fetchSeriesPage(seriesId: string, context: SourceContext): Promise<NextPageProps> {
    const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesId}`), { headers: browserHeaders })
    const data = extractNextData(html)
    if (!data) throw new SourceError("invalid-response", "Flame Comics series data could not be parsed")
    return data
}

export const flameComicsAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Flame Comics",
        domains: [DOMAIN],
        languages: [LANGUAGE],
        capabilities: ["pages", "chapters", "manga"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN,
        imageOrigins: [`https://cdn.${DOMAIN}/*`]
    },

    match(url: URL): SourcePageMatch {
        if (parseChapterUrl(url)) return "chapter"
        if (parseSeriesId(url)) return "manga"
        return "none"
    },

    parseMangaUrl(url: URL) {
        const parsed =
            parseChapterUrl(url) ?? (parseSeriesId(url) ? { seriesId: parseSeriesId(url)!, token: "" } : null)
        if (!parsed) return null
        return { sourceMangaId: parsed.seriesId, mangaUrl: `${ORIGIN}/series/${parsed.seriesId}` }
    },

    getChapterListUrl(sourceMangaId: string): string | null {
        return sourceMangaId ? `${ORIGIN}/series/${sourceMangaId}` : null
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const seriesId = input.url ? parseSeriesId(input.url) : input.sourceMangaId
        if (!seriesId) throw new SourceError("invalid-input", "A valid Flame Comics series URL is required")
        const data = await fetchSeriesPage(seriesId, context)
        const series = data.series
        const title = seriesTitle(series, seriesId)
        const cover = coverUrl(seriesId, series?.cover)
        const authors = (series?.author ?? []).map(a => a.trim()).filter(a => a.length > 0)
        const now = context.now()
        const manga: MangaRecord = {
            id: `${SOURCE_ID}:manga:${seriesId}`,
            title,
            normalizedTitle: title.toLowerCase(),
            ...(cover ? { coverUrl: cover } : {}),
            ...(series?.description ? { description: decodeHtmlEntities(series.description) } : {}),
            authors,
            status: mapStatus(series?.status),
            addedAt: now,
            updatedAt: now
        }
        return {
            manga,
            sourceId: SOURCE_ID,
            sourceMangaId: seriesId,
            url: `${ORIGIN}/series/${seriesId}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const seriesId = input.manga.sourceMangaId
        if (!seriesId) throw new SourceError("invalid-input", "A valid Flame Comics series id is required")
        const data = await fetchSeriesPage(seriesId, context)
        const chapters = (data.chapters ?? [])
            .map(entry => buildChapter(seriesId, entry))
            .filter((c): c is SourceChapter => c !== null)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(input, context): Promise<string | undefined> {
        const seriesId = input.sourceMangaId ?? (input.url ? parseSeriesId(input.url) : undefined)
        if (!seriesId) return undefined
        try {
            const data = await fetchSeriesPage(seriesId, context)
            return coverUrl(seriesId, data.series?.cover)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input, context): Promise<string[]> {
        const seriesId = input.sourceMangaId ?? (input.url ? parseSeriesId(input.url) : undefined)
        if (!seriesId) return []
        try {
            const data = await fetchSeriesPage(seriesId, context)
            return (data.series?.tags ?? []).map(t => t.trim()).filter(t => t.length > 0)
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        const trimmed = query.trim()
        if (!trimmed) return []
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/browse`), { headers: browserHeaders })
            const data = extractNextData(html)
            const series = (data as { series?: NextSeries[] } | null)?.series ?? []
            const needle = trimmed.toLowerCase()
            const out: SourceSearchResult[] = []
            for (const s of series) {
                if (s.series_id == null || !s.title) continue
                const haystack = [s.title, ...(s.altTitles ?? [])].join(" ").toLowerCase()
                if (!haystack.includes(needle)) continue
                const seriesId = String(s.series_id)
                const cover = coverUrl(seriesId, s.cover)
                out.push({
                    sourceId: SOURCE_ID,
                    sourceMangaId: seriesId,
                    title: decodeHtmlEntities(s.title).trim(),
                    url: `${ORIGIN}/series/${seriesId}`,
                    ...(cover ? { coverUrl: cover } : {}),
                    ...(s.altTitles && s.altTitles.length > 0
                        ? { altTitles: s.altTitles.map(t => t.trim()).filter(t => t.length > 0) }
                        : {})
                })
                if (out.length >= 20) break
            }
            return out
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parsed = parseChapterUrl(input.url)
        if (!parsed) throw new SourceError("unsupported-url", "This chapter URL is not supported")

        const html = await context.request.getText(input.url, { headers: browserHeaders })
        const data = extractNextData(html)
        const chapterData = data?.chapter
        if (!chapterData) throw new SourceError("invalid-response", "Flame Comics chapter data could not be parsed")

        const seriesId = String(chapterData.series_id ?? parsed.seriesId)
        const token = chapterData.token ?? parsed.token
        const release = chapterData.release_date
        const query = release ? `?${release}` : ""

        const imageEntries = Object.entries(chapterData.images ?? {})
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([, v]) => v.name)
            .filter((name): name is string => typeof name === "string" && name.length > 0)

        if (imageEntries.length === 0) {
            throw new SourceError("not-found", "Flame Comics chapter has no page images")
        }

        const numLabel = chapterLabel(chapterData.chapter)
        const title = seriesTitle({ title: chapterData.title } as NextSeries, seriesId)
        const cover = coverUrl(seriesId, chapterData.cover)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${seriesId}`
        const chapterId = `${SOURCE_ID}:chapter:${seriesId}-${token}`

        const manga: SourceManga = {
            manga: {
                id: mangaId,
                title,
                normalizedTitle: title.toLowerCase(),
                ...(cover ? { coverUrl: cover } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: seriesId,
            url: `${ORIGIN}/series/${seriesId}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${seriesId}/${token}`,
            title: numLabel ? `Chapter ${numLabel}` : `Chapter ${token}`,
            url: input.url.toString(),
            sortKey:
                parseChapterNumber(chapterData.chapter == null ? undefined : String(chapterData.chapter)) ??
                UNNUMBERED_SORT_KEY,
            language: LANGUAGE
        }

        const pages = imageEntries.map((name, i) => ({
            id: `${chapterId}:page:${i + 1}`,
            url: `${CDN}/uploads/images/series/${seriesId}/${token}/${name}${query}`
        }))
        context.logger.debug("Resolved Flame Comics chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
