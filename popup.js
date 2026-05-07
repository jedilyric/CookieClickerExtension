/**
 * Cookie Clicker Ultra Bot — popup.js
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e15) return (n / 1e15).toFixed(2) + ' Qa';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + ' B';
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + ' M';
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + ' K';
    return Math.floor(n).toLocaleString();
  }

  function sendCmd(action, value) {
    chrome.runtime.sendMessage({ __cookieBotCmd: true, action, value }).catch(() => {});
  }

  function applyStatus(d) {
    if (!d) return;

    const badge = $('statusBadge');
    if (!d.gameReady) {
      badge.textContent = 'Waiting…';
      badge.className = 'badge wait';
    } else if (d.ascending) {
      badge.textContent = 'Ascending';
      badge.className = 'badge wait';
    } else if (d.enabled) {
      badge.textContent = 'Active';
      badge.className = 'badge on';
    } else {
      badge.textContent = 'Paused';
      badge.className = 'badge off';
    }

    $('cookies').textContent   = fmt(d.cookies);
    $('cps').textContent       = fmt(d.cookiesPs) + '/s';
    $('prestige').textContent  = fmt(d.prestige);
    $('fps').textContent       = (d.fps || 0) + ' fps';
    $('earned').textContent    = fmt(d.cookiesEarned);

    const s = d.session || {};
    $('sClicks').textContent    = fmt(s.clicks    || 0);
    $('sGolden').textContent    = fmt(s.goldenClicks || 0);
    $('sUpgrades').textContent  = fmt(s.upgrades  || 0);
    $('sBuildings').textContent = fmt(s.buildings || 0);
    $('sAscensions').textContent = fmt(s.ascensions || 0);

    $('toggleBot').checked = !!d.enabled;
  }

  function checkGameOpen() {
    chrome.tabs.query({ url: 'https://orteil.dashnet.org/cookieclicker/' }, (tabs) => {
      if (tabs.length === 0) {
        $('noGame').style.display = '';
        $('main').style.display  = 'none';
        $('statusBadge').textContent = 'Not Open';
        $('statusBadge').className = 'badge off';
      } else {
        $('noGame').style.display = 'none';
        $('main').style.display  = '';
        // Request fresh status
        sendCmd('getStatus');
      }
    });
  }

  // Listen for live status pushed from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.__cookieBot && msg.type === 'status') {
      applyStatus(msg.data);
    }
  });

  // Controls
  $('toggleBot').addEventListener('change', (e) => {
    sendCmd('setEnabled', e.target.checked);
  });

  $('speedSlider').addEventListener('input', (e) => {
    const fps = parseInt(e.target.value, 10);
    $('speedLabel').textContent = fps + '/s';
    sendCmd('setSpeed', fps);
    chrome.storage.local.set({ gameFps: fps });
  });

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    // Restore saved speed setting
    chrome.storage.local.get(['gameFps', 'botStatus'], (res) => {
      if (res.gameFps) {
        $('speedSlider').value = res.gameFps;
        $('speedLabel').textContent = res.gameFps + '/s';
      }
      if (res.botStatus) applyStatus(res.botStatus);
    });

    checkGameOpen();
    // Poll storage for updates while popup is open
    setInterval(() => {
      chrome.storage.local.get('botStatus', (res) => {
        if (res.botStatus) applyStatus(res.botStatus);
      });
    }, 1000);
  });
})();
