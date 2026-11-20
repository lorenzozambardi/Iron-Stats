import { isSetLine } from './components/customFoldService';
import { isDateLine, isDatesHeader } from './parser';

/**
 * Normalizes horizontal whitespace in a logbook markdown string.
 * Designed to be sub-millisecond and safe to run on every save/autosave.
 */
export const formatLogbookSpaces = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return '';
  }

  const normalizedNewlines = text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
  const lines = normalizedNewlines.split('\n');
  let changed = normalizedNewlines !== text;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let line = raw.trim().replace(/[ \t]{2,}/g, ' ');

    if (line.length > 0) {
      if (line.startsWith('#')) {
        line = line.replace(/^(#+)\s*(?=\S)/, '$1 ');
      } else if (isDatesHeader(line)) {
        line = 'Dates:';
      } else if (isDateLine(line)) {
        // Keep date lines untouched
      } else if (/^override:/i.test(line)) {
        line = line
          .replace(/^override:\s*/i, 'override: ')
          .replace(/\s*\|\s*/g, ' | ')
          .trimEnd();
      } else if (line.includes('|')) {
        line = line
          .replace(/\s*\|\s*/g, ' | ')
          .replace(/\s*,\s*(?=\S)/g, ', ')
          .replace(/\s+,$/g, ',')
          .trimEnd();
      } else if (isSetLine(line)) {
        const commentIdx = line.indexOf('--');
        const setPart = commentIdx === -1 ? line : line.slice(0, commentIdx).trimEnd();
        const commentPart = commentIdx === -1 ? '' : ` ${line.slice(commentIdx).trim()}`;
        const formattedSet = setPart
          .replace(/^old\s+/i, 'old ')
          .replace(/(\d)\s*\.\.(?!\.)\s*(?=\S)/g, '$1.. ')
          .replace(/(\d)\s+\.\.(?!\.)$/g, '$1..')
          .replace(/\s*,\s*(?=\S)/g, ', ')
          .replace(/\s+,$/g, ',')
          .replace(/\s*([+@/])\s*/g, '$1');
        line = `${formattedSet}${commentPart}`;
      }
    }

    if (line !== raw) {
      lines[i] = line;
      changed = true;
    }
  }

  return changed ? lines.join('\n') : text;
};
