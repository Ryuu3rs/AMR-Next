import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { chromiumExtension, firefoxExtension, repositoryRoot } from "./paths.js"

async function readCommunityApiOrigin() {
    try {
        const content = await readFile(path.join(repositoryRoot, "apps", "extension", ".env"), "utf8")
        const match = /^VITE_COMMUNITY_API_ORIGIN=(.+)$/m.exec(content)
        return match?.[1]?.trim()
    } catch {
        return undefined
    }
}

const communityApiOrigin = await readCommunityApiOrigin()

const allowedPermissions = ["alarms", "declarativeNetRequest", "scripting", "storage", "tabs"]

// All source origins + GitHub API are required (granted at install, no per-source grant step).
// VITE_COMMUNITY_API_ORIGIN is intentionally excluded — it comes from a local .env and must not be
// part of the policy check (CI has no .env, local builds may have it set).
const allowedRequiredHosts = [
    "*://*.asuracomic.net/*",
    "*://*.asurascans.com/*",
    "*://*.compsci88.com/*",
    "*://*.images.mangafreak.me/*",
    "*://*.imgsrv4.com/*",
    "*://*.likemanga.io/*",
    "*://*.mangadex.network/*",
    "*://*.mangafreak.me/*",
    "*://*.mangagalaxy.me/*",
    "*://*.mangahere.com/*",
    "*://*.mghcdn.com/*",
    "*://*.mhcdn.net/*",
    "*://*.pstatic.net/*",
    "*://*.static.comix.to/*",
    "*://*.suryatoon.com/*",
    "*://*.weebcentral.com/*",
    "https://api.github.com/*",
    "https://api.mangadex.org/*",
    "https://aquamanga.com/*",
    "https://aquascans.com/*",
    "https://arvencomics.com/*",
    "https://arvenscans.org/*",
    "https://aryascans.com/*",
    "https://asuracomic.net/*",
    "https://asurascans.com/*",
    "https://comix.to/*",
    "https://dynasty-scans.com/*",
    "https://eahentai.com/*",
    "https://en-thunderscans.com/*",
    "https://fanfox.net/*",
    "https://hentai20.io/*",
    "https://hentairead.com/*",
    "https://hentalk.pw/*",
    "https://hivetoon.com/*",
    "https://kappabeast.com/*",
    "https://lhtranslation.net/*",
    "https://likemanga.io/*",
    "https://likemanga.io/*",
    "https://mangadex.org/*",
    "https://mangadistrict.com/*",
    "https://mangagalaxy.me/*",
    "https://mangagalaxy.me/*",
    "https://mangahere.cc/*",
    "https://mangahub.io/*",
    "https://mangasushi.org/*",
    "https://manhuaplus.org/*",
    "https://manhuatop.org/*",
    "https://manhuaus.com/*",
    "https://manhwahentai.me/*",
    "https://manhwatop.com/*",
    "https://manytoon.com/*",
    "https://mgread.io/*",
    "https://natomanga.com/*",
    "https://novelmic.com/*",
    "https://olympustaff.com/*",
    "https://omegascans.org/*",
    "https://phoenixscans.com/*",
    "https://rawkuma.com/*",
    "https://read.oppai.stream/*",
    "https://s2manga.com/*",
    "https://spiderscans.xyz/*",
    "https://suryatoon.com/*",
    "https://suryatoon.com/*",
    "https://templescan.net/*",
    "https://tritinia.org/*",
    "https://uploads.mangadex.org/*",
    "https://utoon.net/*",
    "https://vortexscans.org/*",
    "https://webtoons.com/*",
    "https://weebcentral.com/*",
    "https://www.comix.to/*",
    "https://www.dynasty-scans.com/*",
    "https://www.fanfox.net/*",
    "https://www.mangahere.cc/*",
    "https://www.mangahub.io/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "https://www.natomanga.com/*",
    "https://www.olympustaff.com/*",
    "https://www.phoenixscans.com/*",
    "https://www.webtoons.com/*",
    "https://www.weebcentral.com/*",
    "https://z-fanfox.net/*"
]

async function readManifest(extensionDirectory) {
    const manifestPath = path.join(extensionDirectory, "manifest.json")
    return JSON.parse(await readFile(manifestPath, "utf8"))
}

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
    assert.equal(firefox.browser_specific_settings?.gecko?.id, "amr-next@ryuu3rs.dev")
    assert.deepEqual(firefox.browser_specific_settings?.gecko?.data_collection_permissions, {
        required: ["none"]
    })
    assert.equal(chromium.background?.service_worker, "background.js")
    assert.deepEqual(firefox.background?.scripts, ["background.js"])
})
