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

const SOURCE_ID = "asurascans"
const ORIGIN = "https://asurascans.com"
const DOMAIN = "asurascans.com"
const LANGUAGE = "en"

// Chapter: /comics/<slug-with-uuid>/chapter/<num>
const chapterRe = /^\/comics\/([a-z0-9][a-z0-9-]*)\/chapter\/(\d+(?:[.-]\d+)?)\/?\s*$/i
// Series: /comics/<slug-with-uuid>/
const seriesRe = /^\/comics\/([a-z0-9][a-z0-9-]*)\/?\s*$/i

function isDomain(url: URL): boolean {
    return matchesSourceDomain(url.hostname, [DOMAIN])
}

function parseChapterUrl(url: URL): { slug: string; num: string } | null {
    if (!isDomain(url)) return null
    const m = url.pathname.match(chapterRe)
    if (m?.[1] && m[2]) return { slug: m[1], num: m[2] }
    return null
}

function parseSeriesUrl(url: URL): string | null {
    if (!isDomain(url)) return null
    return url.pathname.match(seriesRe)?.[1] ?? null
}

function extractImages(html: string): string[] {
    // Strategy 1: React Flight (RSC) data — "url":[0,"https://cdn.asurascans.com/asura-images/chapters/..."]
    const flightUrls = [
        ...html.matchAll(/"url":\[0,"(https?:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^"]+)"/g)
    ].map(m => m[1])
    if (flightUrls.length > 0) return flightUrls

    // Strategy 2: <img data-page-index="N"> — chapter page imgs present in SSR HTML
    const pageImgs: string[] = []
    for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
        const tag = m[1]
        if (!/data-page-index/.test(tag)) continue
        const srcM = tag.match(/\bsrc=["']([^"']+)["']/)
        if (srcM?.[1]) pageImgs.push(srcM[1])
    }
    if (pageImgs.length > 0) return pageImgs

    // Strategy 3: CDN chapter URL filter — catch-all for rendered DOM (tab fallback)
    return [
        ...html.matchAll(
            /<img\b[^>]*\bsrc=["'](https?:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^"']+)["'][^>]*>/gi
        )
    ].map(m => m[1])
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

function extractChapterList(html: string, slug: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${slug}`
    const linkRe = new RegExp(
        `href=["'](?:${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})?/comics/${slug}/chapter/(\\d+(?:[.-]\\d+)?)["']`,
        "gi"
    )
    const seen = new Set<string>()
    const out: SourceChapter[] = []
    for (const m of html.matchAll(linkRe)) {
        const num = m[1]
        if (!num || seen.has(num)) continue
        seen.add(num)
        const chapterId = `${SOURCE_ID}:chapter:${slug}-chapter-${num}`
        out.push({
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${slug}/${num}`,
            title: `Chapter ${num}`,
            url: `${ORIGIN}/comics/${slug}/chapter/${num}`,
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

export const asuraScansAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Asura Scans",
        domains: [DOMAIN],
        languages: [LANGUAGE],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (parseChapterUrl(url)) return "chapter"
        if (parseSeriesUrl(url)) return "manga"
        return "none"
    },

    async resolveManga(input, context): Promise<SourceManga> {
        const slug = input.url ? parseSeriesUrl(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid Asura Scans series URL is required")
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
            url: `${ORIGIN}/comics/${slug}/`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid Asura Scans series id is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/comics/${slug}/`), {
            headers: browserHeaders
        })
        const chapters = extractChapterList(html, slug)
        chapters.sort((a, b) => a.sortKey - b.sortKey)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(input, context): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? parseSeriesUrl(input.url) : undefined)
        if (!slug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/comics/${slug}/`), {
                headers: browserHeaders
            })
            return extractCover(html)
        } catch {
            return undefined
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        try {
            const url = new URL(`${ORIGIN}/comics`)
            url.searchParams.set("q", query)
            const html = await context.request.getText(url, { headers: browserHeaders })
            const cardRe =
                /href=["'](?:https:\/\/asurascans\.com)?\/comics\/([a-z0-9][a-z0-9-]*)["'][^>]*>[^<]*<[^>]*>([^<]+)/gi
            const out: SourceSearchResult[] = []
            const seen = new Set<string>()
            for (const m of html.matchAll(cardRe)) {
                const s = m[1]
                const rawTitle = m[2]?.trim()
                if (!s || !rawTitle || seen.has(s)) continue
                seen.add(s)
                out.push({
                    sourceId: SOURCE_ID,
                    sourceMangaId: s,
                    title: rawTitle,
                    url: `${ORIGIN}/comics/${s}/`
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

        const { slug, num } = parsed
        const html = await context.request.getText(input.url, { headers: browserHeaders })
        const imageUrls = extractImages(html)

        if (imageUrls.length === 0) {
            const isBlocked =
                /cf_chl|challenge-platform|cf-browser-verification|__cf_chl_captcha|ddos-guard\.net/i.test(html)
            const msg = `No images found [html:${html.length}b blocked=${isBlocked}]`
            throw new SourceRequestError(msg, undefined, { url: input.url.toString() })
        }

        const title = extractTitle(html, slug)
        const coverUrl = extractCover(html)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const chapterId = `${SOURCE_ID}:chapter:${slug}-chapter-${num}`

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
            sourceMangaId: slug,
            url: `${ORIGIN}/comics/${slug}/`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${slug}/${num}`,
            title: `Chapter ${num}`,
            url: input.url.toString(),
            sortKey: parseFloat(num) || 0,
            language: LANGUAGE
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved AsuraScans chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
