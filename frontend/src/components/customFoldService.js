import { foldService } from '@codemirror/language';

export const isSetLine = (str) => {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.includes('..')) return true;
  return /^(?:old\s+)?[\d().+/@\s-]+$/i.test(trimmed);
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

  // 2. Exercise Header: not '#', not 'override:', not a set line
  const isExerciseHeader =
    !text.startsWith('#') &&
    !text.toLowerCase().startsWith('override:') &&
    !isSetLine(text);

  if (isExerciseHeader) {
    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      const nextTrim = nextLine.text.trim();

      if (nextTrim.startsWith('#')) break;

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
