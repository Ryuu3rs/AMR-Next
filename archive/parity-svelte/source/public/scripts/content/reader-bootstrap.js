;(() => {
    const w = globalThis
    if (w.__amrReaderBootstrapLoaded) {
        return
    }
    w.__amrReaderBootstrapLoaded = true
    if (!Array.isArray(w.__amrReaderPendingMirrors)) {
        w.__amrReaderPendingMirrors = []
    }

    const runtime =
        typeof chrome !== "undefined" ? chrome.runtime : typeof browser !== "undefined" ? browser.runtime : null
    if (!runtime || typeof runtime.getURL !== "function") {
        return
    }

    const pushMirrorPayload = payload => {
        if (!payload || typeof payload.mirrorName !== "string") {
            return
        }
        if (typeof w.amrLoadMirror === "function") {
            void w.amrLoadMirror(payload)
            return
        }
        w.__amrReaderPendingMirrors.push(payload)
    }

    if (typeof runtime.sendMessage === "function") {
        Promise.resolve(
            runtime.sendMessage({
                action: "matchMirrorForUrl",
                url: location.href
            })
        )
            .then(payload => {
                pushMirrorPayload(payload)
            })
            .catch(() => {
                // ignore; background trigger path still exists
            })
    }

    import(runtime.getURL("scripts/content/reader.js")).catch(error => {
        console.error("[amr-rewrite] failed to load reader runtime", error)
    })
})()
