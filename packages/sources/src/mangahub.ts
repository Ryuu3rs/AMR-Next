import {
    SourceError,
    SourceRequestError,
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

const SOURCE_ID = "mangahub"
const ORIGIN = "https://mangahub.io"
const DOMAIN = "mangahub.io"

// MangaHub's /search route is server-rendered (confirmed via direct fetch — no
// __NEXT_DATA__ blob, no GraphQL call needed): each result is a plain
// `<div class="media-manga media">` card in the initial HTML response, and
// pagination is a normal link-driven `/search/page/{n}` route. Fetch a handful
// of pages and concatenate, same approach as browsing the site with JS off.
const SEARCH_MAX_PAGES = 3

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN
}

function captureGroup(m: RegExpMatchArray, i: number): string | undefined {
    const v = m[i]
    return typeof v === "string" ? v : undefined
}

function decodeEntities(s: string): string {
    return s
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0*(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
        .replace(/&#x([0-9a-f]+);/gi, (_, c: string) => String.fromCodePoint(parseInt(c, 16)))
        .replace(/&nbsp;/g, " ")
        .trim()
}

function cleanTitle(raw: string): string {
    return raw
        .replace(/^Read\s+/i, "")
        .replace(/\s+Manga\s+Online(\s+for\s+Free)?$/i, "")
        .trim()
}

function extractTitle(html: string, fallback: string): string {
    const og =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
        html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        const cleaned = cleanTitle(raw)
        if (cleaned.length > 1) return cleaned
    }
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (title) {
        const raw = decodeEntities((captureGroup(title, 1) ?? "").replace(/<[^>]+>/g, "").trim())
        const cleaned = cleanTitle(raw)
        if (cleaned.length > 1) return cleaned
    }
    return fallback
}

function extractCover(html: string): string | undefined {
    const patterns = [
        /<meta[^>]+property="og:image"[^>]+content="(https?:\/\/[^"]+)"/i,
        /<meta[^>]+content="(https?:\/\/[^"]+)"[^>]+property="og:image"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        if (m) return captureGroup(m, 1)
    }
    return undefined
}

// Chapter URLs: https://mangahub.io/chapter/{chSlug}/chapter-{N}
// chSlug may differ from manga slug (e.g. solo-leveling_105 vs solo-leveling).
// Extract N as a float for sort order.
function parseChapterNumber(chapterPath: string): number | undefined {
    const m = chapterPath.match(/\/chapter-(\d+(?:\.\d+)?)\/?$/i)
    return m?.[1] !== undefined ? Number(m[1]) : undefined
}

function extractChapters(html: string, mangaId: string): SourceChapter[] {
    const seen = new Set<string>()
    const out: SourceChapter[] = []
    for (const m of html.matchAll(/href="(https?:\/\/mangahub\.io\/chapter\/([^/]+)\/chapter-(\d+(?:\.\d+)?))"/gi)) {
        const url = captureGroup(m, 1)
        const chNum = captureGroup(m, 3)
        if (!url || !chNum || seen.has(url)) continue
        seen.add(url)
        const sortKey = Number(chNum)
        out.push({
            id: `${SOURCE_ID}:chapter:${mangaId.replace(`${SOURCE_ID}:manga:`, "")}:${chNum}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chNum,
            title: `Chapter ${chNum}`,
            url,
            sortKey,
            language: "en"
        })
    }
    out.sort((a, b) => a.sortKey - b.sortKey)
    return out
}

// Chapter page images — extracted after tab render (JS-driven reader).
// MangaHub renders <img> tags with src pointing to their CDN (mhcdn.net / mghcdn.com).
function extractImages(html: string): string[] {
    const urls: string[] = []
    const seen = new Set<string>()
    // Primary: src on img elements in the reader
    for (const m of html.matchAll(/<img\b[^>]+src="(https?:\/\/[^"]*(?:mhcdn|mghcdn)[^"]+)"/gi)) {
        const u = captureGroup(m, 1)
        if (u && !seen.has(u)) {
            seen.add(u)
            urls.push(u)
        }
    }
    if (urls.length > 0) return urls
    // Fallback: any data-src with cdn patterns
    for (const m of html.matchAll(/<img\b[^>]+data-src="(https?:\/\/[^"]*(?:mhcdn|mghcdn)[^"]+)"/gi)) {
        const u = captureGroup(m, 1)
        if (u && !seen.has(u)) {
            seen.add(u)
            urls.push(u)
        }
    }
    return urls
}

// Search result cards look like:
// <div class="media-manga media">
//   <div class="media-left"><a href=".../manga/SLUG"><img src="COVER" alt="TITLE"/></a></div>
//   <div class="media-body"><h4 class="media-heading">[optional hot label]<a href=".../manga/SLUG">TITLE</a>...
//     <span><a href=".../chapter/SLUG/chapter-N">#N</a> chapters published (...)</span>
//     <p>...genre links...</p>
//   </div>
// </div>
// Split on the card marker so each block is scoped to one card; the last block
// trails off into unrelated page content (e.g. the "Popular" slider), but since
// only the *first* match of each field is taken per block, that trailing junk
// is never reached.
function extractSearchResults(html: string): SourceSearchResult[] {
    const blocks = [
        ...html.matchAll(/<div class="media-manga media">([\s\S]*?)(?=<div class="media-manga media">|$)/gi)
    ]
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    const linkRe = /<a\s+href="https?:\/\/(?:www\.)?mangahub\.io\/manga\/([^"/]+)"[^>]*>([\s\S]*?)<\/a>/gi
    for (const block of blocks) {
        const scope = captureGroup(block, 1) ?? ""
        const anchors = [...scope.matchAll(linkRe)]
        const slug = anchors[0] ? captureGroup(anchors[0], 1) : undefined
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        // The thumbnail anchor wraps only an <img> (no text); the heading anchor
        // has the title text — take the first anchor with non-empty text.
        let title = ""
        for (const a of anchors) {
            const text = decodeEntities((captureGroup(a, 2) ?? "").replace(/<[^>]+>/g, "").trim())
            if (text.length > 0) {
                title = text
                break
            }
        }
        if (!title) title = slug.replace(/-/g, " ")
        const imgMatch = scope.match(/<img\b[^>]+src="(https?:\/\/[^"]+)"/i)
        const coverUrl = imgMatch ? captureGroup(imgMatch, 1) : undefined
        const chapMatch = scope.match(/chapter-(\d+(?:\.\d+)?)/i)
        const latestChapter = chapMatch ? captureGroup(chapMatch, 1) : undefined
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            title,
            url: `${ORIGIN}/manga/${slug}`,
            ...(coverUrl ? { coverUrl } : {}),
            ...(latestChapter ? { latestChapter } : {})
        })
    }
    return out
}

export const mangahubAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaHub",
        domains: [DOMAIN, `www.${DOMAIN}`],
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 2, intervalMs: 2000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return "none"
        if (url.pathname.startsWith("/manga/") && url.pathname.split("/").filter(Boolean).length === 2) return "manga"
        if (url.pathname.startsWith("/chapter/") && url.pathname.includes("/chapter-")) return "chapter"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, ctx: SourceContext): Promise<SourceManga> {
        const slug = input.sourceMangaId ?? input.url?.pathname.split("/").filter(Boolean)[1]
        if (!slug) throw new SourceError("invalid-input", "No manga slug")
        const url = new URL(`${ORIGIN}/manga/${slug}`)
        const html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
        const title = extractTitle(html, slug)
        const coverUrl = extractCover(html)
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en").replace(/\s+/g, " "),
                authors: [],
                status: "unknown",
                ...(coverUrl ? { coverUrl } : {}),
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: url.toString()
        }
    },

    async resolveCover(input: { sourceMangaId?: string; url?: URL }, ctx: SourceContext): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? input.url?.pathname.split("/").filter(Boolean)[1]
        if (!slug) return undefined
        try {
            const url = new URL(`${ORIGIN}/manga/${slug}`)
            const html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
            return extractCover(html)
        } catch {
            return undefined
        }
    },

    async listChapters(input: ListChaptersInput, ctx: SourceContext): Promise<SourceChapter[]> {
        const { manga } = input
        const mangaUrl = new URL(manga.url)
        const html = await ctx.request.getText(mangaUrl, { headers: BROWSER_HEADERS })
        return extractChapters(html, manga.manga.id)
    },

    async search(query: string, ctx: SourceContext): Promise<SourceSearchResult[]> {
        const trimmed = query.trim()
        if (!trimmed) return []

        const out: SourceSearchResult[] = []
        const seen = new Set<string>()
        for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
            const url = new URL(`${ORIGIN}/search/page/${page}`)
            url.searchParams.set("q", trimmed)
            url.searchParams.set("order", "POPULAR")
            url.searchParams.set("genre", "all")

            let html: string
            try {
                html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
            } catch {
                // Stop paginating on a request failure but keep whatever earlier
                // pages already yielded rather than discarding partial results.
                break
            }

            const pageResults = extractSearchResults(html)
            if (pageResults.length === 0) break

            for (const r of pageResults) {
                if (seen.has(r.sourceMangaId)) continue
                seen.add(r.sourceMangaId)
                out.push(r)
            }
        }
        return out
    },

    async resolveChapter(input: ResolveChapterInput, ctx: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "Chapter URL required for MangaHub")
        const url = input.url

        // Chapter pages are behind Cloudflare JS challenge — tab render required.
        // When the user is already on the page the browser has cf_clearance; SW fetch
        // may succeed. If blocked (403/challenge HTML), fall through to tab render.
        let html: string
        try {
            html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
        } catch (e) {
            // Only convert known CDN/reverse-proxy block statuses to "blocked" — other
            // errors (404, network timeout, parse failure) should surface as-is instead
            // of masking the real cause and wasting a tab-render fallback attempt.
            if (e instanceof SourceRequestError && (e.status === 403 || e.status === 502 || e.status === 503)) {
                throw new SourceRequestError("blocked", e.status)
            }
            throw e
        }
        // Cloudflare challenge response — treat as blocked
        if (html.includes("__CF$cv$params") || html.includes("/cdn-cgi/challenge-platform/")) {
            throw new SourceRequestError("blocked")
        }

        const images = extractImages(html)
        if (images.length === 0) throw new SourceRequestError("blocked")

        const pathParts = url.pathname.split("/").filter(Boolean)
        const chSlug = pathParts[1] ?? ""
        const mangaSlug = chSlug.replace(/_\d+$/, "") || chSlug
        const chNum = parseChapterNumber(url.pathname) ?? 0

        const listUrl = new URL(`${ORIGIN}/manga/${mangaSlug}`)
        const manga: SourceManga = {
            manga: {
                id: `${SOURCE_ID}:manga:${mangaSlug}`,
                title: mangaSlug,
                normalizedTitle: mangaSlug,
                authors: [],
                status: "unknown",
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaSlug,
            url: listUrl.toString()
        }

        return {
            manga,
            chapter: {
                id: `${SOURCE_ID}:chapter:${mangaSlug}:${chNum}`,
                mangaId: `${SOURCE_ID}:manga:${mangaSlug}`,
                sourceId: SOURCE_ID,
                sourceChapterId: String(chNum),
                title: `Chapter ${chNum}`,
                url: url.toString(),
                sortKey: chNum,
                language: "en"
            },
            pages: images.map((imgUrl, i) => ({ id: String(i), url: imgUrl }))
        }
    }
}
