import {
    SourceError,
    UNNUMBERED_SORT_KEY,
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

const SOURCE_ID = "olympustaff"
const ORIGIN = "https://olympustaff.com"
const DOMAINS = ["olympustaff.com", "www.olympustaff.com"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// /series/<slug>           → manga page
// /series/<slug>/<chapter> → chapter page (chapter is a number, e.g. 1, 54, 407)
const MANGA_RE = /^\/series\/([^/]+)\/?$/
const CHAPTER_RE = /^\/series\/([^/]+)\/(\d+(?:\.\d+)?)\/?$/

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

function extractOgMeta(html: string, property: string): string | undefined {
    const m =
        html.match(new RegExp(`property="${property}"\\s+content="([^"]+)"`, "i")) ??
        html.match(new RegExp(`content="([^"]+)"\\s+property="${property}"`, "i"))
    return m ? captureGroup(m, 1) : undefined
}

function extractTitle(html: string): string | undefined {
    const og = extractOgMeta(html, "og:title")
    if (og) return decodeHtml(og)
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? decodeHtml(captureGroup(m, 1) ?? "") : undefined
}

function extractCoverUrl(html: string): string | undefined {
    // og:image is reliable on Next.js SSR pages
    return extractOgMeta(html, "og:image")
}

// Chapter links: href="/series/<slug>/<number>" or full URL
function extractChapterLinks(html: string, slug: string): Array<{ num: string; title: string; url: string }> {
    const seen = new Set<string>()
    const results: Array<{ num: string; title: string; url: string }> = []
    const re = new RegExp(`href="(?:${ORIGIN})?/series/${slug}/(\\d+(?:\\.\\d+)?)"`, "gi")

    for (const m of html.matchAll(re)) {
        const num = captureGroup(m, 1)
        if (!num || seen.has(num)) continue
        seen.add(num)

        // Try to find a title div near the link - best-effort; fall back to "Ch.N"
        const afterHref = html.slice(m.index ?? 0, (m.index ?? 0) + 600)
        const divTexts = [...afterHref.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)]
            .map(d => sanitizeScrapedText(captureGroup(d, 1) ?? ""))
            .filter(t => t.length > 2 && t.length < 120 && !/^\d/.test(t) && !/ago$/.test(t))
        const title = divTexts[0] ?? `Ch.${num}`

        results.push({ num, title, url: `${ORIGIN}/series/${slug}/${num}` })
    }
    return results
}

// Fetch all paginated chapter pages for a manga
async function fetchAllChapterLinks(
    slug: string,
    context: SourceContext
): Promise<Array<{ num: string; title: string; url: string }>> {
    const all: Array<{ num: string; title: string; url: string }> = []
    const seen = new Set<string>()

    for (let page = 1; page <= 50; page++) {
        const pageUrl =
            page === 1 ? new URL(`${ORIGIN}/series/${slug}`) : new URL(`${ORIGIN}/series/${slug}?page=${page}`)

        let html: string
        try {
            html = await context.request.getText(pageUrl, { headers: BROWSER_HEADERS })
        } catch {
            break
        }

        const links = extractChapterLinks(html, slug)
        if (links.length === 0) break

        let anyNew = false
        for (const l of links) {
            if (!seen.has(l.num)) {
                seen.add(l.num)
                all.push(l)
                anyNew = true
            }
        }
        if (!anyNew) break

        // No next-page link → done
        if (!html.includes(`?page=${page + 1}`) && !html.includes(`page=${page + 1}`)) break
    }
    return all
}

// Extract chapter images: Next.js SSR renders them as <img src="..." alt="image of episode">
function extractImages(html: string): string[] {
    const urls: string[] = []
    const seen = new Set<string>()
    // Primary selector pattern from SSR HTML
    for (const m of html.matchAll(/<img\b[^>]*alt="image of episode"[^>]*>/gi)) {
        const tag = captureGroup(m, 0) ?? ""
        const src = tag.match(/\bsrc="(https?:\/\/[^"]+)"/i)
        const url = src ? captureGroup(src, 1) : undefined
        if (url && !seen.has(url)) {
            seen.add(url)
            urls.push(url)
        }
    }
    if (urls.length > 0) return urls

    // Fallback: scan for olympustaff.com/uploads/ image paths
    for (const m of html.matchAll(/https?:\/\/olympustaff\.com\/uploads\/[^\s"'<>]+\.webp/gi)) {
        const url = m[0]
        if (!seen.has(url)) {
            seen.add(url)
            urls.push(url)
        }
    }
    return urls
}

export const olympusstaffAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "OlympusStaff",
        domains: DOMAINS,
        languages: ["ar", "en"],
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
        if (!slug) throw new SourceError("invalid-input", "A valid OlympusStaff series URL is required")
        const now = context.now()
        let title = slug.toUpperCase()
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${slug}`), {
                headers: BROWSER_HEADERS
            })
            title = extractTitle(html) ?? title
            coverUrl = extractCoverUrl(html)
        } catch {}
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: `${ORIGIN}/series/${slug}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "Missing series ID")
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const links = await fetchAllChapterLinks(slug, context)
        return links
            .map(l => ({
                id: `${SOURCE_ID}:chapter:${slug}:${l.num}`,
                mangaId,
                sourceId: SOURCE_ID,
                sourceChapterId: l.num,
                title: l.title,
                url: l.url,
                sortKey: parseChapterNumber(l.num) ?? UNNUMBERED_SORT_KEY,
                language: "en"
            }))
            .sort((a, b) => b.sortKey - a.sortKey)
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? matchMangaSlug(input.url) : undefined)
        if (!slug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/series/${slug}`), {
                headers: BROWSER_HEADERS
            })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async resolveGenres(): Promise<string[]> {
        return []
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${ORIGIN}/series`)
            url.searchParams.set("search", query)
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            const out: SourceSearchResult[] = []
            const seen = new Set<string>()
            const searchResultRe = new RegExp(`href="(?:${ORIGIN})?/series/([^/"]+)"[^>]*>([\\s\\S]*?)<\\/a>`, "gi")
            for (const m of html.matchAll(searchResultRe)) {
                const slug = captureGroup(m, 1)
                const inner = captureGroup(m, 2) ?? ""
                if (!slug || seen.has(slug)) continue
                seen.add(slug)
                const title = sanitizeScrapedText(inner)
                if (title.length < 2) continue
                const imgM = inner.match(/\bsrc="(https?:\/\/[^"]+)"/)
                out.push({
                    sourceId: SOURCE_ID,
                    sourceMangaId: slug,
                    title,
                    url: `${ORIGIN}/series/${slug}`,
                    ...(imgM ? { coverUrl: imgM[1] } : {})
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
        const parts = matchChapterParts(input.url)
        if (!parts) throw new SourceError("unsupported-url", "Not a recognised OlympusStaff chapter URL")
        const { slug, chapterNum } = parts
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const chapterId = `${SOURCE_ID}:chapter:${slug}:${chapterNum}`

        const html = await context.request.getText(input.url, { headers: BROWSER_HEADERS })

        const imageUrls = extractImages(html)
        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No chapter images found - the page may require JavaScript")
        }

        const title = extractTitle(html) ?? slug.toUpperCase()
        const coverUrl = extractCoverUrl(html)

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
            sourceMangaId: slug,
            url: `${ORIGIN}/series/${slug}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterNum,
            title: `Ch.${chapterNum}`,
            url: input.url.toString(),
            sortKey: parseChapterNumber(chapterNum) ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({
            id: `${chapterId}:page:${i + 1}`,
            url
        }))

        return { manga, chapter, pages }
    }
}
