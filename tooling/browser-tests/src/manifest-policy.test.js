import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { chromiumExtension, firefoxExtension } from "./paths.js"

const allowedPermissions = ["alarms", "declarativeNetRequest", "scripting", "storage", "tabs"]

// All source origins + GitHub API are required (granted at install, no per-source grant step).
const allowedRequiredHosts = [
    "*://*.asuracomic.net/*",
    "*://*.asurascans.com/*",
    "*://*.imgsrv4.com/*",
    "*://*.likemanga.io/*",
    "*://*.mangadex.network/*",
    "*://*.mangagalaxy.me/*",
    "*://*.mangapark.me/*",
    "*://*.mangapark.net/*",
    "*://*.mghcdn.com/*",
    "*://*.mhcdn.net/*",
    "*://*.mkklcdnv6temp.com/*",
    "*://*.mkklcdnv6tempv3.com/*",
    "*://*.pstatic.net/*",
    "*://*.suryatoon.com/*",
    "*://*.weebcentral.com/*",
    "https://agrcomics.com/*",
    "https://api.github.com/*",
    "https://api.mangadex.org/*",
    "https://arvencomics.com/*",
    "https://arvenscans.org/*",
    "https://aryascans.com/*",
    "https://asuracomic.net/*",
    "https://asurascans.com/*",
    "https://casacomic.com/*",
    "https://chapmanganato.com/*",
    "https://chapmanganato.to/*",
    "https://chapmanganelo.com/*",
    "https://drakecomic.com/*",
    "https://dynasty-scans.com/*",
    "https://eahentai.com/*",
    "https://en-thunderscans.com/*",
    "https://flamecomics.xyz/*",
    "https://harimanga.me/*",
    "https://hentai20.io/*",
    "https://hentairead.com/*",
    "https://hentalk.pw/*",
    "https://hivetoon.com/*",
    "https://kappabeast.com/*",
    "https://kunmanga.com/*",
    "https://lhtranslation.net/*",
    "https://likemanga.io/*",
    "https://likemanga.io/*",
    "https://mangabuddy.com/*",
    "https://mangadex.org/*",
    "https://mangadistrict.com/*",
    "https://mangagalaxy.me/*",
    "https://mangagalaxy.me/*",
    "https://mangahub.io/*",
    "https://mangamirror.com/*",
    "https://manganato.com/*",
    "https://mangapark.net/*",
    "https://mangapuma.com/*",
    "https://mangasushi.org/*",
    "https://manhuaplus.org/*",
    "https://manhuatop.org/*",
    "https://manytoon.com/*",
    "https://natomanga.com/*",
    "https://novelmic.com/*",
    "https://omegascans.org/*",
    "https://phoenixscans.com/*",
    "https://rawkuma.com/*",
    "https://read.oppai.stream/*",
    "https://saucemanhwa.org/*",
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
    "https://www.dynasty-scans.com/*",
    "https://www.mangahub.io/*",
    "https://www.manganato.com/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "https://www.natomanga.com/*",
    "https://www.phoenixscans.com/*",
    "https://www.webtoons.com/*",
    "https://www.weebcentral.com/*"
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
        assert.deepEqual([...manifest.host_permissions].sort(), allowedRequiredHosts)
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
    assert.equal(firefox.browser_specific_settings?.gecko?.id, "all-mangas-reader@ryuu3rs.dev")
    assert.deepEqual(firefox.browser_specific_settings?.gecko?.data_collection_permissions, {
        required: ["none"]
    })
    assert.equal(chromium.background?.service_worker, "background.js")
    assert.deepEqual(firefox.background?.scripts, ["background.js"])
})
