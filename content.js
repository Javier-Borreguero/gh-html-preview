(() => {
  // Lets you confirm which build is live: document.documentElement.dataset.ghhp
  document.documentElement.dataset.ghhp = '1.1.1';

  const HTML_FILE = /\.x?html?$/i;

  const ICON = `<svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2c3.5 0 6.3 2.2 7.7 5.2.2.5.2 1.1 0 1.6C14.3 11.8 11.5 14 8 14s-6.3-2.2-7.7-5.2a1.9 1.9 0 0 1 0-1.6C1.7 4.2 4.5 2 8 2Zm0 1.5c-2.8 0-5.2 1.8-6.4 4.5C2.8 10.7 5.2 12.5 8 12.5s5.2-1.8 6.4-4.5C13.2 5.3 10.8 3.5 8 3.5Zm0 1.75a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z"/></svg>`;

  function makeButton(onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghhp-button';
    button.title = 'Render this HTML file in a sandboxed tab';
    button.innerHTML = `${ICON}<span>Preview</span>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.busy) return;
      button.dataset.busy = '1';
      const label = button.querySelector('span');
      const original = label.textContent;
      label.textContent = 'Opening…';
      onClick()
        .catch((error) => {
          label.textContent = 'Failed';
          console.error('[GitHub HTML Preview]', error);
          alert(`GitHub HTML Preview: ${error.message || error}`);
        })
        .finally(() => {
          setTimeout(() => {
            label.textContent = original;
            delete button.dataset.busy;
          }, 1200);
        });
    });
    return button;
  }

  function requestPreview(rawUrl, name) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'preview', rawUrl, name }, (response) => {
        const failure = chrome.runtime.lastError?.message;
        if (failure) return reject(new Error(failure));
        if (!response?.ok) return reject(new Error(response?.error || 'Unknown error'));
        resolve(response);
      });
    });
  }

  // --- Blob view: /owner/repo/blob/<ref>/<path> ------------------------------
  // GitHub re-renders this toolbar (React), so never trust a "already injected"
  // marker on the container: check whether our button is still actually there.
  function injectBlobButton() {
    const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (!match) return;
    const [, owner, repo, refAndPath] = match;
    const decoded = decodeURIComponent(refAndPath);
    if (!HTML_FILE.test(decoded.split('?')[0])) return;

    const rawUrl = `https://github.com/${owner}/${repo}/raw/${refAndPath.split('?')[0]}`;
    const name = decoded.split('/').pop();

    const containers = document.querySelectorAll(
      '.react-blob-header-edit-and-raw-actions, .react-blob-header-edit-and-raw-actions-combined',
    );
    for (const container of containers) {
      if (!container.offsetParent) continue; // narrow/wide variants: only the visible one
      if (container.querySelector('.ghhp-button')) continue;

      const button = makeButton(() => requestPreview(rawUrl, name));
      button.classList.add('ghhp-button--blob');
      const rawGroup = container
        .querySelector('[data-testid="raw-button"]')
        ?.closest('[class*="ButtonGroup-ButtonGroup"]');
      if (rawGroup) rawGroup.parentElement.insertBefore(button, rawGroup);
      else container.prepend(button);
    }
  }

  // --- Diff views: PR "Files changed", commits, compare ----------------------
  function injectDiffButtons() {
    const headers = document.querySelectorAll('.file-header[data-path]');
    for (const header of headers) {
      if (header.querySelector('.ghhp-button')) continue;
      const path = header.getAttribute('data-path') || '';
      if (!HTML_FILE.test(path)) continue;
      if (header.getAttribute('data-file-deleted') === 'true') continue;

      const actions = header.querySelector('.file-actions');
      if (!actions) continue;

      const viewFile = [...actions.querySelectorAll('a')].find(
        (link) => /\/blob\//.test(link.getAttribute('href') || ''),
      );
      const blobHref = viewFile?.getAttribute('href') || blobHrefFromUrl(path);
      if (!blobHref) continue;

      const rawUrl = new URL(blobHref.replace('/blob/', '/raw/'), location.origin).href;
      const button = makeButton(() => requestPreview(rawUrl, path.split('/').pop()));
      button.classList.add('ghhp-button--diff');
      const row = actions.querySelector('.d-flex') || actions;
      row.prepend(button);
    }
  }

  function blobHrefFromUrl(path) {
    const commit = location.pathname.match(/^\/([^/]+)\/([^/]+)\/commit\/([0-9a-f]{7,40})/);
    if (!commit) return null;
    const [, owner, repo, sha] = commit;
    return `/${owner}/${repo}/blob/${sha}/${path}`;
  }

  // --- New React PR diff view: /owner/repo/pull/<n>/changes|files -----------
  // No .file-header / no /blob/ links here: the path comes from the header's
  // <h3> link and the head SHA from the page's embedded React payload.
  function headShaFromEmbeddedData() {
    const payload = document.querySelector(
      'script[type="application/json"][data-target="react-app.embeddedData"]',
    );
    return payload?.textContent.match(/"headSha":"([0-9a-f]{40})"/)?.[1] || null;
  }

  function injectReactDiffButtons() {
    const pr = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/\d+/);
    if (!pr) return;
    const headers = document.querySelectorAll(
      '[class*="DiffFileHeader-module__diff-file-header"]',
    );
    if (!headers.length) return;

    const sha = headShaFromEmbeddedData();
    if (!sha) return;
    const [, owner, repo] = pr;

    for (const header of headers) {
      if (header.querySelector('.ghhp-button')) continue;
      const path = header
        .querySelector('h3 a')
        ?.textContent.replace(/[\u200e\u200f]/g, '')
        .trim();
      if (!path || !HTML_FILE.test(path)) continue;

      const actions = header.querySelector(':scope > .flex-justify-end');
      if (!actions) continue;

      const rawUrl = `https://github.com/${owner}/${repo}/raw/${sha}/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      const button = makeButton(() => requestPreview(rawUrl, path.split('/').pop()));
      button.classList.add('ghhp-button--diff');
      actions.prepend(button);
    }
  }

  function run() {
    try {
      injectBlobButton();
      injectDiffButtons();
      injectReactDiffButtons();
    } catch (error) {
      console.error('[GitHub HTML Preview]', error);
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      run();
    }, 250);
  }

  run();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  for (const event of ['turbo:load', 'turbo:render', 'pjax:end', 'popstate']) {
    document.addEventListener(event, schedule);
  }
})();
