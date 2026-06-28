import type { SourceAdapter } from "@amr/source-sdk"
import { createFanfoxFamilyAdapter, type FanfoxFamilyConfig } from "./fanfox"

// FanFox / MangaHere family — same platform, same HTML structure, config-driven.
// Images load via JavaScript; resolveChapter returns empty pages.
// On-page panel (prev/next navigation) fully works via listChapters.
const SITES: FanfoxFamilyConfig[] = [
    { id: "fanfox", name: "FanFox", origin: "https://fanfox.net", domains: ["fanfox.net", "www.fanfox.net"] },
    {
        id: "mangahere",
        name: "MangaHere",
        origin: "https://www.mangahere.cc",
        domains: ["mangahere.cc", "www.mangahere.cc"]
    }
]

export const fanfoxFamilyAdapters: readonly SourceAdapter[] = SITES.map(createFanfoxFamilyAdapter)

export const fanfoxFamilyOrigins: readonly string[] = SITES.flatMap(s => s.domains.map(d => `https://${d}/*`))
