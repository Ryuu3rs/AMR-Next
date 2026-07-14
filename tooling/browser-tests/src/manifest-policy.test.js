import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { chromiumExtension, firefoxExtension, repositoryRoot } from "./paths.js"

async function readCommunityApiOrigin() {
    // The release pipeline bakes this in as a build-time env var (no .env file involved -
    // see .github/workflows/release-please.yml), while local dev sets it via apps/extension/.env.
    // Check both sources so the manifest built either way excludes it from the policy check.
    if (process.env.VITE_COMMUNITY_API_ORIGIN) return process.env.VITE_COMMUNITY_API_ORIGIN.trim()
    try {
        const content = await readFile(path.join(repositoryRoot, "apps", "extension", ".env"), "utf8")
        const match = /^VITE_COMMUNITY_API_ORIGIN=(.+)$/m.exec(content)
        return match?.[1]?.trim()
    } catch {
        return undefined
    }
}

const communityApiOrigin = await readCommunityApiOrigin()

const allowedPermissions = ["alarms", "declarativeNetRequest", "downloads", "scripting", "storage", "tabs"]

// All source origins + GitHub API are required (granted at install, no per-source grant step).
// VITE_COMMUNITY_API_ORIGIN is intentionally excluded - it comes from a local .env and must not be
// part of the policy check (CI has no .env, local builds may have it set).
const allowedRequiredHosts = [
    "*://*.asuracomic.net/*",
    "*://*.asurascans.com/*",
    "*://*.compsci88.com/*",
    "*://*.hivetoon.com/*",
    "*://*.images.mangafreak.me/*",
    "*://*.imgsrv4.com/*",
    "*://*.likemanga.io/*",
    "*://*.mangadex.network/*",
    "*://*.mangafreak.me/*",
    "*://*.mangahere.com/*",
    "*://*.mangaread.org/*",
    "*://*.manhwatop.com/*",
    "*://*.mfcdn.net/*",
    "*://*.mghcdn.com/*",
    "*://*.mhcdn.net/*",
    "*://*.pstatic.net/*",
    "*://*.static.comix.to/*",
    "*://*.vortexscans.org/*",
    "*://*.weebcentral.com/*",
    "https://api.github.com/*",
    "https://api.mangadex.org/*",
    "https://aquamanga.com/*",
    "https://asuracomic.net/*",
    "https://asurascans.com/*",
    "https://brainrotcomics.com/*",
    "https://comix.to/*",
    "https://dynasty-scans.com/*",
    "https://eahentai.com/*",
    "https://en-thunderscans.com/*",
    "https://fanfox.net/*",
    "https://hentai20.io/*",
    "https://hentairead.com/*",
    "https://hentalk.pw/*",
    "https://hivetoon.com/*",
    "https://img.hentai1.io/*",
    "https://kagane.to/*",
    "https://kappabeast.com/*",
    "https://kstatic.to/*",
    "https://lhtranslation.net/*",
    "https://likemanga.io/*",
    "https://likemanga.io/*",
    "https://mangadex.org/*",
    "https://mangadistrict.com/*",
    "https://mangahere.cc/*",
    "https://mangahub.io/*",
    "https://mangasushi.org/*",
    "https://manhuatop.org/*",
    "https://manhuaus.com/*",
    "https://manhwatop.com/*",
    "https://mgeko.cc/*",
    "https://mgread.io/*",
    "https://natomanga.com/*",
    "https://novelmic.com/*",
    "https://olympustaff.com/*",
    "https://omegascans.org/*",
    "https://phoenixscans.com/*",
    "https://rawkuma.com/*",
    "https://read.oppai.stream/*",
    "https://spiderscans.xyz/*",
    "https://tritinia.org/*",
    "https://uploads.mangadex.org/*",
    "https://utoon.net/*",
    "https://vortexscans.org/*",
    "https://webtoons.com/*",
    "https://weebcentral.com/*",
    "https://www.comix.to/*",
    "https://www.dynasty-scans.com/*",
    "https://www.fanfox.net/*",
    "https://www.mangadex.org/*",
    "https://www.mangahere.cc/*",
    "https://www.mangahub.io/*",
    "https://www.mgeko.cc/*",
    "https://www.natomanga.com/*",
    "https://www.olympustaff.com/*",
    "https://www.phoenixscans.com/*",
    "https://www.webtoons.com/*",
    "https://www.weebcentral.com/*",
    "https://yuzuki.kagane.to/*",
    "https://z-fanfox.net/*"
]

async function readManifest(extensionDirectory) {
    const manifestPath = path.join(extensionDirectory, "manifest.json")
    return JSON.parse(await readFile(manifestPath, "utf8"))
}

// Must match the "key" literal in apps/extension/wxt.config.ts exactly. This pins the
// Chromium extension id (bbhdbcfjedbbgaeafdfffcadbgafjgai) so it never again depends on
// the unpacked folder's path - a data-loss bug (every manual update reset IndexedDB,
// since a new path meant a new id) was fixed by adding this key. Losing it in a future
// edit would silently reintroduce that bug.
const EXPECTED_CHROMIUM_KEY =
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFs/Zy3z054Tl4XnWmlr+CBQ8vsvnzIUNJBJ/o/ltpGW3vsNypznLvMDeDlZ3yMhNCA0ZkEuy0o2cfyQ6BtBE+wEZu/teb0AKyRzVEOVo3gy//lcPhVaewqfAVF4woFG5lWnEoOS5Fg+88NBdZp6/rY+OyjFgLv6oX1PWnCfX7WRYnAwi90KJK9c27MtgNRJfMaQGHAK4vieUdLcyObKoHxZlVQXqMQOFtUR3WJIQI3AVKg3wheXF8IvBHKHxueyR2f3C5EAWfBI7mm/F051ivpnQT9foV9ED6R9rF3mqfflHZLjqcfoq64qMCYsHkR/9J8BpWTFNfcYmSR21sCE+wIDAQAB"

function packagedPaths(manifest) {
    return [
        manifest.action?.default_popup,
        manifest.background?.service_worker,
        ...(manifest.background?.scripts ?? []),
        ...Object.values(manifest.icons ?? {})
    ].filter(Boolean)
}

for (const [browserName, extensionDirectory] of [
    ["Chromium", chromiumExtension],
    ["Firefox", firefoxExtension]
]) {
    test(`${browserName} manifest follows extension policy`, async () => {
        const manifest = await readManifest(extensionDirectory)

        assert.equal(manifest.manifest_version, 3)
        assert.deepEqual([...manifest.permissions].sort(), allowedPermissions)
        const actualHosts = [...manifest.host_permissions].filter(h => h !== communityApiOrigin).sort()
        assert.deepEqual(actualHosts, allowedRequiredHosts)
        assert.equal(manifest.optional_host_permissions, undefined)
        assert.equal(manifest.content_scripts, undefined)
        assert.equal(manifest.externally_connectable, undefined)

        for (const packagedPath of packagedPaths(manifest)) {
            assert.ok(!packagedPath.includes("://"), `${packagedPath} must be packaged locally`)
            await access(path.join(extensionDirectory, packagedPath.replace(/^[/\\]/, "")))
        }
    })
}

test("browser-specific manifest policy is preserved", async () => {
    const chromium = await readManifest(chromiumExtension)
    const firefox = await readManifest(firefoxExtension)

    assert.equal(chromium.browser_specific_settings, undefined)
    assert.equal(chromium.key, EXPECTED_CHROMIUM_KEY)
    assert.equal(firefox.key, undefined)
    assert.equal(firefox.browser_specific_settings?.gecko?.id, "amr-next@ryuu3rs.dev")
    assert.deepEqual(firefox.browser_specific_settings?.gecko?.data_collection_permissions, {
        required: ["none"]
    })
    assert.equal(chromium.background?.service_worker, "background.js")
    assert.deepEqual(firefox.background?.scripts, ["background.js"])
})
