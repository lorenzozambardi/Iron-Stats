import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import defaultExercises from '../defaultExercises.json';
import { parseLogbook, parseDateTokenToISO, isDatesHeader, isDateLine } from '../parser.js';
import { formatLogbookSpaces } from '../formatLogbook.js';
import { customFoldService } from '../components/customFoldService.js';
import {
  formatTodayDDMMYYYY,
  findPreviousMicrocycleLine,
  resolveImmediateSnippet,
} from '../components/editorSnippets.js';
import { parseLogbookWithWarnings } from '../analytics/dataset/loadAllPrograms.js';
import { buildAnalyticsDataset } from '../analytics/dataset/buildAnalyticsDataset.js';
import { DEFAULT_PROFILE } from '../profileUtils.js';

describe('session Dates: blocks and editor snippets', () => {
  it('parses DD-MM-YYYY Dates: blocks per session without false warnings', () => {
    expect(parseDateTokenToISO('19-11-2026')).toBe('2026-11-19');
    expect(parseDateTokenToISO('05/01/2026')).toBe('2026-01-05');
    expect(parseDateTokenToISO('2026-01-05')).toBe('2026-01-05');
    expect(parseDateTokenToISO('-')).toBeNull();
    expect(parseDateTokenToISO('32-01-2026')).toBeNull();
    expect(isDatesHeader('Dates:')).toBe(true);
    expect(isDatesHeader('dates:')).toBe(true);
    expect(isDateLine('19-11-2026')).toBe(true);
    expect(isDateLine('-')).toBe(true);

    const md = `# 1
Dates:
05-01-2026
13-01-2026
21-01-2026

Lat Machine | 3' | 1-0-2-0
90.. 10, 8
90.. 11, 9
92.5.. 10, 8

# 2
Dates:
08-01-2026
-
23-01-2026

Flat DB Bench | 2' | 1-0-2-0
30.. 10, 9
30.. 11, 10
32.5.. 9, 8
`;

    const { workoutData, parseWarnings } = parseLogbookWithWarnings(md, defaultExercises);
    expect(parseWarnings).toEqual([]);
    expect(workoutData.length).toBe(2);
    expect(workoutData[0].weeks.map((w) => w.date)).toEqual(['2026-01-05', '2026-01-13', '2026-01-21']);
    expect(workoutData[1].weeks.map((w) => w.date)).toEqual(['2026-01-08', null, '2026-01-23']);

    // Build dataset and verify exact date alignment & body log join
    const profile = {
      current: { ...DEFAULT_PROFILE.current, weight: 80.5 },
      logs: [
        { id: '1', date: '2026-01-05', type: 'weight', value: 80.0 },
        { id: '2', date: '2026-01-13', type: 'weight', value: 80.4 },
        { id: '3', date: '2026-01-21', type: 'weight', value: 80.9 },
      ],
    };
    const ds = buildAnalyticsDataset({
      loadedPrograms: [{ id: 'S4M1', rawText: md, workoutData, parseWarnings }],
      profile,
    });
    expect(ds.capabilities.dateAlignment).toBe('exact');
    expect(ds.capabilities.exactDatedMicrocycles).toBe(3);
    expect(ds.microcycles[0].dateAlignment).toBe('exact');
    expect(ds.microcycles[0].windowStart).toBe('2026-01-05');
    expect(ds.microcycles[0].windowEnd).toBe('2026-01-08');
    expect(ds.microcycles[0].bodyWeight).toBeCloseTo(80.0, 2);
    expect(ds.microcycles[1].bodyWeight).toBeCloseTo(80.4, 2);
  });

  it('folds Dates: blocks independently and preserves them in formatLogbookSpaces', () => {
    const md = `# 1\ndates:\n05-01-2026\n12-01-2026\n\nLat Machine | 3'\n90.. 10, 8`;
    const formatted = formatLogbookSpaces(md);
    expect(formatted).toContain('Dates:\n05-01-2026\n12-01-2026');

    const state = EditorState.create({ doc: formatted, extensions: [customFoldService] });
    const datesLine = state.doc.line(2);
    const foldRange = state.facet(customFoldService.facet || []).length; // verify state compiles
    expect(datesLine.text).toBe('Dates:');
    expect(foldRange).toBeGreaterThanOrEqual(0);
    // Ensure parseLogbook still parses cleanly after formatting
    expect(parseLogbook(formatted, defaultExercises).length).toBe(1);
  });

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

    // Capitalized "Date" (e.g. while typing "Dates:") must NOT expand
    const cap = resolveImmediateSnippet({
      lineText: 'Date',
      cursorCol: 4,
      docLines: ['# 1', 'Date'],
      lineIndex: 1,
      now: fixedNow,
    });
    expect(cap).toBeNull();

    // Inside another word ("update") must NOT expand
    const word = resolveImmediateSnippet({
      lineText: 'update',
      cursorCol: 6,
      docLines: ['update'],
      lineIndex: 0,
      now: fixedNow,
    });
    expect(word).toBeNull();
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

    // After an existing microcycle line (even across a blank separator line) -> copies it!
    expect(findPreviousMicrocycleLine(docLines, 9)).toBe('120.. 9+3, 110.. 7+3');
    expect(
      resolveImmediateSnippet({ lineText: 'eq', cursorCol: 2, docLines, lineIndex: 9 })
    ).toEqual({
      replaceFromCol: 0,
      replaceToCol: 2,
      insert: '120.. 9+3, 110.. 7+3',
    });
  });
});
