import { describe, it, expect } from 'vitest';
import {
  formatTodayDDMMYYYY,
  findPreviousMicrocycleLine,
  resolveImmediateSnippet,
} from '../components/editorSnippets.js';

describe('editorSnippets', () => {
  it('expands "date" immediately to DD-MM-YYYY without breaking "Dates:" or words', () => {
    const fixedNow = new Date(2026, 10, 19); // 19-11-2026
    expect(formatTodayDDMMYYYY(fixedNow)).toBe('19-11-2026');

    const res = resolveImmediateSnippet({
      lineText: 'date',
      cursorCol: 4,
      docLines: ['# 1', 'Dates:', 'date'],
      lineIndex: 2,
      now: fixedNow,
    });
    expect(res).toEqual({ replaceFromCol: 0, replaceToCol: 4, insert: '19-11-2026' });

    // After whitespace
    const afterSpace = resolveImmediateSnippet({
      lineText: '  date',
      cursorCol: 6,
      docLines: ['  date'],
      lineIndex: 0,
      now: fixedNow,
    });
    expect(afterSpace).toEqual({ replaceFromCol: 2, replaceToCol: 6, insert: '19-11-2026' });

    // Capitalized "Date" (e.g. while typing "Dates:") must NOT expand
    expect(
      resolveImmediateSnippet({
        lineText: 'Date',
        cursorCol: 4,
        docLines: ['# 1', 'Date'],
        lineIndex: 1,
        now: fixedNow,
      })
    ).toBeNull();

    // Inside another word ("update") or before alphanumeric chars must NOT expand
    expect(
      resolveImmediateSnippet({
        lineText: 'update',
        cursorCol: 6,
        docLines: ['update'],
        lineIndex: 0,
        now: fixedNow,
      })
    ).toBeNull();

    expect(
      resolveImmediateSnippet({
        lineText: 'dates',
        cursorCol: 4,
        docLines: ['dates'],
        lineIndex: 0,
        now: fixedNow,
      })
    ).toBeNull();
  });

  it('expands "eq" to the previous microcycle line only when one exists for the current exercise', () => {
    const docLines = [
      '# 1',
      'Dates:',
      '05-01-2026',
      'eq',
      '',
      "Lat Machine | 3' | 1-1-3-1",
      'eq',
      '120.. 9+3, 110.. 7+3',
      '',
      'eq',
    ];

    // Inside Dates: block -> nothing happens
    expect(findPreviousMicrocycleLine(docLines, 3)).toBeNull();
    expect(
      resolveImmediateSnippet({ lineText: 'eq', cursorCol: 2, docLines, lineIndex: 3 })
    ).toBeNull();

    // First line directly under exercise header (no prior microcycle) -> nothing happens
    expect(findPreviousMicrocycleLine(docLines, 6)).toBeNull();
    expect(
      resolveImmediateSnippet({ lineText: 'eq', cursorCol: 2, docLines, lineIndex: 6 })
    ).toBeNull();

    // After an existing microcycle line (even across a blank separator line) -> copies it
    expect(findPreviousMicrocycleLine(docLines, 9)).toBe('120.. 9+3, 110.. 7+3');
    expect(
      resolveImmediateSnippet({ lineText: 'eq', cursorCol: 2, docLines, lineIndex: 9 })
    ).toEqual({
      replaceFromCol: 0,
      replaceToCol: 2,
      insert: '120.. 9+3, 110.. 7+3',
    });

    // Does not expand when there is trailing text on the line
    expect(
      resolveImmediateSnippet({ lineText: 'eq extra', cursorCol: 2, docLines, lineIndex: 9 })
    ).toBeNull();
  });
});
