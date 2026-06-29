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

const SOURCE_ID = "comix"
const ORIGIN = "https://comix.to"
const DOMAINS = ["comix.to", "www.comix.to"]

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN + "/"
}

// /title/{hid-slug}                              → manga page
// /title/{hid-slug}/{chapterId}-chapter-{num}    → chapter page
const MANGA_RE = /^\/title\/([a-z0-9][a-z0-9-]+)\/?$/
const CHAPTER_RE = /^\/title\/([a-z0-9][a-z0-9-]+)\/(\d+)-chapter-(\d+(?:\.\d+)?)\/?$/

function matchMangaSlug(url: URL): string | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    return url.pathname.match(MANGA_RE)?.[1]
}

function matchChapterParts(url: URL): { slug: string; chapterId: string; chapterNum: string } | undefined {
    if (!matchesSourceDomain(url.hostname, DOMAINS)) return undefined
    const m = url.pathname.match(CHAPTER_RE)
    if (!m) return undefined
    return { slug: m[1]!, chapterId: m[2]!, chapterNum: m[3]! }
}

// Extract manga metadata from the <script id="initial-data"> JSON block.
// Comix.to is a React app — metadata is SSR'd in a React Query dehydrated state.
function extractFromInitialData(html: string): { title?: string; coverUrl?: string } {
    const scriptM = html.match(/<script[^>]+id="initial-data"[^>]*>([\s\S]*?)<\/script>/i)
    if (!scriptM?.[1]) return {}
    try {
        const data = JSON.parse(scriptM[1]) as unknown
        const queries = (data as Record<string, unknown>)["queries"]
        if (!Array.isArray(queries)) return {}
        for (const q of queries) {
            const qObj = q as Record<string, unknown>
            const key = qObj["queryKey"]
            if (!Array.isArray(key) || !key.includes("detail")) continue
            const stateData = ((qObj["state"] as Record<string, unknown>)?.["data"] ?? {}) as Record<string, unknown>
            const title = typeof stateData["title"] === "string" ? stateData["title"] : undefined
            const poster = stateData["poster"] as Record<string, string> | undefined
            const coverUrl = poster?.["large"] ?? poster?.["medium"]
            if (title || coverUrl) return { title, coverUrl }
        }
    } catch {}
    return {}
}

// Fallback og:title extraction
function extractOgTitle(html: string): string | undefined {
    const m =
        html.match(/property="og:title"\s+content="([^"]+)"/i) ?? html.match(/content="([^"]+)"\s+property="og:title"/i)
    return m?.[1]
        ? m[1]
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .trim()
        : undefined
}

async function fetchMangaData(slug: string, context: SourceContext): Promise<{ title: string; coverUrl?: string }> {
    try {
        const html = await context.request.getText(new URL(`${ORIGIN}/title/${slug}`), {
            headers: BROWSER_HEADERS
        })
        const { title, coverUrl } = extractFromInitialData(html)
        return { title: title ?? extractOgTitle(html) ?? slug, coverUrl }
    } catch {
        return { title: slug }
    }
}

export const comixAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "Comix",
        domains: DOMAINS,
        languages: ["en"],
        // Images load via JavaScript; resolveChapter returns empty pages.
        // On-page sidebar (prev/next nav) works via listChapters.
        capabilities: ["chapters"],
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
        if (!slug) throw new SourceError("invalid-input", "A valid Comix manga URL is required")
        const now = context.now()
        const { title, coverUrl } = await fetchMangaData(slug, context)
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
            url: `${ORIGIN}/title/${slug}`
        }
    },

    async listChapters(_input: ListChaptersInput, _context: SourceContext): Promise<SourceChapter[]> {
        // Chapter list requires JavaScript execution — no static API available.
        // Sidebar panel captures chapters as the user reads them.
        return []
    },

    async resolveCover(
        input: { sourceMangaId?: string; url?: URL },
        context: SourceContext
    ): Promise<string | undefined> {
        const slug = input.sourceMangaId ?? (input.url ? matchMangaSlug(input.url) : undefined)
        if (!slug) return undefined
        const { coverUrl } = await fetchMangaData(slug, context)
        return coverUrl
    },

    async resolveGenres(): Promise<string[]> {
        return []
    },

    async search(_query: string, _context: SourceContext): Promise<SourceSearchResult[]> {
        return []
    },

    async resolveChapter(input: ResolveChapterInput, context: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "A chapter URL is required")
        const parts = matchChapterParts(input.url)
        if (!parts) throw new SourceError("unsupported-url", "Not a recognised Comix chapter URL")
        const { slug, chapterNum } = parts
        const now = context.now()
        const mangaId = `${SOURCE_ID}:manga:${slug}`
        const { title, coverUrl } = await fetchMangaData(slug, context)

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
            url: `${ORIGIN}/title/${slug}`
        }

        const chapter: SourceChapter = {
            id: `${SOURCE_ID}:chapter:${slug}:${chapterNum}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chapterNum,
            title: `Ch.${chapterNum}`,
            url: input.url.toString(),
            sortKey: parseFloat(chapterNum) || 0,
            language: "en"
        }

        // Images require JavaScript — chapter captured for panel tracking, pages empty.
        return { manga, chapter, pages: [] }
    }
}
