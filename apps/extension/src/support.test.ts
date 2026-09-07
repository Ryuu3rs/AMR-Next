import { describe, expect, it } from "vitest"
import { AMR_KOFI_URL, supportPlatform } from "./support"

describe("supportPlatform", () => {
    it("names known tip platforms and falls back for a site's own page", () => {
        expect(supportPlatform(AMR_KOFI_URL)).toBe("Ko-fi")
        expect(supportPlatform("https://www.patreon.com/tritiniascans")).toBe("Patreon")
        expect(supportPlatform("https://flamecomics.xyz/donate")).toBe("their donate page")
        expect(supportPlatform("not a url")).toBe("their support page")
    })
})
