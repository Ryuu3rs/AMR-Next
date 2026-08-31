import {
    SourceError,
    UNNUMBERED_SORT_KEY,
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
    type SourcePageMatch
} from "@amr/source-sdk"

// Nyanu Kafe (nyanukafe.com) - a custom, server-rendered Alpine.js reader. Series and chapter
// pages ship all their data in the HTML (no separate API, no Cloudflare challenge on GET), so
// this adapter is a straight HTML parse:
//   - /series/{seriesId}            -> title (og:title), cover (og:image), chapter anchors
//   - /chapter/{seriesId}-{chapterId} -> page images as <img count="N" uid="XXX"> markers,
//     each resolving to https://cdn.meowing.org/uploads/{uid}.
const SOURCE_ID = "nyanukafe"
const ORIGIN = "https://nyanukafe.com"
const DOMAINS = ["nyanukafe.com", "www.nyanukafe.com"]
const IMAGE_CDN = "https://cdn.meowing.org/uploads/"

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

function cap(match: RegExpMatchArray | null, index: number): string | undefined {
    const v = match?.[index]
    return typeof v === "string" ? v : undefined
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
}

// /series/{id}
function extractSeriesId(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    return cap(url.pathname.match(/^\/series\/([a-z0-9]+)\/?$/i), 1)
}

// /chapter/{seriesId}-{chapterId}  (both ids are hex-ish, no internal hyphen)
function extractChapterIds(url: URL): { seriesId: string; chapterId: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(/^\/chapter\/([a-z0-9]+)-([a-z0-9]+)\/?$/i)
    const seriesId = cap(m, 1)
    const chapterId = cap(m, 2)
    if (!seriesId || !chapterId) return undefined
    return { seriesId, chapterId }
}

function seriesUrl(seriesId: string): URL {
    return new URL(`${ORIGIN}/series/${seriesId}`)
}
function chapterUrl(seriesId: string, chapterId: string): string {
    return `${ORIGIN}/chapter/${seriesId}-${chapterId}`
}

function ogContent(html: string, prop: string): string | undefined {
    return (
        cap(html.match(new RegExp(`<meta\\s[^>]*\\bproperty="${prop}"\\s[^>]*\\bcontent="([^"]+)"`, "i")), 1) ??
        cap(html.match(new RegExp(`<meta\\s[^>]*\\bcontent="([^"]+)"\\s[^>]*\\bproperty="${prop}"`, "i")), 1)
    )
}

function extractTitle(html: string, fallback: string): string {
    const og = ogContent(html, "og:title")
    if (og) return decodeEntities(og.trim())
    const t = cap(html.match(/<title>([^<]+)<\/title>/i), 1)
    return t ? decodeEntities(t.trim()) : fallback
}

// og:image is a wsrv.nl proxy of the real CDN url; unwrap to the direct meowing CDN url so the
// app only ever needs the cdn.meowing.org host permission.
function extractCover(html: string): string | undefined {
    const og = ogContent(html, "og:image")
    if (!og) return undefined
    const uid = cap(og.match(/cdn\.meowing\.org\/uploads\/([A-Za-z0-9_-]+)/i), 1)
    if (uid) return `${IMAGE_CDN}${uid}`
    return /^https?:\/\//i.test(og) ? og : undefined
}

// Chapter anchors on the series page carry "Chapter N.M" text inside. The inner markup is
// large (~1.4KB: per-chapter thumbnail + metadata), so match up to the first </a> with an
// unbounded non-greedy group - a fixed cap silently misses every real chapter.
function extractChapters(html: string, seriesId: string): Array<{ chapterId: string; number?: string }> {
    const re = new RegExp(`<a\\b[^>]*href="/chapter/${seriesId}-([a-z0-9]+)/?"[^>]*>([\\s\\S]*?)</a>`, "gi")
    const out: Array<{ chapterId: string; number?: string }> = []
    const seen = new Set<string>()
    for (const m of html.matchAll(re)) {
        const chapterId = cap(m, 1)
        if (!chapterId || seen.has(chapterId)) continue
        seen.add(chapterId)
        const text = (cap(m, 2) ?? "").replace(/<[^>]+>/g, " ")
        const number = cap(text.match(/chapter\s+(\d+(?:\.\d+)?)/i), 1)
        out.push(number ? { chapterId, number } : { chapterId })
    }
    return out
}

// Each page is an <img ... count="N" uid="XXX" ...>; real url = IMAGE_CDN + uid, ordered by count.
function extractImages(html: string): string[] {
    const pages: Array<{ count: number; uid: string }> = []
    for (const m of html.matchAll(/<img\b[^>]*\buid="([A-Za-z0-9_-]+)"[^>]*>/gi)) {
        const tag = cap(m, 0) ?? ""
        const uid = cap(m, 1)
        if (!uid) continue
        const countStr = cap(tag.match(/\bcount="(\d+)"/i), 1)
        pages.push({ count: countStr !== undefined ? Number(countStr) : pages.length, uid })
    }
    pages.sort((a, b) => a.count - b.count)
    return pages.map(p => `${IMAGE_CDN}${p.uid}`)
}

function seriesTitleFromChapterPage(html: string, fallback: string): string {
    // The chapter page's title includes a trailing "Chapter N.M"; strip it so a title added by
    // reading a chapter is the series name, not "Series Chapter 16.2".
    return extractTitle(html, fallback)
        .replace(/\s+chapter\s+\d+(?:\.\d+)?\s*$/i, "")
        .trim()
}

export const nyanukafeAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Nyanu Kafe",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["pages", "chapters"],
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
        const seriesId = input.url ? extractSeriesId(input.url) : input.sourceMangaId
        if (!seriesId) throw new SourceError("invalid-input", "A valid Nyanu Kafe series URL is required")
        const now = context.now()
        let title = seriesId
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(seriesUrl(seriesId), { headers: BROWSER_HEADERS })
            title = extractTitle(html, seriesId)
            coverUrl = extractCover(html)
        } catch {
            // Fall back to id-derived title.
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
        if (!seriesId) throw new SourceError("invalid-input", "A valid Nyanu Kafe series id is required")
        const html = await context.request.getText(seriesUrl(seriesId), { headers: BROWSER_HEADERS })
        const mangaId = `${SOURCE_ID}:manga:${seriesId}`
        const chapters: SourceChapter[] = extractChapters(html, seriesId).map(ch => ({
            id: `${SOURCE_ID}:chapter:${seriesId}:${ch.chapterId}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${seriesId}-${ch.chapterId}`,
            title: ch.number ? `Chapter ${ch.number}` : ch.chapterId,
            url: chapterUrl(seriesId, ch.chapterId),
            sortKey: parseChapterNumber(ch.number) ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }))
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const seriesId = input.sourceMangaId ?? (input.url ? extractSeriesId(input.url) : undefined)
        if (!seriesId) return undefined
        try {
            const html = await context.request.getText(seriesUrl(seriesId), { headers: BROWSER_HEADERS })
            return extractCover(html)
        } catch {
            return undefined
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const ids = extractChapterIds(input.url)
        if (!ids) throw new SourceError("unsupported-url", "This chapter URL is not supported")

        const requestUrl = new URL(chapterUrl(ids.seriesId, ids.chapterId))
        const html = await context.request.getText(requestUrl, { headers: BROWSER_HEADERS })
        const imageUrls = extractImages(html)
        if (imageUrls.length === 0) {
            context.logger.warn("No images found in Nyanu Kafe chapter page - returning pages:[]", {
                url: input.url.toString()
            })
        }

        const number = cap(html.match(/chapter\s+(\d+(?:\.\d+)?)/i), 1)
        const coverUrl = extractCover(html)
        const title = seriesTitleFromChapterPage(html, ids.seriesId)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${ids.seriesId}`
        const chapterId = `${SOURCE_ID}:chapter:${ids.seriesId}:${ids.chapterId}`

        const manga: SourceManga = {
            manga: {
                id: mangaId,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: ids.seriesId,
            url: `${ORIGIN}/series/${ids.seriesId}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${ids.seriesId}-${ids.chapterId}`,
            title: number ? `Chapter ${number}` : ids.chapterId,
            url: requestUrl.toString(),
            sortKey: parseChapterNumber(number) ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved Nyanu Kafe chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    },

    // /chapter/{seriesId}-{chapterId} -> series id + list URL, no network. Lets the on-page
    // panel prime prev/next from the series even if a chapter resolve fails.
    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const ids = extractChapterIds(url)
        if (ids) return { sourceMangaId: ids.seriesId, mangaUrl: `${ORIGIN}/series/${ids.seriesId}` }
        const seriesId = extractSeriesId(url)
        if (seriesId) return { sourceMangaId: seriesId, mangaUrl: `${ORIGIN}/series/${seriesId}` }
        return null
    }
}
