// Single source of truth for source host origins. Consumed by the manifest
// (wxt.config.ts), the background permission helpers, and every UI grant prompt.
// Keep this in sync with optional_host_permissions — they must match exactly.
export const SOURCE_ORIGINS = [
    "https://mangadex.org/*",
    "https://api.mangadex.org/*",
    "https://uploads.mangadex.org/*",
    "*://*.mangadex.network/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "*://*.imgsrv4.com/*"
] as const

// Mutable copy for the browser.permissions APIs, which expect string[].
export function sourceOrigins(): string[] {
    return [...SOURCE_ORIGINS]
}
