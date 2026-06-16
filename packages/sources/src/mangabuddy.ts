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

// Config-driven adapter for the MangaBuddy bespoke reader family. One factory
// covers the whole template — a new mirror is a config row. Chapter pages embed
// images either in a JS variable (chapImages/chapterImages/images) or inside a
// #chapter-images / .chapter-content container.
export type MangaBuddyConfig = {
    id: string
    name: string
    origin: string
    domains: string[]
    // Series URL base, e.g. "manga" -> /manga/<slug>. Default "manga".
    mangaPath?: string
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

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function extractBuddyImages(html: string): string[] {
    // Strategy 1: a JS variable holding the image list. Either a JSON array or a
    // comma-separated string. Covers chapImages/chapterImages/images.
    const jsMatch = html.match(/\b(?:chapImages|chapterImages|images)\s*=\s*(\[[\s\S]*?\]|["'][\s\S]*?["'])\s*;?/)
    const rawList = jsMatch ? captureGroup(jsMatch, 1) : undefined
    if (rawList) {
        if (rawList.startsWith("[")) {
            try {
                const parsed = JSON.parse(rawList) as unknown[]
                const urls = parsed.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
                if (urls.length > 0) return urls
            } catch {
                // fall through to comma split
            }
        }
        // Comma-separated string (or a JSON array that didn't parse): split and keep http urls.
        const inner = rawList.replace(/^\s*[["']+|[\]"']+\s*$/g, "")
        const urls = inner
            .split(",")
            .map(s => s.trim().replace(/^["']|["']$/g, ""))
            .filter(u => u.startsWith("http"))
        if (urls.length > 0) return urls
    }

    // Strategy 2: imgs inside #chapter-images / .chapter-images / .chapter-content.
    const containerMatch =
        html.match(/<div[^>]*\bid=["']chapter-images["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
        html.match(/<div[^>]*\bclass=["'][^"']*\bchapter-images\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
        html.match(/<div[^>]*\bclass=["'][^"']*\bchapter-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
    const scope = containerMatch ? (captureGroup(containerMatch, 1) ?? html) : html
    const tags = [...scope.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
    const containerUrls = tags
        .map(t => getImgAttr(t, "src", "data-src", "data-original"))
        .filter((u): u is string => u !== undefined && /\.(jpe?g|png|webp|gif)/i.test(u))
    if (containerUrls.length > 0) return containerUrls

    // Strategy 3: any <img> whose src matches a CDN/imgsrv pattern.
    const allTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
    const cdnUrls = allTags
        .map(t => getImgAttr(t, "src", "data-src", "data-original"))
        .filter((u): u is string => u !== undefined && /(cdn|imgsrv|img-srv|images?\.|\/imgs?\/)/i.test(u))
    return cdnUrls
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
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const titleText = titleMatch ? captureGroup(titleMatch, 1) : undefined
    if (titleText) {
        const cleaned = titleText.split(/\s*[-–|]\s*/)[0]?.trim()
        if (cleaned) return cleaned
    }
    return fallbackSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

export function createMangaBuddyAdapter(config: MangaBuddyConfig): SourceAdapter {
    const mangaPath = config.mangaPath ?? "manga"
    const language = config.language ?? "en"
    const escPath = escapeRegex(mangaPath)
    // Manga page: /<slug> or /<mangaPath>/<slug>.
    const mangaWithPathRe = new RegExp(`^/${escPath}/([^/]+)/?$`)
    const mangaBareRe = /^\/([^/]+)\/?$/
    // Chapter: /<slug>/chapter-<n> or /<slug>/<chapter-slug> (slug containing "chapter").
    const chapterRe = /^\/([^/]+)\/([a-z0-9._-]*chapter[a-z0-9._-]*)\/?$/i

    const browserHeaders = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: config.origin + "/"
    }

    function chapterSlugs(url: URL): { mangaSlug: string; chapterSlug: string } | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        const match = url.pathname.match(chapterRe)
        if (!match) return undefined
        const mangaSlug = match[1]
        const chapterSlug = match[2]
        if (!mangaSlug || !chapterSlug) return undefined
        return { mangaSlug, chapterSlug }
    }

    function mangaSlug(url: URL): string | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        const withPath = url.pathname.match(mangaWithPathRe)?.[1]
        if (withPath) return withPath
        // Bare /<slug>: conservative — reject chapter-looking slugs so non-manga
        // pages (and chapter URLs handled above) don't classify as manga.
        const bare = url.pathname.match(mangaBareRe)?.[1]
        if (!bare || /chapter/i.test(bare)) return undefined
        return bare
    }

    function chapterNumberOf(slug: string): string {
        const m = slug.match(/chapter[-_ ]?(\d+(?:[.-]\d+)?)/i)
        const raw = m ? captureGroup(m, 1) : undefined
        return raw ? raw.replace("-", ".") : "1"
    }

    function extractSearchResults(html: string): SourceSearchResult[] {
        const linkRe = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
        const out: SourceSearchResult[] = []
        const seen = new Set<string>()
        for (const m of html.matchAll(linkRe)) {
            const href = captureGroup(m, 1)
            if (!href) continue
            let absolute: URL
            try {
                absolute = new URL(href, config.origin)
            } catch {
                continue
            }
            if (!matchesSourceDomain(absolute.hostname, config.domains)) continue
            const slug = mangaSlug(absolute)
            if (!slug || seen.has(slug)) continue
            seen.add(slug)
            const inner = captureGroup(m, 2) ?? ""
            const titleAttr = inner.match(/title="([^"]+)"/)
            const titleText = (titleAttr ? captureGroup(titleAttr, 1) : undefined) ?? inner.replace(/<[^>]+>/g, "")
            const title = titleText.trim()
            out.push({
                sourceId: config.id,
                sourceMangaId: slug,
                title: title || slug.replace(/-/g, " "),
                url: absolute.toString()
            })
        }
        return out
    }

    function extractChapterList(html: string, slug: string): SourceChapter[] {
        const mangaId = `${config.id}:manga:${slug}`
        const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => captureGroup(m, 1) ?? "")
        const out: SourceChapter[] = []
        const seen = new Set<string>()
        for (const block of items) {
            const a = block.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
            const href = a ? captureGroup(a, 1) : undefined
            if (!href || !/chapter/i.test(href)) continue
            let absolute: URL
            try {
                absolute = new URL(href, config.origin)
            } catch {
                continue
            }
            const cslug = absolute.pathname.replace(/\/$/, "").split("/").pop()
            if (!cslug || !/chapter/i.test(cslug) || seen.has(cslug)) continue
            seen.add(cslug)
            const number = chapterNumberOf(cslug)
            out.push({
                id: `${config.id}:chapter:${slug}:${cslug}`,
                mangaId,
                sourceId: config.id,
                sourceChapterId: `${slug}:${cslug}`,
                title: `Chapter ${number}`,
                url: absolute.toString(),
                sortKey: parseFloat(number) || 0,
                language
            })
        }
        return out
    }

    return {
        manifest: {
            id: config.id,
            name: config.name,
            domains: config.domains,
            languages: [language],
            capabilities: ["pages", "chapters"],
            requestRateLimit: config.rateLimit ?? { requests: 3, intervalMs: 1000 },
            fixtureVersion: 1,
            homepage: config.origin
        },

        match(url: URL): SourcePageMatch {
            if (chapterSlugs(url)) return "chapter"
            if (mangaSlug(url)) return "manga"
            return "none"
        },

        async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
            const slug = input.url ? mangaSlug(input.url) : input.sourceMangaId
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
                url: `${config.origin}/${mangaPath}/${slug}`
            }
        },

        async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
            const slug = input.manga.sourceMangaId
            if (!slug) throw new SourceError("invalid-input", `A valid ${config.name} manga id is required`)
            const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}`), {
                headers: browserHeaders
            })
            const chapters = extractChapterList(html, slug)
            chapters.sort((a, b) => a.sortKey - b.sortKey)
            return input.limit ? chapters.slice(-input.limit) : chapters
        },

        async resolveCover(
            input: { sourceMangaId?: string; url?: URL },
            context: SourceContext
        ): Promise<string | undefined> {
            const slug = input.sourceMangaId ?? (input.url ? mangaSlug(input.url) : undefined)
            if (!slug) return undefined
            try {
                const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}`), {
                    headers: browserHeaders
                })
                return extractCoverUrl(html)
            } catch {
                return undefined
            }
        },

        async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
            for (const param of ["q", "keyword"]) {
                const url = new URL(`${config.origin}/search`)
                url.searchParams.set(param, query)
                try {
                    const html = await context.request.getText(url, { headers: browserHeaders })
                    const results = extractSearchResults(html)
                    if (results.length > 0) return results
                } catch {
                    // try next param
                }
            }
            return []
        },

        async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
            if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
            const slugs = chapterSlugs(input.url)
            if (!slugs) throw new SourceError("unsupported-url", "This chapter URL is not supported")

            const html = await context.request.getText(input.url, { headers: browserHeaders })
            const imageUrls = extractBuddyImages(html)
            if (imageUrls.length === 0) {
                const hasCf = /cf-browser-verification|cf_chl_jschl|__cf_chl_captcha/.test(html)
                throw new SourceError("invalid-response", `No images found [html:${html.length}b cf=${hasCf}]`)
            }

            const number = chapterNumberOf(slugs.chapterSlug)
            const coverUrl = extractCoverUrl(html)
            const title = extractTitle(html, slugs.mangaSlug)
            const now = context.now()
            const mangaId = `${config.id}:manga:${slugs.mangaSlug}`
            const chapterId = `${config.id}:chapter:${slugs.mangaSlug}:${slugs.chapterSlug}`

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
                sourceId: config.id,
                sourceMangaId: slugs.mangaSlug,
                url: `${config.origin}/${mangaPath}/${slugs.mangaSlug}`
            }

            const chapter: SourceChapter = {
                id: chapterId,
                mangaId,
                sourceId: config.id,
                sourceChapterId: `${slugs.mangaSlug}:${slugs.chapterSlug}`,
                title: `Chapter ${number}`,
                url: input.url.toString(),
                sortKey: parseFloat(number) || 0,
                language
            }

            const pages = imageUrls.map((url, i) => ({ id: `${chapterId}:page:${i + 1}`, url }))
            context.logger.debug(`Resolved ${config.name} chapter`, { chapterId, pageCount: pages.length })
            return { manga, chapter, pages }
        }
    }
}
