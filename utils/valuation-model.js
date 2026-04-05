// utils/valuation-model.js
// ONNX-based per-impression CPM valuation model.
// Replaces the static tracker-values.json lookup with live inference.
//
// The model outputs [cpm_low, cpm_high] — a confidence interval in dollars per impression.
// Call predictValue() from the service worker only.

import * as ort from 'onnxruntime-web/wasm';

let session = null;
let scaler  = null;
let catMeta = null;

// Configure WASM path once at module load — must happen before any InferenceSession.create()
ort.env.wasm.wasmPaths = {
  'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('ort-wasm-simd-threaded.wasm'),
};
ort.env.wasm.numThreads = 1; // disable SharedArrayBuffer threading for MV3 service worker

async function loadArtefacts() {
  const [scalerRes, catsRes] = await Promise.all([
    fetch(chrome.runtime.getURL('data/valuation_scaler.json')),
    fetch(chrome.runtime.getURL('data/valuation_categories.json')),
  ]);
  scaler  = await scalerRes.json();
  catMeta = await catsRes.json();
}

async function getSession() {
  if (session) return session;
  if (!scaler) await loadArtefacts();
  const modelUrl = chrome.runtime.getURL('data/valuation.onnx');
  session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
  return session;
}

/**
 * MinMaxScaler transform — replicates sklearn's fitted scaler using saved params.
 * @param {number[]} values - raw numeric values in order: [tracker_density, ad_net, data_broker, analytics, social]
 * @returns {number[]} - scaled values clipped to [0, 1]
 */
function minMaxScale(values) {
  return values.map((v, i) => {
    const scaled = (v - scaler.data_min_[i]) / (scaler.data_max_[i] - scaler.data_min_[i] + 1e-8);
    return Math.max(0, Math.min(1, scaled));
  });
}

/**
 * Predict CPM confidence interval for a single tracker impression.
 *
 * @param {{
 *   pageCategory: string,       e.g. 'finance', 'news', 'entertainment', 'other', ...
 *   trackerDensity: number,     raw tracker count for the page (not pre-normalised)
 *   hourOfDay: number,          0–23
 *   isMobile: boolean,
 *   hasGeoSignal: boolean,
 *   adNetworkCount: number,
 *   dataBrokerCount: number,
 *   analyticsCount: number,
 *   socialPixelCount: number,
 * }} features
 * @returns {Promise<{ low: number, high: number, mid: number }>}
 */
export async function predictValue(features) {
  try {
    const sess = await getSession();

    const {
      pageCategory, trackerDensity, hourOfDay, isMobile, hasGeoSignal,
      adNetworkCount, dataBrokerCount, analyticsCount, socialPixelCount,
    } = features;

    // One-hot encode page_category (must match training order)
    const PAGE_CATEGORIES = catMeta.page_categories; // sorted alphabetically
    const ohe = PAGE_CATEGORIES.map(c => c === pageCategory ? 1.0 : 0.0);

    // Cyclical hour encoding
    const angle   = (2 * Math.PI * hourOfDay) / 24;
    const hourSin = Math.sin(angle);
    const hourCos = Math.cos(angle);

    // Scale numeric features
    const clippedDensity = Math.min(trackerDensity, 30) / 30;
    const scaled = minMaxScale([
      clippedDensity, adNetworkCount, dataBrokerCount, analyticsCount, socialPixelCount,
    ]);

    // Assemble feature vector (17 floats) — order must match FEATURE_COLS in train_valuation.py
    const featureVec = Float32Array.from([
      ...ohe,
      hourSin, hourCos,
      isMobile ? 1.0 : 0.0,
      hasGeoSignal ? 1.0 : 0.0,
      ...scaled,
    ]);

    const tensor = new ort.Tensor('float32', featureVec, [1, featureVec.length]);
    const results = await sess.run({ features: tensor });
    const output  = results['cpm_range'].data; // Float32Array [low, high]

    let low  = Math.max(0, output[0]);
    let high = Math.max(0, output[1]);
    if (low > high) [low, high] = [high, low];

    return { low, high, mid: (low + high) / 2 };
  } catch (err) {
    // Fall back to static lookup on any inference failure
    console.warn('Priceless: valuation model inference failed, using fallback', err.message);
    return null; // caller handles null by falling back to getTrackerValue()
  }
}
