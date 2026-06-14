// Anti-scrape / viability probe for manga mirror candidates.
// Fetches each candidate, classifies anti-scrape posture and CMS template, and
// emits a viability score so we can triage which sites are worth an adapter.
//
// Usage: node probe.mjs            (or: npm run probe -w @amr/source-probe)
// No dependencies; uses Node 22 global fetch. Writes output/report.{json,md}.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const CONCURRENCY = 6
const TIMEOUT_MS = 15_000
const MAX_BODY = 200_000

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

const SIGNATURES = {
    cloudflare: /just a moment|cf_chl|challenge-platform|attention required.*cloudflare|cf-mitigated/i,
    turnstile: /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i,
    ddosGuard: /ddos-guard/i,
    captcha: /hcaptcha|g-recaptcha|recaptcha\/api|captcha-delivery/i
}

const CMS = {
    madara: /wp-manga|madara|manga_get_chapter_img_list|wp-manga-chapter-img/i,
    mangastream: /ts_reader|reader-area|id=["']readerarea["']/i,
    mangabuddy: /mangabuddy|chapter-images|chapterimages|loadchapter/i,
    wordpress: /wp-content|wp-includes/i,
    spa: /<div id=["']root["']|__next_data__|window\.__nuxt__/i
}

const IMAGE_HINTS =
    /wp-manga-chapter-img|id=["']image-\d+|chapter_preloaded_images|ts_reader\.run|class=["'][^"']*reader-area/i

async function probeOne(site) {
    const result = {
        name: site.name,
        url: site.url,
        priority: site.priority,
        cmsGuess: site.cmsGuess ?? null,
        reachable: false,
        status: null,
        server: null,
        cfRay: false,
        antiScrape: [],
        cmsDetected: [],
        imageHints: false,
        score: 0,
        verdict: "red",
        note: site.note ?? "",
        error: null
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const res = await fetch(site.url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "User-Agent": UA,
                Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            }
        })
        result.reachable = true
        result.status = res.status
        result.server = res.headers.get("server")
        result.cfRay = res.headers.has("cf-ray")

        const reader = res.body?.getReader?.()
        let body = ""
        if (reader) {
            const decoder = new TextDecoder()
            while (body.length < MAX_BODY) {
                const { done, value } = await reader.read()
                if (done) break
                body += decoder.decode(value, { stream: true })
            }
            await reader.cancel().catch(() => {})
        } else {
            body = (await res.text()).slice(0, MAX_BODY)
        }

        for (const [name, re] of Object.entries(SIGNATURES)) {
            if (re.test(body) || (name === "cloudflare" && result.cfRay && res.status === 403)) {
                result.antiScrape.push(name)
            }
        }
        if (result.server && /ddos-guard/i.test(result.server) && !result.antiScrape.includes("ddosGuard")) {
            result.antiScrape.push("ddosGuard")
        }
        for (const [name, re] of Object.entries(CMS)) {
            if (re.test(body)) result.cmsDetected.push(name)
        }
        result.imageHints = IMAGE_HINTS.test(body)
    } catch (error) {
        result.error = error instanceof Error ? error.name + ": " + error.message : String(error)
    } finally {
        clearTimeout(timer)
    }

    // Score: start optimistic, subtract for friction.
    let score = 5
    if (!result.reachable) score = 0
    else {
        if (
            result.antiScrape.includes("cloudflare") ||
            result.antiScrape.includes("turnstile") ||
            result.antiScrape.includes("captcha")
        )
            score -= 3
        if (result.antiScrape.includes("ddosGuard")) score -= 2
        if (result.status && result.status >= 400) score -= 1
        if (result.cmsDetected.some(c => c === "madara" || c === "mangastream" || c === "mangabuddy")) score += 1
        if (result.imageHints) score += 1
    }
    result.score = Math.max(0, Math.min(5, score))
    result.verdict = result.score >= 4 ? "green" : result.score >= 2 ? "yellow" : "red"
    return result
}

async function runPool(sites, worker) {
    const out = new Array(sites.length)
    let next = 0
    async function lane() {
        while (next < sites.length) {
            const i = next++
            out[i] = await worker(sites[i], i)
            const r = out[i]
            console.log(
                `[${r.verdict.toUpperCase().padEnd(6)}] ${String(r.score)}  ${r.name} — ${r.reachable ? r.status : r.error}`
            )
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sites.length) }, lane))
    return out
}

function toMarkdown(results, stamp) {
    const order = { green: 0, yellow: 1, red: 2 }
    const sorted = [...results].sort((a, b) => order[a.verdict] - order[b.verdict] || b.score - a.score)
    const rows = sorted.map(
        r =>
            `| ${r.verdict} | ${r.score} | ${r.name} | ${r.priority} | ${r.reachable ? r.status : "—"} | ${r.antiScrape.join(", ") || "—"} | ${r.cmsDetected.join(", ") || "—"} | ${r.imageHints ? "yes" : "no"} | ${r.note || r.error || ""} |`
    )
    return [
        `# Mirror probe report`,
        ``,
        `Generated: ${stamp}`,
        ``,
        `Verdict policy: green (>=4) add via generic adapter · yellow (2–3) revisit with content-script/cookies · red (<=1) skip, prefer Suwayomi.`,
        ``,
        `| verdict | score | site | priority | status | anti-scrape | cms | img hints | note |`,
        `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
        ...rows,
        ``
    ].join("\n")
}

async function main() {
    const raw = JSON.parse(await readFile(join(here, "candidates.json"), "utf8"))
    const sites = raw.sites
    // Timestamp passed via env so the script stays deterministic for caching.
    const stamp = process.env.PROBE_STAMP ?? "(set PROBE_STAMP for a fixed timestamp)"
    console.log(`Probing ${sites.length} candidates (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS}ms)...\n`)
    const results = await runPool(sites, probeOne)

    const counts = results.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {})
    console.log(`\nSummary: green ${counts.green ?? 0} · yellow ${counts.yellow ?? 0} · red ${counts.red ?? 0}`)

    const outDir = join(here, "output")
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, "report.json"), JSON.stringify({ generated: stamp, results }, null, 2))
    await writeFile(join(outDir, "report.md"), toMarkdown(results, stamp))
    console.log(`\nWrote output/report.json and output/report.md`)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
