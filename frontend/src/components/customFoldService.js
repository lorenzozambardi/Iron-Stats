import { foldService } from '@codemirror/language';
import { isDateLine, isDatesHeader } from '../parser';

export const isSetLine = (str) => {
  if (!str) return false;
  const trimmed = str.trim();
  if (isDateLine(trimmed)) return false;
  if (trimmed.includes('..')) return true;
  return /^(?:old\s+)?[\d().+/@,\s-]+$/i.test(trimmed);
};

export const customFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text.trim();
  if (!text) return null;

  // 1. Day / Markdown Header: starts with '#'
  if (text.startsWith('#')) {
    const match = text.match(/^(#+)/);
    const headerLevel = match ? match[1].length : 1;

    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      const nextTrim = nextLine.text.trim();

      if (nextTrim.startsWith('#')) {
        const nextMatch = nextTrim.match(/^(#+)/);
        const nextLevel = nextMatch ? nextMatch[1].length : 1;
        if (nextLevel <= headerLevel) {
          break;
        }
      }

      if (nextTrim.length > 0) {
        lastLine = nextLine;
      }
    }

    if (lastLine && lastLine.number > line.number) {
      return { from: line.to, to: lastLine.to };
    }
    return null;
  }

  // 2. Session Dates Block: "Dates:" followed by date lines
  if (isDatesHeader(text)) {
    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      const nextTrim = nextLine.text.trim();
      if (!nextTrim) continue;
      if (!isDateLine(nextTrim)) break;
      lastLine = nextLine;
    }
    if (lastLine && lastLine.number > line.number) {
      return { from: line.to, to: lastLine.to };
    }
    return null;
  }

  // 3. Exercise Header: not '#', not 'override:', not 'Dates:', not a date line, not a set line
  const isExerciseHeader =
    !text.startsWith('#') &&
    !text.toLowerCase().startsWith('override:') &&
    !isDatesHeader(text) &&
    !isDateLine(text) &&
    !isSetLine(text);

  if (isExerciseHeader) {
    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      const nextTrim = nextLine.text.trim();

      if (nextTrim.startsWith('#') || isDatesHeader(nextTrim)) break;

      if (
        nextTrim.length > 0 &&
        !nextTrim.toLowerCase().startsWith('override:') &&
        !isSetLine(nextTrim)
      ) {
        break;
      }

      if (nextTrim.length > 0) {
        lastLine = nextLine;
      }
    }

    if (lastLine && lastLine.number > line.number) {
      return { from: line.to, to: lastLine.to };
    }
    return null;
  }

  return null;
});
