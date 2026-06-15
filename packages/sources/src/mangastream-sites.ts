import type { SourceAdapter } from "@amr/source-sdk"
import { createMangaStreamAdapter, type MangaStreamConfig } from "./mangastream"

// MangaStream/ts-theme sites flagged green (reachable, ts template) by the
// source-probe. Each is a config row over the shared factory. Confirm a live
// chapter before relying on any of them; mangaPath is tunable per config.
const SITES: MangaStreamConfig[] = [
    { id: "drakecomic", name: "Drake Comic", origin: "https://drakecomic.com", domains: ["drakecomic.com"] },
    { id: "cypherscans", name: "Cypher Scans", origin: "https://cypherscans.xyz", domains: ["cypherscans.xyz"] },
    {
        id: "thunderscans",
        name: "Thunder Scans EN",
        origin: "https://en-thunderscans.com",
        domains: ["en-thunderscans.com"]
    },
    { id: "kappabeast", name: "Kappa Beast", origin: "https://kappabeast.com", domains: ["kappabeast.com"] },
    {
        id: "phoenixscans",
        name: "Phoenix Scans",
        origin: "https://www.phoenixscans.com",
        domains: ["phoenixscans.com", "www.phoenixscans.com"]
    },
    { id: "spiderscans", name: "Spider Scans", origin: "https://spiderscans.xyz", domains: ["spiderscans.xyz"] }
]

export const mangaStreamAdapters: readonly SourceAdapter[] = SITES.map(createMangaStreamAdapter)

export const mangaStreamOrigins: readonly string[] = SITES.flatMap(s => s.domains.map(d => `https://${d}/*`))
