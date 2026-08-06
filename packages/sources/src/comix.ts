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
// A chapter id that will never match a real chapter, so the site falls back to resolving
// by the -chapter-{n} suffix and redirects to the canonical URL.
const PLACEHOLDER_CHAPTER_ID = "0"
// Upper bound on the synthesised chapter range, so a malformed latestChapter can't
// generate an unbounded list.
const MAX_SYNTHESISED_CHAPTERS = 2000

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

    // Needed for chapter:siblings' number-fallback and for correct mark-read tracking:
    // both resolve the manga from the chapter URL. A chapter URL is
    // /title/{slug}/{id}-chapter-{n}, so the slug is the same segment either way.
    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const slug = matchChapterParts(url)?.slug ?? matchMangaSlug(url)
        if (!slug) return null
        return { sourceMangaId: slug, mangaUrl: `${ORIGIN}/title/${slug}` }
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
        // The chapter feed itself is client-side only and its API responses are encrypted
        // ({"e":"<blob>"}), with the per-manga list endpoint token-gated - so the list
        // cannot be fetched directly. It doesn't need to be: a chapter URL is
        // /title/{slug}/{chapterId}-chapter-{n}, and when the {chapterId} does NOT match a
        // real chapter the site resolves by the NUMBER instead and redirects to the
        // canonical URL (verified live: /0-chapter-57 -> /6220912-chapter-57). A number
        // past the end lands on the title page rather than a chapter. So the whole list is
        // addressable from the one piece of data the un-encrypted SSR does expose -
        // latestChapter - by emitting a placeholder id and letting the site canonicalise.
        const slug = input.manga.sourceMangaId
        const { latestChapter, latestChapterUrl, firstChapterUrl } = await fetchMangaData(slug, context)
        const mangaId = input.manga.manga.id

        const known = new Map<number, string>()
        for (const [href, fallbackNum] of [
            [firstChapterUrl, 1],
            [latestChapterUrl, latestChapter]
        ] as const) {
            if (!href) continue
            const parts = matchChapterParts(new URL(href, ORIGIN))
            if (!parts) continue
            // A genuine "0" must survive as sortKey 0 (Chapter 0), not fall through to the
            // fallback - parseChapterNumber("0") returns 0, only unparseable input returns
            // undefined and defers to fallbackNum.
            const num = parseChapterNumber(parts.chapterNum) ?? fallbackNum
            if (num === undefined || !Number.isFinite(num)) continue
            known.set(num, new URL(href, ORIGIN).toString())
        }

        // Cap the synthesised range so a bogus latestChapter can't spin out a huge list.
        const highest = Math.max(latestChapter ?? 0, ...known.keys(), 0)
        const total = Math.min(Math.floor(highest), MAX_SYNTHESISED_CHAPTERS)
        const out: SourceChapter[] = []
        const emit = (n: number) => {
            // Prefer a real URL when the SSR gave us one; otherwise the placeholder form,
            // which the site redirects to the canonical chapter.
            const url = known.get(n) ?? `${ORIGIN}/title/${slug}/${PLACEHOLDER_CHAPTER_ID}-chapter-${n}`
            out.push({
                id: `${SOURCE_ID}:chapter:${slug}:${n}`,
                mangaId,
                sourceId: SOURCE_ID,
                sourceChapterId: String(n),
                title: `Ch.${n}`,
                url,
                sortKey: n,
                language: "en"
            })
        }
        // A genuine Chapter 0 only exists when the SSR actually exposed its URL; the
        // synthesis loop below starts at 1, so emit 0 up front when it is known.
        if (known.has(0)) emit(0)
        for (let n = 1; n <= total; n++) emit(n)
        // Math.floor drops a fractional latest (e.g. 57.5), so the newest chapter - and any
        // mid-series .5 - would never be emitted. Append the true latest past the integer
        // range so it is always present, still within the synthesised-range cap.
        if (highest > total && highest <= MAX_SYNTHESISED_CHAPTERS) emit(highest)
        return out
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
