import { anilistProvider } from "./anilist"
import { vpsProvider } from "./vps"
import type { MetadataProvider, MetadataQuery, MetadataResult } from "./provider"

export * from "./provider"

// Ordered provider chain. The self-hosted VPS catalog goes first once its service is
// deployed and origin configured (it caches AniList lookups across all users);
// AniList direct is the fallback and, until the VPS exists, the only provider. First
// non-null result wins.
const providers: MetadataProvider[] = import.meta.env.VITE_METADATA_API_ORIGIN
    ? [vpsProvider, anilistProvider]
    : [anilistProvider]

export async function resolveMetadata(query: MetadataQuery): Promise<MetadataResult | null> {
    const title = query.title?.trim()
    if (!title) return null
    for (const provider of providers) {
        try {
            const result = await provider.resolve(query)
            if (result) return result
        } catch {
            // Provider unavailable - fall through to the next.
        }
    }
    return null
}

// Chain-level title-variant lookup for the source resolver: iterates the SAME
// provider chain in order (VPS catalog first, AniList fallback) and returns the
// first provider's non-empty variant list. A provider without the method, or one
// that returns [] or throws, is skipped so the chain falls through to the next.
// Returns [] when no provider yields variants.
export async function resolveSearchTitles(anilistId: number): Promise<string[]> {
    for (const provider of providers) {
        if (!provider.resolveSearchTitles) continue
        try {
            const titles = await provider.resolveSearchTitles(anilistId)
            if (titles.length > 0) return titles
        } catch {
            // Provider unavailable - fall through to the next.
        }
    }
    return []
}
