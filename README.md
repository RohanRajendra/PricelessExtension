# PricelessExtension
It's a browser extension that puts a real dollar figure on your data in real time, shows you the receipt you were never meant to see, and gives you the dial to decide how much of yourself you're willing to sell. 

### *"They've known your price for years. Now you do too."*

---

## The Problem

Every time you open a browser, you walk into a marketplace. You are not the customer. You are the product — packaged, priced, and sold to the highest bidder before the page even finishes loading.

Ad networks, data brokers, and surveillance platforms have spent decades building an economy around your behavior. They know exactly what you're worth. They've assigned you a price. They buy and sell you every single day.

And they never told you.

Privacy tools today either block trackers silently or bury you in technical warnings. None of them answer the one question that actually makes people feel something:

> **How much am I worth to them?**
> 

---

## What Is Priceless?

Priceless is a browser extension that puts a price tag on the product — **you**.

It doesn't block. It doesn't hide. It tears open the black box of surveillance capitalism and shows you the receipt you were never meant to see. Every site you visit. Every tracker that fires. Every ad network that profiles you. Translated into plain language and a real dollar figure — running in real time, right in your browser.

You've always been the product. Now you know the price.

And once you know the price, **you decide how much of yourself you're willing to sell.**

---

## How It Works

1. **You browse normally.** Priceless runs silently in the background.
2. **On every page**, it detects which third-party trackers fired, what data categories were collected, and which ad networks are profiling you.
3. **It assigns you a dollar value** based on known industry ARPU figures (Google, Meta, Amazon, etc.) and IAB ad market benchmarks — the same data these companies use to buy and sell you.
4. **You see a receipt** — not a warning, not a score. A receipt. Itemized. Running total. Month to date.
5. **You choose your response.** Priceless offers graduated suggestions for reducing your footprint — not a kill switch, but a dial. You decide how much of yourself you're willing to give away.

---

## Core Features

### 🏷️ Your Price Tag

The centerpiece. A real-time dollar value displayed as you browse — your estimated worth to the ad economy on this page, this session, this month. Not abstract. Not a percentage. A number with a dollar sign.

*"You are worth $0.003 to Google right now."*

### 🧾 The Receipt

Per-site breakdown on every page visit:

- Which trackers fired (Ad Networks, Data Brokers, Analytics, Social Pixels)
- What data categories were collected (location, browsing behavior, purchase intent, demographics)
- Estimated dollar value extracted from this visit

### 📊 The Monthly Statement

A dashboard showing your running total for the month:

- Broken down by platform: Google, Meta, Amazon, TikTok, and more
- Headline figure: *"This month, these companies made an estimated $47 from your data. You received $0."*
- The moment people screenshot. The moment people feel it.

### 📢 The Leaderboard of Shame *(stretch)*

A shareable graphic of your week's top data harvesters. Built to be screenshotted and posted. *"Google made $31 off me this week. Here's my receipt."* 

### 📄 Plain English Policy *(stretch)*

LLM-powered one-line summary of what a site actually claims to collect — pulled from their privacy policy, stripped of legalese.

*"They collect: your search history, precise location, and purchase behavior. They sell it to 47 partners."*

---

## Differentiation — Why Priceless Wins

| Tool | What It Does | What It Doesn't Do |
| --- | --- | --- |
| **Privacy Badger** | Blocks trackers algorithmically | Silent. No financial framing. Doesn't show you what you're worth. |
| **uBlock Origin** | Blocks ads and trackers via lists | Binary. No dollar value. No user agency over the spectrum. |
| **Ghostery** | Shows trackers, some blocking | Technical, not emotional. No price tag. No graduated control. |
| **Extension Auditor Pro** | Audits installed extensions for risk | B2B/IT tool. Not consumer-facing. No receipts. |
| **Data broker opt-out tools** | Helps you request data deletion | Reactive, not real-time. No visibility into daily extraction. |

### Priceless's Unfair Advantages

**1. We put a price tag on you.**
Every existing tool speaks in trackers, cookies, and risk scores. Nobody feels anything reading that. A dollar figure is visceral. It reframes surveillance capitalism as a transaction — one where you never agreed to the price and never saw the invoice. Priceless makes it impossible to ignore.

**2. You are the product. We make that literal.**
The entire pitch of modern surveillance capitalism is that the service is free. Priceless exposes the lie: the service was never free. You were always paying — with yourself. We just show you the receipt.

**3. It's a mirror, not just a blocker.**
The punk move isn't only to fight the system — it's to make the system's extraction visible and embarrassing. But we go one step further: we hand you the dial. You choose how visible you want to be. Total awareness, partial resistance, or full ghost mode. That's real autonomy.

**4. It's built to go viral.**
The Monthly Statement and Leaderboard of Shame are designed to be screenshotted and shared. *"Google made $47 off me this month"* is a tweet. *"I installed a tracker blocker"* is not.

**5. No server. No irony.**
Priceless stores everything locally. Zero data leaves your device. We are not going to harvest your data to explain who's harvesting your data. That would make us the villain of our own story.

---

## Tech Stack

### Browser Extension

- **Manifest V3** Chrome Extension (content scripts + background service worker)
- **React** for the popup UI
- **Tailwind CSS** for styling

### Tracker Detection

- **Disconnect.me tracker list** — open source, comprehensive, no API needed
- **EasyPrivacy list** — supplementary tracker data
- Trackers categorized into: Ad Networks, Data Brokers, Analytics, Social Pixels

### Dollar Value Estimation

- Based on publicly available **IAB ad market benchmarks** and platform **ARPU figures**
    - Google: ~$48/user/year → ~$4/month
    - Meta: ~$60/user/year → ~$5/month
    - Estimates scaled by session length, page category, and tracker density
- Transparent about being estimates — and the estimate alone is damning enough

### The Dial (Graduated Blocking)

- Chrome's `declarativeNetRequest` API for rule-based blocking
- Four preset rule sets mapped to the four levels (Witness → Ghost)
- User's level stored locally, never synced

### Optional AI Layer *(stretch)*

- **Claude API** — plain English privacy policy summarizer
- One sentence. No legalese.

### Data Storage

- All data stored locally via Chrome's `storage.local` API
- **Zero data sent to any server. Ever.**

---

## The Pitch — One Paragraph

> For decades, surveillance capitalism has had a dirty secret: you are not the user, you are the product. Every search, every scroll, every click has been packaged and sold — and they've always known your price. Priceless tears that open. It's a browser extension that puts a real dollar figure on your data in real time, shows you the receipt you were never meant to see, and gives you the dial to decide how much of yourself you're willing to sell. Not a blocker. Not a warning. A reckoning.
> 

---

## SharkHack Track Alignment

**Off-Grid** — Privacy, security, and digital autonomy. Priceless is a direct confrontation with the invisible economy built on personal data. It doesn't just highlight the right to privacy — it prices what's being taken, and hands the control back to you.

---

*Built for SharkHack 2026 — Code Against the Machine*
