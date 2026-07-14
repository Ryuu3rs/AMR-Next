import { sourceAdapters } from "@amr/sources"
import { describe, expect, it } from "vitest"
import { SOURCE_ORIGINS } from "./permissions"

// Parses a Chrome extension match pattern of the restricted shape this codebase
// always uses ("https://host/*" or "*://*.host/*") into its host component.
// Returns undefined for anything else (path-scoped patterns, unsupported schemes).
function parsePatternHost(pattern: string): { host: string; matchesSubdomains: boolean } | undefined {
    const m = pattern.match(/^(?:\*|https?):\/\/([^/]+)\/\*$/)
    if (!m) return undefined
    const rawHost = m[1]!.toLowerCase()
    return rawHost.startsWith("*.")
        ? { host: rawHost.slice(2), matchesSubdomains: true }
        : { host: rawHost, matchesSubdomains: false }
}

// True if some pattern in `patterns` would grant host_permissions access to `host`.
function isHostGranted(host: string, patterns: readonly string[]): boolean {
    const normalized = host.toLowerCase().replace(/\.$/, "")
    return patterns.some(pattern => {
        const parsed = parsePatternHost(pattern)
        if (!parsed) return false
        if (parsed.matchesSubdomains) {
            return normalized === parsed.host || normalized.endsWith(`.${parsed.host}`)
        }
        return normalized === parsed.host
    })
}

// Guards against the exact bug pattern this codebase kept hitting: a source
// adapter's manifest declares a domain (or, since imageOrigins was added, a
// separate cover/page-image CDN host) but nobody added a matching pattern to
// SOURCE_ORIGINS, so the extension's manifest never requests permission for it
// and reads fail with a real browser console CORS error. Every adapter actually
// registered in the source registry must be fully covered.
describe("SOURCE_ORIGINS covers every registered source adapter", () => {
    it("grants an origin for every adapter's manifest.domains entry", () => {
        const missing: string[] = []
        for (const adapter of sourceAdapters) {
            for (const domain of adapter.manifest.domains) {
                if (!isHostGranted(domain, SOURCE_ORIGINS)) {
                    missing.push(
                        `${adapter.manifest.id}: domain "${domain}" is not covered by any SOURCE_ORIGINS pattern`
                    )
                }
            }
        }
        expect(missing).toEqual([])
    })

    it("grants an origin for every adapter's manifest.imageOrigins entry", () => {
        const missing: string[] = []
        for (const adapter of sourceAdapters) {
            for (const imageOrigin of adapter.manifest.imageOrigins ?? []) {
                const parsed = parsePatternHost(imageOrigin)
                if (!parsed) {
                    missing.push(
                        `${adapter.manifest.id}: imageOrigins entry "${imageOrigin}" is not a recognised match pattern`
                    )
                    continue
                }
                if (!isHostGranted(parsed.host, SOURCE_ORIGINS)) {
                    missing.push(
                        `${adapter.manifest.id}: imageOrigins entry "${imageOrigin}" is not covered by any SOURCE_ORIGINS pattern`
                    )
                }
            }
        }
        expect(missing).toEqual([])
    })

    // Regression check for the bug that motivated this test: a real user hit a
    // console CORS error fetching a MangaHub-adjacent cover image from
    // fmcdn.mfcdn.net. Live investigation traced it to the FanFox adapter's
    // og:image cover extraction, not MangaHub - see fanfox-sites.ts.
    it("covers the fanfox cover CDN host (fmcdn.mfcdn.net) that motivated this test", () => {
        expect(isHostGranted("fmcdn.mfcdn.net", SOURCE_ORIGINS)).toBe(true)
    })
})

describe("parsePatternHost / isHostGranted", () => {
    it("matches a bare-domain pattern only against the exact host", () => {
        expect(isHostGranted("mangahub.io", ["https://mangahub.io/*"])).toBe(true)
        expect(isHostGranted("evil-mangahub.io", ["https://mangahub.io/*"])).toBe(false)
        expect(isHostGranted("sub.mangahub.io", ["https://mangahub.io/*"])).toBe(false)
    })

    it("matches a wildcard-subdomain pattern against the bare domain and any subdomain", () => {
        expect(isHostGranted("mfcdn.net", ["*://*.mfcdn.net/*"])).toBe(true)
        expect(isHostGranted("fmcdn.mfcdn.net", ["*://*.mfcdn.net/*"])).toBe(true)
        expect(isHostGranted("mfcdn.net.evil.com", ["*://*.mfcdn.net/*"])).toBe(false)
    })
})
