import {
    SourceError,
    SourceRequestError,
    UNNUMBERED_SORT_KEY,
    decodeHtmlEntities,
    matchesSourceDomain,
    parseChapterNumber,
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

const SOURCE_ID = "mangak"
const ORIGIN = "https://mangak.io"
const DOMAINS = ["mangak.io"]
const LANGUAGE = "en"

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// First path segments that are site routes, never a manga slug. A single-segment
// URL whose slug is one of these must classify as "none" so /search, /genres, etc.
// don't get mistaken for a series page.
const RESERVED_SEGMENTS = new Set([
    "home",
    "about",
    "dmca",
    "contact",
    "search",
    "trending",
    "static",
    "_next",
    "api",
    "login",
    "register",
    "genres",
    "genre"
])

function captureGroup(match: RegExpMatchArray, index: number): string | undefined {
    const v = match[index]
    return typeof v === "string" ? v : undefined
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function humanizeSlug(slug: string): string {
    return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// Path segments, trimming leading/trailing slashes and empties.
function pathSegments(url: URL): string[] {
    return url.pathname.split("/").filter(Boolean)
}

// /{slug}/chapter-{token} → { slug, token }. token keeps its original dash-decimal
// form (e.g. "280-237") for the URL; the sortKey normalizes "-" to "." separately.
function parseChapterUrl(url: URL): { slug: string; token: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const segments = pathSegments(url)
    if (segments.length !== 2) return undefined
    const slug = segments[0]
    const chapterSegment = segments[1]
    if (!slug || !chapterSegment) return undefined
    if (RESERVED_SEGMENTS.has(slug.toLowerCase())) return undefined
    if (!chapterSegment.startsWith("chapter-")) return undefined
    const token = chapterSegment.slice("chapter-".length)
    if (!token) return undefined
    return { slug, token }
}

// /{slug} (single non-reserved segment) → slug.
function parseSeriesUrl(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const segments = pathSegments(url)
    if (segments.length !== 1) return undefined
    const slug = segments[0]
    if (!slug || RESERVED_SEGMENTS.has(slug.toLowerCase())) return undefined
    return slug
}

// Strip the trailing " - MangaK" suffix from an og:title. Falls back to the
// humanized slug when no title is present.
function extractTitle(html: string, slug: string): string {
    const og =
        html.match(/<meta\s[^>]*\bproperty="og:title"\s[^>]*\bcontent="([^"]+)"/i) ??
        html.match(/<meta\s[^>]*\bcontent="([^"]+)"\s[^>]*\bproperty="og:title"/i)
    const raw = og ? captureGroup(og, 1) : undefined
    if (raw) {
        const cleaned = decodeHtmlEntities(raw)
            .replace(/\s*-\s*MangaK\s*$/i, "")
            .trim()
        if (cleaned) return cleaned
    }
    return humanizeSlug(slug)
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

function extractGenres(html: string): string[] {
    const anchors = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const out: string[] = []
    const seen = new Set<string>()
    for (const a of anchors) {
        const href = captureGroup(a, 1) ?? ""
        if (!/\/genres?\//i.test(href)) continue
        const text = decodeHtmlEntities((captureGroup(a, 2) ?? "").replace(/<[^>]+>/g, "")).trim()
        const key = text.toLowerCase()
        if (text.length < 2 || seen.has(key)) continue
        seen.add(key)
        out.push(text)
        if (out.length >= 15) break
    }
    return out
}

type ChapterToken = { token: string; number: string; sortKey: number }

// The SSR series page lists every chapter as /{slug}/chapter-{token} in both the
// rendered hrefs and the RSC flight data. Scan the whole document scoped to this
// slug, dedupe by chapter number, and keep the original token form for the URL.
function extractChapterTokens(html: string, slug: string): ChapterToken[] {
    const re = new RegExp("/" + escapeRegex(slug) + "/chapter-(\\d+(?:[.-]\\d+)?)", "gi")
    const seen = new Set<string>()
    const out: ChapterToken[] = []
    for (const m of html.matchAll(re)) {
        const token = captureGroup(m, 1)
        if (!token) continue
        const number = token.replace("-", ".")
        if (seen.has(number)) continue
        seen.add(number)
        out.push({ token, number, sortKey: parseChapterNumber(number) ?? UNNUMBERED_SORT_KEY })
    }
    return out
}

function buildChapters(tokens: ChapterToken[], slug: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${slug}`
    const chapters = tokens.map(t => ({
        id: `${SOURCE_ID}:chapter:${slug}:chapter-${t.token}`,
        mangaId,
        sourceId: SOURCE_ID,
        sourceChapterId: `${slug}:chapter-${t.token}`,
        title: `Chapter ${t.number}`,
        url: `${ORIGIN}/${slug}/chapter-${t.token}`,
        sortKey: t.sortKey,
        language: LANGUAGE
    }))
    chapters.sort((a, b) => a.sortKey - b.sortKey)
    return chapters
}

// Chapter page images are absolute URLs on rotating rx.<sub>.org CDN subdomains.
// Dedupe preserving first-seen order (that is the reading order). The og:image
// cover lives on the same rx.*.org host family, so exclude it to keep it from
// leaking in as a spurious first page.
function extractImages(html: string, coverUrl?: string): string[] {
    const re = /https?:\/\/rx\.[a-z0-9]+\.org\/[^"'\\\s]+?\.(?:webp|jpe?g|png)/gi
    const seen = new Set<string>()
    const out: string[] = []
    for (const m of html.matchAll(re)) {
        const url = m[0]
        if (url === coverUrl || seen.has(url)) continue
        seen.add(url)
        out.push(url)
    }
    return out
}

function getImgAttr(tag: string, ...attrNames: string[]): string | undefined {
    for (const attr of attrNames) {
        const escaped = escapeRegex(attr)
        const m = tag.match(new RegExp(`\\b${escaped}="([^"]*)"`, "i"))
        const v = m ? captureGroup(m, 1)?.trim() : undefined
        if (v && !v.startsWith("data:")) return v
    }
    return undefined
}

// The SSR search page renders each hit as an anchor to /{slug}; a nearby result
// card carries the title (img alt or anchor text) and cover. Fall back to the
// humanized slug when the card markup is not reliably parseable.
function extractSearchResults(html: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    const re = /<a\b[^>]*\bhref="\/([^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi
    for (const m of html.matchAll(re)) {
        const slug = captureGroup(m, 1)
        if (!slug || slug.includes("chapter-") || RESERVED_SEGMENTS.has(slug.toLowerCase())) continue
        if (seen.has(slug)) continue
        seen.add(slug)
        const inner = captureGroup(m, 2) ?? ""
        const imgTag = inner.match(/<img\b[^>]*>/i)?.[0]
        const alt = imgTag ? getImgAttr(imgTag, "alt", "title") : undefined
        const anchorText = decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim()
        const title = decodeHtmlEntities(alt ?? "").trim() || anchorText || humanizeSlug(slug)
        const coverUrl = imgTag ? getImgAttr(imgTag, "src", "data-src") : undefined
        out.push({
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            title,
            url: `${ORIGIN}/${slug}`,
            ...(coverUrl && coverUrl.startsWith("http") ? { coverUrl } : {})
        })
    }
    return out
}

function isBlockedPage(html: string): boolean {
    return /cf_chl|challenge-platform|cf-browser-verification|__cf_chl_captcha|ddos-guard\.net/i.test(html)
}

export const mangakAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaK",
        domains: DOMAINS,
        languages: [LANGUAGE],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const slug = parseChapterUrl(url)?.slug ?? parseSeriesUrl(url)
        if (!slug) return null
        return { sourceMangaId: slug, mangaUrl: `${ORIGIN}/${slug}` }
    },

    match(url: URL): SourcePageMatch {
        if (parseChapterUrl(url)) return "chapter"
        if (parseSeriesUrl(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const slug = input.url ? parseSeriesUrl(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid MangaK manga URL is required")
        const now = context.now()
        let title = humanizeSlug(slug)
        let coverUrl: string | undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/${slug}`), { headers: BROWSER_HEADERS })
            title = extractTitle(html, slug)
            coverUrl = extractCoverUrl(html)
        } catch {
            // Fall back to slug-derived title
        }
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
            url: `${ORIGIN}/${slug}`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid MangaK manga id is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/${slug}`), { headers: BROWSER_HEADERS })
        const chapters = buildChapters(extractChapterTokens(html, slug), slug)
        return input.limit ? chapters.slice(-input.limit) : chapters
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? parseSeriesUrl(input.url) : undefined)
        if (!slug) return undefined
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/${slug}`), { headers: BROWSER_HEADERS })
            return extractCoverUrl(html)
        } catch {
            return undefined
        }
    },

    async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
        const slug = input.sourceMangaId ?? (input.url ? parseSeriesUrl(input.url) : undefined)
        if (!slug) return []
        try {
            const html = await context.request.getText(new URL(`${ORIGIN}/${slug}`), { headers: BROWSER_HEADERS })
            return extractGenres(html)
        } catch {
            return []
        }
    },

    async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
        if (!query.trim()) return []
        try {
            const url = new URL(`${ORIGIN}/search`)
            url.searchParams.set("q", query)
            const html = await context.request.getText(url, { headers: BROWSER_HEADERS })
            return extractSearchResults(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parsed = parseChapterUrl(input.url)
        if (!parsed) throw new SourceError("unsupported-url", "This chapter URL is not supported")
        const { slug, token } = parsed

        const requestUrl = new URL(`${ORIGIN}/${slug}/chapter-${token}`)
        const html = await context.request.getText(requestUrl, { headers: BROWSER_HEADERS })
        const coverUrl = extractCoverUrl(html)
        const imageUrls = extractImages(html, coverUrl)

        if (imageUrls.length === 0) {
            // A Cloudflare / DDoS-Guard challenge page has no page images; surface it as a
            // network-origin error so the tab fallback can open a real browser tab.
            if (isBlockedPage(html)) {
                throw new SourceRequestError("blocked", undefined, { url: input.url.toString() })
            }
            throw new SourceError("invalid-response", "No images found in chapter page")
        }

        const number = token.replace("-", ".")
        const title = extractTitle(html, slug)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const chapterId = `${SOURCE_ID}:chapter:${slug}:chapter-${token}`

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
            url: `${ORIGIN}/${slug}`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: `${slug}:chapter-${token}`,
            title: `Chapter ${number}`,
            url: requestUrl.toString(),
            sortKey: parseChapterNumber(number) ?? UNNUMBERED_SORT_KEY,
            language: LANGUAGE
        }

        const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
        context.logger.debug("Resolved MangaK chapter", { chapterId, pageCount: pages.length })
        return { manga, chapter, pages }
    }
}
