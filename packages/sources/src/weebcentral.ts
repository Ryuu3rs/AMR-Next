import {
    SourceError,
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

const SOURCE_ID = "weebcentral"
const ORIGIN = "https://weebcentral.com"
const DOMAIN = "weebcentral.com"

// Weeb Central uses Postgres ULIDs — 26 chars from Crockford base32.
const ULID_CHARS = "[0-9A-HJKMNP-TV-Z]{26}"
const SERIES_RE = new RegExp(`^/series/(${ULID_CHARS})(?:/[^/]*)?/?$`, "i")
const CHAPTER_RE = new RegExp(`^/chapters/(${ULID_CHARS})(?:/.*)?$`, "i")

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
}

function captureGroup(match: RegExpMatchArray, index: number): string | undefined {
    const v = match[index]
    return typeof v === "string" ? v : undefined
}

function decodeEntities(value: string): string {
    return value
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0*(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&nbsp;/g, " ")
        .trim()
}

function extractSeriesId(url: URL): string | undefined {
    if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return undefined
    const m = url.pathname.match(SERIES_RE)
    return m ? captureGroup(m, 1)?.toUpperCase() : undefined
}

function extractChapterId(url: URL): string | undefined {
    if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    return m ? captureGroup(m, 1)?.toUpperCase() : undefined
}

function chapterNumberFromText(text: string): number {
    // "Chapter 1", "Ch. 1.5", "Vol.2 Chapter 12", etc.
    const m = text.match(/(?:ch(?:apter)?\.?\s*)(\d+(?:[.-]\d+)?)/i)
    const raw = m ? captureGroup(m, 1) : undefined
    return raw ? parseFloat(raw.replace("-", ".")) : 0
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /<meta\s[^>]*\bproperty="og:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i,
        /<meta\s[^>]*\bcontent="(https?:\/\/[^"]+)"\s[^>]*\bproperty="og:image"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        if (m) return captureGroup(m, 1)
    }
    return undefined
}

function extractSeriesTitle(html: string, fallback: string): string {
    // Try og:title first (most reliable on series pages)
    const og =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        // Strip trailing site suffix: " | WeebCentral" or " - WeebCentral"
        const cleaned = raw.split(/\s*[-|]\s*WeebCentral/i)[0]?.trim()
        if (cleaned && cleaned.length > 1) return cleaned
    }
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const h1Text = h1 ? decodeEntities((captureGroup(h1, 1) ?? "").replace(/<[^>]+>/g, "").trim()) : ""
    if (h1Text.length > 1) return h1Text
    return fallback
}

// Parse the chapter list from a series page.
function extractChapterList(html: string, seriesId: string): SourceChapter[] {
    const parentId = `${SOURCE_ID}:manga:${seriesId}`
    const out: SourceChapter[] = []
    const seen = new Set<string>()

    // Chapter links: /chapters/{ULID} or /chapters/{ULID}/
    for (const a of html.matchAll(/<a\b[^>]*\bhref="\/chapters\/([0-9A-Z]{26})[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const chapterId = captureGroup(a, 1)?.toUpperCase()
        const inner = captureGroup(a, 2) ?? ""
        if (!chapterId || seen.has(chapterId)) continue
        seen.add(chapterId)
        const text = decodeEntities(
            inner
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
        )
        const sortKey = chapterNumberFromText(text)
        out.push({
            id: `${SOURCE_ID}:chapter:${chapterId}`,
            mangaId: parentId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterId,
            title: text || `Chapter ${sortKey || "?"}`,
            url: `${ORIGIN}/chapters/${chapterId}/`,
            sortKey,
            language: "en"
        })
    }
    return out
}

function extractImages(html: string): string[] {
    const urls: string[] = []
    for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
        const t = captureGroup(tag, 0) ?? ""
        for (const attr of ["src", "data-src"]) {
            const m = t.match(new RegExp(`\\b${attr}="(https?://[^"]+)"`, "i"))
            const url = m ? captureGroup(m, 1) : undefined
            if (url && !url.startsWith("data:") && /\.(jpe?g|png|webp|gif|avif)/i.test(url)) {
                urls.push(url)
                break
            }
        }
    }
    return urls
}

// From a chapter page, extract the linked series ULID and the chapter title.
function extractChapterPageMeta(html: string): { seriesId?: string; title: string; sortKey: number } {
    // Look for a link to /series/{ULID}...
    const seriesMatch = html.match(/<a\b[^>]*\bhref="\/series\/([0-9A-Z]{26})[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    const seriesId = seriesMatch ? captureGroup(seriesMatch, 1)?.toUpperCase() : undefined

    // Chapter title: prefer og:title or <title>, strip site/series suffix
    const og =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    let title = ""
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        title = raw.split(/\s*[-|]\s*/)[0]?.trim() ?? ""
    }
    if (!title) {
        const docTitle = html.match(/<title>([^<]+)<\/title>/i)
        const raw = docTitle ? decodeEntities(captureGroup(docTitle, 1) ?? "") : ""
        title = raw.split(/\s*[-|]\s*/)[0]?.trim() ?? ""
    }
    const sortKey = chapterNumberFromText(title)
    return { seriesId, title: title || `Chapter ${sortKey || "?"}`, sortKey }
}

function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    for (const a of html.matchAll(/<a\b[^>]*\bhref="(\/series\/([0-9A-Z]{26})[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = captureGroup(a, 1)
        const seriesId = captureGroup(a, 2)?.toUpperCase()
        const inner = captureGroup(a, 3) ?? ""
        if (!seriesId || seen.has(seriesId)) continue
        const title = decodeEntities(
            inner
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
        )
        if (title.length < 2) continue
        seen.add(seriesId)
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: seriesId,
            title,
            url: href ? `${ORIGIN}${href}` : `${ORIGIN}/series/${seriesId}`
        })
    }
    return out
}

export const weebCentralAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Weeb Central",
        domains: [DOMAIN, `www.${DOMAIN}`],
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterId(url)) return "chapter"
        if (extractSeriesId(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const seriesId = input.url ? extractSeriesId(input.url) : input.sourceMangaId?.toUpperCase()
        if (!seriesId) throw new SourceError("invalid-input", "A valid Weeb Central series URL is required")
        const now = context.now()
        let title = seriesId
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesId}`), {
                headers: BROWSER_HEADERS
            })
            title = extractSeriesTitle(html, seriesId)
            coverUrl = extractCoverUrl(html)
        } catch {
            // Fall back to id-derived title
        }
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${seriesId}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: seriesId,
            url: `${ORIGIN}/series/${seriesId}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const seriesId = input.manga.sourceMangaId
        if (!seriesId) throw new SourceError("invalid-input", "A valid Weeb Central series id is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesId}`), {
            headers: BROWSER_HEADERS
        })
        const chapters = extractChapterList(html, seriesId)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const seriesId = input.sourceMangaId?.toUpperCase() ?? (input.url ? extractSeriesId(input.url) : undefined)
        if (!seriesId) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesId}`), {
                headers: BROWSER_HEADERS
            })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${ORIGIN}/search`)
            url.searchParams.set("text", query)
            url.searchParams.set("order_by", "title")
            url.searchParams.set("asc_or_desc", "asc")
            url.searchParams.set("limit", "20")
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        const chapterId = input.url ? extractChapterId(input.url) : input.sourceChapterId?.toUpperCase()
        if (!chapterId) throw new SourceError("invalid-input", "A chapter URL or ID is required")

        const chapterPageUrl = `${ORIGIN}/chapters/${chapterId}/`
        const imagesUrl = new URL(`${ORIGIN}/chapters/${chapterId}/images`)
        imagesUrl.searchParams.set("is_prev", "False")
        imagesUrl.searchParams.set("current_page", "1")

        // Fetch chapter page (manga metadata + chapter title) and images concurrently.
        const [chapterHtml, imagesHtml] = await Promise.all([
            context.request.getText(new URL(chapterPageUrl), { headers: BROWSER_HEADERS }),
            context.request.getText(imagesUrl, {
                headers: { ...BROWSER_HEADERS, "HX-Request": "true", Referer: chapterPageUrl }
            })
        ])

        const imageUrls = extractImages(imagesHtml)
        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No images found in chapter")
        }

        const { seriesId, title: chapterTitle, sortKey } = extractChapterPageMeta(chapterHtml)
        const now = context.now()
        const mangaRecordId = seriesId ? `${SOURCE_ID}:manga:${seriesId}` : `${SOURCE_ID}:manga:unknown`

        let seriesTitle = "Unknown"
        let coverUrl: string | undefined
        if (seriesId) {
            try {
                const seriesHtml = await context.request.getText(new URL(`${ORIGIN}/series/${seriesId}`), {
                    headers: BROWSER_HEADERS
                })
                seriesTitle = extractSeriesTitle(seriesHtml, seriesId)
                coverUrl = extractCoverUrl(seriesHtml)
            } catch {
                seriesTitle = seriesId
            }
        }

        const manga: SourceManga = {
            manga: {
                id: mangaRecordId,
                title: seriesTitle,
                normalizedTitle: seriesTitle.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: seriesId ?? chapterId,
            url: seriesId ? `${ORIGIN}/series/${seriesId}` : `${ORIGIN}/chapters/${chapterId}/`
        }

        const fullChapterId = `${SOURCE_ID}:chapter:${chapterId}`
        const chapter: SourceChapter = {
            id: fullChapterId,
            mangaId: mangaRecordId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterId,
            title: chapterTitle,
            url: chapterPageUrl,
            sortKey,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({ id: `${fullChapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved Weeb Central chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
