// utils/claude-api.js
// Fetches a site's privacy policy and summarizes it using Claude.
// Results are cached in chrome.storage.local — the API is never called twice for the same domain.

import { getCachedSummary, saveCachedSummary } from './storage.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const SYSTEM_PROMPT = `You are a privacy policy analyst. Your job is to read excerpts from website privacy policies and explain them in plain English to everyday users.

Rules:
- Respond with exactly ONE sentence, maximum 25 words
- Be specific about what data is collected and what happens to it
- Use plain language — no legal terms
- If the excerpt doesn't contain enough information, say: "Policy details unclear from available text."
- Never say "I" or "the policy states" — just state the facts directly

Example good responses:
- "They collect your browsing history, location, and purchase behavior, then sell it to over 40 advertising partners."
- "They track which pages you visit and share that data with Google and Meta for ad targeting."
- "They collect your email and usage patterns to send targeted ads and share with third-party analytics firms."`;

/**
 * Get a plain-English summary of a domain's privacy policy.
 * Returns cached result if available. Otherwise fetches policy text and calls Claude.
 *
 * @param {string} domain - e.g. "nytimes.com"
 * @param {string} policyText - raw text from the privacy policy page (max 3000 chars used)
 * @returns {Promise<string>} - one sentence summary
 */
export async function getPrivacySummary(domain, policyText) {
  // Check cache first — never call the API twice for the same domain
  const cached = await getCachedSummary(domain);
  if (cached) return cached;

  // Trim policy text to 3000 chars to stay within token limits
  const trimmedText = policyText.slice(0, 3000);

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Privacy policy excerpt:\n\n${trimmedText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.content[0]?.text?.trim() ?? 'Unable to summarize policy.';

    // Cache the result so we never call the API again for this domain
    await saveCachedSummary(domain, summary);
    return summary;

  } catch (err) {
    console.error('Priceless: Claude API call failed', err);
    return 'Privacy policy unavailable.';
  }
}

/**
 * Attempt to fetch the privacy policy text for a given base URL.
 * Tries common privacy policy URL patterns in order.
 * Called from the service worker context.
 *
 * @param {string} baseUrl - e.g. "https://www.nytimes.com"
 * @returns {Promise<string|null>} - plain text of the policy, or null if not found
 */
export async function fetchPrivacyPolicyText(baseUrl) {
  const paths = [
    '/privacy',
    '/privacy-policy',
    '/legal/privacy',
    '/policies/privacy',
    '/about/privacy',
    '/legal/privacy-policy',
  ];

  for (const path of paths) {
    try {
      const res = await fetch(baseUrl + path, {
        method: 'GET',
        signal: AbortSignal.timeout(4000), // bail after 4 seconds
      });
      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags to get readable plain text
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length > 200) return plain; // must have meaningful content
      }
    } catch {
      // try next path
    }
  }

  return null;
}
