# GitHub HTML Preview

Chrome MV3 extension that adds a **Preview** button next to `.html` files on GitHub and renders
them in a new tab, instead of showing raw source.

Works on:

- **Blob view** — `github.com/owner/repo/blob/<ref>/file.html` (button sits next to *Raw*)
- **PR diffs** — both the new React view (`/pull/<n>/changes`) and the legacy one (`/pull/<n>/files`),
  plus **commit** and **compare** diffs — one button per `.html` file header
- **raw.githubusercontent.com** `.html` pages — floating *Preview HTML* button

## Install

The extension is not on the Chrome Web Store — it runs unpacked, straight from a folder on disk.

1. Get the code:

   ```bash
   git clone https://github.com/Javier-Borreguero/gh-html-preview.git ~/gh-html-preview
   ```

   Keep the folder where it is: Chrome loads an unpacked extension by path and stops loading it
   if the folder moves or is deleted.

2. Open `chrome://extensions` (paste it in the address bar — a link to it won't open).
3. Toggle **Developer mode** on, top right.
4. Click **Load unpacked** and select the folder from step 1 — the one holding `manifest.json`.
5. Confirm the card says **GitHub HTML Preview** with the version from `manifest.json`.

Chrome shows a "Disable developer mode extensions" warning on startup while this is loaded. That
is expected for unpacked extensions; dismissing it leaves the extension working.

### Check it works

Open any `.html` file on GitHub — for example
`https://raw.githubusercontent.com/h5bp/html5-boilerplate/main/dist/index.html` — and look for the
**Preview** button. On blob pages it sits left of *Raw*; on raw pages it floats top-right.

`document.documentElement.dataset.ghhp` in DevTools on any github.com page reports the version of
the build that is actually running, which is the quickest way to tell a stale load from a broken
selector.

### Updating after a code change

Editing the files is not enough — Chrome keeps running the build it loaded:

1. Go back to `chrome://extensions`.
2. Click the **circular reload arrow** on the extension's card.
3. Reload any GitHub tab you had open.

The version on the card should change whenever `manifest.json` does; if it doesn't, the reload
didn't take.

### Permissions it asks for

- `github.com` and `raw.githubusercontent.com` — to inject the button and fetch file contents with
  your session, so private repos work.
- `storage` — holds the last 10 previews in session storage, cleared when Chrome quits.

No other host is reachable: the service worker refuses to fetch anything outside those two.

## How it works

1. The content script injects the button and resolves the file's raw URL
   (`/owner/repo/raw/<sha>/<path>`, taken from the diff's *View file* link so you get the
   PR head version, fork included).
   In the new React PR view there are no `/blob/` links and no `.file-header`, so the path comes
   from the file header's `<h3>` link and the head SHA from the page's `react-app.embeddedData`
   payload.
2. The service worker fetches it with your GitHub cookies (so **private repos work**) and opens
   `viewer.html` in a new tab.
3. `viewer.html` passes the HTML to `sandbox.html`, a manifest-sandboxed extension page with an
   opaque origin, which writes the document into itself.

### Why the sandbox page

The rendered file is untrusted code. A `blob:` URL created on `github.com` would run in **your
GitHub origin** with your session cookies. The sandboxed page has an opaque origin, no
`chrome.*` APIs and no access to github.com cookies or storage, so scripts in the previewed file
can still run (charts, React from a CDN, etc.) without being able to touch your GitHub account.

A `<base href="…">` pointing at the file's directory on `raw.githubusercontent.com` is injected
when the document has none, so relative assets resolve.

## Notes and limits

- Previews are kept in `chrome.storage.session` (last 10) and disappear when Chrome restarts —
  re-open from GitHub.
- GitHub's blob header is React-rendered with hashed class names; the button anchors on
  `.react-blob-header-edit-and-raw-actions`, legacy diffs on `.file-header[data-path]`, and new
  React diffs on `[class*="DiffFileHeader-module__diff-file-header"]`. If GitHub changes those,
  update the selectors in `content.js`. Injection is re-run on every DOM mutation and keyed on the
  button's own presence, so React re-renders can't permanently drop it.
- Deleted files are skipped in the legacy diff view. In the new React view a deleted `.html` file
  still gets a button, and clicking it reports a 404 (the path no longer exists at the head SHA).
- The sandbox CSP allows remote `https:` scripts/styles, which is what makes CDN-based artifacts
  render. That is fine for unpacked/internal use; the Chrome Web Store would review it.

## Files

| File | Role |
| --- | --- |
| `content.js` | Button injection on github.com (blob + diff views) |
| `raw-content.js` | Floating button on raw.githubusercontent.com |
| `background.js` | Credentialed raw fetch, preview store, opens the viewer tab |
| `viewer.html/js/css` | Toolbar tab: reload, copy, download, view raw |
| `sandbox.html/js` | Sandboxed opaque-origin frame that renders the HTML |
