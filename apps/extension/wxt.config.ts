import { defineConfig } from "wxt"
import { ALL_OPTIONAL_ORIGINS, GITHUB_API_ORIGIN } from "./src/permissions"

export default defineConfig({
    manifestVersion: 3,
    modules: ["@wxt-dev/module-svelte"],
    // Fully disable Vite's modulepreload — extensions use self.importScripts, not link preload,
    // and the preload helper injects Function() + innerHTML which violate MV3 CSP and AMO policy.
    vite: () => ({
        build: {
            modulePreload: false
        }
    }),
    manifest: ({ browser }) => ({
        name: "All Mangas Reader",
        description: "Read and track manga from supported websites.",
        // Fixed public key so "Load unpacked" always computes the SAME extension ID
        // regardless of which folder the zip is extracted to. Without this, Chrome
        // derives the id from the unpacked folder's path — since release zips are
        // named per-version (amrextension-0.9.X-chrome), each update unpacked to a
        // new folder got a brand-new id, and IndexedDB (the whole library) is scoped
        // to chrome-extension://<id>, so every manual update looked like data loss.
        // Corresponding private key: apps/extension/chrome-signing-key.pem (gitignored,
        // not required for unpacked loading — only needed if we ever pack/sign a .crx).
        ...(browser !== "firefox"
            ? {
                  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuFs/Zy3z054Tl4XnWmlr+CBQ8vsvnzIUNJBJ/o/ltpGW3vsNypznLvMDeDlZ3yMhNCA0ZkEuy0o2cfyQ6BtBE+wEZu/teb0AKyRzVEOVo3gy//lcPhVaewqfAVF4woFG5lWnEoOS5Fg+88NBdZp6/rY+OyjFgLv6oX1PWnCfX7WRYnAwi90KJK9c27MtgNRJfMaQGHAK4vieUdLcyObKoHxZlVQXqMQOFtUR3WJIQI3AVKg3wheXF8IvBHKHxueyR2f3C5EAWfBI7mm/F051ivpnQT9foV9ED6R9rF3mqfflHZLjqcfoq64qMCYsHkR/9J8BpWTFNfcYmSR21sCE+wIDAQAB"
              }
            : {}),
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
                          id: "amr-next@ryuu3rs.dev",
                          strict_min_version: "142.0",
                          data_collection_permissions: {
                              required: ["none"]
                          }
                      }
                  }
                : undefined
    })
})
