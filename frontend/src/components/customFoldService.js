import { foldService } from '@codemirror/language';

export const customFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text.trim();

  const isSetLine = (str) => {
    if (!str) return false;
    return str.includes('..') || /^[old\s]*[\d().+/@\s]+$/i.test(str);
  };

  // 1. Day header starting with # (e.g. # 1, # 2, # Leg Day)
  if (text.startsWith('#')) {
    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      if (nextLine.text.trim().startsWith('#')) {
        break;
      }
      if (nextLine.text.trim().length > 0) {
        lastLine = nextLine;
      }
    }
    if (lastLine && lastLine.number > line.number) {
      return { from: line.to, to: lastLine.to };
    }
    return null;
  }

  // 2. Exercise header line (e.g. Lat Machine | 3' | last half reps)
  const isExerciseHeader =
    text.length > 0 &&
    !text.startsWith('#') &&
    !text.toLowerCase().startsWith('override:') &&
    !isSetLine(text);

  if (isExerciseHeader) {
    let lastLine = null;
    for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
      const nextLine = state.doc.line(ln);
      const nextTrim = nextLine.text.trim();
      if (nextTrim.startsWith('#')) break;
      if (nextTrim.length > 0 && !isSetLine(nextTrim) && !nextTrim.toLowerCase().startsWith('override:')) {
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
