const MAX_COVER_BYTES = 2 * 1024 * 1024

// Fetch a remote cover and inline it as a data: URL so it renders from the
// extension origin without tripping the source CDN's hotlink/referer checks.
// Returns undefined on any failure so callers can keep the original URL.
export async function inlineCover(url: string): Promise<string | undefined> {
    if (url.startsWith("data:")) return url
    try {
        // Note: `Referer` is a forbidden header name per the fetch spec, so a
        // service-worker fetch can never set it — Naver's pstatic.net CDN (which
        // serves Webtoons covers) has been verified to serve images fine without
        // one, so no header is needed here.
        const res = await fetch(url)
        if (!res.ok) return undefined
        const blob = await res.blob()
        if (blob.size === 0 || blob.size > MAX_COVER_BYTES || !blob.type.startsWith("image/")) return undefined
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const CHUNK = 65536
        let binary = ""
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
        }
        return `data:${blob.type};base64,${btoa(binary)}`
    } catch {
        return undefined
    }
}
