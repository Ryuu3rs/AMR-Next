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

const SOURCE_ID = "fanfox"
const ORIGIN = "https://fanfox.net"
const DOMAINS = ["fanfox.net", "www.fanfox.net"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// /manga/<slug>/                       → manga page
// /manga/<slug>/v<vol>/c<ch>/          → chapter page (with volume)
// /manga/<slug>/c<ch>/                 → chapter page (no volume)
// /manga/<slug>/v<vol>/c<ch>/<page>.html  → chapter page with explicit page
const MANGA_RE = /^\/manga\/([^/]+)\/?$/
const CHAPTER_RE = /^\/manga\/([^/]+)\/(?:v[^/]+\/)?c([^/]+?)(?:\/\d+\.html)?\/?$/

function extractMangaSlug(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(MANGA_RE)
    return m?.[1]
}

function extractChapterParts(url: URL): { mangaSlug: string; chapterNum: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    if (!m) return undefined
    return { mangaSlug: m[1]!, chapterNum: m[2]! }
}

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

function extractTitle(html: string): string | undefined {
    // <span class="detail-info-right-title-font">Title</span>
    // or <h2 class="detail-info-right-title">Title</h2>
    const patterns = [
        /class="detail-info-right-title-font"[^>]*>([\s\S]*?)<\/span>/i,
        /class="detail-info-right-title"[^>]*>([\s\S]*?)<\/h\d>/i,
        /<title[^>]*>([^<]+) - (?:Manga|Read)/i,
        /property="og:title"\s+content="([^"]+)"/i,
        /content="([^"]+)"\s+property="og:title"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        if (m) {
            const t = decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, ""))
            if (t.length > 1) return t
        }
    }
    return undefined
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /property="og:image"\s+content="(https?:\/\/[^"]+)"/i,
        /content="(https?:\/\/[^"]+)"\s+property="og:image"/i,
        /class="detail-info-cover-img"[^>]*\bsrc="(https?:\/\/[^"]+)"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractAuthors(html: string): string[] {
    // <p class="detail-info-right-say"><a href="/search?author=...">Author</a></p>
    const blockM = html.match(/class="detail-info-right-say"[^>]*>([\s\S]*?)<\/p>/i)
    if (!blockM) return []
    const scope = captureGroup(blockM, 1) ?? ""
    return [...scope.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, "")))
        .filter(a => a.length > 1)
        .slice(0, 5)
}

function extractChapterList(html: string, mangaSlug: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`
    const seen = new Set<string>()
    const chapters: SourceChapter[] = []

    // Links like href="/manga/<slug>/v10/c054.1/" or href="/manga/<slug>/c054.1/"
    const linkRe = new RegExp(`href="(/manga/${mangaSlug}/(?:v[^/]+/)?c([^/"]+)/?)"`, "gi")

    for (const m of html.matchAll(linkRe)) {
        const path = captureGroup(m, 1)
        const rawChapter = captureGroup(m, 2)
        if (!path || !rawChapter || seen.has(path)) continue
        seen.add(path)

        const sortKey = parseFloat(rawChapter) || 0
        const chapterId = `${SOURCE_ID}:chapter:${mangaSlug}:${rawChapter}`

        chapters.push({
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: rawChapter,
            title: `Ch.${rawChapter}`,
            url: `${ORIGIN}${path.endsWith("/") ? path : path + "/"}`,
            sortKey,
            language: "en"
        })
    }

    return chapters.sort((a, b) => b.sortKey - a.sortKey)
}

function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()

    // /manga/<slug>/ links with manga title
    for (const m of html.matchAll(/href="\/manga\/([^/"]+)\/"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const slug = captureGroup(m, 1)
        const inner = captureGroup(m, 2) ?? ""
        if (!slug || seen.has(slug)) continue
        seen.add(slug)

        const title = decodeHtml(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
        if (title.length < 2) continue

        const imgM = inner.match(/\bsrc="(https?:\/\/[^"]+)"/)
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            title,
            url: `${ORIGIN}/manga/${slug}/`,
            ...(imgM ? { coverUrl: imgM[1] } : {})
        })
        if (out.length >= 30) break
    }
    return out
}

export const fanfoxAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "FanFox",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterParts(url)) return "chapter"
        if (extractMangaSlug(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const slug = input.url ? extractMangaSlug(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid FanFox manga URL is required")
        const now = context.now()
        let title = slug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
        let coverUrl: string | undefined
        let authors: string[] = []
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${slug}/`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(html) ?? title
            coverUrl = extractCoverUrl(html)
            authors = extractAuthors(html)
        } catch {
            // non-fatal — return slug-derived title
        }
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors,
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: `${ORIGIN}/manga/${slug}/`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "Missing manga ID")
        const html = await context.request.getText(new URL(`${ORIGIN}/manga/${slug}/`), {
            headers: BROWSER_HEADERS
        })
        return extractChapterList(html, slug)
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? extractMangaSlug(input.url) : undefined)
        if (!slug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${slug}/`), {
                headers: BROWSER_HEADERS
            })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        const slug = input.sourceMangaId ?? (input.url ? extractMangaSlug(input.url) : undefined)
        if (!slug) return []
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${slug}/`), {
                headers: BROWSER_HEADERS
            })
            const blockM = html.match(/class="detail-info-right-tag-list"[^>]*>([\s\S]*?)<\/p>/i)
            if (!blockM) return []
            const scope = captureGroup(blockM, 1) ?? ""
            return [...scope.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
                .map(m => decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, "")))
                .filter(g => g.length > 1)
                .slice(0, 15)
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${ORIGIN}/search`)
            url.searchParams.set("title", query)
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parts = extractChapterParts(input.url)
        if (!parts) throw new SourceError("unsupported-url", "This URL is not a recognised FanFox chapter")
        const { mangaSlug, chapterNum } = parts
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`
        const chapterId = `${SOURCE_ID}:chapter:${mangaSlug}:${chapterNum}`
        const mangaTitle = mangaSlug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

        let title = mangaTitle
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${mangaSlug}/`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(html) ?? title
            coverUrl = extractCoverUrl(html)
        } catch {
            // non-fatal
        }

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
            sourceMangaId: mangaSlug,
            url: `${ORIGIN}/manga/${mangaSlug}/`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterNum,
            title: `Ch.${chapterNum}`,
            url: input.url.toString(),
            sortKey: parseFloat(chapterNum) || 0,
            language: "en"
        }

        // FanFox loads images via JavaScript — pages cannot be extracted via plain fetch.
        // The chapter is still captured so listChapters can populate prev/next in the panel.
        return { manga, chapter, pages: [] }
    }
}
