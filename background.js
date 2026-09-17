const MAX_ENTRIES = 10;
const ALLOWED_HOSTS = new Set(['github.com', 'raw.githubusercontent.com']);
const memory = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'preview') {
    createPreview(msg, sender.tab)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (msg?.type === 'get') {
    readEntry(msg.id)
      .then((entry) =>
        entry
          ? { ok: true, entry }
          : { ok: false, error: 'This preview is no longer available. Re-open it from GitHub.' },
      )
      .then(sendResponse);
    return true;
  }
  return false;
});

async function createPreview({ rawUrl, name }, sourceTab) {
  const url = assertAllowed(rawUrl);
  const id = crypto.randomUUID();
  const entry = {
    html: await fetchRaw(url),
    name: name || 'preview.html',
    rawUrl: url,
    baseUrl: url.replace(/[^/]*(\?.*)?$/, ''),
    createdAt: Date.now(),
  };
  memory.set(id, entry);
  await chrome.storage.session.set({ [key(id)]: entry });
  await prune();
  // Open beside the file it came from, not at the end of the strip, so the
  // preview stays next to its source tab (and inherits its tab group).
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`viewer.html?id=${id}`),
    openerTabId: sourceTab?.id,
    index: sourceTab ? sourceTab.index + 1 : undefined,
  });
  return { ok: true, id };
}

// The service worker fetches with your GitHub cookies and is not bound by page
// CSP, so never fetch a URL we did not build ourselves: pin scheme and host both
// before the request and again after redirects (github.com/raw -> raw.github...).
function assertAllowed(candidate) {
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Not a valid URL: ${candidate}`);
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch ${parsed.protocol}//${parsed.hostname} — only https requests to ` +
        `${[...ALLOWED_HOSTS].join(' and ')} are allowed.`,
    );
  }
  return parsed.href;
}

async function fetchRaw(url) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText} for ${url}`);
  }
  assertAllowed(response.url);
  return response.text();
}

async function readEntry(id) {
  if (memory.has(id)) return memory.get(id);
  const stored = await chrome.storage.session.get(key(id));
  const entry = stored[key(id)];
  if (entry) memory.set(id, entry);
  return entry || null;
}

async function prune() {
  const all = await chrome.storage.session.get(null);
  const entries = Object.entries(all)
    .filter(([k]) => k.startsWith('preview:'))
    .sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
  const stale = entries.slice(MAX_ENTRIES).map(([k]) => k);
  if (stale.length) {
    await chrome.storage.session.remove(stale);
    stale.forEach((k) => memory.delete(k.slice('preview:'.length)));
  }
}

function key(id) {
  return `preview:${id}`;
}
