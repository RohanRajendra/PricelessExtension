// utils/claude-api.js
// Fetches a site's privacy policy and analyzes it using Claude.
// Results are cached in chrome.storage.local — the API is never called twice for the same domain.

import { getCachedSummary, saveCachedSummary } from './storage.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const API_KEY = import.meta.env.VITE_CLAUDE_API_KEY;

const SYSTEM_PROMPT = `You are a privacy policy analyst for a browser extension.

Your task is to read a website privacy policy excerpt and return a STRICT JSON object only.

Return JSON with exactly these keys:
{
  "summary": string,
  "claimsNoSelling": boolean,
  "claimsLimitedSharing": boolean,
  "claimsNoTracking": boolean,
  "riskScore": number,
  "plainEnglishTakeaway": string
}

Rules:
- Output valid JSON only. No markdown. No code fences.
- "summary" must be 1 short sentence in plain English.
- "claimsNoSelling" should be true only if the text explicitly says they do not sell personal data or similar.
- "claimsLimitedSharing" should be true only if the text explicitly says sharing is limited, restricted, or only with narrow categories of partners.
- "claimsNoTracking" should be true only if the text explicitly says they do not track users or similar.
- "riskScore" must be an integer from 0 to 100, where higher means more privacy risk.
- "plainEnglishTakeaway" must be 1 concise sentence, max 20 words, plain English.
- If details are unclear, be conservative and use false for booleans.
- If the excerpt is too vague, still return valid JSON.

Example output:
{"summary":"They collect browsing activity and share it with advertising and analytics partners.","claimsNoSelling":false,"claimsLimitedSharing":false,"claimsNoTracking":false,"riskScore":78,"plainEnglishTakeaway":"They gather your activity data and share it with third parties."}`;

/**
 * Safe fallback object when Claude fails or returns malformed output.
 */
function getFallbackPolicyIntelligence() {
  return {
    summary: 'Policy details unclear from available text.',
    claimsNoSelling: false,
    claimsLimitedSharing: false,
    claimsNoTracking: false,
    riskScore: 50,
    plainEnglishTakeaway: 'Privacy practices are unclear from the available policy text.',
  };
}

/**
 * Parse Claude text output into strict structured JSON.
 */
function parsePolicyIntelligence(rawText) {
  try {
    const parsed = JSON.parse(rawText);

    return {
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : 'Policy details unclear from available text.',
      claimsNoSelling: Boolean(parsed.claimsNoSelling),
      claimsLimitedSharing: Boolean(parsed.claimsLimitedSharing),
      claimsNoTracking: Boolean(parsed.claimsNoTracking),
      riskScore: Number.isFinite(parsed.riskScore)
        ? Math.max(0, Math.min(100, Math.round(parsed.riskScore)))
        : 50,
      plainEnglishTakeaway:
        typeof parsed.plainEnglishTakeaway === 'string' && parsed.plainEnglishTakeaway.trim()
          ? parsed.plainEnglishTakeaway.trim()
          : 'Privacy practices are unclear from the available policy text.',
    };
  } catch {
    return getFallbackPolicyIntelligence();
  }
}

/**
 * Get structured privacy intelligence for a domain.
 * Returns cached result if available. Otherwise fetches policy text and calls Claude.
 *
 * @param {string} domain - e.g. "nytimes.com"
 * @param {string} policyText - raw text from the privacy policy page (max 4000 chars used)
 * @returns {Promise<{
 *   summary: string,
 *   claimsNoSelling: boolean,
 *   claimsLimitedSharing: boolean,
 *   claimsNoTracking: boolean,
 *   riskScore: number,
 *   plainEnglishTakeaway: string
 * }>}
 */
export async function getPrivacySummary(domain, policyText) {
  const cached = await getCachedSummary(domain);
  if (cached) {
    // support old cached string format from previous version
    if (typeof cached === 'string') {
      return {
        ...getFallbackPolicyIntelligence(),
        summary: cached,
        plainEnglishTakeaway: cached,
      };
    }
    return cached;
  }

  const trimmedText = policyText.slice(0, 4000);

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
        max_tokens: 220,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyze this privacy policy excerpt and return strict JSON only:\n\n${trimmedText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim() ?? '';

    const structured = parsePolicyIntelligence(rawText);

    await saveCachedSummary(domain, structured);
    return structured;
  } catch (err) {
    console.error('Priceless: Claude API call failed', err);
    return getFallbackPolicyIntelligence();
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
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const html = await res.text();
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length > 200) return plain;
      }
    } catch {
      // try next path
    }
  }

  return null;
}