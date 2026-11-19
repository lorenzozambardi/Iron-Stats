/**
 * Compact tool result serialization with downsampling and strict token/char budget.
 */

export const DEFAULT_OUTPUT_CHAR_BUDGET = 4600; // ~1150 tokens

export function roundNum(val, decimals = 3) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  const f = 10 ** decimals;
  return Math.round(val * f) / f;
}

export function downsampleArray(arr, maxPoints = 32) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) {
    return { items: arr || [], downsampled: false, originalLength: (arr || []).length };
  }
  const out = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return { items: out, downsampled: true, originalLength: arr.length };
}

function roundDeep(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') return roundNum(obj, 4);
  if (Array.isArray(obj)) return obj.map((v) => roundDeep(v, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = roundDeep(v, depth + 1);
    }
    return out;
  }
  return obj;
}

export function formatToolResponse(payload, { maxChars = DEFAULT_OUTPUT_CHAR_BUDGET, hint = 'Narrow scope (program, exercise, or grain) for full resolution.' } = {}) {
  const clean = roundDeep(payload);
  let serialized = JSON.stringify(clean);
  if (serialized.length <= maxChars) {
    return { text: serialized, truncated: false };
  }

  // First try trimming large array fields inside clean
  const trimmed = structuredClone(clean);
  for (const key of ['series', 'points', 'items', 'sets', 'candidates', 'bottlenecks', 'distribution']) {
    if (Array.isArray(trimmed[key]) && trimmed[key].length > 12) {
      const targetLen = Math.max(8, Math.floor(trimmed[key].length / 2));
      trimmed[key] = downsampleArray(trimmed[key], targetLen).items;
      trimmed.truncated = true;
      trimmed.truncationHint = hint;
    }
  }
  serialized = JSON.stringify(trimmed);
  if (serialized.length <= maxChars) {
    return { text: serialized, truncated: true };
  }

  // Hard cap: drop verbose arrays and keep summary fields
  const minimal = {
    evidenceId: trimmed.evidenceId,
    status: trimmed.status || 'ok',
    truncated: true,
    truncationHint: hint,
    n: trimmed.n,
    summary: trimmed.summary || trimmed.summaryLine || 'Output exceeded budget; narrow query scope.',
  };
  for (const scalarKey of ['slope', 'intercept', 'r', 'rho', 'pValue', 'sessionQValue', 'ciLower', 'ciUpper', 'hedgesG', 'diff', 'pctDiff', 'value']) {
    if (trimmed[scalarKey] !== undefined) minimal[scalarKey] = trimmed[scalarKey];
  }
  return { text: JSON.stringify(minimal), truncated: true };
}
