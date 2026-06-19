import type { SourceAdapter } from "@amr/source-sdk"
import { createMadaraAdapter, type MadaraConfig } from "./madara"

// Additional Madara-theme sites — each is a config row over the shared factory.
// All use the default Madara `/manga/<slug>/chapter-N/` URL scheme. Flagged green
// (reachable, Madara template) by the source-probe; confirm a live chapter before
// relying on any of them, and tune mangaPath/chapterPrefix if a site differs.
const SITES: MadaraConfig[] = [
    { id: "arvenscans", name: "Arven Scans", origin: "https://arvenscans.org", domains: ["arvenscans.org"] },
    { id: "arvencomics", name: "Arven Comics", origin: "https://arvencomics.com", domains: ["arvencomics.com"] },
    { id: "novelmic", name: "Novelmic", origin: "https://novelmic.com", domains: ["novelmic.com"] },
    { id: "aryascans", name: "Arya Scans", origin: "https://aryascans.com", domains: ["aryascans.com"] },
    { id: "agrcomics", name: "AGR Comics", origin: "https://agrcomics.com", domains: ["agrcomics.com"] },
    { id: "manhuaplus", name: "ManhuaPlus", origin: "https://manhuaplus.org", domains: ["manhuaplus.org"] },
    { id: "rawkuma", name: "Rawkuma", origin: "https://rawkuma.com", domains: ["rawkuma.com"] },
    { id: "hivetoon", name: "HiveToon", origin: "https://hivetoon.com", domains: ["hivetoon.com"] },
    { id: "lhtranslation", name: "LHTranslation", origin: "https://lhtranslation.net", domains: ["lhtranslation.net"] },
    { id: "harimanga", name: "HariManga", origin: "https://harimanga.me", domains: ["harimanga.me"] },
    { id: "utoon", name: "UToon", origin: "https://utoon.net", domains: ["utoon.net"] },
    { id: "mangasushi", name: "MangaSushi", origin: "https://mangasushi.org", domains: ["mangasushi.org"] },
    // manhuatop uses /manhua/ path prefix instead of /manga/
    {
        id: "manhuatop",
        name: "ManhuaTop",
        origin: "https://manhuatop.org",
        domains: ["manhuatop.org"],
        mangaPath: "manhua"
    },
    // Replacements for dead sites + new user-requested sources
    { id: "saucemanhwa", name: "SauceManhwa", origin: "https://saucemanhwa.org", domains: ["saucemanhwa.org"] },
    {
        id: "mangadistrict",
        name: "Manga District",
        origin: "https://mangadistrict.com",
        domains: ["mangadistrict.com"]
    },
    { id: "manytoon", name: "ManyToon", origin: "https://manytoon.com", domains: ["manytoon.com"] },
    { id: "omegascans", name: "Omega Scans", origin: "https://omegascans.org", domains: ["omegascans.org"] },
    { id: "kunmanga", name: "KunManga", origin: "https://kunmanga.com", domains: ["kunmanga.com"] },
    { id: "vortexscans", name: "Vortex Scans", origin: "https://vortexscans.org", domains: ["vortexscans.org"] },
    { id: "casacomic", name: "Casa Comic", origin: "https://casacomic.com", domains: ["casacomic.com"] },
    {
        id: "natomanga",
        name: "NatoManga",
        origin: "https://www.natomanga.com",
        domains: ["natomanga.com", "www.natomanga.com"]
    },
    { id: "hentairead", name: "HentaiRead", origin: "https://hentairead.com", domains: ["hentairead.com"] },
    { id: "hentai20", name: "Hentai20", origin: "https://hentai20.io", domains: ["hentai20.io"] },
    {
        id: "oppaistream",
        name: "Oppai Stream",
        origin: "https://read.oppai.stream",
        domains: ["read.oppai.stream"]
    },
    { id: "eahentai", name: "EA Hentai", origin: "https://eahentai.com", domains: ["eahentai.com"] },
    { id: "hentalk", name: "HenTalk", origin: "https://hentalk.pw", domains: ["hentalk.pw"] },
    // User-requested additions — Cloudflare-gated; tab fallback handles first-read for new users
    { id: "likemanga", name: "LikeManga", origin: "https://likemanga.io", domains: ["likemanga.io"] },
    { id: "suryatoon", name: "Surya Toon", origin: "https://suryatoon.com", domains: ["suryatoon.com"] },
    { id: "mangagalaxy", name: "Manga Galaxy", origin: "https://mangagalaxy.me", domains: ["mangagalaxy.me"] }
]

export const madaraAdapters: readonly SourceAdapter[] = SITES.map(createMadaraAdapter)

// Origins for these sites — flatMap over all domains so multi-domain configs
// (e.g. natomanga.com + www.natomanga.com) all get host_permissions entries.
export const madaraOrigins: readonly string[] = SITES.flatMap(s => s.domains.map(d => `https://${d}/*`))
