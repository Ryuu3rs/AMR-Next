// The extension's own tip link. Site teams get their own link via SourceManifest.supportUrl;
// wherever both appear they are labelled so readers know which is which.
export const AMR_KOFI_URL = "https://ko-fi.com/ryuu3rs"
export const AMR_SUPPORT_LABEL = "StoryHoard"

// Human name of the tip platform behind a URL, for tooltips ("on Patreon", "on Ko-fi").
export function supportPlatform(url: string): string {
    let host = ""
    try {
        host = new URL(url).hostname
        if (host.startsWith("www.")) host = host.slice(4)
    } catch {
        return "their support page"
    }
    if (host === "ko-fi.com") return "Ko-fi"
    if (host === "patreon.com") return "Patreon"
    if (host === "buymeacoffee.com") return "Buy Me a Coffee"
    if (host === "paypal.me" || host === "paypal.com") return "PayPal"
    if (host === "liberapay.com") return "Liberapay"
    if (host === "github.com") return "GitHub Sponsors"
    return "their donate page"
}
