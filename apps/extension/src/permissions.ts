import { madaraOrigins, mangaStreamOrigins, mangaBuddyOrigins } from "@amr/sources"

// Single source of truth for source host origins. Consumed by the manifest
// (wxt.config.ts), the background permission helpers, and every UI grant prompt.
// Base origins are the bespoke adapters; the generic Madara sites contribute
// their origins from the sources package so adding a Madara site stays a one-liner.
const BASE_SOURCE_ORIGINS = [
    "https://mangadex.org/*",
    "https://api.mangadex.org/*",
    "https://uploads.mangadex.org/*",
    "*://*.mangadex.network/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "*://*.imgsrv4.com/*",
    // MangaNato family — all four domains + image CDNs
    "https://chapmanganato.to/*",
    "https://chapmanganato.com/*",
    "https://manganato.com/*",
    "https://www.manganato.com/*",
    "https://chapmanganelo.com/*",
    "*://*.mkklcdnv6tempv3.com/*",
    "*://*.mkklcdnv6temp.com/*"
] as const

export const SOURCE_ORIGINS: readonly string[] = [
    ...BASE_SOURCE_ORIGINS,
    ...madaraOrigins,
    ...mangaStreamOrigins,
    ...mangaBuddyOrigins
]

// GitHub API origin for Gist sync (G5). Separate from source origins — requested
// only when the user enables sync.
export const SYNC_ORIGINS = ["https://api.github.com/*"] as const

// All optional host origins for the manifest.
export const ALL_OPTIONAL_ORIGINS: readonly string[] = [...SOURCE_ORIGINS, ...SYNC_ORIGINS]

// Mutable copy for the browser.permissions APIs, which expect string[].
export function sourceOrigins(): string[] {
    return [...SOURCE_ORIGINS]
}

export function syncOrigins(): string[] {
    return [...SYNC_ORIGINS]
}
