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

export type FanfoxFamilyConfig = {
    id: string
    name: string
    origin: string
    domains: string[]
}

// /manga/<slug>/                           → manga page
// /manga/<slug>/v<vol>/c<ch>/             → chapter (with volume)
// /manga/<slug>/c<ch>/                    → chapter (no volume)
// /manga/<slug>/v<vol>/c<ch>/<page>.html  → chapter with explicit page
const MANGA_RE = /^\/manga\/([^/]+)\/?$/
const CHAPTER_RE = /^\/manga\/([^/]+)\/(?:v[^/]+\/)?c([^/]+?)(?:\/\d+\.html)?\/?$/

const BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

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

function extractTitle(html: string): string | undefined {
    const patterns = [
        /class="detail-info-right-title-font"[^>]*>([\s\S]*?)<\/span>/i,
        /class="detail-info-right-title"[^>]*>([\s\S]*?)<\/h\d>/i,
        /<title[^>]*>([^<]+) - (?:Manga|Read)/i,
        /property="og:title"\s+content="([^"]+)"/i,
        /content="([^"]+)"\s+property="og:title"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        if (m) {
            const t = decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, ""))
            if (t.length > 1) return t
        }
    }
    return undefined
}

function extractCoverUrl(html: string): string | undefined {
    const patterns = [
        /property="og:image"\s+content="(https?:\/\/[^"]+)"/i,
        /content="(https?:\/\/[^"]+)"\s+property="og:image"/i,
        /class="detail-info-cover-img"[^>]*\bsrc="(https?:\/\/[^"]+)"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        const v = m ? captureGroup(m, 1) : undefined
        if (v) return v
    }
    return undefined
}

function extractAuthors(html: string): string[] {
    const blockM = html.match(/class="detail-info-right-say"[^>]*>([\s\S]*?)<\/p>/i)
    if (!blockM) return []
    const scope = captureGroup(blockM, 1) ?? ""
    return [...scope.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, "")))
        .filter(a => a.length > 1)
        .slice(0, 5)
}

function extractGenres(html: string): string[] {
    const blockM = html.match(/class="detail-info-right-tag-list"[^>]*>([\s\S]*?)<\/p>/i)
    if (!blockM) return []
    const scope = captureGroup(blockM, 1) ?? ""
    return [...scope.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => decodeHtml((captureGroup(m, 1) ?? "").replace(/<[^>]+>/g, "")))
        .filter(g => g.length > 1)
        .slice(0, 15)
}

function extractChapterList(html: string, mangaSlug: string, sourceId: string, origin: string): SourceChapter[] {
    const mangaId = `${sourceId}:manga:${mangaSlug}`
    const seen = new Set<string>()
    const chapters: SourceChapter[] = []
    const linkRe = new RegExp(`href="(/manga/${mangaSlug}/(?:v[^/]+/)?c([^/"]+)/?)"`, "gi")

    for (const m of html.matchAll(linkRe)) {
        const path = captureGroup(m, 1)
        const rawChapter = captureGroup(m, 2)
        if (!path || !rawChapter || seen.has(path)) continue
        seen.add(path)
        const sortKey = parseFloat(rawChapter) || 0
        chapters.push({
            id: `${sourceId}:chapter:${mangaSlug}:${rawChapter}`,
            mangaId,
            sourceId,
            sourceChapterId: rawChapter,
            title: `Ch.${rawChapter}`,
            url: `${origin}${path.endsWith("/") ? path : path + "/"}`,
            sortKey,
            language: "en"
        })
    }
    return chapters.sort((a, b) => b.sortKey - a.sortKey)
}

function extractSearchResults(html: string, sourceId: string, origin: string): SourceSearchResult[] {
    const out: SourceSearchResult[] = []
    const seen = new Set<string>()
    for (const m of html.matchAll(/href="\/manga\/([^/"]+)\/"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const slug = captureGroup(m, 1)
        const inner = captureGroup(m, 2) ?? ""
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        const title = decodeHtml(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
        if (title.length < 2) continue
        const imgM = inner.match(/\bsrc="(https?:\/\/[^"]+)"/)
        out.push({
            sourceId,
            sourceMangaId: slug,
            title,
            url: `${origin}/manga/${slug}/`,
            ...(imgM ? { coverUrl: imgM[1] } : {})
        })
        if (out.length >= 30) break
    }
    return out
}

function slugToTitle(slug: string): string {
    return slug.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

export function createFanfoxFamilyAdapter(cfg: FanfoxFamilyConfig): SourceAdapter {
    const { id, name, origin, domains } = cfg
    const headers = {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: origin + "/"
    }

    function matchMangaSlug(url: URL): string | undefined {
        if (!matchesSourceDomain(url.hostname, domains)) return undefined
        return url.pathname.match(MANGA_RE)?.[1]
    }

    function matchChapterParts(url: URL): { mangaSlug: string; chapterNum: string } | undefined {
        if (!matchesSourceDomain(url.hostname, domains)) return undefined
        const m = url.pathname.match(CHAPTER_RE)
        if (!m) return undefined
        return { mangaSlug: m[1]!, chapterNum: m[2]! }
    }

    async function fetchMangaHtml(slug: string, context: SourceContext): Promise<string> {
        return context.request.getText(new URL(`${origin}/manga/${slug}/`), { headers })
    }

    return {
        manifest: {
            id,
            name,
            domains,
            languages: ["en"],
            capabilities: ["chapters"],
            requestRateLimit: { requests: 3, intervalMs: 1000 },
            fixtureVersion: 1,
            homepage: origin
        },

        match(url: URL): SourcePageMatch {
            if (matchChapterParts(url)) return "chapter"
            if (matchMangaSlug(url)) return "manga"
            return "none"
        },

        async resolveManga(input: ResolveMangaInput, context: SourceContext): Promise<SourceManga> {
            const slug = input.url ? matchMangaSlug(input.url) : input.sourceMangaId
            if (!slug) throw new SourceError("invalid-input", `A valid ${name} manga URL is required`)
            const now = context.now()
            let title = slugToTitle(slug)
            let coverUrl: string | undefined
            let authors: string[] = []
            try {
                const html = await fetchMangaHtml(slug, context)
                title = extractTitle(html) ?? title
                coverUrl = extractCoverUrl(html)
                authors = extractAuthors(html)
            } catch {}
            return {
                manga: {
                    id: `${id}:manga:${slug}`,
                    title,
                    normalizedTitle: title.toLocaleLowerCase("en"),
                    ...(coverUrl ? { coverUrl } : {}),
                    authors,
                    status: "unknown",
                    addedAt: now,
                    updatedAt: now
                },
                sourceId: id,
                sourceMangaId: slug,
                url: `${origin}/manga/${slug}/`
            }
        },

        async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
            const slug = input.manga.sourceMangaId
            if (!slug) throw new SourceError("invalid-input", "Missing manga ID")
            const html = await fetchMangaHtml(slug, context)
            return extractChapterList(html, slug, id, origin)
        },

        async resolveCover(
            input: { sourceMangaId?: string; url?: URL },
            context: SourceContext
        ): Promise<string | undefined> {
            const slug = input.sourceMangaId ?? (input.url ? matchMangaSlug(input.url) : undefined)
            if (!slug) return undefined
            try {
                const html = await fetchMangaHtml(slug, context)
                return extractCoverUrl(html)
            } catch {
                return undefined
            }
        },

        async resolveGenres(input: { sourceMangaId?: string; url?: URL }, context: SourceContext): Promise<string[]> {
            const slug = input.sourceMangaId ?? (input.url ? matchMangaSlug(input.url) : undefined)
            if (!slug) return []
            try {
                const html = await fetchMangaHtml(slug, context)
                return extractGenres(html)
            } catch {
                return []
            }
        },

        async search(query: string, context: SourceContext): Promise<SourceSearchResult[]> {
            if (!query.trim()) return []
            try {
                const url = new URL(`${origin}/search`)
                url.searchParams.set("title", query)
                const html = await context.request.getText(url, { headers })
                return extractSearchResults(html, id, origin)
            } catch {
                return []
            }
        },

        async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
            if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
            const parts = matchChapterParts(input.url)
            if (!parts) throw new SourceError("unsupported-url", `Not a recognised ${name} chapter URL`)
            const { mangaSlug, chapterNum } = parts
            const now = context.now()
            const mangaId = `${id}:manga:${mangaSlug}`
            let title = slugToTitle(mangaSlug)
            let coverUrl: string | undefined
            try {
                const html = await fetchMangaHtml(mangaSlug, context)
                title = extractTitle(html) ?? title
                coverUrl = extractCoverUrl(html)
            } catch {}
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
                sourceId: id,
                sourceMangaId: mangaSlug,
                url: `${origin}/manga/${mangaSlug}/`
            }
            const chapter: SourceChapter = {
                id: `${id}:chapter:${mangaSlug}:${chapterNum}`,
                mangaId,
                sourceId: id,
                sourceChapterId: chapterNum,
                title: `Ch.${chapterNum}`,
                url: input.url.toString(),
                sortKey: parseFloat(chapterNum) || 0,
                language: "en"
            }
            // Images require JavaScript — chapter captured for panel prev/next, pages empty.
            return { manga, chapter, pages: [] }
        }
    }
}
