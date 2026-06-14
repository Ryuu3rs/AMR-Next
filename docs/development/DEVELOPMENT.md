# Development Guide

Last updated: 2026-06-09

## Requirements

- Node.js 22 or newer
- npm 11 or newer
- Firefox
- Chromium

## Install

```powershell
npm install
```

## Run

```powershell
npm run dev
npm run dev:firefox
```

## Build

```powershell
npm run build
npm run build:firefox
```

## Validate

```powershell
npm run typecheck
npm run test
npm run check
```

## Structure

- `apps/extension`: extension entrypoints and application code
- `packages/contracts`: domain contracts
- `packages/source-sdk`: adapter interfaces and parsing support
- `packages/sources`: source implementations
- `packages/test-fixtures`: deterministic source fixtures
- `tooling/browser-tests`: browser installation and end-to-end tests
- `archive`: preserved previous implementations

## Archive Policy

Archived code is read-only reference. Port useful behavior into active packages with
tests rather than importing archive modules.

## Browser Support

Every feature must be built and tested for both Firefox and Chromium. Browser-specific
behavior belongs in the platform layer or WXT configuration.
