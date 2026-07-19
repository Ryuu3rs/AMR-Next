/// <reference types="node" />
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"

// Freshness guard: every fixture in this directory must carry a FIXTURE_META
// export recording when its HTML/response shape was captured from the live site
// and which URL it represents. A new, undated fixture fails CI here until it is
// stamped - closing the "undated fixture drifts silently" gap that let an
// adapter's parsing regex be changed against stale HTML.

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url))

function fixtureFiles(): string[] {
    return readdirSync(FIXTURES_DIR)
        .filter(name => name.endsWith(".ts"))
        .filter(name => !name.endsWith(".test.ts") && name !== "index.ts")
        .sort()
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe("fixture-meta guard: every fixture is stamped", () => {
    const files = fixtureFiles()

    it("finds fixture files to check", () => {
        expect(files.length).toBeGreaterThan(0)
    })

    it.each(files)("%s exports a valid FIXTURE_META", async name => {
        const mod = (await import(pathToFileURL(join(FIXTURES_DIR, name)).href)) as {
            FIXTURE_META?: { capturedAt?: unknown; sourceUrl?: unknown; note?: unknown }
        }

        const meta = mod.FIXTURE_META
        expect(meta, `${name} must export FIXTURE_META`).toBeTruthy()

        expect(typeof meta!.sourceUrl, `${name} FIXTURE_META.sourceUrl must be a string`).toBe("string")
        expect((meta!.sourceUrl as string).length, `${name} FIXTURE_META.sourceUrl must be non-empty`).toBeGreaterThan(
            0
        )

        expect(typeof meta!.capturedAt, `${name} FIXTURE_META.capturedAt must be a string`).toBe("string")
        const capturedAt = meta!.capturedAt as string
        expect(capturedAt, `${name} FIXTURE_META.capturedAt must be YYYY-MM-DD`).toMatch(ISO_DATE)

        const parsed = new Date(`${capturedAt}T00:00:00Z`)
        expect(Number.isNaN(parsed.getTime()), `${name} FIXTURE_META.capturedAt must parse to a real date`).toBe(false)
        // Guard against normalized-away nonsense like 2026-02-31 -> 2026-03-03.
        expect(parsed.toISOString().slice(0, 10), `${name} FIXTURE_META.capturedAt must be a real calendar date`).toBe(
            capturedAt
        )
    })
})
