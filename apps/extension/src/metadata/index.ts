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
