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
    "*://*.mkklcdnv6temp.com/*",
    // Weeb Central (MangaSee successor) — main domain + image CDN subdomains
    "https://weebcentral.com/*",
    "https://www.weebcentral.com/*",
    "*://*.weebcentral.com/*"
] as const

export const SOURCE_ORIGINS: readonly string[] = [
    ...BASE_SOURCE_ORIGINS,
    ...madaraOrigins,
    ...mangaStreamOrigins,
    ...mangaBuddyOrigins
]

// GitHub API is a required host permission (update checks + Gist sync).
// Listed here for reference; added to host_permissions in wxt.config.ts, so it
// is NOT repeated in optional_host_permissions to avoid manifest conflicts.
export const GITHUB_API_ORIGIN = "https://api.github.com/*" as const

// Gist sync origins — still requested optionally in the UI so the user knows
// they are authorising Gist access (the network-level permission is already
// granted via host_permissions; this optional grant is for the UI prompt only).
export const SYNC_ORIGINS = [GITHUB_API_ORIGIN] as const

// All optional host origins for the manifest (source sites only — GitHub API
// is in required host_permissions instead).
export const ALL_OPTIONAL_ORIGINS: readonly string[] = [...SOURCE_ORIGINS]

// Mutable copy for the browser.permissions APIs, which expect string[].
export function sourceOrigins(): string[] {
    return [...SOURCE_ORIGINS]
}

export function syncOrigins(): string[] {
    return [...SYNC_ORIGINS]
}
