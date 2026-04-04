# Priceless — Setup & Testing Guide

## Prerequisites

- Node.js 18+
- Google Chrome
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

---

## Step 1 — Add your API key

Open `utils/claude-api.js` and replace line 18:

```js
const API_KEY = '__PASTE_API_KEY_HERE__';
```

with your actual Anthropic API key.

---

## Step 2 — Add icons (optional)

The manifest references icon files at `icons/icon16.png`, `icons/icon48.png`, and `icons/icon128.png`. Without them Chrome will use a default puzzle-piece icon — the extension still works fine.

To add real icons, create an `icons/` folder in the project root and drop in PNG files at those three sizes. You can generate them at [favicon.io](https://favicon.io).

---

## Step 3 — Install dependencies and build

```bash
cd /path/to/PricelessExtension
npm install
npm run build
```

This compiles all React/JSX and Tailwind into a `dist/` folder. That folder is what Chrome loads.

---

## Step 4 — Load the extension in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder

The **PRICELESS** icon should appear in your Chrome toolbar.

---

## Step 5 — First test

1. Visit **nytimes.com**
2. Wait 2–3 seconds — a red badge number appears on the extension icon (tracker count)
3. Click the icon — the popup opens showing a dollar value in the **Price Tag** view
4. Click `// Receipt` to see every tracker itemized
5. Click **VIEW MONTHLY STATEMENT** — the dashboard opens in a new tab
6. If the dashboard shows no data, click **Load Demo Data** to seed a realistic month of browsing history

---

## Rebuilding after code changes

```bash
npm run dev   # watch mode — rebuilds automatically on every file save
```

After a rebuild, go to `chrome://extensions` and click the **↺ refresh** icon on the Priceless card to reload the extension into Chrome.

---

## Good pages to test on

| Site | Why |
|------|-----|
| nytimes.com | Heavy tracker load — 10+ trackers typical |
| reddit.com | Mix of ad networks and analytics |
| cnn.com | Data brokers + social pixels |
| github.com | Light load — good contrast to show the difference |

---

## Troubleshooting

**Badge doesn't appear**
- Open `chrome://extensions` → click **Service Worker** link under Priceless → check the console for errors.

**Popup is blank**
- Make sure you ran `npm run build` and reloaded the extension after changes.

**AI summary never loads**
- Check your API key in `utils/claude-api.js`.
- The summary fetches 2 seconds after page load and may take a few more seconds to complete.
- Summaries are cached — if it worked once for a domain, it will be instant on repeat visits.

**Dashboard shows no data**
- Click **Load Demo Data** in the empty state. This seeds realistic data for the current month.
