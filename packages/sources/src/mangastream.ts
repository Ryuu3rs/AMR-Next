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

// Config-driven adapter for the MangaStream / MangaReader (Theme: ts) WordPress
// family. One factory covers the whole template — a new site is a config row.
// Chapter pages embed images in a `ts_reader.run({...sources:[{images:[]}]})`
// blob and/or a `#readerarea` block.
export type MangaStreamConfig = {
    id: string
    name: string
    origin: string
    domains: string[]
    // Series URL base, e.g. "manga" -> /manga/<slug>/. Default "manga".
    mangaPath?: string
    language?: string
    rateLimit?: { requests: number; intervalMs: number }
}

function captureGroup(match: RegExpMatchArray, index: number): string | undefined {
    const v = match[index]
    return typeof v === "string" ? v : undefined
}

// Navigation / widget labels that leak into a whole-page anchor scan. A real
// search result is a manga title, never one of these control labels.
const JUNK_TITLES = new Set([
    "top",
    "latest",
    "completed",
    "ongoing",
    "popular",
    "hot",
    "new",
    "new titles",
    "updated",
    "update",
    "trending",
    "recommended",
    "random",
    "genres",
    "genre",
    "bookmark",
    "bookmarks",
    "home",
    "manga",
    "manga list",
    "comics",
    "all",
    "view all",
    "see all",
    "a-z",
    "advanced search",
    "search",
    "more",
    "login",
    "register"
])

function decodeEntities(value: string): string {
    return value
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#0*38;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0*(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&nbsp;/g, " ")
}

function isJunkTitle(title: string): boolean {
    const t = title.trim().toLowerCase()
    return t.length < 2 || JUNK_TITLES.has(t)
}

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

export function extractStreamImages(html: string): string[] {
    // Strategy 1: ts_reader.run({...}) JSON with sources[].images[].
    const tsMatch = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)\s*;?/)
    const raw = tsMatch ? captureGroup(tsMatch, 1) : undefined
    if (raw) {
        try {
            const cfg = JSON.parse(raw) as { sources?: Array<{ images?: unknown }> }
            for (const source of cfg.sources ?? []) {
                if (Array.isArray(source.images)) {
                    const urls = source.images.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
                    if (urls.length > 0) return urls
                }
            }
        } catch {
            // fall through to DOM scan
        }
    }

    // Strategy 2: imgs inside #readerarea.
    const area = html.match(/<div[^>]*\bid=["']readerarea["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
    const scope = area ? (captureGroup(area, 1) ?? html) : html
    const tags = [...scope.matchAll(/<img\b[^>]*>/gi)].map(m => captureGroup(m, 0) ?? "").filter(Boolean)
    const urls = tags
        .map(t => getImgAttr(t, "src", "data-src", "data-lazy-src"))
        .filter((u): u is string => u !== undefined && /\.(jpe?g|png|webp|gif)/i.test(u))
    return urls
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /<meta\s[^>]*\bproperty="og:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i,
        /<meta\s[^>]*\bcontent="(https?:\/\/[^"]+)"\s[^>]*\bproperty="og:image"/i,
        /<meta\s[^>]*\bname="twitter:image"\s[^>]*\bcontent="(https?:\/\/[^"]+)"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractGenres(html: string): string[] {
    const mgenMatch = html.match(/<span[^>]*\bclass=["'][^"']*\bmgen\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
    const scope = mgenMatch ? (captureGroup(mgenMatch, 1) ?? "") : html
    const anchors = [...scope.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const out: string[] = []
    const seen = new Set<string>()
    for (const a of anchors) {
        const href = captureGroup(a, 1) ?? ""
        if (!mgenMatch && !/\/genres?\//i.test(href)) continue
        const text = decodeEntities((captureGroup(a, 2) ?? "").replace(/<[^>]+>/g, "")).trim()
        const key = text.toLowerCase()
        if (text.length < 2 || seen.has(key)) continue
        seen.add(key)
        out.push(text)
        if (out.length >= 15) break
    }
    return out
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

export function createMangaStreamAdapter(config: MangaStreamConfig): SourceAdapter {
    const mangaPath = config.mangaPath ?? "manga"
    const language = config.language ?? "en"
    const escPath = escapeRegex(mangaPath)
    const mangaRe = new RegExp(`^/${escPath}/([^/]+)/?$`)
    // MangaStream chapters live at the site root with a slug containing "chapter".
    const chapterRe = /^\/([a-z0-9][a-z0-9._-]*chapter[a-z0-9._-]*)\/?$/i

    const browserHeaders = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: config.origin + "/"
    }

    function chapterSlug(url: URL): string | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        return url.pathname.match(chapterRe)?.[1]
    }

    function mangaSlug(url: URL): string | undefined {
        if (!matchesSourceDomain(url.hostname, config.domains)) return undefined
        return url.pathname.match(mangaRe)?.[1]
    }

    function chapterNumberOf(slug: string): string {
        const m = slug.match(/chapter[-_ ]?(\d+(?:[.-]\d+)?)/i)
        const raw = m ? captureGroup(m, 1) : undefined
        return raw ? raw.replace("-", ".") : "1"
    }

    // MangaStream/Asura render search hits inside `.listupd`; each card is an
    // anchor carrying a `title` attribute. Scope to that region and require the
    // title attribute so nav/sidebar links never leak in as fake results.
    function extractSearchResults(html: string): SourceSearchResult[] {
        const originPath = `${escapeRegex(config.origin)}/${escPath}`
        const listIdx = html.search(/class=["'][^"']*\blistupd\b/i)
        const region = listIdx === -1 ? html : html.slice(listIdx)
        const itemRe = new RegExp(`<a\\s+href="(${originPath}/([^"/]+)/?)"[^>]*\\stitle="([^"]+)"`, "gi")
        const out: SourceSearchResult[] = []
        const seen = new Set<string>()
        for (const m of region.matchAll(itemRe)) {
            const url = captureGroup(m, 1)
            const slug = captureGroup(m, 2)
            const rawTitle = captureGroup(m, 3)
            if (!url || !slug || !rawTitle || seen.has(slug)) continue
            const title = decodeEntities(rawTitle).trim()
            if (isJunkTitle(title)) continue
            seen.add(slug)
            out.push({
                sourceId: config.id,
                sourceMangaId: slug,
                title: title || slug.replace(/-/g, " "),
                url
            })
        }
        return out
    }

    function extractChapterList(html: string, slug: string): SourceChapter[] {
        const mangaId = `${config.id}:manga:${slug}`
        const items = [...html.matchAll(/<li[^>]*\bdata-num=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi)]
        const fallback = items.length === 0 ? [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)] : []
        const blocks =
            items.length > 0 ? items.map(m => captureGroup(m, 2) ?? "") : fallback.map(m => captureGroup(m, 1) ?? "")
        const out: SourceChapter[] = []
        const seen = new Set<string>()
        for (const block of blocks) {
            const a = block.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
            const href = a ? captureGroup(a, 1) : undefined
            if (!href) continue
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
                id: `${config.id}:chapter:${cslug}`,
                mangaId,
                sourceId: config.id,
                sourceChapterId: cslug,
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
            if (chapterSlug(url)) return "chapter"
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
                url: `${config.origin}/${mangaPath}/${slug}/`
            }
        },

        async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
            const slug = input.manga.sourceMangaId
            if (!slug) throw new SourceError("invalid-input", `A valid ${config.name} manga id is required`)
            const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}/`), {
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
                const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}/`), {
                    headers: browserHeaders
                })
                return extractCoverUrl(html)
            } catch {
                return undefined
            }
        },

        async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
            const slug = input.sourceMangaId ?? (input.url ? mangaSlug(input.url) : undefined)
            if (!slug) return []
            try {
                const html = await context.request.getText(new URL(`${config.origin}/${mangaPath}/${slug}/`), {
                    headers: browserHeaders
                })
                return extractGenres(html)
            } catch {
                return []
            }
        },

        async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
            const url = new URL(`${config.origin}/`)
            url.searchParams.set("s", query)
            try {
                const html = await context.request.getText(url, { headers: browserHeaders })
                return extractSearchResults(html)
            } catch {
                return []
            }
        },

        async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
            if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
            const slug = chapterSlug(input.url)
            if (!slug) throw new SourceError("unsupported-url", "This chapter URL is not supported")

            const html = await context.request.getText(input.url, { headers: browserHeaders })
            const imageUrls = extractStreamImages(html)
            if (imageUrls.length === 0) {
                const hasCf = /cf-browser-verification|cf_chl_jschl|__cf_chl_captcha/.test(html)
                throw new SourceError("invalid-response", `No images found [html:${html.length}b cf=${hasCf}]`)
            }

            const mangaSlugGuess = slug.replace(/-?chapter[-_]?\d.*$/i, "") || slug
            const number = chapterNumberOf(slug)
            const coverUrl = extractCoverUrl(html)
            const title = extractTitle(html, mangaSlugGuess)
            const now = context.now()
            const mangaId = `${config.id}:manga:${mangaSlugGuess}`
            const chapterId = `${config.id}:chapter:${slug}`

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
                sourceMangaId: mangaSlugGuess,
                url: `${config.origin}/${mangaPath}/${mangaSlugGuess}/`
            }

            const chapter: SourceChapter = {
                id: chapterId,
                mangaId,
                sourceId: config.id,
                sourceChapterId: slug,
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
