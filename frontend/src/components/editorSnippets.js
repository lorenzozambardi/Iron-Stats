/**
 * Immediate editor snippets for FoldableEditor:
 * 1. Typing "date" expands immediately to today's DD-MM-YYYY timestamp.
 * 2. Typing "eq" on a log line copies the previous microcycle line of the current exercise (if present).
 */

import { isDateLine, isDatesHeader } from '../parser';
import { isSetLine } from './customFoldService';

export function formatTodayDDMMYYYY(now = new Date()) {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Walks upward from currentLineIndex - 1 to find the previous microcycle set line
 * belonging to the same exercise block. Returns null if none exists.
 */
export function findPreviousMicrocycleLine(docLines, currentLineIndex) {
  if (!Array.isArray(docLines) || currentLineIndex <= 0) return null;

  for (let i = currentLineIndex - 1; i >= 0; i--) {
    const trimmed = String(docLines[i] || '').trim();
    if (!trimmed) continue; // Allow blank separators between blocks within an exercise
    if (trimmed.startsWith('#') || isDatesHeader(trimmed) || trimmed.toLowerCase().startsWith('override:')) {
      return null;
    }
    if (isDateLine(trimmed)) {
      return null;
    }
    if (isSetLine(trimmed)) {
      return trimmed;
    }
    // Hit an exercise header (e.g. "Lat Machine | 3' | ...") -> no prior microcycle for this exercise
    return null;
  }

  return null;
}

/**
 * Resolves immediate snippet expansion at the current cursor position.
 * Returns { replaceFromCol, replaceToCol, insert } or null.
 */
export function resolveImmediateSnippet({ lineText, cursorCol, docLines, lineIndex, now = new Date() }) {
  if (typeof lineText !== 'string' || cursorCol < 2) return null;

  const before = lineText.slice(0, cursorCol);
  const after = lineText.slice(cursorCol);

  // Do not expand inside the middle of a longer identifier
  if (/^[a-zA-Z0-9_]/.test(after)) return null;

  // Snippet 1: lowercase "date" at line start or after whitespace -> DD-MM-YYYY
  // Case-sensitive so typing "Dates:" (capital D) never triggers expansion.
  if (/(?:^|\s)date$/.test(before)) {
    return {
      replaceFromCol: cursorCol - 4,
      replaceToCol: cursorCol,
      insert: formatTodayDDMMYYYY(now),
    };
  }

  // Snippet 2: "eq" on an otherwise empty log line -> copy previous microcycle line if present
  if (/^\s*eq$/.test(before) && after.trim().length === 0) {
    const prev = findPreviousMicrocycleLine(docLines, lineIndex);
    if (!prev) return null;
    return {
      replaceFromCol: 0,
      replaceToCol: lineText.length,
      insert: prev,
    };
  }

  return null;
}
