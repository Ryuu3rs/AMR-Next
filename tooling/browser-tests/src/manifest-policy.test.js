import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { chromiumExtension, firefoxExtension } from "./paths.js"

const allowedPermissions = ["alarms", "scripting", "storage", "tabs"]
const allowedOptionalHosts = [
    "*://*.imgsrv4.com/*",
    "*://*.mangadex.network/*",
    "https://agrcomics.com/*",
    "https://api.github.com/*",
    "https://api.mangadex.org/*",
    "https://arvencomics.com/*",
    "https://arvenscans.org/*",
    "https://aryascans.com/*",
    "https://asuracomic.net/*",
    "https://cypherscans.xyz/*",
    "https://drakecomic.com/*",
    "https://en-thunderscans.com/*",
    "https://flamecomics.xyz/*",
    "https://freakscans.com/*",
    "https://hivetoon.com/*",
    "https://kappabeast.com/*",
    "https://mangadex.org/*",
    "https://mangagalaxy.me/*",
    "https://mangamirror.com/*",
    "https://mangapuma.com/*",
    "https://manhuaplus.org/*",
    "https://novelmic.com/*",
    "https://phoenixscans.com/*",
    "https://rawkuma.com/*",
    "https://spiderscans.xyz/*",
    "https://templescan.net/*",
    "https://uploads.mangadex.org/*",
    "https://www.mangaread.org/*",
    "https://www.mgeko.cc/*",
    "https://www.phoenixscans.com/*"
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
        assert.deepEqual([...manifest.optional_host_permissions].sort(), allowedOptionalHosts)
        assert.equal(manifest.host_permissions, undefined)
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
