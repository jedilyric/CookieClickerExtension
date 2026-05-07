/**
 * Cookie Clicker Ultra Bot — content.js
 * Runs in the extension's isolated world; bridges between injected.js
 * (which lives in the page's JS context and can access window.Game)
 * and the popup / background service worker.
 */
(function () {
  'use strict';

  // Inject the bot into the page's JS context
  function inject() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // ── Page → Popup ────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__cookieBot) return;
    // Store latest status for popup to read
    chrome.storage.local.set({ botStatus: e.data.data }).catch(() => {});
    // Also forward live to popup if it's open
    chrome.runtime.sendMessage(e.data).catch(() => {});
  });

  // ── Popup → Page ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.__cookieBotCmd) {
      window.postMessage(msg, '*');
    }
    sendResponse({ ok: true });
  });
})();
