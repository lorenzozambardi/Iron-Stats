import { isDateLine, isDatesHeader } from '../parser';
import { isSetLine } from './customFoldService';
import { isWeekInRange } from './helpers';

const isSessionHeader = (trimmed) => /^#(?!#)/.test(trimmed);

const parseSessionNumber = (trimmed, prevSessionNum) => {
  const match = trimmed.match(/\d+/);
  return match ? parseInt(match[0], 10) : prevSessionNum + 1;
};

/**
 * Parse a logbook markdown string into preamble + structured session blocks.
 * Preserves exact raw lines and line indices for lossless filtering and merging.
 */
export function parseLogbookSessions(text) {
  const lines = (text || '').split('\n');
  const preambleLines = [];
  const sessions = [];
  let currentSession = null;
  let currentExercise = null;
  let inDatesBlock = false;
  let lastSessionNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (isSessionHeader(trimmed)) {
      if (currentSession) {
        currentSession.endLine = i;
      }
      const sessionNum = parseSessionNumber(trimmed, lastSessionNum);
      lastSessionNum = sessionNum;
      currentSession = {
        sessionNum,
        headerLine: raw,
        startLine: i,
        endLine: lines.length,
        datesBlock: null,
        items: [], // { type: 'dates' } | { type: 'exercise', headerLine, headerLineIdx, setLines: [{ lineIdx, text }] } | { type: 'other', lineIdx, text }
      };
      sessions.push(currentSession);
      currentExercise = null;
      inDatesBlock = false;
      continue;
    }

    if (!currentSession) {
      preambleLines.push(raw);
      continue;
    }

    if (!trimmed) {
      currentSession.items.push({ type: 'blank', lineIdx: i, text: raw });
      continue;
    }

    if (isDatesHeader(trimmed)) {
      inDatesBlock = true;
      currentExercise = null;
      if (!currentSession.datesBlock) {
        currentSession.datesBlock = { headerLineIdx: i, headerLine: raw, dateLines: [] };
        currentSession.items.push({ type: 'dates' });
      }
      continue;
    }

    if (inDatesBlock) {
      if (isDateLine(trimmed)) {
        currentSession.datesBlock.dateLines.push({ lineIdx: i, text: raw });
        continue;
      }
      inDatesBlock = false;
    }

    const lower = trimmed.toLowerCase();
    if (
      trimmed.startsWith('#') ||
      lower.startsWith('override:') ||
      trimmed.startsWith('>') ||
      /^(?:[-*_]\s*){3,}$/.test(trimmed) ||
      /^[-*+]\s+/.test(trimmed)
    ) {
      currentExercise = null;
      currentSession.items.push({ type: 'other', lineIdx: i, text: raw });
      continue;
    }

    if (isSetLine(trimmed)) {
      if (currentExercise) {
        currentExercise.setLines.push({ lineIdx: i, text: raw });
      } else {
        currentSession.items.push({ type: 'other', lineIdx: i, text: raw });
      }
      continue;
    }

    if (isDateLine(trimmed)) {
      currentExercise = null;
      currentSession.items.push({ type: 'other', lineIdx: i, text: raw });
      continue;
    }

    currentExercise = {
      type: 'exercise',
      headerLineIdx: i,
      headerLine: raw,
      setLines: [],
    };
    currentSession.items.push(currentExercise);
  }

  return { lines, preambleLines, sessions };
}

/**
 * Extract available session numbers and microcycle numbers from raw logbook text.
 */
export function getLogbookFilterMeta(text) {
  const { sessions } = parseLogbookSessions(text);
  const sessionNums = Array.from(new Set(sessions.map(s => s.sessionNum))).sort((a, b) => a - b);

  const getWeeksForSession = (sessionVal) => {
    const targetSessions = sessionVal === 'all'
      ? sessions
      : sessions.filter(s => s.sessionNum === Number(sessionVal));
    let maxWeeks = 0;
    for (const s of targetSessions) {
      for (const item of s.items) {
        if (item.type === 'exercise' && item.setLines.length > maxWeeks) {
          maxWeeks = item.setLines.length;
        }
      }
      if (s.datesBlock && s.datesBlock.dateLines.length > maxWeeks) {
        maxWeeks = s.datesBlock.dateLines.length;
      }
    }
    const weeks = [];
    for (let w = 1; w <= maxWeeks; w++) weeks.push(w);
    return weeks;
  };

  return { sessions: sessionNums, getWeeksForSession };
}

/**
 * Filter logbook text by session and/or microcycle range.
 * Returns { text, lineMap, isFiltered } where lineMap[filteredIdx] = originalIdx.
 */
export function filterLogbookText(fullText, { session = 'all', weekFrom = 'all', weekTo = 'all' } = {}) {
  const hasSessionFilter = session !== 'all';
  const hasWeekFilter = weekFrom !== 'all' || weekTo !== 'all';
  if (!hasSessionFilter && !hasWeekFilter) {
    return { text: fullText, lineMap: null, isFiltered: false };
  }

  const { lines, sessions } = parseLogbookSessions(fullText);
  const matchingSessions = hasSessionFilter
    ? sessions.filter(s => s.sessionNum === Number(session))
    : sessions;

  if (!hasWeekFilter && hasSessionFilter) {
    const target = matchingSessions[0];
    if (!target) return { text: '', lineMap: [], isFiltered: true };
    let contentEnd = target.endLine;
    while (contentEnd > target.startLine + 1 && lines[contentEnd - 1].trim() === '') {
      contentEnd--;
    }
    const outLines = [];
    const lineMap = [];
    for (let i = target.startLine; i < contentEnd; i++) {
      outLines.push(lines[i]);
      lineMap.push(i);
    }
    return { text: outLines.join('\n'), lineMap, isFiltered: true };
  }

  const outLines = [];
  const lineMap = [];
  const pushLine = (str, origIdx = null) => {
    outLines.push(str);
    lineMap.push(origIdx);
  };

  matchingSessions.forEach((sess, sessIdx) => {
    if (sessIdx > 0) {
      pushLine('', null);
    }
    pushLine(sess.headerLine, sess.startLine);

    if (sess.datesBlock) {
      const filteredDates = sess.datesBlock.dateLines.filter((_, idx) =>
        isWeekInRange(idx + 1, weekFrom, weekTo)
      );
      if (filteredDates.length > 0) {
        pushLine(sess.datesBlock.headerLine, sess.datesBlock.headerLineIdx);
        for (const d of filteredDates) {
          pushLine(d.text, d.lineIdx);
        }
      }
    }

    const hasVisibleDates = Boolean(
      sess.datesBlock &&
      sess.datesBlock.dateLines.some((_, idx) => isWeekInRange(idx + 1, weekFrom, weekTo))
    );
    let hasEmittedContent = hasVisibleDates;
    for (const item of sess.items) {
      if (item.type === 'exercise') {
        if (hasEmittedContent) {
          pushLine('', null);
        }
        pushLine(item.headerLine, item.headerLineIdx);
        item.setLines.forEach((sl, idx) => {
          if (isWeekInRange(idx + 1, weekFrom, weekTo)) {
            pushLine(sl.text, sl.lineIdx);
          }
        });
        hasEmittedContent = true;
      } else if (item.type === 'other') {
        if (hasEmittedContent) {
          pushLine('', null);
        }
        pushLine(item.text, item.lineIdx);
        hasEmittedContent = true;
      }
    }
  });

  return { text: outLines.join('\n'), lineMap, isFiltered: true };
}

const spliceRange = (origList, editedList, weekFrom, weekTo) => {
  const fromIdx = weekFrom === 'all' ? 0 : Math.max(0, parseInt(weekFrom, 10) - 1);
  const toIdx = weekTo === 'all' ? origList.length - 1 : parseInt(weekTo, 10) - 1;
  const before = origList.slice(0, fromIdx);
  const after = toIdx + 1 < origList.length ? origList.slice(toIdx + 1) : [];
  return [...before, ...editedList, ...after];
};

const serializeSession = (sess, { preserveRawIfUntouched = false, lines = null } = {}) => {
  if (preserveRawIfUntouched && lines) {
    let end = sess.endLine;
    while (end > sess.startLine + 1 && lines[end - 1].trim() === '') {
      end--;
    }
    return lines.slice(sess.startLine, end).join('\n');
  }

  const out = [sess.headerLine];
  let lastWasBlank = false;
  for (const item of sess.items) {
    if (item.type === 'blank') {
      if (!lastWasBlank) {
        out.push('');
        lastWasBlank = true;
      }
    } else if (item.type === 'dates') {
      if (sess.datesBlock && sess.datesBlock.dateLines.length > 0) {
        out.push(sess.datesBlock.headerLine);
        for (const d of sess.datesBlock.dateLines) {
          out.push(d.text);
        }
        lastWasBlank = false;
      }
    } else if (item.type === 'exercise') {
      out.push(item.headerLine);
      for (const s of item.setLines) {
        out.push(s.text);
      }
      lastWasBlank = false;
    } else if (item.type === 'other') {
      out.push(item.text);
      lastWasBlank = false;
    }
  }
  while (out.length > 1 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return out.join('\n');
};

/**
 * Merge edits made in a filtered slice back into the full logbook text.
 */
export function mergeFilteredLogbook(fullText, editedSlice, { session = 'all', weekFrom = 'all', weekTo = 'all' } = {}) {
  const hasSessionFilter = session !== 'all';
  const hasWeekFilter = weekFrom !== 'all' || weekTo !== 'all';
  if (!hasSessionFilter && !hasWeekFilter) {
    return editedSlice;
  }

  const { lines, preambleLines, sessions } = parseLogbookSessions(fullText);

  // Case 1: Session-only filter — exact line-range splice
  if (hasSessionFilter && !hasWeekFilter) {
    const target = sessions.find(s => s.sessionNum === Number(session));
    if (!target) return fullText;
    let contentEnd = target.endLine;
    while (contentEnd > target.startLine + 1 && lines[contentEnd - 1].trim() === '') {
      contentEnd--;
    }
    const editedLines = editedSlice.split('\n');
    const mergedLines = [
      ...lines.slice(0, target.startLine),
      ...editedLines,
      ...lines.slice(contentEnd),
    ];
    return mergedLines.join('\n');
  }

  // Case 2: Microcycle range filter (with optional session filter)
  const { sessions: editedSessions } = parseLogbookSessions(editedSlice);
  const editedByNum = new Map();
  for (const es of editedSessions) {
    if (!editedByNum.has(es.sessionNum)) {
      editedByNum.set(es.sessionNum, es);
    }
  }

  const mergedSessionStrings = sessions.map((origSess) => {
    const isTargetSession = !hasSessionFilter || origSess.sessionNum === Number(session);
    if (!isTargetSession) {
      return serializeSession(origSess, { preserveRawIfUntouched: true, lines });
    }

    const edSess = editedByNum.get(origSess.sessionNum);
    if (!edSess) {
      return serializeSession(origSess, { preserveRawIfUntouched: true, lines });
    }

    const nextSess = {
      ...origSess,
      headerLine: edSess.headerLine,
      datesBlock: origSess.datesBlock,
      items: [...origSess.items],
    };

    // Merge Dates block
    if (origSess.datesBlock) {
      const edDates = edSess.datesBlock ? edSess.datesBlock.dateLines : [];
      nextSess.datesBlock = {
        ...origSess.datesBlock,
        headerLine: edSess.datesBlock ? edSess.datesBlock.headerLine : origSess.datesBlock.headerLine,
        dateLines: spliceRange(origSess.datesBlock.dateLines, edDates, weekFrom, weekTo),
      };
    } else if (edSess.datesBlock && edSess.datesBlock.dateLines.length > 0) {
      nextSess.datesBlock = { ...edSess.datesBlock };
      nextSess.items.unshift({ type: 'dates' });
    }

    // Merge exercises
    const origExIndices = [];
    origSess.items.forEach((it, idx) => {
      if (it.type === 'exercise') origExIndices.push(idx);
    });
    const origExercises = origExIndices.map(idx => origSess.items[idx]);
    const edExercises = edSess.items.filter(it => it.type === 'exercise');

    const getExKey = (header) => header.split('|')[0].trim().toLowerCase();
    const usedEd = new Set();
    const matchedEdForOrig = new Array(origExercises.length).fill(null);

    // Match by exercise name first, preserving order
    let searchStart = 0;
    for (let i = 0; i < origExercises.length; i++) {
      const key = getExKey(origExercises[i].headerLine);
      for (let j = searchStart; j < edExercises.length; j++) {
        if (!usedEd.has(j) && getExKey(edExercises[j].headerLine) === key) {
          matchedEdForOrig[i] = edExercises[j];
          usedEd.add(j);
          searchStart = j + 1;
          break;
        }
      }
    }

    // Positional fallback when exercise count is unchanged (e.g. in-place rename)
    if (origExercises.length === edExercises.length) {
      for (let i = 0; i < origExercises.length; i++) {
        if (!matchedEdForOrig[i] && !usedEd.has(i)) {
          matchedEdForOrig[i] = edExercises[i];
          usedEd.add(i);
        }
      }
    }

    const updatedItems = [];
    let origExCursor = 0;
    let nextEdToInsert = 0;

    for (const item of nextSess.items) {
      if (item.type !== 'exercise') {
        updatedItems.push(item);
        continue;
      }
      const origIdx = origExCursor++;
      const matchedEd = matchedEdForOrig[origIdx];
      if (matchedEd) {
        const edPos = edExercises.indexOf(matchedEd);
        while (nextEdToInsert < edPos) {
          if (!usedEd.has(nextEdToInsert)) {
            if (updatedItems.length > 0 && updatedItems[updatedItems.length - 1].type !== 'blank') {
              updatedItems.push({ type: 'blank', text: '' });
            }
            updatedItems.push(edExercises[nextEdToInsert]);
            usedEd.add(nextEdToInsert);
          }
          nextEdToInsert++;
        }
        nextEdToInsert = Math.max(nextEdToInsert, edPos + 1);

        updatedItems.push({
          ...item,
          headerLine: matchedEd.headerLine,
          setLines: spliceRange(item.setLines, matchedEd.setLines, weekFrom, weekTo),
        });
      }
      // If unmatched, the exercise was deleted in the filtered view -> omit it
    }

    // Append any newly added exercises at the end of the session
    for (let j = 0; j < edExercises.length; j++) {
      if (!usedEd.has(j)) {
        if (updatedItems.length > 0 && updatedItems[updatedItems.length - 1].type !== 'blank') {
          updatedItems.push({ type: 'blank', text: '' });
        }
        updatedItems.push(edExercises[j]);
      }
    }

    nextSess.items = updatedItems;
    return serializeSession(nextSess);
  });

  const preambleStr = preambleLines.join('\n').replace(/\n+$/, '');
  const bodyStr = mergedSessionStrings.join('\n\n');
  if (preambleStr) {
    return `${preambleStr}\n\n${bodyStr}`;
  }
  return bodyStr;
}
