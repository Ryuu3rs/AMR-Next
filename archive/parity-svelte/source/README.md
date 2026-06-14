# Svelte Rewrite Workspace

Last updated: 2026-06-08

This workspace is the build foundation for the lightweight AMR extension rewrite.

The current application code is retained temporarily as reference. Do not extend its
page shell, background monolith, or legacy runtime bridge. Stage 0 will replace those
paths after the current work is preserved in git.

Active planning:

-   [../REWRITE_PLAN.md](../REWRITE_PLAN.md)
-   [../TASKS.md](../TASKS.md)

Reusable parts:

-   Svelte 5, TypeScript, and Vite setup
-   Chrome and Firefox manifest generation
-   extension icons
-   release verification ideas

Current build commands remain available while Stage 0 is prepared:

```powershell
npm install
npm run build:firefox
npm run build:chrome
```

Build output is written to repo-root `dist/`.
