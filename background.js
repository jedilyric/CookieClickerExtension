/**
 * Cookie Clicker Ultra Bot — background.js (service worker)
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    botEnabled: true,
    gameFps: 240,
  });
});

// Forward popup commands to the active Cookie Clicker tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.__cookieBotCmd) {
    chrome.tabs.query({ url: 'https://orteil.dashnet.org/cookieclicker/' }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  }
  sendResponse({ ok: true });
  return true;
});
