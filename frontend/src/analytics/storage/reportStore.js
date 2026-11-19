/**
 * Offline report & run-checkpoint persistence.
 * - Native Android: Capacitor Filesystem Directory.Data/analytics/ (private sandbox, excluded from backups & PC Documents sync).
 * - Web Browser: IndexedDB (iron_stats_analytics_db).
 * - Node / fallback: in-memory Map.
 * Also supports opt-in Markdown export (Documents folder on native or download on web).
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { EvidenceLedger } from '../grounding/evidenceLedger.js';

const MAX_REPORTS = 20;
const DB_NAME = 'iron_stats_analytics_db';
const DB_VERSION = 1;
const STORE_REPORTS = 'reports';
const STORE_CHECKPOINTS = 'checkpoints';
const REPORTS_DIR = 'analytics/reports';
const CHECKPOINT_PATH = 'analytics/active_checkpoint.json';
const INDEX_PATH = 'analytics/index.json';

// In-memory fallback for Node tests or restricted environments
const memReports = new Map();
let memCheckpoint = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        db.createObjectStore(STORE_REPORTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
        db.createObjectStore(STORE_CHECKPOINTS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function ensureNativeDirs() {
  try {
    await Filesystem.mkdir({ path: REPORTS_DIR, directory: Directory.Data, recursive: true });
  } catch {
    // already exists
  }
}

function toIndexEntry(report) {
  return {
    id: report.id,
    generatedAt: report.generatedAt,
    datasetFingerprint: report.datasetFingerprint,
    depth: report.depth,
    model: report.model,
    headline: report.summary?.headline || 'Smart Analytics Report',
    insightCount: Array.isArray(report.insights) ? report.insights.length : 0,
    partial: Boolean(report.partial),
    dataQualityGrade: report.dataQuality?.grade || '—',
  };
}

export async function listReports() {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({ path: INDEX_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
      const arr = JSON.parse(res.data);
      return Array.isArray(arr) ? arr.sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || '')) : [];
    } catch {
      return [];
    }
  }
  const db = await openIDB();
  if (!db) {
    return Array.from(memReports.values())
      .map(toIndexEntry)
      .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const req = tx.objectStore(STORE_REPORTS).getAll();
    req.onsuccess = () => {
      const list = (req.result || []).map(toIndexEntry).sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getReport(id) {
  if (!id) return null;
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({ path: `${REPORTS_DIR}/${id}.json`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(res.data);
    } catch {
      return null;
    }
  }
  const db = await openIDB();
  if (!db) return memReports.get(id) || null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const req = tx.objectStore(STORE_REPORTS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getLatestReport() {
  const index = await listReports();
  if (index.length === 0) return null;
  return getReport(index[0].id);
}

export async function saveReport(report) {
  if (!report || !report.id) return;
  if (Capacitor.isNativePlatform()) {
    await ensureNativeDirs();
    await Filesystem.writeFile({
      path: `${REPORTS_DIR}/${report.id}.json`,
      data: JSON.stringify(report),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    const prev = await listReports();
    const filtered = [toIndexEntry(report), ...prev.filter((r) => r.id !== report.id)];
    const keep = filtered.slice(0, MAX_REPORTS);
    const evicted = filtered.slice(MAX_REPORTS);
    for (const old of evicted) {
      try {
        await Filesystem.deleteFile({ path: `${REPORTS_DIR}/${old.id}.json`, directory: Directory.Data });
      } catch {
        // ignore
      }
    }
    await Filesystem.writeFile({
      path: INDEX_PATH,
      data: JSON.stringify(keep),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return;
  }

  const db = await openIDB();
  if (!db) {
    memReports.set(report.id, report);
    if (memReports.size > MAX_REPORTS) {
      const sorted = Array.from(memReports.values()).sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
      for (const old of sorted.slice(MAX_REPORTS)) memReports.delete(old.id);
    }
    return;
  }

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    tx.objectStore(STORE_REPORTS).put(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Enforce MAX_REPORTS cap
  const all = await listReports();
  if (all.length > MAX_REPORTS) {
    const toDelete = all.slice(MAX_REPORTS);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_REPORTS, 'readwrite');
      const store = tx.objectStore(STORE_REPORTS);
      toDelete.forEach((item) => store.delete(item.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export async function deleteReport(id) {
  if (!id) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({ path: `${REPORTS_DIR}/${id}.json`, directory: Directory.Data });
    } catch {
      // ignore
    }
    const prev = await listReports();
    const next = prev.filter((r) => r.id !== id);
    await ensureNativeDirs();
    await Filesystem.writeFile({ path: INDEX_PATH, data: JSON.stringify(next), directory: Directory.Data, encoding: Encoding.UTF8 });
    return;
  }
  const db = await openIDB();
  if (!db) {
    memReports.delete(id);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    tx.objectStore(STORE_REPORTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllReports() {
  if (Capacitor.isNativePlatform()) {
    const all = await listReports();
    for (const r of all) {
      try {
        await Filesystem.deleteFile({ path: `${REPORTS_DIR}/${r.id}.json`, directory: Directory.Data });
      } catch {
        // ignore
      }
    }
    try {
      await Filesystem.deleteFile({ path: INDEX_PATH, directory: Directory.Data });
    } catch {
      // ignore
    }
    return;
  }
  const db = await openIDB();
  if (!db) {
    memReports.clear();
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    tx.objectStore(STORE_REPORTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Active Run Checkpoints ───────────────────────────────────────────────────

export async function saveCheckpoint(checkpoint) {
  if (!checkpoint) return;
  if (Capacitor.isNativePlatform()) {
    await ensureNativeDirs();
    await Filesystem.writeFile({
      path: CHECKPOINT_PATH,
      data: JSON.stringify(checkpoint),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return;
  }
  const db = await openIDB();
  if (!db) {
    memCheckpoint = checkpoint;
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
    tx.objectStore(STORE_CHECKPOINTS).put({ key: 'active', data: checkpoint });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadCheckpoint() {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({ path: CHECKPOINT_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(res.data);
    } catch {
      return null;
    }
  }
  const db = await openIDB();
  if (!db) return memCheckpoint;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, 'readonly');
    const req = tx.objectStore(STORE_CHECKPOINTS).get('active');
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearCheckpoint() {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({ path: CHECKPOINT_PATH, directory: Directory.Data });
    } catch {
      // ignore
    }
    return;
  }
  const db = await openIDB();
  if (!db) {
    memCheckpoint = null;
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKPOINTS, 'readwrite');
    tx.objectStore(STORE_CHECKPOINTS).delete('active');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Opt-in Markdown Export ───────────────────────────────────────────────────

export function formatReportAsMarkdown(report) {
  if (!report) return '';
  const ledger = EvidenceLedger.fromJSON({
    entries: Object.values(report.evidenceLedger || {}),
  });
  const fill = (s) => ledger.renderPlaceholders(s || '').text;
  const lines = [
    `# Iron Stats — Smart Analytics Report`,
    `Generated: ${report.generatedAt} | Model: ${report.model} | Depth: ${report.depth} | Data Quality: ${report.dataQuality?.grade || '—'}`,
    '',
    `## ${fill(report.summary?.headline)}`,
    '',
    '### Key Takeaways',
    ...(report.summary?.keyTakeaways || []).map((t) => `- ${fill(t)}`),
    '',
    '## Insights',
  ];

  for (const ins of report.insights || []) {
    lines.push(`### ${ins.title} [${ins.category} | confidence: ${ins.confidence}]`);
    lines.push(`**Finding:** ${fill(ins.finding)}`);
    lines.push('');
    lines.push(`**Interpretation:** ${fill(ins.interpretation)}`);
    if (ins.recommendation) {
      lines.push('');
      lines.push(`**Action:** ${fill(ins.recommendation.action)}`);
      if (ins.recommendation.rationale) lines.push(`*Rationale:* ${fill(ins.recommendation.rationale)}`);
      if (ins.recommendation.successMetric?.description) {
        lines.push(`*Success metric:* ${ins.recommendation.successMetric.description}`);
      }
    }
    lines.push(`*Evidence:* ${(ins.evidence || []).join(', ')}`);
    lines.push('');
  }

  if ((report.bottlenecks || []).length > 0) {
    lines.push('## Ranked Bottlenecks');
    for (const b of report.bottlenecks) {
      lines.push(`${b.rank}. **${b.title}** — ${fill(b.impact)} *Recommendation:* ${fill(b.recommendation)} (${(b.evidence || []).join(', ')})`);
    }
    lines.push('');
  }

  if ((report.rejectedHypotheses || []).length > 0) {
    lines.push('## Tested But Not Supported');
    for (const r of report.rejectedHypotheses) {
      lines.push(`- **${r.statement}**: ${fill(r.why)} (${(r.evidence || []).join(', ')})`);
    }
    lines.push('');
  }

  if ((report.limitations || []).length > 0) {
    lines.push('## Limitations & Caveats');
    for (const lim of report.limitations) lines.push(`- ${lim}`);
    lines.push('');
  }

  if (report.methodology) {
    const m = report.methodology;
    lines.push('---');
    lines.push(
      `*Methodology: ${m.toolCalls} tool calls, ${m.testsRun} statistical tests (BH-FDR ${m.fdrLevel}), ${m.promptTokens} prompt tokens (${m.cacheHitTokens} cached), est. cost $${m.estimatedCostUsd}.*`
    );
  }

  return lines.join('\n');
}

export async function exportReportMarkdown(report) {
  const md = formatReportAsMarkdown(report);
  const dateTag = (report.generatedAt || new Date().toISOString()).slice(0, 10);
  const filename = `IronStats_SmartAnalytics_${dateTag}.md`;

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: `Iron Stats/${filename}`,
      data: md,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return { exportedTo: `Documents/Iron Stats/${filename}` };
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { exportedTo: filename };
}
