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

const SOURCE_ID = "mangafreak"
const ORIGIN = "https://ww2.mangafreak.me"
const CDN = "https://images.mangafreak.me"
// All wwN mirrors serve the same content; wildcard covers ww1/ww2/ww3/...
const DOMAINS = ["*.mangafreak.me", "mangafreak.me"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// /Manga/{Slug}               → manga page (Title_Case_Underscores)
// /Read1_{Slug}_{ChapterNum}  → chapter page
const MANGA_RE = /^\/Manga\/([A-Za-z0-9_]+)\/?$/
// Greedy match for slug so the last _\d+ is always the chapter number
const CHAPTER_RE = /^\/Read1_(.+)_(\d+(?:\.\d+)?)\/?$/

function captureGroup(m: RegExpMatchArray, i: number): string | undefined {
    const v = m[i]
    return typeof v === "string" ? v : undefined
}

function decodeHtml(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim()
}

function matchMangaSlug(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    return url.pathname.match(MANGA_RE)?.[1]
}

function matchChapterParts(url: URL): { slug: string; chapterNum: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    if (!m) return undefined
    return { slug: m[1]!, chapterNum: m[2]! }
}

// CDN and internal paths use lowercase slug
function cdnSlug(urlSlug: string): string {
    return urlSlug.toLowerCase()
}

// Use the same host the user is on (ww1/ww2/ww3 etc.) for constructed links
function hostOrigin(url?: URL): string {
    if (url && matchesSourceDomain(url.hostname, DOMAINS)) return url.origin
    return ORIGIN
}

function extractTitle(html: string): string | undefined {
    for (const p of [
        /property="og:title"\s+content="([^"]+)"/i,
        /content="([^"]+)"\s+property="og:title"/i,
        /<h1[^>]*>([^<]+)<\/h1>/i
    ]) {
        const m = html.match(p)
        if (m) {
            const t = decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, ""))
            if (t.length > 1) return t
        }
    }
    return undefined
}

function extractImages(html: string): string[] {
    const urls: string[] = []
    const seen = new Set<string>()
    for (const m of html.matchAll(/<img\b[^>]*\bsrc="(https?:\/\/images\.mangafreak\.me\/mangas\/[^"]+)"/gi)) {
        const url = captureGroup(m, 1)
        if (url && !seen.has(url)) {
            seen.add(url)
            urls.push(url)
        }
    }
    return urls
}

function extractChapterLinks(html: string, slug: string, origin: string): Array<{ num: string; url: string }> {
    const seen = new Set<string>()
    const results: Array<{ num: string; url: string }> = []
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`href="/Read1_${escaped}_(\\d+(?:\\.\\d+)?)"`, "gi")
    for (const m of html.matchAll(re)) {
        const num = captureGroup(m, 1)
        if (!num || seen.has(num)) continue
        seen.add(num)
        results.push({ num, url: `${origin}/Read1_${slug}_${num}` })
    }
    return results
}

function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    for (const m of html.matchAll(/href="\/Manga\/([A-Za-z0-9_]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const slug = captureGroup(m, 1)
        const inner = captureGroup(m, 2) ?? ""
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        const title = decodeHtml(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
        if (title.length < 2) continue
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            title,
            url: `${ORIGIN}/Manga/${slug}`,
            coverUrl: `${CDN}/manga_images/${cdnSlug(slug)}.jpg`
        })
        if (out.length >= 20) break
    }
    return out
}

export const mangafreakAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaFreak",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["chapters", "pages"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (matchChapterParts(url)) return "chapter"
        if (matchMangaSlug(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const slug = input.url ? matchMangaSlug(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid MangaFreak manga URL is required")
        const now = context.now()
        const origin = hostOrigin(input.url)
        const coverUrl = `${CDN}/manga_images/${cdnSlug(slug)}.jpg`
        let title = slug.replace(/_/g, " ")
        try {
            const html = await context.request.getText(new URL(`${origin}/Manga/${slug}`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(html) ?? title
        } catch {}
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                coverUrl,
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: `${origin}/Manga/${slug}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "Missing manga ID")
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const html = await context.request.getText(new URL(`${ORIGIN}/Manga/${slug}`), {
            headers: BROWSER_HEADERS
        })
        const links = extractChapterLinks(html, slug, ORIGIN)
        return links
            .map(l => ({
                id: `${SOURCE_ID}:chapter:${slug}:${l.num}`,
                mangaId,
                sourceId: SOURCE_ID,
                sourceChapterId: l.num,
                title: `Ch.${l.num}`,
                url: l.url,
                sortKey: parseFloat(l.num) || 0,
                language: "en"
            }))
            .sort((a, b) => b.sortKey - a.sortKey)
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        _context: SourceContext
    ): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? matchMangaSlug(input.url) : undefined)
        if (!slug) return undefined
        return `${CDN}/manga_images/${cdnSlug(slug)}.jpg`
    },

    async resolveGenres(): Promise<string[]> {
        return []
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${ORIGIN}/Find`)
            url.searchParams.set("s", query)
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parts = matchChapterParts(input.url)
        if (!parts) throw new SourceError("unsupported-url", "Not a recognised MangaFreak chapter URL")
        const { slug, chapterNum } = parts
        const now = context.now()
        const origin = hostOrigin(input.url)
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const coverUrl = `${CDN}/manga_images/${cdnSlug(slug)}.jpg`

        const html = await context.request.getText(input.url, { headers: BROWSER_HEADERS })
        const imageUrls = extractImages(html)
        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No chapter images found")
        }

        let title = slug.replace(/_/g, " ")
        try {
            const mangaHtml = await context.request.getText(new URL(`${origin}/Manga/${slug}`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(mangaHtml) ?? title
        } catch {}

        const manga: SourceManga = {
            manga: {
                id: mangaId,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                coverUrl,
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: `${origin}/Manga/${slug}`
        }

        const chapter: SourceChapter = {
            id: `${SOURCE_ID}:chapter:${slug}:${chapterNum}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterNum,
            title: `Ch.${chapterNum}`,
            url: input.url.toString(),
            sortKey: parseFloat(chapterNum) || 0,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({
            id: `${SOURCE_ID}:chapter:${slug}:${chapterNum}:page:${i + 1}`,
            url
        }))

        return { manga, chapter, pages }
    }
}
