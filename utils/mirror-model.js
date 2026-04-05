// utils/mirror-model.js
// ONNX-based audience segment classifier (The Mirror feature).
// Replaces the keyword-matching profile-engine with proper ML inference.
//
// Call classifyBrowsingHistory() from the dashboard/popup context.
// The preprocessing replicates the Python pipeline from train_mirror.py exactly.

import * as ort from 'onnxruntime-web/wasm';

let session    = null;
let vocabulary = null;  // token → index map
let lsaMatrix  = null;  // Float32Array, shape [64, 5000] stored row-major
let thresholds = null;  // { segments: [...], thresholds: { segment: float } }
let lsaDims    = 0;
let vocabSize  = 0;

ort.env.wasm.wasmPaths = {
  'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('ort-wasm-simd-threaded.wasm'),
};
ort.env.wasm.numThreads = 1;

async function loadArtefacts() {
  const [vocabRes, lsaRes, threshRes] = await Promise.all([
    fetch(chrome.runtime.getURL('data/mirror_vocab.json')),
    fetch(chrome.runtime.getURL('data/mirror_lsa.json')),
    fetch(chrome.runtime.getURL('data/mirror_thresholds.json')),
  ]);
  const vocabData   = await vocabRes.json();
  const lsaData     = await lsaRes.json();
  thresholds        = await threshRes.json();

  vocabulary = vocabData.vocabulary;      // { token: index }
  lsaDims    = lsaData.n_components;      // 64
  vocabSize  = lsaData.vocab_size;        // 5000
  lsaMatrix  = new Float32Array(lsaData.data); // flat [64 * 5000]
}

async function getSession() {
  if (session) return session;
  if (!vocabulary) await loadArtefacts();
  const modelUrl = chrome.runtime.getURL('data/mirror.onnx');
  session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
  return session;
}

// Stop tokens must match train_mirror.py exactly
const STOP_TOKENS = new Set([
  'www','com','org','net','html','htm','php','asp',
  'the','a','an','and','or','of','in','to','for',
  'index','page','http','https','','2024','2025','2026',
]);

function tokenizeUrl(url) {
  let path = url.toLowerCase();
  // Strip protocol + domain
  path = path.replace(/^https?:\/\/[^/]+/, '');
  // Split on non-alphanumeric, filter stop tokens, cap at 20
  return path
    .split(/[^a-z0-9]+/)
    .filter(t => t && t.length > 1 && !STOP_TOKENS.has(t))
    .slice(0, 20);
}

/**
 * Project a URL to a 64-dim LSA feature vector.
 * Replicates: CountVectorizer → TruncatedSVD from train_mirror.py
 */
function urlToLsaVector(url) {
  const tokens = tokenizeUrl(url);

  // Build sparse BoW vector
  const bow = new Float32Array(vocabSize);
  for (const t of tokens) {
    const idx = vocabulary[t];
    if (idx !== undefined) bow[idx] += 1.0;
  }

  // Matrix multiply: LSA (64 × 5000) @ bow (5000,) = result (64,)
  const result = new Float32Array(lsaDims);
  for (let i = 0; i < lsaDims; i++) {
    let sum = 0;
    const rowOffset = i * vocabSize;
    for (let j = 0; j < vocabSize; j++) {
      if (bow[j] !== 0) sum += lsaMatrix[rowOffset + j] * bow[j];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * Classify a user's browsing history into IAB audience segments.
 * Replaces buildBehaviorProfile() in profile-engine.js.
 *
 * @param {Array<{ parentSite: string }>} events - monthly tracker events
 * @returns {Promise<Array<{ label: string, confidence: number, evidence: string[] }>>}
 */
export async function classifyBrowsingHistory(events) {
  try {
    if (!vocabulary) await loadArtefacts();
    const sess = await getSession();

    // Aggregate URLs from events — use parentSite as a URL proxy
    const siteVisits = {};
    for (const e of events) {
      const site = e.parentSite;
      if (!site) continue;
      siteVisits[site] = (siteVisits[site] || 0) + 1;
    }

    if (Object.keys(siteVisits).length === 0) return fallbackProfile();

    const SEGMENTS   = thresholds.segments;
    const THRESHOLDS = thresholds.thresholds;

    // Accumulate weighted LSA vectors across all visited sites
    const accum   = new Float32Array(lsaDims);
    const siteMax = Math.max(...Object.values(siteVisits));

    for (const [site, count] of Object.entries(siteVisits)) {
      const vec    = urlToLsaVector(`https://${site}`);
      const weight = count / siteMax; // normalise by visit frequency
      for (let i = 0; i < lsaDims; i++) accum[i] += vec[i] * weight;
    }

    // Run ONNX inference
    const tensor  = new ort.Tensor('float32', accum, [1, lsaDims]);
    const results = await sess.run({ features: tensor });
    const probs   = results['segment_probabilities'].data; // Float32Array [8]

    // Build scored results using per-segment thresholds
    const scored = SEGMENTS
      .map((label, i) => ({
        label,
        prob:       parseFloat(probs[i]),
        threshold:  THRESHOLDS[label] ?? 0.5,
        evidence:   findEvidenceSites(label, siteVisits),
      }))
      .sort((a, b) => b.prob - a.prob);

    // Return top 4 segments that exceed their threshold, or top 4 by score if none qualify
    const qualified = scored.filter(s => s.prob >= s.threshold).slice(0, 4);
    const results4  = qualified.length > 0 ? qualified : scored.slice(0, 4);

    return results4.map(s => ({
      label:      s.label,
      confidence: Math.round(Math.min(95, Math.max(55, s.prob * 100))),
      evidence:   s.evidence,
    }));
  } catch (err) {
    console.warn('Priceless: mirror model inference failed, using keyword fallback', err.message);
    return null; // profile-engine.js will fall back to keyword matching
  }
}

/**
 * Find up to 3 sites in the user's history that are evidence for a given segment.
 * Uses the same keyword signals as the original profile-engine.js for interpretability.
 */
const SEGMENT_KEYWORDS = {
  'Parent':                ['baby', 'parent', 'kids', 'school', 'family', 'toddler', 'child'],
  'Homeowner':             ['zillow', 'realestate', 'mortgage', 'home', 'rent', 'apartment', 'property'],
  'Luxury Auto Intender':  ['bmw', 'mercedes', 'audi', 'tesla', 'car', 'auto', 'vehicle'],
  'Health Conscious':      ['fitness', 'health', 'nutrition', 'gym', 'wellness', 'diet', 'workout'],
  'Investor':              ['stocks', 'crypto', 'invest', 'finance', 'trading', 'market', 'portfolio'],
  'Traveler':              ['flight', 'hotel', 'booking', 'airbnb', 'travel', 'expedia', 'trip'],
  'News Reader':           ['cnn', 'bbc', 'news', 'nytimes', 'reuters', 'times', 'herald'],
  'Tech Enthusiast':       ['tech', 'github', 'verge', 'wired', 'android', 'apple', 'dev'],
};

function findEvidenceSites(segmentLabel, siteVisits) {
  const keywords = SEGMENT_KEYWORDS[segmentLabel] || [];
  return Object.keys(siteVisits)
    .filter(site => keywords.some(kw => site.toLowerCase().includes(kw)))
    .slice(0, 3);
}

function fallbackProfile() {
  return [{
    label:      'General Web User',
    confidence: 60,
    evidence:   ['Browsing history still too sparse'],
  }];
}
