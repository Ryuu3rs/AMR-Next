import {
    SourceError,
    SourceRequestError,
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

const SOURCE_ID = "webtoons"
const ORIGIN = "https://www.webtoons.com"
const DOMAIN = "webtoons.com"

// Webtoons images are served from Naver's CDN and require the correct Referer.
const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: ORIGIN
}

function captureGroup(m: RegExpMatchArray, i: number): string | undefined {
    const v = m[i]
    return typeof v === "string" ? v : undefined
}

function decodeEntities(s: string): string {
    return s
        .replace(/&#0*39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0*(\d+);/g, (_, c: string) => String.fromCodePoint(Number(c)))
        .replace(/&nbsp;/g, " ")
        .trim()
}

function extractTitle(html: string, fallback: string): string {
    const og =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
        html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        const cleaned = raw.split(/\s*[-|]\s*WEBTOON/i)[0]?.trim()
        if (cleaned && cleaned.length > 1) return cleaned
    }
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const h1Text = h1 ? decodeEntities((captureGroup(h1, 1) ?? "").replace(/<[^>]+>/g, "").trim()) : ""
    if (h1Text.length > 1) return h1Text
    return fallback
}

function extractCover(html: string): string | undefined {
    const patterns = [
        /<meta[^>]+property="og:image"[^>]+content="(https?:\/\/[^"]+)"/i,
        /<meta[^>]+content="(https?:\/\/[^"]+)"[^>]+property="og:image"/i
    ]
    for (const p of patterns) {
        const m = html.match(p)
        if (m) return captureGroup(m, 1)
    }
    return undefined
}

// Return the first 3 path segments as /lang/genre/slug for list URL construction.
function pathPrefix(url: URL): string {
    const segs = url.pathname.split("/").filter(Boolean)
    return "/" + segs.slice(0, 3).join("/")
}

// Canonical series prefix URL — used as mangaUrl so that chapter URLs (which share the
// same /lang/genre/slug/ prefix) match via startsWith in trackExternalChapter.
function seriesPrefixUrl(url: URL): string {
    return `${ORIGIN}${pathPrefix(url)}/`
}

// Parse episode links from a list page, returning chapters oldest-first.
function extractEpisodes(html: string, titleNo: string, prefix: string): SourceChapter[] {
    const mangaId = `${SOURCE_ID}:manga:${titleNo}`
    const out: SourceChapter[] = []
    const seen = new Set<string>()
    // href="...viewer?title_no=X&episode_no=Y" or "?episode_no=Y&title_no=X"
    for (const m of html.matchAll(/href="([^"]+\bviewer\?[^"]*\bepisode_no=(\d+)[^"]*)"/gi)) {
        const epNo = captureGroup(m, 2)
        if (!epNo || seen.has(epNo)) continue
        seen.add(epNo)
        const sortKey = Number(epNo)

        // Use the actual href from HTML (decoded) so the stored URL matches what the
        // browser shows — chapter:siblings lookup uses exact URL string comparison.
        const rawHref = captureGroup(m, 1) ?? ""
        const decodedHref = rawHref.replace(/&amp;/g, "&")
        const epUrl = decodedHref.startsWith("http") ? decodedHref : `${ORIGIN}${decodedHref}`

        // Extract episode title from URL slug (e.g. "ep-5-some-title" → "Some Title").
        const slugMatch = decodedHref.match(/\/([^/]+)\/viewer\?/)
        const slug = slugMatch?.[1] ?? ""
        let epTitle: string
        if (slug.match(/^ep-\d+-/)) {
            epTitle = slug
                .replace(/^ep-\d+-/, "")
                .replace(/-/g, " ")
                .replace(/\b\w/g, c => c.toUpperCase())
        } else {
            epTitle = `Episode ${epNo}`
        }

        out.push({
            id: `${SOURCE_ID}:chapter:${titleNo}:${epNo}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: epNo,
            title: epTitle,
            url: epUrl,
            sortKey,
            language: "en"
        })
    }
    // List pages show newest-first; reverse to oldest-first for AMR sort order.
    out.reverse()
    return out
}

// Extract image URLs from a viewer page.
// Webtoons puts the real URL in data-url on <img class="_images"> in the initial HTML.
// Scope the search to the actual episode content area (#content / .viewer_lst) to avoid
// capturing anti-bot decoy images injected before the content section.
function extractImages(html: string): string[] {
    const urls: string[] = []
    const seen = new Set<string>()

    // Find the start of the actual episode content area.
    const contentIdx = html.search(/\bid=(?:"content"|'content')|\bclass="viewer_lst"/)
    const scope = contentIdx >= 0 ? html.slice(contentIdx) : html

    for (const m of scope.matchAll(/data-url="(https?:\/\/[^"]+)"/gi)) {
        const u = captureGroup(m, 1)
        if (u && !seen.has(u)) {
            seen.add(u)
            urls.push(u)
        }
    }
    if (urls.length > 0) return urls
    // Fallback: src / data-src on elements with _images class
    for (const m of scope.matchAll(/<img\b[^>]+class="[^"]*_images[^"]*"[^>]*>/gi)) {
        const tag = captureGroup(m, 0) ?? ""
        const src = tag.match(/\bdata-src="(https?:\/\/[^"]+)"/i)?.[1] ?? tag.match(/\bsrc="(https?:\/\/[^"]+)"/i)?.[1]
        if (src && !seen.has(src)) {
            seen.add(src)
            urls.push(src)
        }
    }
    return urls
}

export const webtoonsAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "WEBTOON",
        domains: [DOMAIN, `www.${DOMAIN}`],
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 2, intervalMs: 1500 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return "none"
        if (url.pathname.includes("/viewer") && url.searchParams.has("title_no")) return "chapter"
        if (url.pathname.includes("/list") && url.searchParams.has("title_no")) return "manga"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, ctx: SourceContext): Promise<SourceManga> {
        const titleNo = input.sourceMangaId ?? input.url?.searchParams.get("title_no") ?? undefined
        if (!titleNo) throw new SourceError("invalid-input", "No title_no in URL or sourceMangaId")
        const fetchUrl = input.url ?? new URL(`${ORIGIN}/en/fantasy/unknown/list?title_no=${titleNo}`)
        const html = await ctx.request.getText(fetchUrl, { headers: BROWSER_HEADERS })
        const title = extractTitle(html, `Series ${titleNo}`)
        const coverUrl = extractCover(html)
        // Return the series path prefix as the manga URL so that any chapter URL
        // (which shares /lang/genre/slug/) matches via startsWith in trackExternalChapter.
        const mangaUrl = seriesPrefixUrl(fetchUrl)
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${titleNo}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en").replace(/\s+/g, " "),
                authors: [],
                status: "unknown",
                ...(coverUrl ? { coverUrl } : {}),
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: titleNo,
            url: mangaUrl
        }
    },

    async listChapters(input: ListChaptersInput, ctx: SourceContext): Promise<SourceChapter[]> {
        const { manga } = input
        const titleNo = manga.sourceMangaId
        // Always build the list URL from the source manga ID so this works regardless of
        // whether manga.url is the old list URL or the new series prefix.
        const prefix = pathPrefix(new URL(manga.url))
        const listBase = new URL(`${ORIGIN}${prefix}/list?title_no=${titleNo}`)
        const MAX_PAGES = 50

        const all: SourceChapter[] = []
        const seen = new Set<string>()

        for (let page = 1; page <= MAX_PAGES; page++) {
            const pageUrl = new URL(listBase.toString())
            pageUrl.searchParams.set("page", String(page))
            const html = await ctx.request.getText(pageUrl, { headers: BROWSER_HEADERS })
            const episodes = extractEpisodes(html, titleNo, prefix)
            if (episodes.length === 0) break
            let added = 0
            for (const ep of episodes) {
                if (!seen.has(ep.sourceChapterId)) {
                    seen.add(ep.sourceChapterId)
                    all.push(ep)
                    added++
                }
            }
            // If we added nothing new this page, stop
            if (added === 0) break
            // Webtoons uses &amp; in href attributes, so check for the raw number only.
            // page=10 won't match page=1 because \D after the digit rejects '0'.
            const hasNext = new RegExp(`page=${page + 1}(?:\\D|$)`).test(html)
            if (!hasNext) break
        }

        all.sort((a, b) => a.sortKey - b.sortKey)
        return all
    },

    parseMangaUrl(url: URL): { sourceMangaId: string; mangaUrl: string } | null {
        const titleNo = url.searchParams.get("title_no")
        if (!titleNo) return null
        // Return the series path prefix so chapter URLs (e.g. /en/genre/slug/ep-5/viewer)
        // match via startsWith against the stored mangaUrl.
        return { sourceMangaId: titleNo, mangaUrl: seriesPrefixUrl(url) }
    },

    getChapterListUrl(sourceMangaId: string, mangaUrl: string): string | null {
        // mangaUrl is the series prefix e.g. https://www.webtoons.com/en/fantasy/slug/
        // The list page is that prefix + "list?title_no=<id>".
        try {
            const base = new URL(mangaUrl)
            return `${base.origin}${base.pathname}list?title_no=${encodeURIComponent(sourceMangaId)}`
        } catch {
            return null
        }
    },

    async resolveChapter(input: ResolveChapterInput, ctx: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("invalid-input", "Chapter URL required for WEBTOON")
        const url = input.url
        const titleNo = url.searchParams.get("title_no")
        const episodeNo = input.sourceChapterId ?? url.searchParams.get("episode_no")
        if (!titleNo || !episodeNo) throw new SourceError("invalid-input", "Missing title_no or episode_no in URL")

        const html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
        const images = extractImages(html)
        if (images.length === 0) {
            // Viewer images are JS-rendered; direct SW fetch returns minimal HTML.
            // Signal bot-block to trigger the tab-render fallback (real browser session
            // with locale cookies, full JS execution, data-url attributes in DOM).
            throw new SourceRequestError("blocked")
        }

        // Fetch list page for real series title and cover art.
        // This runs in the second (tab-injected) call where images were found.
        const segs = url.pathname.split("/").filter(Boolean)
        const mangaUrl = seriesPrefixUrl(url)
        const listPageUrl = new URL(`${ORIGIN}/${segs.slice(0, 3).join("/")}/list?title_no=${titleNo}`)
        const listHtml = await ctx.request.getText(listPageUrl, { headers: BROWSER_HEADERS }).catch(() => "")
        const seriesTitle = extractTitle(listHtml, `Series ${titleNo}`)
        const seriesCover = extractCover(listHtml)

        const manga: SourceManga = {
            manga: {
                id: `${SOURCE_ID}:manga:${titleNo}`,
                title: seriesTitle,
                normalizedTitle: seriesTitle.toLocaleLowerCase("en").replace(/\s+/g, " "),
                authors: [],
                status: "unknown",
                ...(seriesCover ? { coverUrl: seriesCover } : {}),
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: titleNo,
            url: mangaUrl
        }

        return {
            manga,
            chapter: {
                id: `${SOURCE_ID}:chapter:${titleNo}:${episodeNo}`,
                mangaId: `${SOURCE_ID}:manga:${titleNo}`,
                sourceId: SOURCE_ID,
                sourceChapterId: episodeNo,
                title: `Episode ${episodeNo}`,
                url: url.toString(),
                sortKey: Number(episodeNo),
                language: "en"
            },
            pages: images.map((imgUrl, i) => ({ id: String(i), url: imgUrl }))
        }
    }
}
