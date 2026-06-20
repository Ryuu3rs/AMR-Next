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

const SOURCE_ID = "mangahub"
const ORIGIN = "https://mangahub.io"
const DOMAIN = "mangahub.io"

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

function cleanTitle(raw: string): string {
    return raw
        .replace(/^Read\s+/i, "")
        .replace(/\s+Manga\s+Online(\s+for\s+Free)?$/i, "")
        .trim()
}

function extractTitle(html: string, fallback: string): string {
    const og =
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
        html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i)
    if (og) {
        const raw = decodeEntities(captureGroup(og, 1) ?? "")
        const cleaned = cleanTitle(raw)
        if (cleaned.length > 1) return cleaned
    }
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (title) {
        const raw = decodeEntities((captureGroup(title, 1) ?? "").replace(/<[^>]+>/g, "").trim())
        const cleaned = cleanTitle(raw)
        if (cleaned.length > 1) return cleaned
    }
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

// Chapter URLs: https://mangahub.io/chapter/{chSlug}/chapter-{N}
// chSlug may differ from manga slug (e.g. solo-leveling_105 vs solo-leveling).
// Extract N as a float for sort order.
function parseChapterNumber(chapterPath: string): number | undefined {
    const m = chapterPath.match(/\/chapter-(\d+(?:\.\d+)?)$/i)
    return m?.[1] !== undefined ? Number(m[1]) : undefined
}

function extractChapters(html: string, mangaId: string): SourceChapter[] {
    const seen = new Set<string>()
    const out: SourceChapter[] = []
    for (const m of html.matchAll(/href="(https?:\/\/mangahub\.io\/chapter\/([^/]+)\/chapter-(\d+(?:\.\d+)?))"/gi)) {
        const url = captureGroup(m, 1)
        const chNum = captureGroup(m, 3)
        if (!url || !chNum || seen.has(url)) continue
        seen.add(url)
        const sortKey = Number(chNum)
        out.push({
            id: `${SOURCE_ID}:chapter:${mangaId.replace(`${SOURCE_ID}:manga:`, "")}:${chNum}`,
            mangaId,
            sourceId: SOURCE_ID,
            sourceChapterId: chNum,
            title: `Chapter ${chNum}`,
            url,
            sortKey,
            language: "en"
        })
    }
    out.sort((a, b) => a.sortKey - b.sortKey)
    return out
}

// Chapter page images — extracted after tab render (JS-driven reader).
// MangaHub renders <img> tags with src pointing to their CDN (mhcdn.net / mghcdn.com).
function extractImages(html: string): string[] {
    const urls: string[] = []
    const seen = new Set<string>()
    // Primary: src on img elements in the reader
    for (const m of html.matchAll(/<img\b[^>]+src="(https?:\/\/[^"]*(?:mhcdn|mghcdn)[^"]+)"/gi)) {
        const u = captureGroup(m, 1)
        if (u && !seen.has(u)) {
            seen.add(u)
            urls.push(u)
        }
    }
    if (urls.length > 0) return urls
    // Fallback: any data-src with cdn patterns
    for (const m of html.matchAll(/<img\b[^>]+data-src="(https?:\/\/[^"]*(?:mhcdn|mghcdn)[^"]+)"/gi)) {
        const u = captureGroup(m, 1)
        if (u && !seen.has(u)) {
            seen.add(u)
            urls.push(u)
        }
    }
    return urls
}

export const mangahubAdapter: SourceAdapter = {
    manifest: {
        id: SOURCE_ID,
        name: "MangaHub",
        domains: [DOMAIN, `www.${DOMAIN}`],
        languages: ["en"],
        capabilities: ["pages", "chapters"],
        requestRateLimit: { requests: 2, intervalMs: 2000 },
        fixtureVersion: 1,
        homepage: ORIGIN
    },

    match(url: URL): SourcePageMatch {
        if (url.hostname !== DOMAIN && url.hostname !== `www.${DOMAIN}`) return "none"
        if (url.pathname.startsWith("/manga/") && url.pathname.split("/").filter(Boolean).length === 2) return "manga"
        if (url.pathname.startsWith("/chapter/") && url.pathname.includes("/chapter-")) return "chapter"
        return "none"
    },

    async resolveManga(input: ResolveMangaInput, ctx: SourceContext): Promise<SourceManga> {
        const slug = input.sourceMangaId ?? input.url?.pathname.split("/").filter(Boolean)[1]
        if (!slug) throw new SourceError("No manga slug")
        const url = new URL(`${ORIGIN}/manga/${slug}`)
        const html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
        const title = extractTitle(html, slug)
        const coverUrl = extractCover(html)
        return {
            manga: {
                id: `${SOURCE_ID}:manga:${slug}`,
                title,
                normalizedTitle: title.toLocaleLowerCase("en").replace(/\s+/g, " "),
                authors: [],
                status: "unknown",
                ...(coverUrl ? { coverUrl } : {}),
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: slug,
            url: url.toString()
        }
    },

    async listChapters(input: ListChaptersInput, ctx: SourceContext): Promise<SourceChapter[]> {
        const { manga } = input
        const mangaUrl = new URL(manga.url)
        const html = await ctx.request.getText(mangaUrl, { headers: BROWSER_HEADERS })
        return extractChapters(html, manga.id)
    },

    async resolveChapter(input: ResolveChapterInput, ctx: SourceContext): Promise<ResolvedChapter> {
        if (!input.url) throw new SourceError("Chapter URL required for MangaHub")
        const url = input.url

        // Chapter pages are behind Cloudflare JS challenge — tab render required.
        // When the user is already on the page the browser has cf_clearance; SW fetch
        // may succeed. If blocked (403/challenge HTML), fall through to tab render.
        let html: string
        try {
            html = await ctx.request.getText(url, { headers: BROWSER_HEADERS })
            // Cloudflare challenge response — treat as blocked
            if (html.includes("__CF$cv$params") || html.includes("/cdn-cgi/challenge-platform/")) {
                throw new SourceRequestError(undefined)
            }
        } catch (e) {
            if (e instanceof SourceRequestError && e.statusCode === undefined) throw e
            throw new SourceRequestError(undefined)
        }

        const images = extractImages(html)
        if (images.length === 0) throw new SourceRequestError(undefined)

        const pathParts = url.pathname.split("/").filter(Boolean)
        const chSlug = pathParts[1] ?? ""
        const mangaSlug = chSlug.replace(/_\d+$/, "") || chSlug
        const chNum = parseChapterNumber(url.pathname) ?? 0

        const listUrl = new URL(`${ORIGIN}/manga/${mangaSlug}`)
        const manga: SourceManga = {
            manga: {
                id: `${SOURCE_ID}:manga:${mangaSlug}`,
                title: mangaSlug,
                normalizedTitle: mangaSlug,
                authors: [],
                status: "unknown",
                addedAt: ctx.now(),
                updatedAt: ctx.now()
            },
            sourceId: SOURCE_ID,
            sourceMangaId: mangaSlug,
            url: listUrl.toString()
        }

        return {
            manga,
            chapter: {
                id: `${SOURCE_ID}:chapter:${mangaSlug}:${chNum}`,
                mangaId: `${SOURCE_ID}:manga:${mangaSlug}`,
                sourceId: SOURCE_ID,
                sourceChapterId: String(chNum),
                title: `Chapter ${chNum}`,
                url: url.toString(),
                sortKey: chNum,
                language: "en"
            },
            pages: images.map((imgUrl, i) => ({ id: String(i), url: imgUrl }))
        }
    }
}
