import { describe, it, expect } from 'vitest';
import {
  getLogbookFilterMeta,
  filterLogbookText,
  mergeFilteredLogbook,
} from '../components/editorFilterUtils';

const SAMPLE_LOGBOOK = `override: Lat Machine | {"Latissimus Dorsi": 1.0}

# 1
Dates:
01/01/2026
08/01/2026
15/01/2026

Lat Machine | 3' | last half reps
90.. 9+2, 7+2
90.. 9+2, 8+2
95.. 10+2, 8+2

DB Hammer | 2'
22.. 8, 6
22.. 9, 6
24.. 8, 6

# 2
Flat DB Bench | 2'30"
40.. 5
40.. 6
42.. 6

# 4
Dates:
04/01/2026
11/01/2026
18/01/2026

RDL | 3'
140.. 9
140.. 10
145.. 8

Leg Curl | 2'
50.. 12, 12
50.. 13, 12
55.. 12, 11`;

describe('editorFilterUtils', () => {
  it('extracts sessions and per-session microcycles', () => {
    const meta = getLogbookFilterMeta(SAMPLE_LOGBOOK);
    expect(meta.sessions).toEqual([1, 2, 4]);
    expect(meta.getWeeksForSession('all')).toEqual([1, 2, 3]);
    expect(meta.getWeeksForSession('4')).toEqual([1, 2, 3]);
  });

  it('filters by session only and merges edits without touching other sessions', () => {
    const filter = { session: '4', weekFrom: 'all', weekTo: 'all' };
    const { text, isFiltered, lineMap } = filterLogbookText(SAMPLE_LOGBOOK, filter);
    expect(isFiltered).toBe(true);
    expect(text.startsWith('# 4')).toBe(true);
    expect(text).toContain('RDL | 3\'');
    expect(text).not.toContain('# 1');
    expect(text).not.toContain('# 2');
    expect(lineMap[0]).toBe(SAMPLE_LOGBOOK.split('\n').indexOf('# 4'));

    const edited = text.replace('145.. 8', '150.. 9') + '\n\nCalf Raise | 1\'30"\n60.. 15, 15';
    const merged = mergeFilteredLogbook(SAMPLE_LOGBOOK, edited, filter);
    expect(merged).toContain('override: Lat Machine');
    expect(merged).toContain('# 1');
    expect(merged).toContain('# 2');
    expect(merged).toContain('150.. 9');
    expect(merged).toContain('Calf Raise | 1\'30"');
    expect(filterLogbookText(merged, filter).text).toBe(edited);
  });

  it('filters by microcycle range and merges edits preserving hidden microcycles', () => {
    const filter = { session: '4', weekFrom: '2', weekTo: '3' };
    const { text } = filterLogbookText(SAMPLE_LOGBOOK, filter);
    expect(text).toContain('# 4');
    expect(text).toContain('11/01/2026');
    expect(text).toContain('18/01/2026');
    expect(text).not.toContain('04/01/2026');
    expect(text).toContain('140.. 10');
    expect(text).toContain('145.. 8');
    expect(text).not.toContain('140.. 9');

    // Edit m3 and add m4
    const edited = text.replace('145.. 8', '145.. 9\n150.. 8');
    const merged = mergeFilteredLogbook(SAMPLE_LOGBOOK, edited, filter);
    expect(merged).toContain('04/01/2026'); // m1 date preserved
    expect(merged).toContain('140.. 9');    // m1 set preserved
    expect(merged).toContain('145.. 9');    // m3 edited
    expect(merged).toContain('150.. 8');    // m4 added
    expect(merged).toContain('# 1');        // other sessions preserved
    expect(filterLogbookText(merged, { ...filter, weekTo: '4' }).text).toBe(edited);
  });

  it('filters across all sessions by microcycle range and merges back cleanly', () => {
    const filter = { session: 'all', weekFrom: '3', weekTo: '3' };
    const { text } = filterLogbookText(SAMPLE_LOGBOOK, filter);
    expect(text).toContain('# 1');
    expect(text).toContain('# 2');
    expect(text).toContain('# 4');
    expect(text).toContain('95.. 10+2, 8+2');
    expect(text).not.toContain('90.. 9+2, 7+2');

    const edited = text.replace('42.. 6', '45.. 7');
    const merged = mergeFilteredLogbook(SAMPLE_LOGBOOK, edited, filter);
    expect(merged).toContain('40.. 5');
    expect(merged).toContain('40.. 6');
    expect(merged).toContain('45.. 7');
    expect(filterLogbookText(merged, filter).text).toBe(edited);
  });

  it('returns original text when no filter is active', () => {
    const filter = { session: 'all', weekFrom: 'all', weekTo: 'all' };
    const res = filterLogbookText(SAMPLE_LOGBOOK, filter);
    expect(res.isFiltered).toBe(false);
    expect(res.text).toBe(SAMPLE_LOGBOOK);
    expect(mergeFilteredLogbook(SAMPLE_LOGBOOK, SAMPLE_LOGBOOK, filter)).toBe(SAMPLE_LOGBOOK);
  });

  it('does not splice hidden microcycles onto wrong exercises when deleting one and adding another', () => {
    const filter = { session: '4', weekFrom: '2', weekTo: '3' };
    const { text } = filterLogbookText(SAMPLE_LOGBOOK, filter);
    // Delete RDL and add Calf Raise at the end (same exercise count = 2)
    const edited = text
      .replace("RDL | 3'\n140.. 10\n145.. 8\n\n", '')
      + "\n\nCalf Raise | 2'\n60.. 15";
    const merged = mergeFilteredLogbook(SAMPLE_LOGBOOK, edited, filter);
    expect(merged).not.toContain("RDL | 3'");
    expect(merged).not.toContain('140.. 9');
    // Leg Curl keeps its hidden m1 set (50.. 12, 12)
    expect(merged).toContain("Leg Curl | 2'\n50.. 12, 12\n50.. 13, 12\n55.. 12, 11");
    // Calf Raise only has its newly added set
    expect(merged).toContain("Calf Raise | 2'\n60.. 15");
  });

  it('preserves other markdown lines (notes, subheadings) when microcycle filter is active', () => {
    const logWithOther = `# 1\n> Deload week note\n\nBench | 3'\n100.. 8\n105.. 8`;
    const filter = { session: '1', weekFrom: '2', weekTo: '2' };
    const { text } = filterLogbookText(logWithOther, filter);
    expect(text).toContain('> Deload week note');
    expect(text).toContain('105.. 8');
    expect(text).not.toContain('100.. 8');
  });
});
