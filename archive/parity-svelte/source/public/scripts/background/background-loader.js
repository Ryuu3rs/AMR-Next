;(() => {
    const runtime =
        typeof chrome !== "undefined" ? chrome.runtime : typeof browser !== "undefined" ? browser.runtime : null

    if (!runtime || typeof runtime.getURL !== "function") {
        return
    }

    // Legacy mirror code still contains CommonJS-style `require(...)` for icon paths.
    // Firefox MV3 background scripts run in module mode here, so provide a lightweight
    // compatibility shim before loading the background module.
    if (typeof globalThis.require !== "function") {
        globalThis.require = specifier => {
            if (typeof specifier !== "string") {
                return specifier
            }

            if (/^(https?:|data:|moz-extension:|chrome-extension:)/i.test(specifier)) {
                return specifier
            }

            const normalized = specifier.replace(/^(\.\.\/)+/, "")
            return runtime.getURL(normalized)
        }
    }

    import(runtime.getURL("scripts/background/background.js")).catch(error => {
        console.error("[amr-rewrite] failed to load background module", error)
    })
})()
