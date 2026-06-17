import type { SourceAdapter } from "@amr/source-sdk"
import { createMadaraAdapter, type MadaraConfig } from "./madara"

// Additional Madara-theme sites — each is a config row over the shared factory.
// All use the default Madara `/manga/<slug>/chapter-N/` URL scheme. Flagged green
// (reachable, Madara template) by the source-probe; confirm a live chapter before
// relying on any of them, and tune mangaPath/chapterPrefix if a site differs.
const SITES: MadaraConfig[] = [
    { id: "freakscans", name: "Freak Scans", origin: "https://freakscans.com", domains: ["freakscans.com"] },
    { id: "arvenscans", name: "Arven Scans", origin: "https://arvenscans.org", domains: ["arvenscans.org"] },
    { id: "arvencomics", name: "Arven Comics", origin: "https://arvencomics.com", domains: ["arvencomics.com"] },
    { id: "novelmic", name: "Novelmic", origin: "https://novelmic.com", domains: ["novelmic.com"] },
    { id: "aryascans", name: "Arya Scans", origin: "https://aryascans.com", domains: ["aryascans.com"] },
    { id: "agrcomics", name: "AGR Comics", origin: "https://agrcomics.com", domains: ["agrcomics.com"] },
    { id: "manhuaplus", name: "ManhuaPlus", origin: "https://manhuaplus.org", domains: ["manhuaplus.org"] },
    { id: "rawkuma", name: "Rawkuma", origin: "https://rawkuma.com", domains: ["rawkuma.com"] },
    // Probe-green by homepage; needs live chapter confirmation (mangaPath/chapterPrefix may need tuning per site).
    { id: "hivetoon", name: "HiveToon", origin: "https://hivetoon.com", domains: ["hivetoon.com"] },
    { id: "mangagalaxy", name: "Manga Galaxy", origin: "https://mangagalaxy.me", domains: ["mangagalaxy.me"] },
    // User-import confirmed Madara sites (/manga/<slug>/chapter-N?style=list pattern)
    { id: "aquascans", name: "Aqua Scans", origin: "https://aquascans.com", domains: ["aquascans.com"] },
    { id: "lhtranslation", name: "LHTranslation", origin: "https://lhtranslation.net", domains: ["lhtranslation.net"] },
    { id: "harimanga", name: "HariManga", origin: "https://harimanga.me", domains: ["harimanga.me"] },
    { id: "manhuaus", name: "ManhuaUS", origin: "https://manhuaus.com", domains: ["manhuaus.com"] },
    { id: "s2manga", name: "S2Manga", origin: "https://s2manga.com", domains: ["s2manga.com"] },
    { id: "utoon", name: "UToon", origin: "https://utoon.net", domains: ["utoon.net"] },
    { id: "mangasushi", name: "MangaSushi", origin: "https://mangasushi.org", domains: ["mangasushi.org"] },
    // manhuatop uses /manhua/ path prefix instead of /manga/
    {
        id: "manhuatop",
        name: "ManhuaTop",
        origin: "https://manhuatop.org",
        domains: ["manhuatop.org"],
        mangaPath: "manhua"
    }
]

export const madaraAdapters: readonly SourceAdapter[] = SITES.map(createMadaraAdapter)

// Origins for these sites, for the extension's request allowlist + host permissions.
export const madaraOrigins: readonly string[] = SITES.map(s => `${s.origin}/*`)
