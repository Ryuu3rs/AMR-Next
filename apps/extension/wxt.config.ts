import { defineConfig } from "wxt"
import { ALL_OPTIONAL_ORIGINS, GITHUB_API_ORIGIN } from "./src/permissions"

export default defineConfig({
    manifestVersion: 3,
    modules: ["@wxt-dev/module-svelte"],
    // Disable Vite 8's modulepreload polyfill — it uses Function() for feature detection
    // which violates MV3 CSP (unsafe-eval). Extensions use self.importScripts, not link preload.
    vite: () => ({
        build: {
            modulePreload: { polyfill: false }
        }
    }),
    manifest: ({ browser }) => ({
        name: "All Mangas Reader",
        description: "Read and track manga from supported websites.",
        permissions: ["alarms", "declarativeNetRequest", "scripting", "storage", "tabs"],
        declarative_net_request: {
            rule_resources: [{ id: "pstatic-referer", enabled: true, path: "rules/pstatic-referer.json" }]
        },
        // All source origins are required so reading works immediately after install
        // without any manual "Grant access" step. GitHub API also required for
        // update checks and Gist sync.
        // VITE_COMMUNITY_API_ORIGIN is loaded from apps/extension/.env (gitignored)
        host_permissions: [
            GITHUB_API_ORIGIN,
            ...(process.env.VITE_COMMUNITY_API_ORIGIN ? [process.env.VITE_COMMUNITY_API_ORIGIN] : []),
            ...ALL_OPTIONAL_ORIGINS
        ],
        icons: {
            32: "/icons/icon_32.png",
            48: "/icons/icon_48.png",
            96: "/icons/icon_96.png",
            128: "/icons/icon_128.png"
        },
        browser_specific_settings:
            browser === "firefox"
                ? {
                      gecko: {
                          id: "all-mangas-reader@ryuu3rs.dev",
                          strict_min_version: "142.0",
                          data_collection_permissions: {
                              required: ["none"]
                          }
                      }
                  }
                : undefined
    })
})
