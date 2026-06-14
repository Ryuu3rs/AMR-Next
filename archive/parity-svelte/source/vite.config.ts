import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"

export default defineConfig({
    plugins: [
        svelte({
            emitCss: false,
            compilerOptions: {
                runes: false,
                compatibility: {
                    componentApi: 4
                }
            }
        })
    ],
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                "pages/popup": "pages/popup.html",
                "pages/options": "pages/options.html",
                "pages/dashboard": "pages/dashboard.html",
                "pages/bookmarks": "pages/bookmarks.html",
                "pages/importexport": "pages/importexport.html",
                "pages/lab": "pages/lab.html",
                "pages/permissions": "pages/permissions.html",
                "content/reader": "src/ui/reader/main.ts",
                background: "src/background/index.ts"
            },
            output: {
                banner: `var require = globalThis.require || function (specifier) {
  if (typeof specifier !== "string") return specifier;
  var runtime =
    (typeof chrome !== "undefined" && chrome.runtime) ||
    (typeof browser !== "undefined" && browser.runtime) ||
    null;
  if (runtime && typeof runtime.getURL === "function") {
    var normalized = specifier.replace(/^(\\.\\.\\/)+/, "");
    return runtime.getURL(normalized);
  }
  return specifier;
};`,
                entryFileNames: chunkInfo => {
                    const name = chunkInfo.name
                    if (name === "background") {
                        return "scripts/background/background.js"
                    }

                    if (name === "content/reader") {
                        return "scripts/content/reader.js"
                    }

                    if (name.startsWith("pages/")) {
                        const pageName = name.split("/")[1]
                        return `scripts/pages/${pageName}.js`
                    }

                    return `scripts/${name}.js`
                },
                chunkFileNames: "scripts/chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]"
            }
        }
    }
})
