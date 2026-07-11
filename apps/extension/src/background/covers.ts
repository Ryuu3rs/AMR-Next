const MAX_COVER_BYTES = 2 * 1024 * 1024

// Fetch a remote cover and inline it as a data: URL so it renders from the
// extension origin without tripping the source CDN's hotlink/referer checks.
// Returns undefined on any failure so callers can keep the original URL.
export async function inlineCover(url: string): Promise<string | undefined> {
    if (url.startsWith("data:")) return url
    try {
        const headers: HeadersInit = {}
        if (url.includes("pstatic.net")) headers["Referer"] = "https://www.webtoons.com"
        const res = await fetch(url, Object.keys(headers).length ? { headers } : undefined)
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
