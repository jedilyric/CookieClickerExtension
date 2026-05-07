/**
 * Cookie Clicker Ultra Bot — injected.js
 * Runs in the page's JS context so it can access window.Game directly.
 * Injected by content.js via a <script src> tag.
 */
(function () {
  'use strict';

  if (window.__cookieBotLoaded) return;
  window.__cookieBotLoaded = true;

  // ─── Configuration ────────────────────────────────────────────────────────
  const CFG = {
    clicksPerSecond: 500,       // clicks/sec on the big cookie
    buyCheckMs: 150,            // how often to run the buying loop
    goldenCheckMs: 50,          // how often to scan for golden cookies
    wrinklerCheckMs: 800,       // how often to manage wrinklers
    ascendCheckMs: 8000,        // how often to evaluate ascension
    statusMs: 1000,             // how often to post status to the popup
    gameFpsTarget: 240,         // raise game tick rate (default is 30)
    ascendMinCookies: 1e12,     // minimum cookies earned before we'll ascend
    ascendMinGain: 100,         // minimum prestige to gain before ascending
    ascendPercentGain: 0.10,    // or ascend if gain is ≥10% of current prestige
    wrinklerPopThreshold: 5,    // pop wrinklers when this many are fully fat
  };

  // ─── State ────────────────────────────────────────────────────────────────
  let enabled = true;
  let ascending = false;
  let intervals = {};
  const session = {
    clicks: 0,
    upgrades: 0,
    buildings: 0,
    goldenClicks: 0,
    wrinklerPops: 0,
    ascensions: 0,
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function gameReady() {
    return typeof Game !== 'undefined' && Game.ready && !Game.OnAscend && !ascending;
  }

  function fmt(n) {
    if (n >= 1e15) return (n / 1e15).toFixed(2) + ' Qa';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + ' B';
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + ' M';
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + ' K';
    return Math.floor(n).toString();
  }

  // ─── Game Speed Boost ─────────────────────────────────────────────────────
  function speedUpGame() {
    if (typeof Game === 'undefined') return;
    try {
      if (Game.loopInterval) clearInterval(Game.loopInterval);
      Game.fps = CFG.gameFpsTarget;
      Game.loopInterval = setInterval(Game.Loop, 1000 / CFG.gameFpsTarget);
      console.log(`[CookieBot] Game loop boosted to ${CFG.gameFpsTarget} FPS`);
    } catch (e) {
      console.warn('[CookieBot] Could not boost FPS:', e);
    }
  }

  // ─── Clicking ────────────────────────────────────────────────────────────
  function clickCookie() {
    if (!gameReady()) return;
    try {
      Game.ClickCookie();
      session.clicks++;
    } catch (_) {}
  }

  // ─── Golden Cookies & Shimmers ────────────────────────────────────────────
  function clickGoldenCookies() {
    if (typeof Game === 'undefined' || !Game.shimmers) return;
    for (let i = Game.shimmers.length - 1; i >= 0; i--) {
      const s = Game.shimmers[i];
      if (s && typeof s.pop === 'function') {
        try { s.pop(); session.goldenClicks++; } catch (_) {}
      }
    }
  }

  // ─── Wrinkler Management ─────────────────────────────────────────────────
  function manageWrinklers() {
    if (typeof Game === 'undefined' || !Game.wrinklers) return;

    let fat = 0;
    for (let i = 0; i < Game.wrinklers.length; i++) {
      if (Game.wrinklers[i] && Game.wrinklers[i].phase === 2) fat++;
    }

    // Keep at least a few wrinklers for the passive bonus; pop when there are many fat ones
    if (fat >= CFG.wrinklerPopThreshold) {
      for (let i = Game.wrinklers.length - 1; i >= 0; i--) {
        const w = Game.wrinklers[i];
        if (w && w.phase === 2) {
          try { w.hp = 0; session.wrinklerPops++; } catch (_) {}
        }
      }
    }
  }

  // ─── Buying Strategy ─────────────────────────────────────────────────────
  function runBuyingStrategy() {
    if (!gameReady()) return;

    buyUpgrades();
    buyBestBuilding();
  }

  function buyUpgrades() {
    const store = Game.UpgradesInStore;
    if (!store) return;
    for (let i = 0; i < store.length; i++) {
      const u = store[i];
      if (u && u.pool !== 'toggle' && typeof u.canBuy === 'function' && u.canBuy()) {
        try { u.buy(1); session.upgrades++; } catch (_) {}
      }
    }
  }

  function buyBestBuilding() {
    const objs = Game.ObjectsById;
    if (!objs) return;

    const cookies = Game.cookies;
    let best = null;
    let bestScore = -1;

    for (let i = 0; i < objs.length; i++) {
      const b = objs[i];
      if (!b || b.locked || b.price > cookies) continue;

      // Efficiency: estimated CPS gain / price
      const amt = b.amount || 0;
      const storedCps = b.storedCps || 0;
      const baseCps = b.baseCps || 0.001;
      const cpsGain = amt > 0 ? storedCps / amt : baseCps;
      const score = (cpsGain + 1e-9) / b.price;

      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }

    if (best) {
      try { best.buy(1); session.buildings++; } catch (_) {}
    }
  }

  // ─── Permanent Upgrade Slots ──────────────────────────────────────────────
  // Fill permanent upgrade slots with the highest-CPS upgrades we own
  function fillPermanentSlots() {
    if (typeof Game === 'undefined' || !Game.permanentUpgrades) return;
    try {
      // Find unlocked permanent slot upgrades and fill them
      const slots = Game.permanentUpgrades;
      const owned = Object.values(Game.Upgrades || {}).filter(u =>
        u.bought && u.pool !== 'prestige' && u.pool !== 'toggle' && u.pool !== 'debug'
      );
      // Sort by rough value (id descending ≈ later/better upgrades)
      owned.sort((a, b) => b.id - a.id);
      for (let i = 0; i < slots.length && i < owned.length; i++) {
        if (slots[i] === 0) slots[i] = owned[i].id;
      }
    } catch (_) {}
  }

  // ─── Ascension Management ─────────────────────────────────────────────────
  function checkAscension() {
    if (typeof Game === 'undefined' || !Game.ready || ascending) return;

    if ((Game.cookiesEarned || 0) < CFG.ascendMinCookies) return;

    const current = Game.prestige || 0;
    const total = (Game.cookiesReset || 0) + (Game.cookiesEarned || 0);
    const potential = typeof Game.HowMuchPrestige === 'function'
      ? Game.HowMuchPrestige(total) : 0;
    const gain = potential - current;

    const threshold = Math.max(
      CFG.ascendMinGain,
      current * CFG.ascendPercentGain
    );

    if (gain >= threshold) {
      doAscend(gain);
    }
  }

  function doAscend(gain) {
    ascending = true;
    console.log(`[CookieBot] Ascending — gaining ${gain} prestige (total will be ${(Game.prestige || 0) + gain})`);

    try {
      fillPermanentSlots();
      Game.Ascend(1);
    } catch (e) {
      console.warn('[CookieBot] Ascend error:', e);
      ascending = false;
      return;
    }

    // Give the ascension screen 2 s, then reincarnate
    setTimeout(() => {
      try {
        buyHeavenlyUpgrades();
        Game.Reincarnate(1);
        session.ascensions++;
        console.log('[CookieBot] Reincarnated — resuming bot');
      } catch (e) {
        console.warn('[CookieBot] Reincarnate error:', e);
      } finally {
        ascending = false;
        // Re-apply speed boost after game reinit
        setTimeout(speedUpGame, 3000);
      }
    }, 2500);
  }

  function buyHeavenlyUpgrades() {
    const priority = [
      'Heavenly chip secret',
      'Heavenly cookie stand',
      'Heavenly bakery',
      'Heavenly confectionery',
      'Heavenly key',
      'A crumbly egg',
      'Permanent upgrade slot I',
      'Permanent upgrade slot II',
      'Permanent upgrade slot III',
      'Permanent upgrade slot IV',
      'Permanent upgrade slot V',
      'Lucky day',
      'Serendipity',
      'Get lucky',
      "Heaven's touch",
      'Lucky number',
      'Kitten helpers',
      'Kitten workers',
      'Kitten engineers',
      'Kitten overseers',
      'Kitten managers',
      'Kitten accountants',
      'Kitten specialists',
      'Kitten experts',
      'Kitten consultants',
      'Kitten assistants to the regional manager',
    ];

    for (const name of priority) {
      const u = Game.Upgrades && Game.Upgrades[name];
      if (u && u.pool === 'prestige' && typeof u.canBuy === 'function' && u.canBuy()) {
        try { u.buy(1); } catch (_) {}
      }
    }

    // Then sweep any remaining affordable prestige upgrades
    const all = Game.UpgradesById || [];
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (u && u.pool === 'prestige' && typeof u.canBuy === 'function' && u.canBuy()) {
        try { u.buy(1); } catch (_) {}
      }
    }
  }

  // ─── Status Reporting ─────────────────────────────────────────────────────
  function reportStatus() {
    window.postMessage({
      __cookieBot: true,
      type: 'status',
      data: {
        enabled,
        ascending,
        cookies: typeof Game !== 'undefined' ? (Game.cookies || 0) : 0,
        cookiesPs: typeof Game !== 'undefined' ? (Game.cookiesPs || 0) : 0,
        cookiesEarned: typeof Game !== 'undefined' ? (Game.cookiesEarned || 0) : 0,
        prestige: typeof Game !== 'undefined' ? (Game.prestige || 0) : 0,
        fps: typeof Game !== 'undefined' ? (Game.fps || 0) : 0,
        buildings: typeof Game !== 'undefined' && Game.ObjectsById
          ? Game.ObjectsById.reduce((s, b) => s + (b ? b.amount : 0), 0) : 0,
        session: { ...session },
        gameReady: typeof Game !== 'undefined' && !!Game.ready,
      },
    }, '*');
  }

  // ─── Message Listener (from content.js) ───────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__cookieBotCmd) return;
    const cmd = e.data;

    switch (cmd.action) {
      case 'toggle':
        enabled = !enabled;
        console.log(`[CookieBot] ${enabled ? 'Enabled' : 'Disabled'}`);
        break;
      case 'setEnabled':
        enabled = !!cmd.value;
        break;
      case 'setSpeed':
        CFG.gameFpsTarget = Math.max(30, Math.min(1000, cmd.value));
        speedUpGame();
        break;
      case 'getStatus':
        reportStatus();
        break;
    }
  });

  // ─── Boot Sequence ────────────────────────────────────────────────────────
  function waitAndStart() {
    if (typeof Game !== 'undefined' && Game.ready) {
      start();
    } else {
      setTimeout(waitAndStart, 300);
    }
  }

  function start() {
    console.log('[CookieBot] Game detected — launching ultra bot!');
    speedUpGame();

    const clickDelayMs = Math.max(1, Math.floor(1000 / CFG.clicksPerSecond));
    intervals.click    = setInterval(clickCookie,         clickDelayMs);
    intervals.buy      = setInterval(runBuyingStrategy,   CFG.buyCheckMs);
    intervals.golden   = setInterval(clickGoldenCookies,  CFG.goldenCheckMs);
    intervals.wrinkler = setInterval(manageWrinklers,     CFG.wrinklerCheckMs);
    intervals.ascend   = setInterval(checkAscension,      CFG.ascendCheckMs);
    intervals.status   = setInterval(reportStatus,        CFG.statusMs);

    // Watch for game resets / reloads and re-apply speed boost
    const observer = new MutationObserver(() => {
      if (typeof Game !== 'undefined' && Game.ready && Game.fps < CFG.gameFpsTarget) {
        speedUpGame();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  waitAndStart();
  console.log('[CookieBot] injected.js loaded — waiting for game…');
})();
