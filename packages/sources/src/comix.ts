import {
    SourceError,
    UNNUMBERED_SORT_KEY,
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
    type SourcePageMatch
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

type ComixDetail = {
    title?: string
    coverUrl?: string
    latestChapter?: number
    latestChapterUrl?: string
    firstChapterUrl?: string
}

// Extract manga metadata from the <script id="initial-data"> JSON block.
// Comix.to is a React app - metadata is SSR'd in a React Query dehydrated state.
// `queries` is an object keyed by the JSON-stringified queryKey array (e.g.
// `["manga","detail","<hid>"]`), NOT an array of {queryKey, state} entries.
function extractFromInitialData(html: string): ComixDetail {
    const scriptM = html.match(/<script[^>]+id="initial-data"[^>]*>([\s\S]*?)<\/script>/i)
    if (!scriptM?.[1]) return {}
    try {
        const data = JSON.parse(scriptM[1]) as unknown
        const queries = (data as Record<string, unknown>)["queries"]
        if (!queries || typeof queries !== "object") return {}
        for (const [rawKey, value] of Object.entries(queries as Record<string, unknown>)) {
            let key: unknown
            try {
                key = JSON.parse(rawKey)
            } catch {
                continue
            }
            if (!Array.isArray(key) || !key.includes("detail")) continue
            const stateData = value as Record<string, unknown>
            const title = typeof stateData["title"] === "string" ? stateData["title"] : undefined
            const poster = stateData["poster"] as Record<string, string> | undefined
            const coverUrl = poster?.["large"] ?? poster?.["medium"]
            const latestChapter =
                typeof stateData["latestChapter"] === "number" ? stateData["latestChapter"] : undefined
            const latestChapterUrl =
                typeof stateData["latestChapterUrl"] === "string" ? stateData["latestChapterUrl"] : undefined
            const firstChapterUrl =
                typeof stateData["firstChapterUrl"] === "string" ? stateData["firstChapterUrl"] : undefined
            return {
                ...(title ? { title } : {}),
                ...(coverUrl ? { coverUrl } : {}),
                ...(latestChapter !== undefined ? { latestChapter } : {}),
                ...(latestChapterUrl ? { latestChapterUrl } : {}),
                ...(firstChapterUrl ? { firstChapterUrl } : {})
            }
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

async function fetchMangaData(
    slug: string,
    context: SourceContext
): Promise<{
    title: string
    coverUrl?: string
    latestChapter?: number
    latestChapterUrl?: string
    firstChapterUrl?: string
}> {
    try {
        const html = await context.request.getText(new URL(`${ORIGIN}/title/${slug}`), {
            headers: BROWSER_HEADERS
        })
        const detail = extractFromInitialData(html)
        return {
            title: detail.title ?? extractOgTitle(html) ?? slug,
            ...(detail.coverUrl ? { coverUrl: detail.coverUrl } : {}),
            ...(detail.latestChapter !== undefined ? { latestChapter: detail.latestChapter } : {}),
            ...(detail.latestChapterUrl ? { latestChapterUrl: detail.latestChapterUrl } : {}),
            ...(detail.firstChapterUrl ? { firstChapterUrl: detail.firstChapterUrl } : {})
        }
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

    async listChapters(input: ListChaptersInput, context: SourceContext): Promise<SourceChapter[]> {
        // The full chapter feed is client-side only (React Query, no public API found),
        // but the manga page's SSR "detail" data carries the first and latest chapter
        // URLs/number directly - enough to keep latestChapterNumber from going stale.
        // The on-page sidebar mines the rest as the user reads (mineAndCacheEpisodesFromHtml).
        const slug = input.manga.sourceMangaId
        const { latestChapter, latestChapterUrl, firstChapterUrl } = await fetchMangaData(slug, context)
        const mangaId = input.manga.manga.id
        const out: SourceChapter[] = []
        for (const [href, fallbackNum] of [
            [firstChapterUrl, 1],
            [latestChapterUrl, latestChapter]
        ] as const) {
            if (!href) continue
            const parts = matchChapterParts(new URL(href, ORIGIN))
            if (!parts) continue
            const chapterNum = parts.chapterNum
            // A genuine "0" must survive as sortKey 0 (Chapter 0), not fall through
            // to the fallback - parseChapterNumber("0") returns 0, only unparseable
            // input returns undefined and defers to fallbackNum.
            const sortKey = parseChapterNumber(chapterNum) ?? fallbackNum ?? UNNUMBERED_SORT_KEY
            const id = `${SOURCE_ID}:chapter:${slug}:${chapterNum}`
            if (out.some(c => c.id === id)) continue
            out.push({
                id,
                mangaId,
                sourceId: SOURCE_ID,
                sourceChapterId: chapterNum,
                title: `Ch.${chapterNum}`,
                url: new URL(href, ORIGIN).toString(),
                sortKey,
                language: "en"
            })
        }
        return out.sort((a, b) => a.sortKey - b.sortKey)
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

    // No search endpoint available - omitting `search` so canSearch reports false
    // instead of presenting Comix as searchable and silently returning zero results.

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
            sortKey: parseChapterNumber(chapterNum) ?? UNNUMBERED_SORT_KEY,
            language: "en"
        }

        // Images require JavaScript - chapter captured for panel tracking, pages empty.
        return { manga, chapter, pages: [] }
    }
}
