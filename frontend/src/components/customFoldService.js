import { foldService } from '@codemirror/language';
import { isDateLine, isDatesHeader } from '../parser';

export const isSetLine = (str) => {
  if (!str) return false;
  const trimmed = str.split('--')[0].trim();
  if (isDateLine(trimmed) || trimmed.includes('|')) return false;
  const noOld = trimmed.replace(/(?:\b|(?<=^))old\s+/gi, '').trim();
  if (!noOld || !/\d/.test(noOld)) return false;
  if (/(?:^|\s)-?[\d.]+(?:\/-?[\d.]+)*\s*\.\./.test(noOld)) return true;
  if (/^-?[\d.]+\s*,\s*\d{2,4}[/-]\d{2}[/-]\d{2,4}$/.test(noOld)) return true;
  return /^[\d().+/@,\s]+$/.test(noOld);
};

const foldRangesCache = new WeakMap();

const computeFoldMap = (doc) => {
  const map = new Map();
  const headerStack = []; // { lineNum, lineTo, level, lastNonEmptyTo }
  let openDates = null; // { lineNum, lineTo, lastDateTo }
  let openExercise = null; // { lineNum, lineTo, lastSetTo }

  const closeHeadersAtOrAboveLevel = (minLevel) => {
    while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= minLevel) {
      const h = headerStack.pop();
      if (h.lastNonEmptyTo !== null) {
        map.set(h.lineNum, { from: h.lineTo, to: h.lastNonEmptyTo });
      }
    }
  };

  const closeOpenDates = () => {
    if (openDates) {
      if (openDates.lastDateTo !== null) {
        map.set(openDates.lineNum, { from: openDates.lineTo, to: openDates.lastDateTo });
      }
      openDates = null;
    }
  };

  const closeOpenExercise = () => {
    if (openExercise) {
      if (openExercise.lastSetTo !== null) {
        map.set(openExercise.lineNum, { from: openExercise.lineTo, to: openExercise.lastSetTo });
      }
      openExercise = null;
    }
  };

  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln);
    const text = line.text.trim();
    if (!text) continue;

    // 1. Check if an active Dates: block continues or closes
    if (openDates) {
      if (isDateLine(text)) {
        openDates.lastDateTo = line.to;
        for (let i = 0; i < headerStack.length; i++) {
          headerStack[i].lastNonEmptyTo = line.to;
        }
        continue;
      }
      closeOpenDates();
    }

    // 2. Markdown Header: starts with '#'
    if (text.startsWith('#')) {
      closeOpenExercise();
      const match = text.match(/^(#+)/);
      const headerLevel = match ? match[1].length : 1;
      closeHeadersAtOrAboveLevel(headerLevel);
      for (let i = 0; i < headerStack.length; i++) {
        headerStack[i].lastNonEmptyTo = line.to;
      }
      headerStack.push({ lineNum: ln, lineTo: line.to, level: headerLevel, lastNonEmptyTo: null });
      continue;
    }

    // Update lastNonEmptyTo for all enclosing headers
    for (let i = 0; i < headerStack.length; i++) {
      headerStack[i].lastNonEmptyTo = line.to;
    }

    // 3. Session Dates Block: "Dates:"
    if (isDatesHeader(text)) {
      closeOpenExercise();
      openDates = { lineNum: ln, lineTo: line.to, lastDateTo: null };
      continue;
    }

    // 4. Override or Set line vs Exercise Header
    const lower = text.toLowerCase();
    const isOverride = lower.startsWith('override:');
    if (isOverride) {
      closeOpenExercise();
      continue;
    }

    if (isSetLine(text)) {
      if (openExercise) {
        openExercise.lastSetTo = line.to;
      }
      continue;
    }

    // 5. Exercise Header (not '#', not 'override:', not 'Dates:', not a date line, not a set line)
    if (!isDateLine(text)) {
      closeOpenExercise();
      openExercise = { lineNum: ln, lineTo: line.to, lastSetTo: null };
    } else {
      closeOpenExercise();
    }
  }

  closeOpenDates();
  closeOpenExercise();
  closeHeadersAtOrAboveLevel(0);

  return map;
};

export const customFoldService = foldService.of((state, lineStart) => {
  let map = foldRangesCache.get(state.doc);
  if (!map) {
    map = computeFoldMap(state.doc);
    foldRangesCache.set(state.doc, map);
  }
  const line = state.doc.lineAt(lineStart);
  return map.get(line.number) || null;
});
