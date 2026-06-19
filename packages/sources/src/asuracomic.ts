import {
    SourceError,
    SourceRequestError,
    matchesSourceDomain,
    type ListChaptersInput,
    type ResolveChapterInput,
    type ResolvedChapter,
    type SourceAdapter,
    type SourceChapter,
    type SourceContext,
    type SourceManga,
    type SourcePageMatch,
    type SourceSearchResult
} from "@amr/source-sdk"

const SOURCE_ID = "asuracomic"
const ORIGIN = "https://asuracomic.net"
const DOMAIN = "asuracomic.net"
const LANGUAGE = "en"

// New URL format since migration to Next.js: /series/<slug>/<chapter-num>
// Slug has a UUID suffix, e.g. return-of-the-disaster-class-hero-4dbc9a3a
const newChapterRe = /^\/series\/([a-z0-9][a-z0-9-]*)\/(\d+(?:[.-]\d+)?)\/?\s*$/i
// Legacy WordPress MangaStream URL: /slug-containing-chapter-N
const oldChapterRe = /^\/([a-z0-9][a-z0-9._-]*chapter[a-z0-9._-]*)\/?$/i
const seriesRe = /^\/series\/([a-z0-9][a-z0-9-]*)\/?\s*$/i

type ParsedChapter = { type: "new"; slug: string; num: string } | { type: "old"; slug: string }

function isDomain(url: URL): boolean {
    return matchesSourceDomain(url.hostname, [DOMAIN])
}

function parseChapterUrl(url: URL): ParsedChapter | null {
    if (!isDomain(url)) return null
    const n = url.pathname.match(newChapterRe)
    if (n?.[1] && n[2]) return { type: "new", slug: n[1], num: n[2] }
    const o = url.pathname.match(oldChapterRe)
    if (o?.[1]) return { type: "old", slug: o[1] }
    return null
}

function parseMangaUrl(url: URL): string | undefined {
    if (!isDomain(url)) return undefined
    return url.pathname.match(seriesRe)?.[1]
}

// Recursively walk a JSON tree to find the first array of 2+ HTTP image URLs.
// Handles any __NEXT_DATA__ shape regardless of nesting.
function findImageArray(node: unknown, depth = 0): string[] {
    if (depth > 12) return []
    if (Array.isArray(node)) {
        const urls = node.filter(
            (x): x is string => typeof x === "string" && /^https?:\/\/.+\.(jpe?g|png|webp|gif)/i.test(x)
        )
        if (urls.length >= 2) return urls
        for (const item of node) {
            const found = findImageArray(item, depth + 1)
            if (found.length >= 2) return found
        }
    } else if (node !== null && typeof node === "object") {
        for (const val of Object.values(node)) {
            const found = findImageArray(val, depth + 1)
            if (found.length >= 2) return found
        }
    }
    return []
}

type ChapterRec = {
    number?: number
    sort_order?: number
    sortOrder?: number
    chapter_number?: number
    chapter?: number
    title?: string
    updated_at?: string
    updatedAt?: string
    [key: string]: unknown
}

function isChapterRec(x: unknown): x is ChapterRec {
    if (!x || typeof x !== "object") return false
    const r = x as Record<string, unknown>
    return (
        typeof r.number === "number" ||
        typeof r.sort_order === "number" ||
        typeof r.sortOrder === "number" ||
        typeof r.chapter_number === "number" ||
        typeof r.chapter === "number"
    )
}

function findChapterArray(node: unknown, depth = 0): ChapterRec[] {
    if (depth > 10) return []
    if (Array.isArray(node)) {
        const recs = node.filter(isChapterRec)
        if (recs.length >= 1) return recs
        for (const item of node) {
            const found = findChapterArray(item, depth + 1)
            if (found.length > 0) return found
        }
    } else if (node !== null && typeof node === "object") {
        for (const val of Object.values(node)) {
            const found = findChapterArray(val, depth + 1)
            if (found.length > 0) return found
        }
    }
    return []
}

function extractImages(html: string): string[] {
    // Strategy 1: __NEXT_DATA__ script tag (SSR JSON bundle)
    const ndm = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (ndm?.[1]) {
        try {
            const found = findImageArray(JSON.parse(ndm[1]) as unknown)
            if (found.length > 0) return found
        } catch {
            /* fall through */
        }
    }

    // Strategy 2: inline application/json blobs (some Next.js builds)
    for (const m of html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        if (!m[1]) continue
        try {
            const found = findImageArray(JSON.parse(m[1]) as unknown)
            if (found.length > 0) return found
        } catch {
            /* ignore */
        }
    }

    // Strategy 3: <img src="..."> scan — works on fully rendered DOM (tab fallback)
    const urls: string[] = []
    for (const m of html.matchAll(
        /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp|gif)[^"']*?)["'][^>]*>/gi
    )) {
        if (m[1]) urls.push(m[1])
    }
    return urls
}

function extractTitle(html: string, slug: string): string {
    const og =
        html.match(/<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']+)["']/i) ??
        html.match(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:title["']/i)
    if (og?.[1]) {
        const t = og[1].split(/\s*[-|]\s*/)[0]?.trim()
        if (t) return t
    }
    const t = html
        .match(/<title>([^<]+)<\/title>/i)?.[1]
        ?.split(/\s*[-|]\s*/)[0]
        ?.trim()
    if (t) return t
    // Strip trailing UUID suffix common in AsuraComic slugs
    return slug
        .replace(/-[a-f0-9]{8}$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
}

function extractCover(html: string): string | undefined {
    return (
        html.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["'](https?:\/\/[^"']+)["']/i)?.[1] ??
        html.match(/<meta\b[^>]*\bcontent=["'](https?:\/\/[^"']+)["'][^>]*\bproperty=["']og:image["']/i)?.[1]
    )
}

function chapterNumOf(parsed: ParsedChapter): string {
    if (parsed.type === "new") return parsed.num
    const m = parsed.slug.match(/chapter[-_ ]?(\d+(?:[.-]\d+)?)/i)
    return m?.[1]?.replace("-", ".") ?? "1"
}

function mangaSlugOf(parsed: ParsedChapter): string {
    if (parsed.type === "new") return parsed.slug
    return parsed.slug.replace(/-?chapter[-_]?\d.*$/i, "") || parsed.slug
}

function extractChapterList(html: string, mangaSlug: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`

    const ndm = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (ndm?.[1]) {
        try {
            const recs = findChapterArray(JSON.parse(ndm[1]) as unknown)
            if (recs.length > 0) {
                return recs.map(r => {
                    const num = String(r.number ?? r.sort_order ?? r.sortOrder ?? r.chapter_number ?? r.chapter ?? 1)
                    const chapterId = `${SOURCE_ID}:chapter:${mangaSlug}-chapter-${num}`
                    return {
                        id: chapterId,
                        mangaId,
                        sourceId: SOURCE_ID,
                        sourceChapterId: `${mangaSlug}/${num}`,
                        title: String(r.title ?? `Chapter ${num}`),
                        url: `${ORIGIN}/series/${mangaSlug}/${num}`,
                        sortKey: parseFloat(num) || 0,
                        language: LANGUAGE
                    }
                })
            }
        } catch {
            /* fall through */
        }
    }

    // Fallback: anchor href scan for /series/<slug>/N links
    const linkRe = new RegExp(`href=["'](?:${ORIGIN})?/series/${mangaSlug}/(\\d+(?:[.-]\\d+)?)["']`, "gi")
    const seen = new Set<string>()
    const out: SourceChapter[] = []
    for (const m of html.matchAll(linkRe)) {
        const num = m[1]
        if (!num || seen.has(num)) continue
        seen.add(num)
        const chapterId = `${SOURCE_ID}:chapter:${mangaSlug}-chapter-${num}`
        out.push({
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${mangaSlug}/${num}`,
            title: `Chapter ${num}`,
            url: `${ORIGIN}/series/${mangaSlug}/${num}`,
            sortKey: parseFloat(num) || 0,
            language: LANGUAGE
        })
    }
    return out
}

const browserHeaders = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
}

export const asuraComicAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Asura Comic",
        domains: [DOMAIN],
        languages: [LANGUAGE],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (parseChapterUrl(url)) return "chapter"
        if (parseMangaUrl(url)) return "manga"
        return "none"
    },

    async resolveManga(input, context): Promise<SourceManga> {
        const slug = input.url ? parseMangaUrl(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid AsuraComic series URL is required")
        const now = context.now()
        const title = slug
            .replace(/-[a-f0-9]{8}$/, "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase())
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLowerCase(),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: `${ORIGIN}/series/${slug}/`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid AsuraComic series id is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/series/${slug}/`), {
            headers: browserHeaders
        })
        const chapters = extractChapterList(html, slug)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(input, context): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? parseMangaUrl(input.url) : undefined)
        if (!slug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${slug}/`), {
                headers: browserHeaders
            })
            return extractCover(html)
        } catch {
            return undefined
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        try {
            const url = new URL(`${ORIGIN}/series`)
            url.searchParams.set("q", query)
            const html = await context.request.getText(url, { headers: browserHeaders })
            // Series cards in the search/listing page — href="/series/<slug>" with a title attribute or heading
            const cardRe =
                /href=["'](?:https:\/\/asuracomic\.net)?\/series\/([a-z0-9][a-z0-9-]*)["'][^>]*>[^<]*<[^>]*>([^<]+)/gi
            const out: SourceSearchResult[] = []
            const seen = new Set<string>()
            for (const m of html.matchAll(cardRe)) {
                const slug = m[1]
                const rawTitle = m[2]?.trim()
                if (!slug || !rawTitle || seen.has(slug)) continue
                seen.add(slug)
                out.push({
                    sourceId: SOURCE_ID,
                    sourceMangaId: slug,
                    title: rawTitle,
                    url: `${ORIGIN}/series/${slug}/`
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

        const mangaSlug = mangaSlugOf(parsed)
        const chapterNum = chapterNumOf(parsed)

        const html = await context.request.getText(input.url, { headers: browserHeaders })
        const imageUrls = extractImages(html)

        if (imageUrls.length === 0) {
            // SSR HTML has no images — AsuraComic may render pages client-side.
            // Throw as a network-origin error so isBotBlocked() returns true in
            // background.ts, triggering the fetchChapterHtmlViaTab fallback which
            // captures the fully JS-rendered DOM (Strategy 3 img scan will find them).
            throw new SourceRequestError("Chapter requires JS rendering — no images in SSR HTML", undefined, {
                url: input.url.toString()
            })
        }

        const title = extractTitle(html, mangaSlug)
        const coverUrl = extractCover(html)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`
        const chapterId = `${SOURCE_ID}:chapter:${mangaSlug}-chapter-${chapterNum}`

        const manga: SourceManga = {
            manga: {
                id: mangaId,
                title,
                normalizedTitle: title.toLowerCase(),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaSlug,
            url: `${ORIGIN}/series/${mangaSlug}/`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: parsed.type === "new" ? `${mangaSlug}/${chapterNum}` : parsed.slug,
            title: `Chapter ${chapterNum}`,
            url: parsed.type === "new" ? input.url.toString() : `${ORIGIN}/series/${mangaSlug}/${chapterNum}`,
            sortKey: parseFloat(chapterNum) || 0,
            language: LANGUAGE
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved AsuraComic chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
