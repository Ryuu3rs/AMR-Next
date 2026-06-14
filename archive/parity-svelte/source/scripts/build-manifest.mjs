import fs from "node:fs"
import path from "node:path"

const target = process.argv[2]
if (!target || !["chrome", "firefox"].includes(target)) {
    console.error("Usage: node scripts/build-manifest.mjs <chrome|firefox>")
    process.exit(1)
}

const manifestDir = path.resolve("manifest")
const base = JSON.parse(fs.readFileSync(path.join(manifestDir, "manifest.base.json"), "utf8"))
const override = JSON.parse(fs.readFileSync(path.join(manifestDir, `manifest.${target}.json`), "utf8"))

const merged = {
    ...base,
    ...override,
    action: {
        ...(base.action ?? {}),
        ...(override.action ?? {})
    }
}

if (override.background) {
    merged.background = override.background
} else if (base.background) {
    merged.background = base.background
}

const distDir = path.resolve("../dist")
fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(path.join(distDir, "manifest.json"), JSON.stringify(merged, null, 2))
console.log(`Manifest generated for ${target}`)
