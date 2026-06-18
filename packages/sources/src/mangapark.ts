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

const SOURCE_ID = "mangapark"
const ORIGIN = "https://mangapark.net"
const DOMAINS = ["mangapark.net"]

// /title/<manga-id>-<lang>-<slug>/<chapter-id>-chapter-<n>[-<group>]
const chapterPathRe = /^\/title\/(\d+)-([a-z]{2})-([^/]+)\/(\d+)-([^/]+)\/?$/i
// /title/<manga-id>-<lang>-<slug>
const mangaPathRe = /^\/title\/(\d+)-([a-z]{2})-([^/]+)\/?$/i

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

type ChapterSlugs = {
    mangaId: string
    lang: string
    mangaSlug: string
    chapterId: string
    chapterSlug: string
}

function parseChapterUrl(url: URL): ChapterSlugs | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(chapterPathRe)
    if (!m) return undefined
    const mangaId = captureGroup(m, 1)
    const lang = captureGroup(m, 2)
    const mangaSlug = captureGroup(m, 3)
    const chapterId = captureGroup(m, 4)
    const chapterSlug = captureGroup(m, 5)
    if (!mangaId || !lang || !mangaSlug || !chapterId || !chapterSlug) return undefined
    return { mangaId, lang, mangaSlug, chapterId, chapterSlug }
}

function parseMangaUrl(url: URL): { mangaId: string; lang: string; slug: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(mangaPathRe)
    if (!m) return undefined
    const mangaId = captureGroup(m, 1)
    const lang = captureGroup(m, 2)
    const slug = captureGroup(m, 3)
    if (!mangaId || !lang || !slug) return undefined
    return { mangaId, lang, slug }
}

function chapterNumberFromSlug(slug: string): string {
    const m = slug.match(/^chapter-(\d+(?:[.-]\d+)?)/)
    const raw = m ? captureGroup(m, 1) : undefined
    return raw ? raw.replace("-", ".") : "1"
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /<meta\s[^>]*\bproperty="og:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i,
        /<meta\s[^>]*\bcontent="(https?:\/\/[^"]+)"\s[^>]*\bproperty="og:image"/i,
        /<meta\s[^>]*\bname="twitter:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i,
        /<meta\s[^>]*\bcontent="(https?:\/\/[^"]+)"\s[^>]*\bname="twitter:image"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractTitle(html: string, fallbackSlug: string): string {
    const ogMatch =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    const og = ogMatch ? captureGroup(ogMatch, 1) : undefined
    if (og) {
        const cleaned = og.split(/\s*[-–|]\s*/)[0]?.trim()
        if (cleaned) return cleaned
    }
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    const title = titleMatch ? captureGroup(titleMatch, 1) : undefined
    if (title) {
        const cleaned = title.split(/\s*[-–|]\s*/)[0]?.trim()
        if (cleaned) return cleaned
    }
    return fallbackSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// Walk any parsed JSON looking for the first array that contains HTTP image URLs.
function findImageArrayInJson(obj: unknown, depth: number = 0): string[] {
    if (depth > 10) return []
    if (Array.isArray(obj)) {
        const httpUrls = obj.filter(
            (u): u is string => typeof u === "string" && u.startsWith("http") && /\.(jpe?g|png|webp|gif)/i.test(u)
        )
        if (httpUrls.length > 2) return httpUrls
        for (const item of obj) {
            const found = findImageArrayInJson(item, depth + 1)
            if (found.length > 0) return found
        }
    } else if (obj !== null && typeof obj === "object") {
        const rec = obj as Record<string, unknown>
        // Prioritise keys that suggest image lists
        const priorityKeys = ["pageUrls", "images", "pages", "pageList", "imageFiles", "imgs", "imageSet", "pageData"]
        for (const key of priorityKeys) {
            if (key in rec) {
                const found = findImageArrayInJson(rec[key], depth + 1)
                if (found.length > 0) return found
            }
        }
        for (const value of Object.values(rec)) {
            const found = findImageArrayInJson(value, depth + 1)
            if (found.length > 0) return found
        }
    }
    return []
}

export function extractMangaParkImages(html: string): string[] {
    // Strategy 1: Next.js __NEXT_DATA__ embedded JSON
    const nextDataMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (nextDataMatch) {
        const raw = captureGroup(nextDataMatch, 1)
        if (raw) {
            try {
                const data = JSON.parse(raw) as unknown
                const urls = findImageArrayInJson(data)
                if (urls.length > 0) return urls
            } catch {
                // fall through
            }
        }
    }

    // Strategy 2: Any <script type="application/json"> block
    for (const m of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        const raw = captureGroup(m, 1)
        if (!raw) continue
        try {
            const data = JSON.parse(raw) as unknown
            const urls = findImageArrayInJson(data)
            if (urls.length > 0) return urls
        } catch {
            // fall through
        }
    }

    // Strategy 3: JS array variable (pageUrls, images, pages, imageFiles, imgHttpLs)
    const jsVarRe = /\b(?:pageUrls|imageFiles|imgHttpLs|images|pages)\s*=\s*(\[[\s\S]*?\])\s*[;,]?\s*(?:\n|$)/
    const jsMatch = html.match(jsVarRe)
    if (jsMatch) {
        const raw = captureGroup(jsMatch, 1)
        if (raw) {
            try {
                const arr = JSON.parse(raw) as unknown[]
                const urls = arr.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
                if (urls.length > 0) return urls
            } catch {
                // fall through
            }
        }
    }

    // Strategy 4: JSON blob inline with pageUrls key
    const pageUrlsMatch = html.match(/"pageUrls"\s*:\s*(\[[\s\S]*?\])/)
    if (pageUrlsMatch) {
        const raw = captureGroup(pageUrlsMatch, 1)
        if (raw) {
            try {
                const arr = JSON.parse(raw) as unknown[]
                const urls = arr.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
                if (urls.length > 0) return urls
            } catch {
                // fall through
            }
        }
    }

    // Strategy 5: img tags with data-src or src pointing to image CDNs
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
    const cdnUrls: string[] = []
    for (const tag of imgTags) {
        for (const attr of ["data-src", "src"]) {
            const attrMatch = tag.match(new RegExp(`\\b${attr}="(https?://[^"]+)"`, "i"))
            const url = attrMatch ? captureGroup(attrMatch, 1) : undefined
            if (url && !url.startsWith("data:") && /\.(jpe?g|png|webp|gif)/i.test(url)) {
                cdnUrls.push(url)
            }
        }
    }
    return cdnUrls
}

function extractChapterList(html: string, mangaId: string, mangaSlug: string, lang: string): SourceChapter[] {
    const chapterLinkRe = new RegExp(
        `href=["'](/title/${mangaId}-${lang}-${mangaSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)-([^"']+))["']`,
        "gi"
    )
    const out: SourceChapter[] = []
    const seen = new Set<string>()
    const mangaDbId = `${SOURCE_ID}:manga:${mangaId}`
    for (const m of html.matchAll(chapterLinkRe)) {
        const chapterId = captureGroup(m, 2)
        const chapterSlug = captureGroup(m, 3)
        if (!chapterId || !chapterSlug || seen.has(chapterId)) continue
        seen.add(chapterId)
        const number = chapterNumberFromSlug(chapterSlug)
        const url = `${ORIGIN}/title/${mangaId}-${lang}-${mangaSlug}/${chapterId}-${chapterSlug}`
        out.push({
            id: `${SOURCE_ID}:chapter:${mangaId}:${chapterId}`,
            mangaId: mangaDbId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${mangaId}:${chapterId}`,
            title: `Chapter ${number}`,
            url,
            sortKey: parseFloat(number) || 0,
            language: lang
        })
    }
    return out
}

function extractSearchResults(html: string): SourceSearchResult[] {
    const linkRe = /<a\s+href="(\/title\/(\d+)-([a-z]{2})-([^"]+))"[^>]*>([\s\S]*?)<\/a>/gi
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    for (const m of html.matchAll(linkRe)) {
        const href = captureGroup(m, 1)
        const mangaId = captureGroup(m, 2)
        const slug = captureGroup(m, 4)
        const innerHtml = captureGroup(m, 5) ?? ""
        if (!href || !mangaId || !slug || seen.has(mangaId)) continue
        seen.add(mangaId)
        // Extract title from anchor inner content: try title attr, h3/h4, or text content
        const titleAttrMatch = m[0].match(/\btitle="([^"]+)"/)
        const headingMatch = innerHtml.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
        const rawTitle =
            (titleAttrMatch ? captureGroup(titleAttrMatch, 1) : undefined) ??
            (headingMatch ? captureGroup(headingMatch, 1) : undefined) ??
            innerHtml.replace(/<[^>]+>/g, "").trim()
        const title = rawTitle
            .replace(/&amp;/g, "&")
            .replace(/&#\d+;/g, "")
            .trim()
        if (!title || title.length < 2) continue
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: mangaId,
            title,
            url: `${ORIGIN}${href}`
        })
    }
    return out
}

export const mangaparkAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaPark",
        domains: DOMAINS,
        languages: ["en"],
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

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const parsed = input.url ? parseMangaUrl(input.url) : undefined
        const mangaId = parsed?.mangaId ?? input.sourceMangaId
        const lang = parsed?.lang ?? "en"
        const slug = parsed?.slug ?? input.sourceMangaId ?? mangaId ?? ""
        if (!mangaId) throw new SourceError("invalid-input", "A valid MangaPark manga URL is required")
        const now = context.now()
        const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${mangaId}`,
                title,
                normalizedTitle: title.toLowerCase(),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaId,
            url: `${ORIGIN}/title/${mangaId}-${lang}-${slug}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const mangaId = input.manga.sourceMangaId
        if (!mangaId) throw new SourceError("invalid-input", "A valid MangaPark manga id is required")
        const mangaUrl = input.manga.url ?? `${ORIGIN}/title/${mangaId}-en-unknown`
        const parsed = parseMangaUrl(new URL(mangaUrl))
        const lang = parsed?.lang ?? "en"
        const slug = parsed?.slug ?? "unknown"
        const html = await context.request.getText(new URL(mangaUrl), { headers: BROWSER_HEADERS })
        const chapters = extractChapterList(html, mangaId, slug, lang)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const mangaId = input.sourceMangaId ?? (input.url ? parseMangaUrl(input.url)?.mangaId : undefined)
        if (!mangaId) return undefined
        const mangaUrl = input.url?.toString() ?? `${ORIGIN}/title/${mangaId}-en-unknown`
        try {
            const html = await context.request.getText(new URL(mangaUrl), { headers: BROWSER_HEADERS })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        const url = new URL(`${ORIGIN}/search`)
        url.searchParams.set("q", query)
        try {
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const slugs = parseChapterUrl(input.url)
        if (!slugs) throw new SourceError("unsupported-url", "This chapter URL is not supported")

        const html = await context.request.getText(input.url, { headers: BROWSER_HEADERS })
        const imageUrls = extractMangaParkImages(html)
        if (imageUrls.length === 0) {
            const hasCf = /cf-browser-verification|cf_chl_jschl|__cf_chl_captcha/.test(html)
            throw new SourceError("invalid-response", `No images found [html:${html.length}b cf=${hasCf}]`)
        }

        const number = chapterNumberFromSlug(slugs.chapterSlug)
        const coverUrl = extractCoverUrl(html)
        const title = extractTitle(html, slugs.mangaSlug)
        const now = context.now()
        const mangaDbId = `${SOURCE_ID}:manga:${slugs.mangaId}`
        const chapterId = `${SOURCE_ID}:chapter:${slugs.mangaId}:${slugs.chapterId}`

        const manga: SourceManga = {
            manga: {
                id: mangaDbId,
                title,
                normalizedTitle: title.toLowerCase(),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slugs.mangaId,
            url: `${ORIGIN}/title/${slugs.mangaId}-${slugs.lang}-${slugs.mangaSlug}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId: mangaDbId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${slugs.mangaId}:${slugs.chapterId}`,
            title: `Chapter ${number}`,
            url: input.url.toString(),
            sortKey: parseFloat(number) || 0,
            language: slugs.lang
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved MangaPark chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
