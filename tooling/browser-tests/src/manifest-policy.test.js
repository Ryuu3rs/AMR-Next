import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { chromiumExtension, firefoxExtension } from "./paths.js"

const allowedPermissions = ["alarms", "scripting", "storage", "tabs"]

// All source origins + GitHub API are required (granted at install, no per-source grant step).
const allowedRequiredHosts = [
    "*://*.imgsrv4.com/*",
    "*://*.mangadex.network/*",
    "*://*.mangapark.me/*",
    "*://*.mangapark.net/*",
    "*://*.mkklcdnv6temp.com/*",
    "*://*.mkklcdnv6tempv3.com/*",
    "*://*.weebcentral.com/*",
    "https://agrcomics.com/*",
    "https://api.github.com/*",
    "https://api.mangadex.org/*",
    "https://aquascans.com/*",
    "https://arvencomics.com/*",
    "https://arvenscans.org/*",
    "https://aryascans.com/*",
    "https://asuracomic.net/*",
    "https://chapmanganato.com/*",
    "https://chapmanganato.to/*",
    "https://chapmanganelo.com/*",
    "https://drakecomic.com/*",
    "https://dynasty-scans.com/*",
    "https://en-thunderscans.com/*",
    "https://flamecomics.xyz/*",
    "https://freakscans.com/*",
    "https://harimanga.me/*",
    "https://hivetoon.com/*",
    "https://kappabeast.com/*",
    "https://lhtranslation.net/*",
    "https://mangabuddy.com/*",
    "https://mangadex.org/*",
    "https://mangagalaxy.me/*",
    "https://mangamirror.com/*",
    "https://manganato.com/*",
    "https://mangapark.net/*",
    "https://mangapuma.com/*",
    "https://mangasushi.org/*",
    "https://manhuaplus.org/*",
    "https://manhuatop.org/*",
    "https://manhuaus.com/*",
    "https://novelmic.com/*",
    "https://phoenixscans.com/*",
    "https://rawkuma.com/*",
    "https://s2manga.com/*",
    "https://spiderscans.xyz/*",
    "https://templescan.net/*",
    "https://uploads.mangadex.org/*",
    "https://utoon.net/*",
    "https://weebcentral.com/*",
    "https://www.dynasty-scans.com/*",
    "https://www.manganato.com/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "https://www.phoenixscans.com/*",
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
