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
    type SourcePageMatch
} from "@amr/source-sdk"

const SOURCE_ID = "manganato"
// All outbound requests normalize to this one origin (chapters + manga pages).
// Input URLs on any of the four domains are accepted by match() but fetched here.
const ORIGIN = "https://chapmanganato.to"
const DOMAINS = [
    "chapmanganato.to",
    "chapmanganato.com",
    "manganato.com",
    "www.manganato.com",
    "chapmanganelo.com",
    "www.chapmanganelo.com"
]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
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

// /manga-XXXX  (no trailing path segment) → manga id
function extractMangaId(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const match = url.pathname.match(/^\/(manga-[a-z0-9]+)\/?$/i)
    return match?.[1]
}

// /manga-XXXX/chapter-N → { mangaId, chapterSlug }
function extractChapterIds(url: URL): { mangaId: string; chapterSlug: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const match = url.pathname.match(/^\/(manga-[a-z0-9]+)\/(chapter-[a-z0-9._-]+)\/?$/i)
    const mangaId = match?.[1]
    const chapterSlug = match?.[2]
    if (!mangaId || !chapterSlug) return undefined
    return { mangaId, chapterSlug }
}

function chapterNumberOf(slug: string): string {
    const m = slug.match(/chapter-(\d+(?:[.-]\d+)?)/i)
    const raw = m ? captureGroup(m, 1) : undefined
    return raw ? raw.replace("-", ".") : "1"
}

function mangaPageUrl(mangaId: string): URL {
    return new URL(`${ORIGIN}/${mangaId}`)
}

function extractImages(html: string): string[] {
    const containerMatch = html.match(
        /<div[^>]*\bclass=["'][^"']*\bcontainer-chapter-reader\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    )
    const scope = containerMatch ? (captureGroup(containerMatch, 1) ?? html) : html
    const tags = [...scope.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)

    function getImgUrl(tag: string): string | undefined {
        for (const attr of ["src", "data-src"]) {
            const m = tag.match(new RegExp(`\\b${attr}="(https?://[^"]+)"`, "i"))
            const url = m ? captureGroup(m, 1) : undefined
            if (url && !url.startsWith("data:")) return url
        }
        return undefined
    }

    return tags.map(getImgUrl).filter((u): u is string => u !== undefined && /\.(jpe?g|png|webp|gif)/i.test(u))
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /<meta\s[^>]*\bproperty="og:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i,
        /<meta\s[^>]*\bcontent="(https?:\/\/[^"]+)"\s[^>]*\bproperty="og:image"/i,
        /<span[^>]*\bclass=["'][^"']*\binfo-image\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractTitle(html: string, fallbackId: string): string {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const h1Text = h1 ? decodeEntities((captureGroup(h1, 1) ?? "").replace(/<[^>]+>/g, "")) : ""
    if (h1Text) return h1Text
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    const titleText = titleMatch ? captureGroup(titleMatch, 1) : undefined
    if (titleText) {
        const cleaned = titleText.split(/\s*[-–|]\s*/)[0]?.trim()
        if (cleaned) return cleaned
    }
    return fallbackId
}

function extractGenres(html: string): string[] {
    const anchors = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const out: string[] = []
    const seen = new Set<string>()
    for (const a of anchors) {
        const href = captureGroup(a, 1) ?? ""
        if (!/\/genre-/i.test(href)) continue
        const text = decodeEntities((captureGroup(a, 2) ?? "").replace(/<[^>]+>/g, ""))
        const key = text.toLowerCase()
        if (text.length < 2 || seen.has(key)) continue
        seen.add(key)
        out.push(text)
        if (out.length >= 15) break
    }
    return out
}

function extractChapterList(html: string, mangaId: string): SourceChapter[] {
    const ulMatch = html.match(/<ul[^>]*\bclass=["'][^"']*\brow-content-chapter\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)
    const scope = ulMatch ? (captureGroup(ulMatch, 1) ?? html) : html
    const parentId = `${SOURCE_ID}:manga:${mangaId}`
    const out: SourceChapter[] = []
    const seen = new Set<string>()
    for (const a of scope.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = captureGroup(a, 1)
        if (!href) continue
        let absolute: URL
        try {
            absolute = new URL(href, ORIGIN)
        } catch {
            continue
        }
        const ids = extractChapterIds(absolute)
        if (!ids || seen.has(ids.chapterSlug)) continue
        seen.add(ids.chapterSlug)
        const number = chapterNumberOf(ids.chapterSlug)
        out.push({
            id: `${SOURCE_ID}:chapter:${mangaId}:${ids.chapterSlug}`,
            mangaId: parentId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${mangaId}:${ids.chapterSlug}`,
            title: `Chapter ${number}`,
            url: `${ORIGIN}/${mangaId}/${ids.chapterSlug}`,
            sortKey: parseFloat(number) || 0,
            language: "en"
        })
    }
    return out
}

export const manganatoAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaNato",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterIds(url)) return "chapter"
        if (extractMangaId(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const mangaId = input.url ? extractMangaId(input.url) : input.sourceMangaId
        if (!mangaId) throw new SourceError("invalid-input", "A valid MangaNato manga URL is required")
        const now = context.now()
        let title = mangaId
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(mangaPageUrl(mangaId), { headers: BROWSER_HEADERS })
            title = extractTitle(html, mangaId)
            coverUrl = extractCoverUrl(html)
        } catch {
            // Fall back to id-derived title
        }
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${mangaId}`,
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
            url: `${ORIGIN}/${mangaId}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const mangaId = input.manga.sourceMangaId
        if (!mangaId) throw new SourceError("invalid-input", "A valid MangaNato manga id is required")
        const html = await context.request.getText(mangaPageUrl(mangaId), { headers: BROWSER_HEADERS })
        const chapters = extractChapterList(html, mangaId)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const mangaId = input.sourceMangaId ?? (input.url ? extractMangaId(input.url) : undefined)
        if (!mangaId) return undefined
        try {
            const html = await context.request.getText(mangaPageUrl(mangaId), { headers: BROWSER_HEADERS })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        const mangaId = input.sourceMangaId ?? (input.url ? extractMangaId(input.url) : undefined)
        if (!mangaId) return []
        try {
            const html = await context.request.getText(mangaPageUrl(mangaId), { headers: BROWSER_HEADERS })
            return extractGenres(html)
        } catch {
            return []
        }
    },

    // search() removed: manganato.com domain was taken over by an unrelated site
    // (spinzywheel.com) as of 2026-06. Requests succeed with 200 but return
    // non-manga HTML, producing empty results. Removing the method excludes this
    // adapter from reconcile search until the domain situation is resolved.

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const ids = extractChapterIds(input.url)
        if (!ids) throw new SourceError("unsupported-url", "This chapter URL is not supported")

        // Normalize to canonical origin regardless of which input domain was used
        const requestUrl = new URL(`${ORIGIN}/${ids.mangaId}/${ids.chapterSlug}`)
        const html = await context.request.getText(requestUrl, { headers: BROWSER_HEADERS })
        const imageUrls = extractImages(html)
        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No images found in chapter page")
        }

        const number = chapterNumberOf(ids.chapterSlug)
        const coverUrl = extractCoverUrl(html)
        const title = extractTitle(html, ids.mangaId)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${ids.mangaId}`
        const chapterId = `${SOURCE_ID}:chapter:${ids.mangaId}:${ids.chapterSlug}`

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
            sourceMangaId: ids.mangaId,
            url: `${ORIGIN}/${ids.mangaId}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${ids.mangaId}:${ids.chapterSlug}`,
            title: `Chapter ${number}`,
            url: requestUrl.toString(),
            sortKey: parseFloat(number) || 0,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved MangaNato chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
