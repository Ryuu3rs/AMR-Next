// Compile-time build marker injected by wxt.config.ts (vite `define`). Short git commit of the
// build (+ "+" when the tree was dirty), or "dev" when git is unavailable. Shown in the UI next
// to the release version so a local dev build is identifiable without hand-bumping the version.
declare const __BUILD_ID__: string
