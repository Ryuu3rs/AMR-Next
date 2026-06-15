import assert from "node:assert/strict"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { start } from "geckodriver"
import { firefox as playwrightFirefox } from "playwright"
import { Builder, By, until } from "selenium-webdriver"
import firefox from "selenium-webdriver/firefox.js"
import { artifactsDirectory, firefoxExtension, repositoryRoot } from "../../src/paths.js"

const extensionId = "all-mangas-reader@ryuu3rs.dev"
const extensionUuid = "8d2b2cc7-86aa-4afd-b733-939aaf4bb217"
const geckodriverUrl = "http://127.0.0.1:4444"

async function findExtensionPackage() {
    if (process.env.FIREFOX_EXTENSION_PATH) {
        return path.resolve(process.env.FIREFOX_EXTENSION_PATH)
    }

    const outputDirectory = path.dirname(firefoxExtension)
    const files = await readdir(outputDirectory)
    const packageName = files.find(file => file.endsWith("-firefox.zip"))
    assert.ok(packageName, `No Firefox package found in ${path.relative(repositoryRoot, outputDirectory)}`)
    return path.join(outputDirectory, packageName)
}

const options = new firefox.Options()
options.addArguments("-headless")
options.setPreference("extensions.webextensions.uuids", JSON.stringify({ [extensionId]: extensionUuid }))

options.setBinary(process.env.FIREFOX_BIN ?? playwrightFirefox.executablePath())

async function waitForGeckodriver() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(`${geckodriverUrl}/status`)
            if (response.ok) return
        } catch {
            // The driver may still be starting.
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error("Geckodriver did not become ready")
}

async function run() {
    const geckodriver = await start({ host: "127.0.0.1", port: 4444 })
    let driver

    try {
        await waitForGeckodriver()
        driver = await new Builder()
            .usingServer(geckodriverUrl)
            .forBrowser("firefox")
            .setFirefoxOptions(options)
            .build()

        const installedId = await driver.installAddon(await findExtensionPackage(), true)
        assert.equal(installedId, extensionId)

        await driver.get(`moz-extension://${extensionUuid}/popup.html`)
        const heading = await driver.wait(until.elementLocated(By.css("h1")), 15_000)
        assert.equal(await heading.getText(), "All Mangas Reader")

        const stateHeading = await driver.wait(until.elementLocated(By.css("section.card h2")), 15_000)
        assert.equal(await stateHeading.getText(), "Not a supported manga page")
    } catch (error) {
        if (driver) {
            await mkdir(artifactsDirectory, { recursive: true })
            const screenshot = await driver.takeScreenshot()
            await writeFile(path.join(artifactsDirectory, "firefox-failure.png"), screenshot, "base64")
        }
        throw error
    } finally {
        await driver?.quit()
        geckodriver.kill()
    }
}

await run()
