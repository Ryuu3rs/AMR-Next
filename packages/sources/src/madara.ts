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

// Config-driven adapter for the Madara WordPress manga theme. One factory covers
// the whole template family — a new Madara site is a config row, not new code.
export type MadaraConfig = {
    id: string
    name: string
    origin: string
    domains: string[]
    // URL base segment for series, e.g. "manga" -> /manga/<slug>/. Default "manga".
    mangaPath?: string
    // Chapter slug prefix, e.g. "chapter" -> chapter-12. Default "chapter".
    chapterPrefix?: string
    language?: string
    rateLimit?: { requests: number; intervalMs: number }
}

function captureGroup(match: RegExpMatchArray, index: number): string | undefined {
    const v = match[index]
    return typeof v === "string" ? v : undefined
}

// Get an attribute value from an img tag, handles both quote styles and any attribute order.
function getImgAttr(tag: string, ...attrNames: string[]): string | undefined {
    for (const attr of attrNames) {
        const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const dq = tag.match(new RegExp(`\\b${escaped}="([^"]*)"`, "i"))
        if (dq) {
            const v = captureGroup(dq, 1)
            if (v && !v.startsWith("data:") && v.startsWith("http")) return v
        }
        const sq = tag.match(new RegExp(`\\b${escaped}='([^']*)'`, "i"))
        if (sq) {
            const v = captureGroup(sq, 1)
            if (v && !v.startsWith("data:") && v.startsWith("http")) return v
        }
    }
    return undefined
}

// Reject WordPress thumbnail suffixes (-150x150 etc.) and obvious non-page images.
function isLikelyPageImage(url: string): boolean {
    if (/-\d{2,5}x\d{2,5}\./.test(url)) return false
    return true
}

export function extractImagesFromHtml(html: string): string[] {
    // Narrow to reading-content (gallery-dl confirmed: excludes sidebar/header junk).
    const readingMatch = html.match(
        /<div[^>]*\breading-content\b[^>]*>([\s\S]*?)(?:<div[^>]*\bentry-header\b|<\/div>\s*<div[^>]*\bentry-content\b)/i
    )
    const scope = readingMatch ? (captureGroup(readingMatch, 1) ?? html) : html

    const imgTags = [...scope.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)

    // Strategy 0: id="image-N" + read src first (real URL in src, junk in data-src).
    const imageIdTags = imgTags.filter(t => /\bid="image-\d+"/.test(t))
    if (imageIdTags.length > 0) {
        const urls = imageIdTags
            .map(t => getImgAttr(t, "src", "data-src", "data-lazy-src"))
            .filter((u): u is string => u !== undefined && isLikelyPageImage(u))
        if (urls.length > 0) return urls
    }

    // Strategy 1: wp-manga-chapter-img class.
    const chapterTags = imgTags.filter(t => /\bwp-manga-chapter-img\b/.test(t))
    if (chapterTags.length > 0) {
        const urls = chapterTags
            .map(t => getImgAttr(t, "data-src", "data-lazy-src", "src"))
            .filter((u): u is string => u !== undefined && isLikelyPageImage(u))
        if (urls.length > 0) return urls
    }

    // Strategy 2: chapter_preloaded_images JS variable.
    const preloaded = html.match(/chapter_preloaded_images\s*=\s*(\[[^\]]+\])/)
    const preloadedRaw = preloaded ? captureGroup(preloaded, 1) : undefined
    if (preloadedRaw) {
        try {
            const parsed = JSON.parse(preloadedRaw) as unknown[]
            const urls = parsed.filter(
                (u): u is string => typeof u === "string" && u.startsWith("http") && isLikelyPageImage(u)
            )
            if (urls.length > 0) return urls
        } catch {
            // ignore
        }
    }

    // Strategy 3: imgs in page-break divs (Madara scroll-mode structure).
    const pageBreaks = [...html.matchAll(/<div[^>]*\bpage-break\b[^>]*>([\s\S]*?)<\/div>/gi)]
    if (pageBreaks.length > 0) {
        const urls = pageBreaks.flatMap(m => {
            const block = captureGroup(m, 1) ?? ""
            const blockTags = [...block.matchAll(/<img\b[^>]*>/gi)].map(t => captureGroup(t, 0) ?? "").filter(Boolean)
            return blockTags
                .map(t => getImgAttr(t, "data-src", "data-lazy-src", "src"))
                .filter((u): u is string => u !== undefined && isLikelyPageImage(u))
        })
        if (urls.length > 0) return urls
    }

    return []
}

function extractChapterId(html: string): string | undefined {
    const patterns = [
        /\bpostid-(\d+)\b/,
        /<link[^>]*\brel=["']canonical["'][^>]*\bhref=["'][^"']*[?&]p=(\d+)/i,
        /<link[^>]*\bhref=["'][^"']*[?&]p=(\d+)[^"']*["'][^>]*\brel=["']canonical["']/i,
        /\breading-content\b[^>]*\bdata-id=["'](\d+)["']/i,
        /\bdata-id=["'](\d+)["'][^>]*\breading-content\b/i,
        /\bid=["']wp-manga-chapter-(\d+)["']/i,
        /<link[^>]*\brel=["']shortlink["'][^>]*\bhref=["'][^"']*[?&]p=(\d+)/i,
        /<input[^>]*\bname=["']chapter_id["'][^>]*\bvalue=["'](\d+)["']/i,
        /<input[^>]*\bvalue=["'](\d+)["'][^>]*\bname=["']chapter_id["']/i,
        /"chapterID"\s*:\s*"(\d+)"/,
        /"chapter_id"\s*:\s*"?(\d+)"?/,
        /\bchapter_id\s*[=:]\s*["']?(\d+)["']?/
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractNonce(html: string): string | undefined {
    const patterns = [
        /"reading_ajax_nonce"\s*:\s*"([a-z0-9]{10})"/i,
        /"nonce"\s*:\s*"([a-z0-9]{10})"/i,
        /reading_ajax_nonce["'\s]*[=:]["'\s]*([a-z0-9]{10})/i,
        /_wpnonce["'\s]*[=:]["'\s]*([a-z0-9]{10})/i,
        /wpmangaOoptions[^{]*\{[^}]*"nonce"\s*:\s*"([a-z0-9]{10})"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
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

function extractMangaTitle(html: string, mangaSlug: string): string {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const titleText = titleMatch ? captureGroup(titleMatch, 1) : undefined
    if (titleText) {
        const parts = titleText.split(/\s*[-–|]\s*/)
        if (parts.length >= 3) {
            const title = parts.slice(1, -1).join(" - ").trim()
            if (title) return title
        }
    }
    return mangaSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

export function createMadaraAdapter(config: MadaraConfig): SourceAdapter {
    const mangaPath = config.mangaPath ?? "manga"
    const chapterPrefix = config.chapterPrefix ?? "chapter"
    const language = config.language ?? "en"
    const escapedPath = mangaPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const escapedPrefix = chapterPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const chapterRe = new RegExp(`^/${escapedPath}/([^/]+)/(${escapedPrefix}[^/]+)/`)
    const mangaRe = new RegExp(`^/${escapedPath}/([^/]+)/?$`)
    const chapterNumberRe = new RegExp(`${escapedPrefix}-(\\d+(?:\\.\\d+)?)`, "i")

    const browserHeaders = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: config.origin + "/"
    }
    const ajaxHeaders = {
        ...browserHeaders,
        Accept: "*/*",
        "X-Requested-With": "XMLHttpRequest"
    }

    function extractChapterSlugs(url: URL): { mangaSlug: string; chapterSlug: string } | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        const match = url.pathname.match(chapterRe)
        if (!match) return undefined
        const mangaSlug = match[1]
        const chapterSlug = match[2]
        if (!mangaSlug || !chapterSlug) return undefined
        return { mangaSlug, chapterSlug }
    }

    function extractMangaSlug(url: URL): string | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        return url.pathname.match(mangaRe)?.[1]
    }

    function extractChapterNumber(chapterSlug: string): string {
        const match = chapterSlug.match(chapterNumberRe)
        return (match ? captureGroup(match, 1) : undefined) ?? "1"
    }

    async function fetchAjaxImages(html: string, context: SourceContext): Promise<{ urls: string[]; debug: string }> {
        const chapterId = extractChapterId(html)
        if (!chapterId) return { urls: [], debug: "chId=MISSING" }

        const ajaxUrl = new URL(`${config.origin}/wp-admin/admin-ajax.php`)
        const nonce = extractNonce(html)
        const params: Record<string, string> = { action: "manga_get_chapter_img_list", chapter_id: chapterId }
        if (nonce) params["wpmanga-reading-ajax-nonce"] = nonce
        const debugPrefix = `chId=${chapterId} nonce=${nonce ?? "MISSING"}`

        try {
            const body = await context.request.postForm(ajaxUrl, params, { headers: ajaxHeaders })
            try {
                const json = JSON.parse(body) as { html?: unknown; data?: unknown; images?: unknown }
                if (Array.isArray(json.images)) {
                    const urls = (json.images as unknown[]).filter(
                        (u): u is string => typeof u === "string" && u.startsWith("http")
                    )
                    if (urls.length > 0) return { urls, debug: `${debugPrefix} json.images ok (${urls.length})` }
                }
                const htmlContent =
                    typeof json.html === "string" ? json.html : typeof json.data === "string" ? json.data : undefined
                if (htmlContent) {
                    const urls = extractImagesFromHtml(htmlContent)
                    if (urls.length > 0) return { urls, debug: `${debugPrefix} json.html ok (${urls.length})` }
                    return { urls: [], debug: `${debugPrefix} json.html found 0 imgs` }
                }
                return { urls: [], debug: `${debugPrefix} JSON keys=${Object.keys(json).join(",")}` }
            } catch {
                const urls = extractImagesFromHtml(body)
                if (urls.length > 0) return { urls, debug: `${debugPrefix} raw-html ok (${urls.length})` }
                return { urls: [], debug: `${debugPrefix} non-JSON body len=${body.length}` }
            }
        } catch (error) {
            return { urls: [], debug: `${debugPrefix} POST threw: ${String(error)}` }
        }
    }

    return {
        manifest: {
            id: config.id,
            name: config.name,
            domains: config.domains,
            languages: [language],
            capabilities: ["pages"],
            requestRateLimit: config.rateLimit ?? { requests: 3, intervalMs: 1000 },
            fixtureVersion: 1
        },

        match(url: URL): SourcePageMatch {
            if (extractChapterSlugs(url)) return "chapter"
            if (extractMangaSlug(url)) return "manga"
            return "none"
        },

        async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
            const slug = input.url ? extractMangaSlug(input.url) : input.sourceMangaId
            if (!slug) throw new SourceError("invalid-input", `A valid ${config.name} manga URL is required`)
            const now = context.now()
            const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
            return {
                manga: {
                    id: `${config.id}:manga:${slug}`,
                    title,
                    normalizedTitle: title.toLowerCase(),
                    authors: [],
                    status: "unknown",
                    addedAt: now,
                    updatedAt: now
                },
                sourceId: config.id,
                sourceMangaId: slug,
                url: `${config.origin}/${mangaPath}/${slug}/`
            }
        },

        async listChapters(_input: ListChaptersInput, _context: SourceContext): Promise<SourceChapter[]> {
            throw new SourceError("invalid-input", `${config.name} chapter listing is not supported`)
        },

        async resolveCover(
            input: { sourceMangaId?: string; url?: URL },
            context: SourceContext
        ): Promise<string | undefined> {
            const slug = input.sourceMangaId ?? (input.url ? extractMangaSlug(input.url) : undefined)
            if (!slug) return undefined
            try {
                const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}/`), {
                    headers: browserHeaders
                })
                return extractCoverUrl(html)
            } catch {
                return undefined
            }
        },

        async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
            if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
            const slugs = extractChapterSlugs(input.url)
            if (!slugs) throw new SourceError("unsupported-url", "This chapter URL is not supported")

            const html = await context.request.getText(input.url, { headers: browserHeaders })

            // AJAX first: bypasses anti-scraping data-src traps in static HTML.
            const ajaxResult = await fetchAjaxImages(html, context)
            let imageUrls = ajaxResult.urls
            context.logger.debug(`${config.name} AJAX result`, { debug: ajaxResult.debug, count: imageUrls.length })

            if (imageUrls.length === 0) imageUrls = extractImagesFromHtml(html)

            if (imageUrls.length === 0) {
                const hasCf = /cf-browser-verification|cf_chl_jschl|__cf_chl_captcha/.test(html)
                throw new SourceError(
                    "invalid-response",
                    `No images found [ajax:${ajaxResult.debug}] [html:${html.length}b cf=${hasCf}]`
                )
            }

            const mangaTitle = extractMangaTitle(html, slugs.mangaSlug)
            const chapterNumber = extractChapterNumber(slugs.chapterSlug)
            const coverUrl = extractCoverUrl(html)
            const now = context.now()
            const mangaId = `${config.id}:manga:${slugs.mangaSlug}`
            const chapterId = `${config.id}:chapter:${slugs.mangaSlug}:${slugs.chapterSlug}`

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
                sourceId: config.id,
                sourceMangaId: slugs.mangaSlug,
                url: `${config.origin}/${mangaPath}/${slugs.mangaSlug}/`
            }

            const chapter: SourceChapter = {
                id: chapterId,
                mangaId,
                sourceId: config.id,
                sourceChapterId: `${slugs.mangaSlug}:${slugs.chapterSlug}`,
                title: `Chapter ${chapterNumber}`,
                url: input.url.toString(),
                sortKey: parseFloat(chapterNumber) || 0,
                language
            }

            const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
            context.logger.debug(`Resolved ${config.name} chapter`, { chapterId, pageCount: pages.length })
            return { manga, chapter, pages }
        }
    }
}
