(() => {
  if (!/\.x?html?$/i.test(location.pathname)) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghhp-button ghhp-button--floating';
  button.textContent = 'Preview HTML';
  button.addEventListener('click', () => {
    button.textContent = 'Opening…';
    if (!chrome.runtime?.id) {
      button.textContent = 'Preview HTML';
      alert('GitHub HTML Preview: this tab is running an older copy of the extension. Reload the page and try again.');
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'preview', rawUrl: location.href, name: location.pathname.split('/').pop() },
      (response) => {
        const failure = chrome.runtime.lastError?.message || (!response?.ok && response?.error);
        button.textContent = failure ? 'Failed' : 'Preview HTML';
        if (failure) alert(`GitHub HTML Preview: ${failure}`);
      },
    );
  });
  document.body.appendChild(button);
})();
