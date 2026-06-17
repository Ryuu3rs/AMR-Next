import { defineConfig } from "wxt"
import { ALL_OPTIONAL_ORIGINS, GITHUB_API_ORIGIN } from "./src/permissions"

export default defineConfig({
    manifestVersion: 3,
    modules: ["@wxt-dev/module-svelte"],
    manifest: ({ browser }) => ({
        name: "All Mangas Reader",
        description: "Read and track manga from supported websites.",
        permissions: ["alarms", "scripting", "storage", "tabs"],
        // GitHub API is required (not optional) so the background service worker
        // can check for updates and push/pull Gist without a prior permission grant.
        host_permissions: [GITHUB_API_ORIGIN],
        optional_host_permissions: [...ALL_OPTIONAL_ORIGINS],
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
                          strict_min_version: "140.0",
                          data_collection_permissions: {
                              required: ["none"]
                          }
                      }
                  }
                : undefined
    })
})
