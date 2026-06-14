<script lang="ts">
    import { onMount } from "svelte"
    import { sendRuntimeMessage } from "../../src/runtime"
    import { sourceOrigins } from "../../src/permissions"

    type PageState = {
        supported: boolean
        pageType?: "chapter" | "manga" | "none"
        url?: string
    }

    let page = $state<PageState | undefined>()
    let message = $state("")
    let busy = $state(false)

    onMount(async () => {
        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
            if (!tab?.url) {
                page = { supported: false }
                return
            }
            const url = new URL(tab.url)
            page = {
                supported: url.hostname === "mangadex.org" || url.hostname.endsWith(".mangadex.org"),
                pageType: url.pathname.startsWith("/chapter/") ? "chapter" : "manga",
                url: tab.url
            }
        } catch {
            page = { supported: false }
        }
    })

    function openApp() {
        void browser.tabs.create({ url: browser.runtime.getURL("/app.html") })
    }

    async function grantAndRead() {
        if (!page?.url) return
        busy = true
        message = ""
        const granted = await browser.permissions.request({ origins: sourceOrigins() })

        if (!granted) {
            message = "Site access is required to resolve this chapter."
            busy = false
            return
        }

        try {
            const result = await sendRuntimeMessage<{ added?: boolean }>({
                type: "page:capture",
                url: page.url
            })
            const readerUrl = browser.runtime.getURL(`/reader.html?url=${encodeURIComponent(page.url)}`)
            await browser.tabs.create({ url: readerUrl })
            message = result.added ? "Added to your library." : ""
        } catch (cause) {
            message = cause instanceof Error ? cause.message : "The chapter could not be opened."
        } finally {
            busy = false
        }
    }
</script>

<main>
    <header>
        <img src="/icons/icon_48.png" alt="" />
        <div>
            <h1>All Mangas Reader</h1>
            <p>Local-first manga reading</p>
        </div>
        <button class="icon" type="button" onclick={openApp} title="Open AMR settings">Open</button>
    </header>

    {#if !page}
        <section class="card"><p>Checking this page...</p></section>
    {:else if page.supported && page.pageType === "chapter"}
        <section class="card">
            <span class="source">MangaDex chapter</span>
            <h2>Ready to read</h2>
            <p>Open this chapter in the distraction-free AMR reader.</p>
            <button type="button" onclick={grantAndRead} disabled={busy}>
                {busy ? "Resolving chapter..." : "Read in AMR"}
            </button>
        </section>
    {:else if page.supported}
        <section class="card">
            <span class="source">MangaDex</span>
            <h2>Manga page detected</h2>
            <p>Open a chapter to read it and automatically add the title to your library.</p>
        </section>
    {:else}
        <section class="card">
            <h2>This page is not supported</h2>
            <p>MangaDex is available in the first reader milestone. More source families follow.</p>
        </section>
    {/if}

    {#if message}<p class="notice">{message}</p>{/if}

    <footer>
        <button type="button" onclick={openApp}>Open library</button>
    </footer>
</main>
