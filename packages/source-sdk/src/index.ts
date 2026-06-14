export * from "./errors"
export * from "./registry"
export * from "./request"
export * from "./types"

export function matchesSourceDomain(hostname: string, domains: readonly string[]): boolean {
    const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "")

    return domains.some(domain => {
        const normalizedDomain = domain.toLowerCase().replace(/\.$/, "")

        if (normalizedDomain.startsWith("*.")) {
            return normalizedHostname.endsWith(`.${normalizedDomain.slice(2)}`)
        }

        return normalizedHostname === normalizedDomain
    })
}
