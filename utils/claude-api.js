// utils/claude-api.js
// Fetches a site's privacy policy and analyzes it using Claude.
// Now includes:
//   - Policy change detection (hash-based, re-analyzes when policy text changes)
//   - Consent theater scoring (dark pattern detection from content script)
//   - Extended output schema: consentScore, consentVerdict, policyChanged, changeSummary

import {
  getCachedSummary,
  saveCachedSummary,
  getPolicyHash,
  savePolicyHash,
  getPolicySummaryText,
  savePolicySummaryText,
} from './storage.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL   = 'claude-sonnet-4-20250514';
const API_KEY        = import.meta.env.VITE_CLAUDE_API_KEY;

const SYSTEM_PROMPT = `You are a privacy policy analyst for a browser extension.

Your task is to read a website privacy policy excerpt and return a STRICT JSON object only.

Return JSON with exactly these keys:
{
  "summary": string,
  "claimsNoSelling": boolean,
  "claimsLimitedSharing": boolean,
  "claimsNoTracking": boolean,
  "riskScore": number,
  "plainEnglishTakeaway": string,
  "consentScore": number,
  "consentVerdict": string
}

Rules:
- Output valid JSON only. No markdown. No code fences.
- "summary": 1 short plain-English sentence about their data practices.
- "claimsNoSelling": true only if policy explicitly says they do not sell personal data.
- "claimsLimitedSharing": true only if policy explicitly says sharing is limited/restricted.
- "claimsNoTracking": true only if policy explicitly says they do not track users.
- "riskScore": integer 0–100. Higher = more privacy risk.
- "plainEnglishTakeaway": 1 sentence, max 20 words, plain English.
- "consentScore": integer 0–100. Higher = more dark patterns in cookie consent UX. Use the provided consent context if available, otherwise estimate from policy text.
- "consentVerdict": one of "TRANSPARENT", "MINOR_PATTERNS", "MODERATE_DARK_PATTERNS", "CONSENT_THEATER".
- If details are unclear, be conservative (false for booleans, 50 for scores).`;

const CHANGE_SYSTEM_PROMPT = `You are a privacy policy analyst for a browser extension.

A site's privacy policy has changed since the last time it was analyzed.
Compare the old and new summaries and identify changes that are worse for users.

Return a STRICT JSON object only:
{
  "summary": string,
  "claimsNoSelling": boolean,
  "claimsLimitedSharing": boolean,
  "claimsNoTracking": boolean,
  "riskScore": number,
  "plainEnglishTakeaway": string,
  "consentScore": number,
  "consentVerdict": string,
  "policyChanged": true,
  "changeSummary": string
}

- "changeSummary": 1 sentence describing what got worse for users. Max 25 words.
- All other rules same as standard analysis.
- Output valid JSON only.`;

function getFallback() {
  return {
    summary:             'Policy details unclear from available text.',
    claimsNoSelling:     false,
    claimsLimitedSharing: false,
    claimsNoTracking:    false,
    riskScore:           50,
    plainEnglishTakeaway: 'Privacy practices are unclear from the available policy text.',
    consentScore:        50,
    consentVerdict:      'MINOR_PATTERNS',
    policyChanged:       false,
    changeSummary:       null,
  };
}

function parsePolicyIntelligence(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return {
      summary:              typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : getFallback().summary,
      claimsNoSelling:      Boolean(parsed.claimsNoSelling),
      claimsLimitedSharing: Boolean(parsed.claimsLimitedSharing),
      claimsNoTracking:     Boolean(parsed.claimsNoTracking),
      riskScore:            Number.isFinite(parsed.riskScore) ? Math.max(0, Math.min(100, Math.round(parsed.riskScore))) : 50,
      plainEnglishTakeaway: typeof parsed.plainEnglishTakeaway === 'string' && parsed.plainEnglishTakeaway.trim() ? parsed.plainEnglishTakeaway.trim() : getFallback().plainEnglishTakeaway,
      consentScore:         Number.isFinite(parsed.consentScore) ? Math.max(0, Math.min(100, Math.round(parsed.consentScore))) : 50,
      consentVerdict:       ['TRANSPARENT','MINOR_PATTERNS','MODERATE_DARK_PATTERNS','CONSENT_THEATER'].includes(parsed.consentVerdict) ? parsed.consentVerdict : 'MINOR_PATTERNS',
      policyChanged:        Boolean(parsed.policyChanged),
      changeSummary:        typeof parsed.changeSummary === 'string' ? parsed.changeSummary.trim() : null,
    };
  } catch {
    return getFallback();
  }
}

/**
 * Compute SHA-256 hex hash of a string using the Web Crypto API.
 * Available in both service worker and extension page contexts.
 */
async function hashText(text) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Call Claude API with the given system prompt and user message.
 */
async function callClaude(systemPrompt, userMessage, maxTokens = 280) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text?.trim() ?? '';
}

/**
 * Get structured privacy intelligence for a domain, with policy change detection.
 * Caches per domain. Re-analyzes when policy text hash changes.
 *
 * @param {string}      domain        - e.g. "nytimes.com"
 * @param {string}      policyText    - raw policy text fetched from the site
 * @param {object|null} consentContext - { score, verdict } from content script dark pattern detection
 */
export async function getPrivacySummaryWithChangeDetection(domain, policyText, consentContext = null) {
  const trimmedText = policyText.slice(0, 4000);
  const newHash     = await hashText(trimmedText);
  const storedHash  = await getPolicyHash(domain);

  // Build consent context string to append to the prompt if available
  const consentNote = consentContext
    ? `\n\nAdditional context: This site's cookie consent banner scored ${consentContext.score}/100 for dark patterns (${consentContext.verdict}).`
    : '';

  try {
    // Case 1: No prior analysis — first-time fetch
    if (!storedHash) {
      const rawText  = await callClaude(SYSTEM_PROMPT, `Analyze this privacy policy excerpt and return strict JSON only:\n\n${trimmedText}${consentNote}`);
      const result   = parsePolicyIntelligence(rawText);
      result.policyChanged = false;

      await saveCachedSummary(domain, result);
      await savePolicyHash(domain, newHash);
      await savePolicySummaryText(domain, result.plainEnglishTakeaway);
      return result;
    }

    // Case 2: Policy unchanged — return cache
    if (newHash === storedHash) {
      const cached = await getCachedSummary(domain);
      if (cached && typeof cached === 'object') return { ...cached, policyChanged: false };
    }

    // Case 3: Policy changed — re-analyze with diff context
    const oldSummaryText = await getPolicySummaryText(domain) ?? 'Unknown previous policy.';
    const changePrompt   = `The privacy policy for this domain has changed.\n\nPrevious summary: "${oldSummaryText}"\n\nNew policy text:\n${trimmedText}${consentNote}\n\nAnalyze the new policy and describe what changed for the worse.`;
    const rawText        = await callClaude(CHANGE_SYSTEM_PROMPT, changePrompt, 320);
    const result         = parsePolicyIntelligence(rawText);
    result.policyChanged = true;

    await saveCachedSummary(domain, result);
    await savePolicyHash(domain, newHash);
    await savePolicySummaryText(domain, result.plainEnglishTakeaway);
    return result;

  } catch (err) {
    console.error('Priceless: Claude API call failed', err);
    // On failure, still return cached data if available
    const cached = await getCachedSummary(domain);
    return (cached && typeof cached === 'object') ? cached : getFallback();
  }
}

/**
 * Legacy wrapper — kept for backward compatibility with existing service worker calls.
 * Delegates to getPrivacySummaryWithChangeDetection without consent context.
 */
export async function getPrivacySummary(domain, policyText) {
  return getPrivacySummaryWithChangeDetection(domain, policyText, null);
}

/**
 * Attempt to fetch the privacy policy text for a given base URL.
 * Tries common privacy policy URL patterns in order.
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
        const html  = await res.text();
        const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length > 200) return plain;
      }
    } catch {
      // try next path
    }
  }
  return null;
}
