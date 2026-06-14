import path from "node:path"
import { fileURLToPath } from "node:url"

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const repositoryRoot = path.resolve(testRoot, "../..")
export const chromiumExtension = path.join(repositoryRoot, "apps", "extension", ".output", "chrome-mv3")
export const firefoxExtension = path.join(repositoryRoot, "apps", "extension", ".output", "firefox-mv3")
export const artifactsDirectory = path.join(testRoot, "artifacts")
