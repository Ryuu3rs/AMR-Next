import fs from "node:fs"
import path from "node:path"

const target = process.argv[2]
if (!target || !["chrome", "firefox"].includes(target)) {
    console.error("Usage: node scripts/verify-release.mjs <chrome|firefox>")
    process.exit(1)
}

const distDir = path.resolve("../dist")
const requiredFiles = [
    "manifest.json",
    "pages/popup.html",
    "pages/options.html",
    "pages/dashboard.html",
    "pages/bookmarks.html",
    "pages/importexport.html",
    "pages/lab.html",
    "pages/permissions.html",
    "scripts/background/background.js",
    "scripts/background/background-loader.js",
    "scripts/content/reader.js",
    "scripts/content/reader-bootstrap.js"
]

for (const file of requiredFiles) {
    const fullPath = path.join(distDir, file)
    if (!fs.existsSync(fullPath)) {
        console.error(`Missing required release file: ../dist/${file}`)
        process.exit(1)
    }
}

const manifestPath = path.join(distDir, "manifest.json")
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

if (manifest.manifest_version !== 3) {
    console.error("Release check failed: manifest_version must be 3")
    process.exit(1)
}

if (target === "chrome" && manifest.background?.service_worker !== "scripts/background/background.js") {
    console.error("Release check failed: chrome background.service_worker must be scripts/background/background.js")
    process.exit(1)
}

if (target === "firefox") {
    const backgroundScripts = manifest.background?.scripts
    const hasFirefoxBackgroundScripts =
        Array.isArray(backgroundScripts) && backgroundScripts.includes("scripts/background/background-loader.js")
    if (!hasFirefoxBackgroundScripts) {
        console.error(
            "Release check failed: firefox background.scripts must include scripts/background/background-loader.js"
        )
        process.exit(1)
    }
}

if (manifest.options_ui?.page !== "pages/options.html") {
    console.error("Release check failed: options_ui.page must be pages/options.html")
    process.exit(1)
}

if (target === "chrome" && manifest.browser_specific_settings?.gecko) {
    console.error("Release check failed: chrome manifest must not include browser_specific_settings.gecko")
    process.exit(1)
}

if (target === "firefox" && !manifest.browser_specific_settings?.gecko?.id) {
    console.error("Release check failed: firefox manifest must include browser_specific_settings.gecko.id")
    process.exit(1)
}

console.log(`Release verification passed for ${target}`)
