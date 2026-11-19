/**
 * Evidence Ledger: tracks every tool call result by ID (E1, E2, ...),
 * manages hypothesis pre-registration (H1, H2, ...), tracks session-wide
 * multiple testing (BH-FDR), and resolves {{E#.path|decimals}} placeholders.
 */

import { benjaminiHochberg } from '../stats/multiplicity.js';
import { hashString } from '../dataset/fingerprint.js';

function canonicalArgs(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalArgs).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalArgs(obj[k])}`).join(',')}}`;
}

export function extractByPath(obj, pathStr) {
  if (obj === null || obj === undefined || !pathStr) return undefined;
  const parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function formatLedgerValue(val, decimals = null) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '—';
    if (decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 6) {
      return val.toFixed(decimals);
    }
    if (Number.isInteger(val)) return String(val);
    const abs = Math.abs(val);
    if (abs >= 100) return val.toFixed(1);
    if (abs >= 1) return val.toFixed(2);
    return val.toFixed(3);
  }
  return String(val);
}

export const PLACEHOLDER_REGEX = /\{\{(E\d+)\.([a-zA-Z0-9_.[\]]+)(?:\|(\d))?\}\}/g;

export class EvidenceLedger {
  constructor(fdrLevel = 0.1) {
    this.fdrLevel = fdrLevel;
    this.entries = [];
    this.byId = new Map();
    this.bySignature = new Map();
    this.hypotheses = [];
    this.hypothesisById = new Map();
    this.tests = []; // { evidenceId, label, pValue }
  }

  getSignature(toolName, args) {
    return `${toolName}:${hashString(canonicalArgs(args || {}))}`;
  }

  findDuplicate(toolName, args) {
    const sig = this.getSignature(toolName, args);
    const id = this.bySignature.get(sig);
    return id ? this.byId.get(id) : null;
  }

  record({ toolName, args, data, summaryLine, n = null, qualityFlags = [], rpeDependent = false, dateAligned = false }) {
    const id = `E${this.entries.length + 1}`;
    const sig = this.getSignature(toolName, args);
    const entry = {
      id,
      toolName,
      args: args || {},
      data: data || {},
      summaryLine: summaryLine || `${id}: ${toolName}`,
      n,
      qualityFlags: Array.isArray(qualityFlags) ? qualityFlags : [],
      rpeDependent: Boolean(rpeDependent),
      dateAligned: Boolean(dateAligned),
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    this.byId.set(id, entry);
    if (!this.bySignature.has(sig)) {
      this.bySignature.set(sig, id);
    }
    return entry;
  }

  registerHypothesis({ statement, rationale = '', plannedTest = '' }) {
    const id = `H${this.hypotheses.length + 1}`;
    const hyp = {
      id,
      statement: String(statement || '').trim(),
      rationale: String(rationale || '').trim(),
      plannedTest: String(plannedTest || '').trim(),
      status: 'registered',
      evidenceIds: [],
    };
    this.hypotheses.push(hyp);
    this.hypothesisById.set(id, hyp);
    return hyp;
  }

  linkHypothesis(hypothesisId, evidenceId, status = 'tested') {
    const hyp = this.hypothesisById.get(hypothesisId);
    if (!hyp) return;
    if (!hyp.evidenceIds.includes(evidenceId)) hyp.evidenceIds.push(evidenceId);
    hyp.status = status;
  }

  recordTests(testRecords) {
    for (const rec of testRecords) {
      if (rec && Number.isFinite(Number(rec.pValue))) {
        this.tests.push({
          evidenceId: rec.evidenceId,
          label: rec.label || '',
          pValue: Number(rec.pValue),
        });
      }
    }
    return this.recomputeSessionFDR();
  }

  recomputeSessionFDR() {
    if (this.tests.length === 0) return { qValues: [], rejected: [], m: 0, fdr: this.fdrLevel };
    const bh = benjaminiHochberg(
      this.tests.map((t) => t.pValue),
      { fdr: this.fdrLevel }
    );
    for (let i = 0; i < this.tests.length; i++) {
      this.tests[i].sessionQValue = bh.qValues[i];
      this.tests[i].sessionRejected = bh.rejected[i];
    }
    // Propagate sessionQValue onto ledger entries that represent single tests
    for (const t of this.tests) {
      const entry = this.byId.get(t.evidenceId);
      if (entry && entry.toolName === 'test_relationship') {
        entry.data.sessionQValue = t.sessionQValue;
        entry.data.sessionTestsTotal = this.tests.length;
        entry.data.sessionSignificant = t.sessionRejected;
      }
    }
    return bh;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  resolveRef(evidenceId, fieldPath) {
    const entry = this.byId.get(evidenceId);
    if (!entry) return { found: false, value: undefined, entry: null };
    const val = extractByPath(entry.data, fieldPath);
    return { found: val !== undefined, value: val, entry };
  }

  renderPlaceholders(text) {
    if (typeof text !== 'string') return { text: '', tokens: [] };
    const tokens = [];
    const rendered = text.replace(PLACEHOLDER_REGEX, (raw, evidenceId, fieldPath, decStr) => {
      const decimals = decStr !== undefined ? parseInt(decStr, 10) : null;
      const { found, value } = this.resolveRef(evidenceId, fieldPath);
      const formatted = found ? formatLedgerValue(value, decimals) : raw;
      tokens.push({
        raw,
        evidenceId,
        fieldPath,
        decimals,
        value,
        formatted,
        valid: found && value !== null && value !== undefined,
      });
      return formatted;
    });
    return { text: rendered, tokens };
  }

  collectCitedNumbers(evidenceIds) {
    const nums = new Set();
    const visit = (val, depth = 0) => {
      if (depth > 5 || val === null || val === undefined) return;
      if (typeof val === 'number' && Number.isFinite(val)) {
        nums.add(val);
        nums.add(Math.abs(val));
        // Also allow percentage form of ratios (0..1)
        if (Math.abs(val) <= 1) {
          nums.add(val * 100);
          nums.add(Math.abs(val) * 100);
        }
        return;
      }
      if (Array.isArray(val)) {
        for (let i = 0; i < Math.min(val.length, 60); i++) visit(val[i], depth + 1);
      } else if (typeof val === 'object') {
        for (const k of Object.keys(val)) visit(val[k], depth + 1);
      }
    };
    for (const id of evidenceIds || []) {
      const entry = this.byId.get(id);
      if (entry) visit(entry.data, 0);
    }
    return Array.from(nums);
  }

  exportSubset(evidenceIds) {
    const idSet = new Set(evidenceIds || []);
    const subset = {};
    for (const entry of this.entries) {
      if (idSet.has(entry.id)) {
        subset[entry.id] = entry;
      }
    }
    return subset;
  }

  toJSON() {
    return {
      fdrLevel: this.fdrLevel,
      entries: this.entries,
      hypotheses: this.hypotheses,
      tests: this.tests,
    };
  }

  static fromJSON(json) {
    const ledger = new EvidenceLedger(json?.fdrLevel ?? 0.1);
    if (Array.isArray(json?.entries)) {
      for (const entry of json.entries) {
        ledger.entries.push(entry);
        ledger.byId.set(entry.id, entry);
        ledger.bySignature.set(ledger.getSignature(entry.toolName, entry.args), entry.id);
      }
    }
    if (Array.isArray(json?.hypotheses)) {
      for (const hyp of json.hypotheses) {
        ledger.hypotheses.push(hyp);
        ledger.hypothesisById.set(hyp.id, hyp);
      }
    }
    if (Array.isArray(json?.tests)) {
      ledger.tests = json.tests.slice();
    }
    return ledger;
  }
}
