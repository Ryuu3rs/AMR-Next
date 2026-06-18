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

const SOURCE_ID = "mgeko"
const ORIGIN = "https://www.mgeko.cc"
const DOMAINS = ["mgeko.cc", "www.mgeko.cc"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

function extractChapterSlug(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const match = url.pathname.match(/^\/reader\/en\/([^/]+)\/?$/)
    return match?.[1]
}

function extractMangaSlug(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const match = url.pathname.match(/^\/comic\/([^/]+)\/?$/)
    return match?.[1]
}

// Parse slug like "manga-title-chapter-52-eng-li" into parts
function parseChapterSlug(slug: string): { mangaSlug: string; chapterNumber: string; mangaTitle: string } {
    const chapterMatch = slug.match(/^(.*)-chapter-(\d+(?:-\d+)?)-/)
    if (chapterMatch) {
        const mangaSlug = chapterMatch[1] ?? slug
        const raw = chapterMatch[2] ?? "1"
        const chapterNumber = raw.replace("-", ".")
        const mangaTitle = mangaSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
        return { mangaSlug, chapterNumber, mangaTitle }
    }
    return { mangaSlug: slug, chapterNumber: "1", mangaTitle: slug.replace(/-/g, " ") }
}

function captureGroup(match: RegExpMatchArray, index: number): string | undefined {
    const v = match[index]
    return typeof v === "string" ? v : undefined
}

function tryParseJsonArray(raw: string): string[] {
    // Handle JS arrays with single-quoted strings
    try {
        const urls = JSON.parse(raw.replace(/'/g, '"')) as unknown[]
        return urls.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    } catch {
        return []
    }
}

function extractJsArrayVar(html: string, ...varNames: string[]): string[] {
    for (const name of varNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const m = html.match(
            new RegExp(`(?:var\\s+|window\\.)?${escaped}\\s*=\\s*(\\[[\\s\\S]*?\\])[;,]?\\s*(?:\\n|$)`)
        )
        if (m) {
            const raw = captureGroup(m, 1)
            if (raw) {
                const urls = tryParseJsonArray(raw)
                if (urls.length > 0) return urls
            }
        }
    }
    return []
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
    const blockMatch = html.match(/<[^>]*\bclass=["'][^"']*\bgenres\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|ul|p)>/i)
    const scope = blockMatch ? (captureGroup(blockMatch, 1) ?? "") : html
    const anchors = [...scope.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const out: string[] = []
    const seen = new Set<string>()
    for (const a of anchors) {
        const href = captureGroup(a, 1) ?? ""
        if (!blockMatch && !/\/genre/i.test(href)) continue
        const text = (captureGroup(a, 2) ?? "")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&#0*39;|&apos;/g, "'")
            .replace(/&nbsp;/g, " ")
            .trim()
        const key = text.toLowerCase()
        if (text.length < 2 || seen.has(key)) continue
        seen.add(key)
        out.push(text)
        if (out.length >= 15) break
    }
    return out
}

function extractChapterList(html: string, mangaSlug: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`
    const linkRe = /href="\/reader\/en\/([^"]+?)(?:\/)?"/gi
    const seen = new Set<string>()
    const chapters: SourceChapter[] = []

    for (const m of html.matchAll(linkRe)) {
        const chapterSlug = m[1]
        if (!chapterSlug || seen.has(chapterSlug)) continue
        if (!chapterSlug.startsWith(`${mangaSlug}-chapter-`)) continue
        seen.add(chapterSlug)

        const { chapterNumber } = parseChapterSlug(chapterSlug)
        const chapterId = `${SOURCE_ID}:chapter:${chapterSlug}`

        chapters.push({
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterSlug,
            title: `Chapter ${chapterNumber}`,
            url: `${ORIGIN}/reader/en/${chapterSlug}/`,
            sortKey: parseFloat(chapterNumber) || 0,
            language: "en"
        })
    }

    return chapters.sort((a, b) => b.sortKey - a.sortKey)
}

function extractImages(html: string): string[] {
    // Strategy 1: JS array variables (chapImages, chapterImages, imageList, images, pages)
    const jsArrayUrls = extractJsArrayVar(
        html,
        "chapImages",
        "chapterImages",
        "imageList",
        "images",
        "pages",
        "page_images"
    )
    if (jsArrayUrls.length > 0) return jsArrayUrls

    // Strategy 2: JSON object with images/pages key
    const jsonObjMatch = html.match(/["']?images["']?\s*:\s*(\[[\s\S]*?\])/)
    if (jsonObjMatch) {
        const raw = captureGroup(jsonObjMatch, 1)
        if (raw) {
            const urls = tryParseJsonArray(raw)
            if (urls.length > 0) return urls
        }
    }

    // Collect all img tags for attribute-order-safe extraction
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)

    function getImgUrl(tag: string): string | undefined {
        for (const attr of ["src", "data-src", "data-lazy-src"]) {
            const m = tag.match(new RegExp(`\\b${attr}="(https?://[^"]+)"`, "i"))
            const url = m ? captureGroup(m, 1) : undefined
            if (url && !url.startsWith("data:")) return url
        }
        return undefined
    }

    // Strategy 3: imgsrv CDN images
    const imgsrvTags = imgTags.filter(t => /imgsrv/i.test(t))
    if (imgsrvTags.length > 0) {
        const urls = imgsrvTags.map(getImgUrl).filter((u): u is string => u !== undefined)
        if (urls.length > 0) return urls
    }

    // Strategy 4: gallery block images
    const galleryMatches = [...html.matchAll(/<li[^>]*blocks-gallery-item[^>]*>[\s\S]*?<img\b[^>]*>/gi)]
        .map(m => captureGroup(m, 0) ?? "")
        .filter(Boolean)
    if (galleryMatches.length > 0) {
        const tagMatches = galleryMatches.flatMap(block =>
            [...block.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
        )
        const urls = tagMatches.map(getImgUrl).filter((u): u is string => u !== undefined)
        if (urls.length > 0) return urls
    }

    // Strategy 5: any image-like src from chapter content area
    const contentIdx = Math.max(
        html.indexOf("chapter-content"),
        html.indexOf("reading-content"),
        html.indexOf("chapter_content")
    )
    if (contentIdx !== -1) {
        const section = html.slice(contentIdx, contentIdx + 200_000)
        const sectionTags = [...section.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
        const urls = sectionTags
            .map(getImgUrl)
            .filter((u): u is string => u !== undefined && /\.(jpe?g|png|webp|gif)/i.test(u))
        if (urls.length > 0) return urls
    }

    return []
}

export const mgekoAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Mgeko",
        domains: DOMAINS,
        languages: ["en"],
        capabilities: ["chapters", "pages"],
        requestRateLimit: { requests: 3, intervalMs: 1000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (extractChapterSlug(url)) return "chapter"
        if (extractMangaSlug(url)) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
        const slug = input.url ? extractMangaSlug(input.url) : input.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid Mgeko manga URL is required")
        const now = context.now()
        const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
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
            url: `${ORIGIN}/comic/${slug}/`
        }
    },

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        const slug = input.manga.sourceMangaId
        if (!slug) throw new SourceError("invalid-input", "A valid Mgeko manga URL is required")
        const html = await context.request.getText(new URL(`${ORIGIN}/comic/${slug}/`), {
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
            const html = await context.request.getText(new URL(`${ORIGIN}/comic/${slug}/`), {
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
            const html = await context.request.getText(new URL(`${ORIGIN}/comic/${slug}/`), {
                headers: BROWSER_HEADERS
            })
            return extractGenres(html)
        } catch {
            return []
        }
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const chapterSlug = extractChapterSlug(input.url)
        if (!chapterSlug) throw new SourceError("unsupported-url", "This chapter URL is not supported")

        const html = await context.request.getText(input.url, { headers: BROWSER_HEADERS })
        const imageUrls = extractImages(html)

        if (imageUrls.length === 0) {
            throw new SourceError("invalid-response", "No images found in chapter page")
        }

        const { mangaSlug, chapterNumber, mangaTitle } = parseChapterSlug(chapterSlug)
        const coverUrl = extractCoverUrl(html)
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${mangaSlug}`
        const chapterId = `${SOURCE_ID}:chapter:${chapterSlug}`

        const manga: SourceManga = {
            manga: {
                id: mangaId,
                title: mangaTitle,
                normalizedTitle: mangaTitle.toLocaleLowerCase("en"),
                ...(coverUrl ? { coverUrl } : {}),
                authors: [],
                status: "unknown",
                addedAt: now,
                updatedAt: now
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaSlug,
            url: `${ORIGIN}/comic/${mangaSlug}/`
        }

        const chapter: SourceChapter = {
            id: chapterId,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterSlug,
            title: `Chapter ${chapterNumber}`,
            url: input.url.toString(),
            sortKey: parseFloat(chapterNumber) || 0,
            language: "en"
        }

        const pages = imageUrls.map((url, i) => ({
            id: `${chapterId}:page:${i + 1}`,
            url
        }))

        context.logger.debug("Resolved Mgeko chapter", { chapterId, pageCount: pages.length })

        return { manga, chapter, pages }
    }
}
