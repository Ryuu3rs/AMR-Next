# Android (Firefox)

AMR-Next runs on **Firefox for Android** using the same `firefox-mv3` build shipped for
desktop Firefox — there is no separate Android package. The dashboard, reader, and popup
have had a responsive pass for narrow (phone) viewports, so the UI is usable one-handed
at ~360px wide.

## Current support status

- Runs on Firefox for Android via the standard `firefox-mv3` build.
- Dashboard, library, reader, and popup are responsive for phone widths.
- Source permission grants, library sync (GitHub Gist), and the supported-site popup all
  work the same way as on desktop.

## Installing

Pick whichever option fits how you got the build:

1. **AMO-signed XPI (recommended).** When an AMO-signed release is available, open its
   AMO listing in Firefox for Android and tap **Add to Firefox**. This is the only path
   that survives a browser restart.
2. **Add-on Collection.** If the signed XPI is published through a Firefox Add-on
   Collection, add the collection under Firefox **Settings → Advanced → Custom Add-on
   collection**, then install AMR-Next from the **Add-ons** menu.
3. **Remote debugging (unsigned local builds).** Enable **USB debugging** in Android
   developer options, connect the phone to a desktop, then on the desktop open
   `about:debugging` → **This Firefox** (select the connected device) → **Load Temporary
   Add-on** and pick a file from `apps/extension/.output/firefox-mv3/`. Temporary add-ons
   are removed when Firefox restarts, so re-load after each restart.

After installing, open the dashboard and **grant source access** so the extension can
fetch from the manga sites you read.

## Known limitations

- **Fullscreen** is unreliable on mobile Firefox — the reader's fullscreen/immersive
  toggle may be ignored or only hide part of the browser chrome. Auto-hide-on-scroll
  still works.
- **Offline / blob download** is not yet implemented, so chapters cannot be saved for
  offline reading on the device.
- Temporary (remote-debug) installs do not persist across browser restarts.

## Testing checklist

Run through this on a phone (or a narrow desktop window) after installing:

- [ ] Dashboard library renders and the poster grid reflows to the narrow layout.
- [ ] Search works after granting source permission.
- [ ] Opening a chapter loads it in the reader and pages fit the screen width.
- [ ] Reader header buttons (prev/next, mode, zoom, refresh) wrap and stay tappable.
- [ ] GitHub Gist sync (push/pull) completes.
- [ ] The popup appears and detects a supported site when browsing one.
