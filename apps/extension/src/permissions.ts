import { madaraOrigins } from "@amr/sources"

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
    "*://*.imgsrv4.com/*"
] as const

export const SOURCE_ORIGINS: readonly string[] = [...BASE_SOURCE_ORIGINS, ...madaraOrigins]

// Mutable copy for the browser.permissions APIs, which expect string[].
export function sourceOrigins(): string[] {
    return [...SOURCE_ORIGINS]
}
