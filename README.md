# Cookie Clicker Ultra Bot

A Google Chrome extension that auto-plays [Cookie Clicker](https://orteil.dashnet.org/cookieclicker/) at record speed.

## Features

- **500 clicks/second** on the big cookie
- **8× game speed boost** (raises internal tick rate to 240 FPS)
- **Smart auto-buyer** — always purchases the most cost-efficient upgrade or building
- **Instant golden cookie clicking** — scans every 50 ms
- **Wrinkler management** — pops fat wrinklers at the right time for maximum cookies
- **Auto-ascension** — ascends when prestige gain is significant, buys priority heavenly upgrades, reincarnates automatically, and repeats indefinitely
- **Live popup dashboard** — shows cookies, CPS, prestige, FPS, and session stats
- **Speed slider** — set game FPS from 30 (normal) to 1000 (ultra)
- **Persists across reloads** — bot restarts automatically every time the page loads

## Installation (Chrome)

1. Download or clone this repository so you have the `CookieClickerExtension` folder.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `CookieClickerExtension` folder.
6. The Cookie icon will appear in your Chrome toolbar.

## Usage

1. Open [Cookie Clicker](https://orteil.dashnet.org/cookieclicker/).
2. The bot starts automatically — no action needed.
3. Click the Cookie icon in the toolbar to open the dashboard:
   - **Toggle** the bot on/off with the switch.
   - **Drag the speed slider** to adjust game FPS (higher = faster passive income).
4. Leave the tab open and watch the cookies pile up.

## How It Works

| Component | Role |
|-----------|------|
| `content.js` | Bridge between extension and page JS context |
| `injected.js` | Runs inside the page — accesses `window.Game` directly |
| `background.js` | Service worker; routes messages between popup and content script |
| `popup.html/js` | Live control panel |

The bot hooks into Cookie Clicker's internal `Game` object to click, buy, and ascend — no pixel-clicking or screen capture needed.

## Files

```
CookieClickerExtension/
├── manifest.json          Chrome extension manifest (V3)
├── content.js             Content script bridge
├── injected.js            Game bot (page context)
├── background.js          Service worker
├── popup.html             Dashboard UI
├── popup.js               Dashboard logic
├── generate_icons.py      Icon generator (already run)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
