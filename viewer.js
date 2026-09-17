const id = new URLSearchParams(location.search).get('id');
const frame = document.getElementById('frame');
const nameEl = document.getElementById('name');
const errorEl = document.getElementById('error');
const rawLink = document.getElementById('raw');

let entry = null;
let sandboxReady = false;

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  if (event.data?.type === 'ready') {
    sandboxReady = true;
    render();
  }
});

chrome.runtime.sendMessage({ type: 'get', id }, (response) => {
  if (chrome.runtime.lastError || !response?.ok) {
    showError(chrome.runtime.lastError?.message || response?.error || 'Preview unavailable.');
    return;
  }
  entry = response.entry;
  nameEl.textContent = entry.name;
  document.title = `${entry.name} — HTML Preview`;
  if (entry.rawUrl) rawLink.href = entry.rawUrl;
  else rawLink.hidden = true;
  render();
});

function render() {
  if (!entry || !sandboxReady) return;
  frame.contentWindow.postMessage(
    { type: 'render', html: entry.html, baseUrl: entry.baseUrl },
    '*',
  );
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  nameEl.textContent = 'Error';
}

document.getElementById('reload').addEventListener('click', () => {
  sandboxReady = false;
  frame.src = 'sandbox.html';
});

document.getElementById('copy').addEventListener('click', async (event) => {
  if (!entry) return;
  await navigator.clipboard.writeText(entry.html);
  const button = event.currentTarget;
  button.textContent = 'Copied';
  setTimeout(() => (button.textContent = 'Copy HTML'), 1200);
});

document.getElementById('download').addEventListener('click', () => {
  if (!entry) return;
  const url = URL.createObjectURL(new Blob([entry.html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = entry.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
