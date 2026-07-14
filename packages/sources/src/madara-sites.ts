import type { SourceAdapter } from "@amr/source-sdk"
import { createMadaraAdapter, type MadaraConfig } from "./madara"

// Additional Madara-theme sites - each is a config row over the shared factory.
// All use the default Madara `/manga/<slug>/chapter-N/` URL scheme. Flagged green
// (reachable, Madara template) by the source-probe; confirm a live chapter before
// relying on any of them, and tune mangaPath/chapterPrefix if a site differs.
const SITES: MadaraConfig[] = [
    // { id: "arvenscans", name: "Arven Scans", origin: "https://arvenscans.org", domains: ["arvenscans.org"] }, // retired: site down 2026-07 - TLS certificate expired, verified 2026-07-11
    // { id: "arvencomics", name: "Arven Comics", origin: "https://arvencomics.com", domains: ["arvencomics.com"] }, // retired: site down 2026-07 - TLS handshake fails, verified 2026-07-11
    { id: "novelmic", name: "Novelmic", origin: "https://novelmic.com", domains: ["novelmic.com"] },
    // Renamed 2026-07-11: aryascans.com now redirects to brainrotcomics.com. Verified it's
    // the same Madara-engine site (still /manga/<slug>/ URLs, wp-manga-chapter list markup,
    // ?post_type=wp-manga search) - just a rebrand, not a hijack. id kept stable so existing
    // library links still resolve; origin/domains/name updated to the new host.
    {
        id: "aryascans",
        name: "BrainRotComics",
        origin: "https://brainrotcomics.com",
        domains: ["brainrotcomics.com"]
    },
    // { id: "agrcomics", name: "AGR Comics", origin: "https://agrcomics.com", domains: ["agrcomics.com"] }, // retired: site down 2026-06 - re-enable when back
    // { id: "manhuaplus", name: "ManhuaPlus", origin: "https://manhuaplus.org", domains: ["manhuaplus.org"] }, // retired 2026-07-14: fully migrated off WordPress/Madara to a custom "liliana" theme - verified live: no wp-content/wp-json/wp-admin markers anywhere on the site, chapter pages have zero wp-manga-chapter/reading-content/wp-manga-chapter-img markup, and POSTing to /wp-admin/admin-ajax.php (both manga_get_chapters and manga_get_chapter_img_list) 302-redirects to /home since the endpoint no longer exists - matches the user's reported redirect exactly. Not a same-engine rebrand like aryascans; the whole template changed, so re-adding needs a bespoke adapter, not a config row.
    { id: "rawkuma", name: "Rawkuma", origin: "https://rawkuma.com", domains: ["rawkuma.com"] },
    {
        id: "hivetoon",
        name: "HiveToon",
        origin: "https://hivetoon.com",
        domains: ["hivetoon.com"],
        // Page/chapter images are served from storage.hivetoon.com - a subdomain the bare
        // "https://hivetoon.com/*" pattern does not cover. Confirmed live 2026-07-14.
        imageOrigins: ["*://*.hivetoon.com/*"]
    },
    { id: "lhtranslation", name: "LHTranslation", origin: "https://lhtranslation.net", domains: ["lhtranslation.net"] },
    // { id: "harimanga", name: "HariManga", origin: "https://harimanga.me", domains: ["harimanga.me"] }, // retired: site down 2026-06 - re-enable when back
    { id: "utoon", name: "UToon", origin: "https://utoon.net", domains: ["utoon.net"] },
    { id: "mangasushi", name: "MangaSushi", origin: "https://mangasushi.org", domains: ["mangasushi.org"] },
    // chapters-only: chapter pages are ad-gated; sidebar tracking works, reader shows "open on site"
    {
        id: "manhuatop",
        name: "ManhuaTop",
        origin: "https://manhuatop.org",
        domains: ["manhuatop.org"],
        mangaPath: "manhua",
        capabilities: ["chapters"]
    },
    // Replacements for dead sites + new user-requested sources
    // { id: "saucemanhwa", name: "SauceManhwa", origin: "https://saucemanhwa.org", domains: ["saucemanhwa.org"] }, // retired: site down 2026-06 - re-enable when back
    {
        id: "mangadistrict",
        name: "Manga District",
        origin: "https://mangadistrict.com",
        domains: ["mangadistrict.com"]
    },
    // { id: "manytoon", name: "ManyToon", origin: "https://manytoon.com", domains: ["manytoon.com"] }, // retired: domain hijacked 2026-07 - resolves and returns 200 but redirects to an unrelated adult popunder ad network (purplesacam.com), verified 2026-07-11
    { id: "omegascans", name: "Omega Scans", origin: "https://omegascans.org", domains: ["omegascans.org"] },
    // { id: "kunmanga", name: "KunManga", origin: "https://kunmanga.com", domains: ["kunmanga.com"] }, // retired: site down 2026-06 - re-enable when back
    {
        id: "vortexscans",
        name: "Vortex Scans",
        origin: "https://vortexscans.org",
        domains: ["vortexscans.org"],
        mangaPath: "series",
        // Chapter images are served from storage.vortexscans.org, a subdomain not
        // covered by "https://vortexscans.org/*". Confirmed live 2026-07-14.
        imageOrigins: ["*://*.vortexscans.org/*"]
    },
    // { id: "casacomic", name: "Casa Comic", origin: "https://casacomic.com", domains: ["casacomic.com"] }, // retired: site down 2026-06 - re-enable when back
    {
        id: "natomanga",
        name: "NatoManga",
        origin: "https://www.natomanga.com",
        domains: ["natomanga.com", "www.natomanga.com"]
    },
    { id: "hentairead", name: "HentaiRead", origin: "https://hentairead.com", domains: ["hentairead.com"] },
    {
        id: "hentai20",
        name: "Hentai20",
        origin: "https://hentai20.io",
        domains: ["hentai20.io"],
        // Chapter page images are served from img.hentai1.io, an entirely different
        // domain from hentai20.io. Confirmed live 2026-07-14.
        imageOrigins: ["https://img.hentai1.io/*"]
    },
    {
        id: "oppaistream",
        name: "Oppai Stream",
        origin: "https://read.oppai.stream",
        domains: ["read.oppai.stream"]
    },
    { id: "eahentai", name: "EA Hentai", origin: "https://eahentai.com", domains: ["eahentai.com"] },
    { id: "hentalk", name: "HenTalk", origin: "https://hentalk.pw", domains: ["hentalk.pw"] },
    // User-requested additions - Cloudflare-gated; tab fallback handles first-read for new users
    { id: "likemanga", name: "LikeManga", origin: "https://likemanga.io", domains: ["likemanga.io"] },
    // { id: "suryatoon", name: "Surya Toon", origin: "https://suryatoon.com", domains: ["suryatoon.com"] }, // retired: domain hijacked/stalled 2026-07 - 200s but body is a bare stuck "Loading..." placeholder, no real content, verified 2026-07-11
    // { id: "mangagalaxy", name: "Manga Galaxy", origin: "https://mangagalaxy.me", domains: ["mangagalaxy.me"] }, // retired: domain hijacked 2026-07 - homepage 200s with a JS redirect chain that lands on an unrelated TikTok video, verified 2026-07-11
    { id: "tritinia", name: "Tritinia Scans", origin: "https://tritinia.org", domains: ["tritinia.org"] },
    { id: "manhuaus", name: "ManhuaUS", origin: "https://manhuaus.com", domains: ["manhuaus.com"] },
    { id: "mgread", name: "MgRead", origin: "https://mgread.io", domains: ["mgread.io"] },
    // { id: "aquascans", name: "Aqua Scans", origin: "https://aquascans.com", domains: ["aquascans.com"] }, // retired: site down 2026-07 - domain has a registrar SOA record but no A/AAAA (doesn't resolve to a host), verified 2026-07-11
    // { id: "s2manga", name: "S2Manga", origin: "https://s2manga.com", domains: ["s2manga.com"] }, // retired: site down 2026-07 - NXDOMAIN, verified 2026-07-11
    {
        id: "manhwatop",
        name: "ManhwaTop",
        origin: "https://manhwatop.com",
        domains: ["manhwatop.com"],
        // Chapter images are served from a numbered CDN subdomain (e.g. c4.manhwatop.com),
        // not covered by "https://manhwatop.com/*". Confirmed live 2026-07-14.
        imageOrigins: ["*://*.manhwatop.com/*"]
    },
    {
        id: "aquamanga",
        name: "Aqua Manga",
        origin: "https://aquamanga.com",
        domains: ["aquamanga.com"],
        mangaPath: "read"
    }
    // { id: "manhwahentai", name: "Manhwa Hentai", origin: "https://manhwahentai.me", domains: ["manhwahentai.me"], mangaPath: "webtoon" }, // retired: domain hijacked 2026-07 - resolves and returns 200 but redirects to the same unrelated adult popunder ad network as manytoon (purplesacam.com), verified 2026-07-11
]

export const madaraAdapters: readonly SourceAdapter[] = SITES.map(createMadaraAdapter)

// Origins for these sites - flatMap over all domains so multi-domain configs
// (e.g. natomanga.com + www.natomanga.com) all get host_permissions entries. Also
// folds in each site's imageOrigins (if any) so a separate cover/page-image CDN
// host is granted automatically instead of needing a one-off hand patch in
// permissions.ts BASE_SOURCE_ORIGINS.
export const madaraOrigins: readonly string[] = SITES.flatMap(s => [
    ...s.domains.map(d => `https://${d}/*`),
    ...(s.imageOrigins ?? [])
])
