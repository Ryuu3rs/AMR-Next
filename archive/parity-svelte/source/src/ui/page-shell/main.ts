import App from "./App.svelte"

try {
    new App({
        target: document.body
    })
} catch (error) {
    document.body.innerHTML = `<pre style="padding:12px;color:#b91c1c;font:12px/1.5 monospace;">AMR rewrite dashboard boot failed\n${
        error instanceof Error ? error.stack ?? error.message : String(error)
    }</pre>`
}
