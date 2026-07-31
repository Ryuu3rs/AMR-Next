import {
    SourceError,
    UNNUMBERED_SORT_KEY,
    assignListSortKeys,
    matchesSourceDomain,
    parseChapterNumber,
    sanitizeScrapedText,
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

const SOURCE_ID = "mangakatana"
const ORIGIN = "https://mangakatana.com"
const DOMAINS = ["mangakatana.com", "www.mangakatana.com"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// Manga:   /manga/{slug}.{numericId}         e.g. /manga/the-archmages-restaurant.27314
// Chapter: /manga/{slug}.{numericId}/c{num}  e.g. /manga/the-archmages-restaurant.27314/c142
// The sourceMangaId is the whole "{slug}.{numericId}" token - it's the site's stable
// per-title key and reconstructs the manga URL directly.
const MANGA_RE = /^\/manga\/([^/]+)$/
const CHAPTER_RE = /^\/manga\/([^/]+)\/c(\d+(?:\.\d+)?)\/?$/

function captureGroup(m: RegExpMatchArray, i: number): string | undefined {
    const v = m[i]
    return typeof v === "string" ? v : undefined
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchMangaId(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    return url.pathname.match(MANGA_RE)?.[1]
}

function matchChapterParts(url: URL): { mangaId: string; chapterNum: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    if (!m) return undefined
    return { mangaId: m[1]!, chapterNum: m[2]! }
}

function extractTitle(html: string): string | undefined {
    for (const p of [
        /<h1[^>]*class="heading"[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
        /<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i
    ]) {
        const m = html.match(p)
        if (m) {
            const t = sanitizeScrapedText(captureGroup(m, 1) ?? "")
            if (t.length > 1) return t
        }
    }
    return undefined
}

function extractCoverUrl(html: string): string | undefined {
    for (const p of [
        /<meta[^>]+property="og:image"[^>]+content="(https?:\/\/[^"]+)"/i,
        /<meta[^>]+content="(https?:\/\/[^"]+)"[^>]+property="og:image"/i
    ]) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

// Genre chips live in a single `<div class="genres">...</div>` block on the manga
// page - scope to it so sidebar/related genre links elsewhere on the page can't leak in.
function extractGenres(html: string): string[] {
    const block = html.match(/<div class="genres">([\s\S]*?)<\/div>/i)?.[1] ?? ""
    const out: string[] = []
    const seen = new Set<string>()
    for (const m of block.matchAll(/href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi)) {
        const g = sanitizeScrapedText(captureGroup(m, 1) ?? "")
        if (g.length > 0 && !seen.has(g.toLowerCase())) {
            seen.add(g.toLowerCase())
            out.push(g)
        }
    }
    return out
}

// Pull the chapter number out of a visible label like "Chapter 142" / "Vol.2 Chapter 5"
// / "Chapter 1.5". parseChapterNumber expects an ALREADY-ISOLATED numeric token, so
// handing it the whole label ("Chapter 5") returns NaN->undefined - isolate the number
// first (prefer the token after "chapter", else the last number in the label).
function chapterNumberFromLabel(label: string): number | undefined {
    const afterChapter = label.match(/chapter[\s._-]*(\d+(?:\.\d+)?)/i)?.[1]
    if (afterChapter !== undefined) return parseChapterNumber(afterChapter)
    const anyNumber = label.match(/(\d+(?:\.\d+)?)(?!.*\d)/)?.[1]
    return parseChapterNumber(anyNumber)
}

// Chapter anchors on the manga page: <a href="{ORIGIN}/manga/{mangaId}/c{num}">Chapter {N}</a>.
// The visible "Chapter {N}" label is authoritative (mangakatana's URL c-number usually
// equals it but a re-slug/extra can diverge); fall back to the URL c-number. Unnumbered
// bonus/extra rows are interpolated between their numbered neighbours via
// assignListSortKeys (mangakatana lists newest-first) instead of collapsing to the
// +Infinity sentinel, which would otherwise sort an extra ahead of every real chapter.
function extractChapters(html: string, mangaId: string): SourceChapter[] {
    const recordId = `${SOURCE_ID}:manga:${mangaId}`
    const prefix = escapeRegExp(`${ORIGIN}/manga/${mangaId}/c`)
    const re = new RegExp(`<a\\b[^>]*\\bhref="${prefix}(\\d+(?:\\.\\d+)?)"[^>]*>([\\s\\S]*?)</a>`, "gi")
    const seen = new Set<string>()
    const entries: Array<{ cNum: string; label: string; number: number | undefined }> = []
    for (const m of html.matchAll(re)) {
        const cNum = captureGroup(m, 1)
        if (!cNum || seen.has(cNum)) continue
        seen.add(cNum)
        const label = sanitizeScrapedText(captureGroup(m, 2) ?? "")
        entries.push({ cNum, label, number: chapterNumberFromLabel(label) ?? parseChapterNumber(cNum) })
    }
    const sortKeys = assignListSortKeys(entries, e => e.number, "newest-first")
    return entries
        .map((entry, i) => ({
            id: `${SOURCE_ID}:chapter:${mangaId}:${entry.cNum}`,
            mangaId: recordId,
            sourceId: SOURCE_ID,
            sourceChapterId: entry.cNum,
            title: entry.label.length > 0 ? entry.label : `Chapter ${entry.cNum}`,
            url: `${ORIGIN}/manga/${mangaId}/c${entry.cNum}`,
            sortKey: sortKeys[i] ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }))
        .sort((a, b) => b.sortKey - a.sortKey)
}

// Chapter page images are held in a JS array `var <random>=[ '<cdn url>', ... ]`. The
// page ships a 1-entry DECOY array (a different token for image 0) beside the real full
// array, and the var names are randomised per page - so pick the LONGEST array of
// mangakatana-CDN image URLs rather than trusting any single var name. Bracket bodies
// never contain a literal "]", so the non-greedy `[^\]]` capture stays bounded.
function extractImages(html: string): string[] {
    const imgRe = /'(https?:\/\/i\d*\.mangakatana\.com\/[^']+?\.(?:jpg|jpeg|png|webp|avif))'/gi
    const arrayRe = /=\s*\[([^\]]*?mangakatana\.com[^\]]*?)\]/gi
    let best: string[] = []
    for (const m of html.matchAll(arrayRe)) {
        const body = captureGroup(m, 1) ?? ""
        const urls: string[] = []
        for (const u of body.matchAll(imgRe)) {
            const url = captureGroup(u, 1)
            if (url) urls.push(url)
        }
        if (urls.length > best.length) best = urls
    }
    return best
}

// Search result cards: <div class="item"> ... <h3 class="title"><a href="{mangaUrl}">{title}</a> ...
// each card also carries a real cover <img>. A single strong match can 302 straight to
// the manga page (no cards) - callers still get the manga via resolveManga in that case.
function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    for (const block of html.split(/<div class="item"/i).slice(1)) {
        const a = block.match(
            /<h3 class="title">\s*<a\b[^>]*\bhref="(https?:\/\/(?:www\.)?mangakatana\.com\/manga\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i
        )
        if (!a) continue
        const url = captureGroup(a, 1)
        const title = sanitizeScrapedText(captureGroup(a, 2) ?? "")
        if (!url || title.length < 2) continue
        const mangaId = url.split("/manga/")[1]?.replace(/\/.*$/, "")
        if (!mangaId || seen.has(mangaId)) continue
        seen.add(mangaId)
        const imgMatch =
            block.match(/<img\b[^>]*\bsrc="(https?:\/\/[^"]*mangakatana\.com\/imgs\/[^"]+)"/i) ??
            block.match(/<img\b[^>]*\bdata-src="(https?:\/\/[^"]*mangakatana\.com\/imgs\/[^"]+)"/i)
        const coverUrl = imgMatch ? captureGroup(imgMatch, 1) : undefined
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: mangaId,
            title,
            url: `${ORIGIN}/manga/${mangaId}`,
            ...(coverUrl ? { coverUrl } : {})
        })
        if (out.length >= 20) break
    }
    return out
}

export const mangakatanaAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaKatana",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (matchChapterParts(url)) return "chapter"
        if (matchMangaId(url)) return "manga"
        return "none"
    },

    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const mangaId = matchChapterParts(url)?.mangaId ?? matchMangaId(url)
        if (!mangaId) return null
        return { sourceMangaId: mangaId, mangaUrl: `${ORIGIN}/manga/${mangaId}` }
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const mangaId = (input.url ? matchMangaId(input.url) : undefined) ?? input.sourceMangaId
        if (!mangaId) throw new SourceError("invalid-input", "A valid MangaKatana manga URL is required")
        const now = context.now()
        const url = `${ORIGIN}/manga/${mangaId}`
        let title = mangaId.replace(/\.\d+$/, "").replace(/-/g, " ")
        let coverUrl: string | undefined
        let genres: string[] = []
        try {
            const html = await context.request.getText(new URL(url), { headers: BROWSER_HEADERS })
            title = extractTitle(html) ?? title
            coverUrl = extractCoverUrl(html)
            genres = extractGenres(html)
        } catch {
            // fall back to slug-derived title
        }
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${mangaId}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                ...(genres.length > 0 ? { genres } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaId,
            url
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const mangaId = input.manga.sourceMangaId
        if (!mangaId) throw new SourceError("invalid-input", "Missing manga ID")
        const html = await context.request.getText(new URL(`${ORIGIN}/manga/${mangaId}`), {
            headers: BROWSER_HEADERS
        })
        return extractChapters(html, mangaId)
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const mangaId = input.sourceMangaId ?? (input.url ? matchMangaId(input.url) : undefined)
        if (!mangaId) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${mangaId}`), {
                headers: BROWSER_HEADERS
            })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        const mangaId = input.sourceMangaId ?? (input.url ? matchMangaId(input.url) : undefined)
        if (!mangaId) return []
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/manga/${mangaId}`), {
                headers: BROWSER_HEADERS
            })
            return extractGenres(html)
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        const trimmed = query.trim()
        if (!trimmed) return []
        try {
            const url = new URL(ORIGIN)
            url.searchParams.set("search", trimmed)
            url.searchParams.set("search_by", "book_name")
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parts = matchChapterParts(input.url)
        if (!parts) throw new SourceError("unsupported-url", "Not a recognised MangaKatana chapter URL")
        const { mangaId, chapterNum } = parts
        const now = context.now()
        const recordId = `${SOURCE_ID}:manga:${mangaId}`

        const html = await context.request.getText(input.url, { headers: BROWSER_HEADERS })
        const imageUrls = extractImages(html)
        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No chapter images found")
        }

        let title = mangaId.replace(/\.\d+$/, "").replace(/-/g, " ")
        let coverUrl: string | undefined
        try {
            const mangaHtml = await context.request.getText(new URL(`${ORIGIN}/manga/${mangaId}`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(mangaHtml) ?? title
            coverUrl = extractCoverUrl(mangaHtml)
        } catch {
            // best-effort metadata
        }

        const manga: SourceManga = {
            manga: {
                id: recordId,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaId,
            url: `${ORIGIN}/manga/${mangaId}`
        }

        const chapter: SourceChapter = {
            id: `${SOURCE_ID}:chapter:${mangaId}:${chapterNum}`,
            mangaId: recordId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterNum,
            title: `Chapter ${chapterNum}`,
            url: input.url.toString(),
            sortKey: parseChapterNumber(chapterNum) ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({
            id: `${SOURCE_ID}:chapter:${mangaId}:${chapterNum}:page:${i + 1}`,
            url
        }))

        return { manga, chapter, pages }
    }
}
