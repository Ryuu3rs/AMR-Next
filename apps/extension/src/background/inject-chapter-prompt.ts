// Self-contained — serialized and injected into the page via scripting.executeScript.
// Must not reference any external variables or imports.
export function injectChapterPrompt(chapterUrl: string): void {
    const BANNER_ID = "__amr-chapter-prompt__"
    if (document.getElementById(BANNER_ID)) return

    // Resolve the WebExtension runtime from the page-level global, NOT from the background
    // module's closure. When Chrome serializes this function via scripting.executeScript the
    // closure is broken — 'browser' from wxt/browser compiles to a minified module-local var
    // that is undefined in the re-evaluated isolated world. globalThis.browser (Chrome 121+
    // native) or globalThis.chrome (all Chrome/Edge) are always available in the isolated world.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext: any = (globalThis as any).browser ?? (globalThis as any).chrome

    // Auto-detect light background and switch to dark for comfortable reading.
    function parseLuminance(css: string): number {
        const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!m) return -1
        const r = parseInt(m[1]!) / 255,
            g = parseInt(m[2]!) / 255,
            b = parseInt(m[3]!) / 255
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const bgCss =
        getComputedStyle(document.documentElement).backgroundColor || getComputedStyle(document.body).backgroundColor
    const isLight = parseLuminance(bgCss) > 0.5

    let darkModeActive = false
    let darkStyleEl: HTMLStyleElement | null = null

    function applyDark() {
        if (darkStyleEl) return
        darkStyleEl = document.createElement("style")
        darkStyleEl.id = "__amr-dark-mode__"
        darkStyleEl.textContent =
            "html,body{background-color:#111!important;color:#e2e8f0!important}" +
            ".chapter-container,.reading-content,.page-break,.wp-manga-chapter-img," +
            "div[class*='chapter'],div[class*='page']{background:#111!important}"
        document.head.appendChild(darkStyleEl)
        darkModeActive = true
    }
    function removeDark() {
        darkStyleEl?.remove()
        darkStyleEl = null
        darkModeActive = false
    }

    if (isLight) applyDark()

    const host = document.createElement("div")
    host.id = BANNER_ID
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: "open" })
    const darkBtnActive = isLight ? " dark-active" : ""

    const style = document.createElement("style")
    style.textContent = `
        .panel {
            position: fixed; bottom: 100px; right: 24px; z-index: 2147483647;
            background: #16213e; border: 1px solid rgba(255,255,255,0.12);
            border-radius: 14px; padding: 0;
            display: flex; flex-direction: column;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px; color: #e2e8f0;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            animation: slide-in 0.22s cubic-bezier(.22,.6,.36,1) both; width: 220px;
            overflow: hidden;
        }
        @keyframes slide-in {
            from { transform: translateY(110%); opacity: 0; }
            to   { transform: translateY(0); opacity: 1; }
        }
        .prog-track { height: 3px; background: rgba(255,255,255,0.06); width: 100%; flex-shrink: 0; }
        .prog-fill  { height: 100%; background: #6366f1; width: 0%; transition: width 0.1s linear; }
        .inner { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
        .hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .ttl { font-weight: 700; font-size: 13px; color: #fff; }
        .sub { font-size: 11px; color: #64748b; margin-top: 1px;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
        .x { background: none; border: none; color: #64748b; cursor: pointer;
             font-size: 16px; line-height: 1; padding: 0 2px; font-family: inherit; flex-shrink: 0; }
        .x:hover { color: #e2e8f0; }
        .sep { height: 1px; background: rgba(255,255,255,0.08); }
        .row { display: flex; gap: 6px; }
        .btn {
            flex: 1; background: rgba(255,255,255,0.08); color: #e2e8f0;
            border: 1px solid rgba(255,255,255,0.10); border-radius: 8px;
            padding: 7px 10px; font-size: 12px; font-weight: 600; cursor: pointer;
            font-family: inherit; transition: background 0.15s, opacity 0.15s;
            text-align: center; white-space: nowrap;
        }
        .btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
        .btn:disabled { opacity: 0.28; cursor: default; }
        .btn-p { background: #6366f1; border-color: transparent; }
        .btn-p:hover:not(:disabled) { background: #818cf8; }
        .btn-moon { font-size: 14px; padding: 7px 8px; flex: 0 0 auto; }
        .dark-active { background: #1e3a8a; border-color: #3b82f6; }
    `

    function mk(tag: string, attrs: Record<string, string | boolean> = {}): HTMLElement {
        const el = document.createElement(tag)
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "id") el.id = v as string
            else if (k === "className") el.className = v as string
            else if (k === "textContent") el.textContent = v as string
            else if (k === "title") (el as HTMLElement).title = v as string
            else if (k === "disabled") (el as HTMLButtonElement).disabled = true
            else if (k === "aria-label") el.setAttribute("aria-label", v as string)
        }
        return el
    }

    const progFill = mk("div", { id: "prog", className: "prog-fill" })
    const progTrack = mk("div", { className: "prog-track" })
    progTrack.appendChild(progFill)

    const ttl = mk("div", { className: "ttl", textContent: "📖 AMR" })
    const sub = mk("div", { id: "sub", className: "sub", textContent: "Chapter detected" })
    const hdLeft = mk("div")
    hdLeft.append(ttl, sub)
    const xbtn = mk("button", { id: "xbtn", className: "x", textContent: "✕", "aria-label": "Dismiss" })
    const hd = mk("div", { className: "hd" })
    hd.append(hdLeft, xbtn)

    const sep = mk("div", { className: "sep" })

    const bprev = mk("button", { id: "bprev", className: "btn", textContent: "‹ Prev", disabled: true })
    const bnext = mk("button", { id: "bnext", className: "btn", textContent: "Next ›", disabled: true })
    const row1 = mk("div", { className: "row" })
    row1.append(bprev, bnext)

    const bopen = mk("button", { id: "bopen", className: "btn btn-p", textContent: "Open in AMR" })
    const bdark = mk("button", {
        id: "bdark",
        className: `btn btn-moon${darkBtnActive}`,
        textContent: "🌙",
        title: "Toggle dark background"
    })
    const row2 = mk("div", { className: "row" })
    row2.append(bopen, bdark)

    const btrack = mk("button", { id: "btrack", className: "btn", textContent: "Mark read" })

    const inner = mk("div", { className: "inner" })
    inner.append(hd, sep, row1, row2, btrack)

    const panel = mk("div", { className: "panel" })
    panel.append(progTrack, inner)

    shadow.append(style, panel)

    // Scroll progress bar — updates on every scroll event via rAF.
    const progEl = shadow.getElementById("prog") as HTMLElement | null
    function updateProgress() {
        if (!progEl) return
        const el = document.documentElement
        const scrollable = el.scrollHeight - el.clientHeight
        const pct = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 0
        progEl.style.width = `${pct}%`
    }
    let rafPending = false
    function onScroll() {
        if (rafPending) return
        rafPending = true
        requestAnimationFrame(() => {
            updateProgress()
            rafPending = false
        })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    updateProgress()

    function track(action: string) {
        ext.runtime
            .sendMessage({
                type: "analytics:record",
                event: "panel_action",
                detail: JSON.stringify({ action })
            })
            .catch(() => {})
    }

    let prevUrl: string | null = null
    let nextUrl: string | null = null

    // Seed prev/next immediately from the page DOM for episode_no-style sites (e.g.
    // Webtoons). The paginate nav links are in the SSR HTML so this works without
    // any background round-trip and enables the buttons before the DB lookup returns.
    ;(function seedNavFromDom() {
        try {
            const cu = new URL(chapterUrl)
            const epNo = Number(cu.searchParams.get("episode_no"))
            const titleNo = cu.searchParams.get("title_no")
            if (!epNo || !titleNo || isNaN(epNo)) return
            const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="episode_no="]'))
            for (const a of anchors) {
                try {
                    const au = new URL(a.href || a.getAttribute("href") || "", location.origin)
                    if (au.searchParams.get("title_no") !== titleNo) continue
                    const aEpNo = Number(au.searchParams.get("episode_no"))
                    if (aEpNo === epNo - 1 && !prevUrl) {
                        prevUrl = au.toString()
                        ;(bprev as HTMLButtonElement).disabled = false
                    }
                    if (aEpNo === epNo + 1 && !nextUrl) {
                        nextUrl = au.toString()
                        ;(bnext as HTMLButtonElement).disabled = false
                    }
                } catch {}
            }
        } catch {}
    })()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ext.runtime
        .sendMessage({ type: "chapter:siblings", url: chapterUrl })
        .then((resp: any) => {
            if (!resp?.ok || !resp.data) return
            const d = resp.data as {
                prevUrl: string | null
                nextUrl: string | null
                mangaTitle: string | null
                chapterTitle: string | null
            }
            // Only overwrite DOM-seeded URLs if the DB has real values — don't
            // re-disable buttons that seedNavFromDom already enabled.
            if (d.prevUrl !== null) prevUrl = d.prevUrl
            if (d.nextUrl !== null) nextUrl = d.nextUrl
            const sub = shadow.getElementById("sub")
            if (sub && (d.chapterTitle || d.mangaTitle)) sub.textContent = d.chapterTitle ?? d.mangaTitle
            const bprevSib = shadow.getElementById("bprev") as HTMLButtonElement | null
            const bnextSib = shadow.getElementById("bnext") as HTMLButtonElement | null
            if (bprevSib) bprevSib.disabled = !prevUrl
            if (bnextSib) bnextSib.disabled = !nextUrl
        })
        .catch(() => {})

    shadow.getElementById("xbtn")?.addEventListener("click", () => {
        track("dismiss")
        window.removeEventListener("scroll", onScroll)
        host.remove()
    })

    shadow.getElementById("bopen")?.addEventListener("click", () => {
        track("open-in-reader")
        ext.runtime.sendMessage({ type: "chapter:open-in-reader", url: chapterUrl }).catch(() => {})
        window.removeEventListener("scroll", onScroll)
        host.remove()
    })

    shadow.getElementById("btrack")?.addEventListener("click", () => {
        track("mark-read")
        ext.runtime.sendMessage({ type: "chapter:track", url: chapterUrl }).catch(() => {})
        const btn = shadow.getElementById("btrack") as HTMLButtonElement | null
        if (btn) {
            btn.textContent = "Marked ✓"
            btn.disabled = true
        }
    })

    shadow.getElementById("bdark")?.addEventListener("click", () => {
        const btn = shadow.getElementById("bdark")
        if (darkModeActive) {
            track("dark-off")
            removeDark()
            btn?.classList.remove("dark-active")
        } else {
            track("dark-on")
            applyDark()
            btn?.classList.add("dark-active")
        }
    })

    shadow.getElementById("bprev")?.addEventListener("click", () => {
        if (prevUrl) {
            track("prev")
            const bp = shadow.getElementById("bprev") as HTMLButtonElement | null
            const bn = shadow.getElementById("bnext") as HTMLButtonElement | null
            if (bp) {
                bp.textContent = "← Going…"
                bp.disabled = true
            }
            if (bn) bn.disabled = true
            window.removeEventListener("scroll", onScroll)
            window.location.href = prevUrl
        }
    })
    shadow.getElementById("bnext")?.addEventListener("click", () => {
        if (nextUrl) {
            track("next")
            const bp = shadow.getElementById("bprev") as HTMLButtonElement | null
            const bn = shadow.getElementById("bnext") as HTMLButtonElement | null
            if (bp) bp.disabled = true
            if (bn) {
                bn.textContent = "Going… →"
                bn.disabled = true
            }
            window.removeEventListener("scroll", onScroll)
            window.location.href = nextUrl
        }
    })
}
