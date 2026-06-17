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

const SOURCE_ID = "dynasty-scans"
const ORIGIN = "https://dynasty-scans.com"
const DOMAIN = "dynasty-scans.com"

// Path patterns:
//   /series/<slug>   → manga page
//   /chapters/<slug> → chapter page
const SERIES_RE = /^\/series\/([a-z0-9_-]+)\/?$/i
const CHAPTER_RE = /^\/chapters\/([a-z0-9_-]+)\/?$/i

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// Dynasty chapter page embeds image list as JSON in a <script> tag:
//   var pages = [{"url": "/system/releases/...", "name": "..."}, ...]
// The URLs may be relative (no origin), so we prepend ORIGIN when needed.
const PAGES_JSON_RE = /var\s+pages\s*=\s*(\[[\s\S]*?\]);/

type DynastyPage = {
    url: string
    name?: string
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

function extractSeriesSlug(url: URL): string | undefined {
    if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return undefined
    const m = url.pathname.match(SERIES_RE)
    return m ? captureGroup(m, 1) : undefined
}

function extractChapterSlug(url: URL): string | undefined {
    if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    return m ? captureGroup(m, 1) : undefined
}

// Extract a float chapter sort key from a title string.
// Handles patterns like "Ch. 1", "Chapter 1", "Volume 2 Chapter 3", "1.5", plain numbers.
function chapterSortKey(title: string): number {
    // Explicit chapter label
    const labeled = title.match(/(?:ch(?:apter)?\.?\s*)(\d+(?:[._-]\d+)?)/i)
    if (labeled) return parseFloat((captureGroup(labeled, 1) ?? "0").replace(/[_-]/, "."))
    // Trailing number in title
    const trailing = title.match(/(\d+(?:\.\d+)?)\s*$/)
    if (trailing) return parseFloat(captureGroup(trailing, 1) ?? "0")
    return 0
}

function extractTitle(html: string, fallback: string): string {
    // og:title is the most reliable on dynasty-scans
    const og =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        // Strip trailing " | Dynasty Scans" etc.
        const cleaned = raw.split(/\s*[|–-]\s*Dynasty/i)[0]?.trim()
        if (cleaned && cleaned.length > 1) return cleaned
    }
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const h1Text = h1 ? decodeEntities((captureGroup(h1, 1) ?? "").replace(/<[^>]+>/g, "").trim()) : ""
    if (h1Text.length > 1) return h1Text
    const docTitle = html.match(/<title>([^<]+)<\/title>/i)
    if (docTitle) {
        const raw = decodeEntities(captureGroup(docTitle, 1) ?? "")
        const cleaned = raw.split(/\s*[|–-]\s*/)[0]?.trim()
        if (cleaned && cleaned.length > 1) return cleaned
    }
    return fallback
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

// Dynasty series pages list chapters inside <dl class="chapter-list"> or similar.
// Each entry is a <dt> (or <dd>) containing an <a href="/chapters/<slug>"> link.
//
// Observed structure (as of 2025):
//   <dt>
//     <a class="name" href="/chapters/bloom_into_you_ch01">Chapter 1</a>
//     ...
//   </dt>
//
// We scan all /chapters/ anchors found on the page.
function extractChapterList(html: string, seriesSlug: string): SourceChapter[] {
    const parentId = `${SOURCE_ID}:manga:${seriesSlug}`
    const out: SourceChapter[] = []
    const seen = new Set<string>()

    for (const a of html.matchAll(/<a\b[^>]*\bhref="(\/chapters\/([a-z0-9_-]+))[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = captureGroup(a, 1)
        const chapterSlug = captureGroup(a, 2)
        const inner = captureGroup(a, 3) ?? ""
        if (!chapterSlug || !href || seen.has(chapterSlug)) continue
        seen.add(chapterSlug)

        const rawTitle = decodeEntities(
            inner
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
        )
        // Skip navigation/UI links that aren't chapter entries
        if (!rawTitle || rawTitle.length < 1) continue

        const sortKey = chapterSortKey(rawTitle)
        out.push({
            id: `${SOURCE_ID}:chapter:${chapterSlug}`,
            mangaId: parentId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterSlug,
            title: rawTitle,
            url: `${ORIGIN}/chapters/${chapterSlug}`,
            sortKey,
            language: "en"
        })
    }
    return out
}

// Extract pages from the embedded JSON in a chapter page.
function extractPages(html: string): string[] {
    const m = html.match(PAGES_JSON_RE)
    if (!m) return []
    try {
        const raw = captureGroup(m, 1) ?? "[]"
        const parsed = JSON.parse(raw) as DynastyPage[]
        return parsed
            .map(p => {
                const u = p.url ?? ""
                // Relative URLs like /system/releases/... need the origin prepended
                if (u.startsWith("http")) return u
                if (u.startsWith("//")) return `https:${u}`
                return `${ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`
            })
            .filter(u => u.length > ORIGIN.length)
    } catch {
        return []
    }
}

// From a chapter page, extract the linked series slug and the chapter title.
function extractChapterPageMeta(html: string): { seriesSlug?: string; title: string; sortKey: number } {
    // Dynasty chapter pages have a breadcrumb/link back to the series, e.g.:
    //   <a href="/series/bloom_into_you">Bloom Into You</a>
    const seriesMatch = html.match(/<a\b[^>]*\bhref="\/series\/([a-z0-9_-]+)[^"]*"[^>]*>/i)
    const seriesSlug = seriesMatch ? captureGroup(seriesMatch, 1) : undefined

    // Chapter title from og:title or <title>
    const og =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    let title = ""
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        title = raw.split(/\s*[|]\s*Dynasty/i)[0]?.trim() ?? ""
    }
    if (!title) {
        const docTitle = html.match(/<title>([^<]+)<\/title>/i)
        const raw = docTitle ? decodeEntities(captureGroup(docTitle, 1) ?? "") : ""
        title = raw.split(/\s*[|]\s*/)[0]?.trim() ?? ""
    }
    const sortKey = chapterSortKey(title)
    return { seriesSlug, title: title || "Chapter", sortKey }
}

function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()

    // Search results page links series as:
    //   <a href="/series/<slug>">Title</a>
    for (const a of html.matchAll(/<a\b[^>]*\bhref="\/series\/([a-z0-9_-]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const seriesSlug = captureGroup(a, 1)
        const inner = captureGroup(a, 2) ?? ""
        if (!seriesSlug || seen.has(seriesSlug)) continue
        const title = decodeEntities(
            inner
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
        )
        if (title.length < 2) continue
        seen.add(seriesSlug)
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: seriesSlug,
            title,
            url: `${ORIGIN}/series/${seriesSlug}`
        })
    }
    return out
}

export const dynastyScansAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Dynasty Scans",
        domains: [DOMAIN, `www.${DOMAIN}`],
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 2, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterSlug(url)) return "chapter"
        if (extractSeriesSlug(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const seriesSlug = input.url ? extractSeriesSlug(input.url) : input.sourceMangaId
        if (!seriesSlug) throw new SourceError("invalid-input", "A valid Dynasty Scans series URL is required")
        const now = context.now()
        let title = seriesSlug
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesSlug}`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(html, seriesSlug)
            coverUrl = extractCoverUrl(html)
        } catch {
            // Fall back to slug-derived title
        }
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${seriesSlug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: seriesSlug,
            url: `${ORIGIN}/series/${seriesSlug}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const seriesSlug = input.manga.sourceMangaId
        if (!seriesSlug) throw new SourceError("invalid-input", "A valid Dynasty Scans series id is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesSlug}`), {
            headers: BROWSER_HEADERS
        })
        const chapters = extractChapterList(html, seriesSlug)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const seriesSlug = input.sourceMangaId ?? (input.url ? extractSeriesSlug(input.url) : undefined)
        if (!seriesSlug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${seriesSlug}`), {
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
            url.searchParams.set("q", query.trim())
            // Restrict to Series results (not chapters/anthologies)
            url.searchParams.append("classes[]", "Series")
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        const chapterSlug = input.url ? extractChapterSlug(input.url) : input.sourceChapterId
        if (!chapterSlug) throw new SourceError("invalid-input", "A chapter URL or ID is required")

        const chapterUrl = `${ORIGIN}/chapters/${chapterSlug}`
        const html = await context.request.getText(new URL(chapterUrl), { headers: BROWSER_HEADERS })

        const imageUrls = extractPages(html)
        if (imageUrls.length === 0) {
            // TODO: If this fires, check whether dynasty-scans.com changed the
            //       var pages = [...] pattern in its chapter page script tags.
            //       The regex is: /var\s+pages\s*=\s*(\[[\s\S]*?\]);/
            throw new SourceError("invalid-response", "No images found in chapter — pages JSON may have changed")
        }

        const { seriesSlug, title: chapterTitle, sortKey } = extractChapterPageMeta(html)
        const now = context.now()
        const mangaRecordId = seriesSlug ? `${SOURCE_ID}:manga:${seriesSlug}` : `${SOURCE_ID}:manga:unknown`

        let seriesTitle = seriesSlug ?? "Unknown"
        let coverUrl: string | undefined
        if (seriesSlug) {
            try {
                const seriesHtml = await context.request.getText(new URL(`${ORIGIN}/series/${seriesSlug}`), {
                    headers: BROWSER_HEADERS
                })
                seriesTitle = extractTitle(seriesHtml, seriesSlug)
                coverUrl = extractCoverUrl(seriesHtml)
            } catch {
                // Non-fatal — fall back to slug
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
            sourceMangaId: seriesSlug ?? chapterSlug,
            url: seriesSlug ? `${ORIGIN}/series/${seriesSlug}` : `${ORIGIN}/chapters/${chapterSlug}`
        }

        const fullChapterId = `${SOURCE_ID}:chapter:${chapterSlug}`
        const chapter: SourceChapter = {
            id: fullChapterId,
            mangaId: mangaRecordId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterSlug,
            title: chapterTitle,
            url: chapterUrl,
            sortKey,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({ id: `${fullChapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved Dynasty Scans chapter", { chapterSlug, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
