const MAX_COVER_BYTES = 2 * 1024 * 1024

// Fetch a remote cover and return it as a Blob for caching in the covers table
// (see cacheCover in ../database). Reuses the size/content-type guard that used
// to gate inlineCover's base64 encoding, minus the encoding step itself - covers
// are cached as Blobs now, never inlined as data: URIs into coverUrl.
// Returns undefined on any failure so callers can treat this as best-effort.
export async function fetchCoverBlob(url: string): Promise<Blob | undefined> {
    try {
        // Note: `Referer` is a forbidden header name per the fetch spec, so a
        // service-worker fetch can never set it - Naver's pstatic.net CDN (which
        // serves Webtoons covers) has been verified to serve images fine without
        // one, so no header is needed here.
        const res = await fetch(url)
        if (!res.ok) return undefined
        const blob = await res.blob()
        if (blob.size === 0 || blob.size > MAX_COVER_BYTES || !blob.type.startsWith("image/")) return undefined
        return blob
    } catch {
        return undefined
    }
}
