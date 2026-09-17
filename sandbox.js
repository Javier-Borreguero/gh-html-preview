window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type !== 'render') return;
  const { html, baseUrl } = event.data;
  document.open();
  document.write(withBase(html, baseUrl));
  document.close();
});

function withBase(html, baseUrl) {
  if (!baseUrl || /<base\s/i.test(html)) return html;
  const base = `<base href="${baseUrl.replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (tag) => tag + base);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${base}</head>`);
  return base + html;
}

window.parent.postMessage({ type: 'ready' }, '*');
