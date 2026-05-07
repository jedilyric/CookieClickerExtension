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
    clicksPerTick: 50,          // clicks fired per 1ms interval (~50,000/sec effective)
    buyCheckMs: 100,            // how often to run the buying loop
    goldenCheckMs: 50,          // how often to scan for golden cookies
    wrinklerCheckMs: 800,       // how often to manage wrinklers
    ascendCheckMs: 8000,        // how often to evaluate ascension
    statusMs: 1000,             // how often to post status to the popup
    gameFpsTarget: 2400,        // target Loop call rate; maps to 1ms → ~1000 calls/sec
    // Game.Earn() multiplier — every income event (passive tick, click, golden cookie,
    // wrinkler pop) flows through Game.Earn, so 1000× here means ~33,000× passive CPS
    // on top of the Loop-rate boost. Safe: CC uses floats up to ~1.8e308.
    earnMultiplier: 1000,
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

  // ─── Game.Earn Patch ──────────────────────────────────────────────────────
  // Multiplies every income event at the source. Passive ticks, manual clicks,
  // golden cookies, and wrinkler pops all call Game.Earn internally.
  // Safe to call repeatedly — skips if already patched.
  function patchEarn() {
    if (typeof Game === 'undefined' || typeof Game.Earn !== 'function') return;
    if (Game.Earn.__botPatched) return;
    const orig = Game.Earn.bind(Game);
    Game.Earn = function (n) { return orig(n * CFG.earnMultiplier); };
    Game.Earn.__botPatched = true;
    console.log(`[CookieBot] Game.Earn patched — ${CFG.earnMultiplier}× multiplier active`);
  }

  // ─── Game Speed Boost ─────────────────────────────────────────────────────
  function speedUpGame() {
    if (typeof Game === 'undefined') return;
    try {
      // Loop rate boost: keep fps=30 so each tick earns cookiesPs/30 cookies,
      // then call Loop at ~1000/sec (browser 1ms floor).
      // Net passive from Loop alone: ~1000/30 ≈ 33× CPS.
      // Combined with earnMultiplier=1000: ~33,000× total passive CPS.
      if (Game.loopInterval) clearInterval(Game.loopInterval);
      Game.fps = 30;
      const intervalMs = Math.max(1, Math.floor(1000 / CFG.gameFpsTarget));
      Game.loopInterval = setInterval(Game.Loop, intervalMs);
      // Earn patch on top — covers any re-initialization after Reincarnate
      patchEarn();
      console.log(`[CookieBot] Speed active: Loop@${intervalMs}ms, fps=30, earn×${CFG.earnMultiplier}`);
    } catch (e) {
      console.warn('[CookieBot] Could not boost speed:', e);
    }
  }

  // ─── Clicking ────────────────────────────────────────────────────────────
  // Batch multiple clicks per 1ms tick instead of one click per interval.
  // ClickCookie also calls Game.Earn internally, so each click is multiplied too.
  function clickBatch() {
    if (!enabled || !gameReady()) return;
    for (let i = 0; i < CFG.clicksPerTick; i++) {
      try { Game.ClickCookie(); } catch (_) { break; }
    }
    session.clicks += CFG.clicksPerTick;
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
    buyUpgrades();     // upgrades first — they unlock immediately and multiply CPS
    buyBestBuilding(); // then find the best bulk-buy across all building types
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

    const budget = Game.cookies;
    if (budget <= 0) return;

    // Cookie Clicker price scaling: each purchase costs 1.15× the previous one.
    // Total cost of buying k units from current price P:
    //   P × (1.15^k − 1) / 0.15
    // → max affordable k: floor(log(1 + 0.15×budget/P) / log(1.15))
    // We compare (k × cpsPerUnit) / totalSpend across all building types and
    // pick the one with the highest CPS-per-cookie-spent, then buy that many.
    const SCALE = 1.15;
    const LOG_SCALE = Math.log(SCALE);

    let best = null;
    let bestQty = 1;
    let bestEff = -1;

    for (let i = 0; i < objs.length; i++) {
      const b = objs[i];
      if (!b || b.locked || b.price > budget) continue;

      const amt = b.amount || 0;
      const storedCps = b.storedCps || 0;
      const baseCps = b.baseCps || 1e-9;
      // Each additional unit of a type adds the same CPS as the average existing unit
      // (all units share the same multiplicative upgrade bonuses).
      const cpsPerUnit = amt > 0 ? Math.max(storedCps / amt, baseCps) : baseCps;

      const maxK = Math.max(1, Math.floor(
        Math.log(1 + (SCALE - 1) * budget / b.price) / LOG_SCALE
      ));

      const spend = b.price * (Math.pow(SCALE, maxK) - 1) / (SCALE - 1);
      const gain  = maxK * cpsPerUnit;
      const eff   = gain / Math.max(spend, 1e-9);

      if (eff > bestEff) {
        bestEff = eff;
        best = b;
        bestQty = maxK;
      }
    }

    if (best) {
      for (let i = 0; i < bestQty; i++) {
        if (best.price > Game.cookies) break;
        try { best.buy(1); session.buildings++; } catch (_) { break; }
      }
      // Re-run upgrades: buying buildings unlocks new ones at milestones (10, 25, 50…)
      buyUpgrades();
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
        // Re-apply speed boost and earn patch after game reinit
        setTimeout(() => { speedUpGame(); patchEarn(); }, 3000);
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
        earnMultiplier: CFG.earnMultiplier,
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
        CFG.gameFpsTarget = Math.max(30, Math.min(10000, cmd.value));
        // Scale earn multiplier with speed slider: 100× at min, 1000× at max
        CFG.earnMultiplier = Math.max(100, Math.round(CFG.gameFpsTarget / 2.4));
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

    intervals.click    = setInterval(clickBatch,          1);                 // 1ms = max rate
    intervals.buy      = setInterval(runBuyingStrategy,   CFG.buyCheckMs);
    intervals.golden   = setInterval(clickGoldenCookies,  CFG.goldenCheckMs);
    intervals.wrinkler = setInterval(manageWrinklers,     CFG.wrinklerCheckMs);
    intervals.ascend   = setInterval(checkAscension,      CFG.ascendCheckMs);
    intervals.status   = setInterval(reportStatus,        CFG.statusMs);

    // Re-apply speed and earn patch if the game reinitializes (page reload, reset)
    const observer = new MutationObserver(() => {
      if (typeof Game === 'undefined' || !Game.ready) return;
      if (Game.fps < CFG.gameFpsTarget) speedUpGame();
      if (!Game.Earn.__botPatched) patchEarn();
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  waitAndStart();
  console.log('[CookieBot] injected.js loaded — waiting for game…');
})();
