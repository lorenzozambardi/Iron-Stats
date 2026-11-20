import { describe, it, expect } from 'vitest';
import { formatLogbookSpaces } from '../formatLogbook';

describe('formatLogbookSpaces', () => {
  it('uniforms spaces in headers, exercises, overrides, and set lines', () => {
    const input = [
      '  #1  ',
      '',
      '  Lat Machine  |   3\'  |  1"  pause down,last half reps  ',
      '  90 ..9 + 2 ,   7+2 @ 8  ',
      'old   90..9,8',
      '37..5,30..8',
      'override:  Lat Machine  |   muscles_distr={"Lats": 80}  ',
      ''
    ].join('\n');

    const expected = [
      '# 1',
      '',
      'Lat Machine | 3\' | 1" pause down, last half reps',
      '90.. 9+2, 7+2@8',
      'old 90.. 9, 8',
      '37.. 5, 30.. 8',
      'override: Lat Machine | muscles_distr={"Lats": 80}',
      ''
    ].join('\n');

    expect(formatLogbookSpaces(input)).toBe(expected);
  });

  it('does not corrupt ellipsis in notes and preserves trailing newlines', () => {
    const input = 'DB Flies | 2\' | pause...\n20.. 12, 8\n';
    expect(formatLogbookSpaces(input)).toBe(input);
  });

  it('normalizes CRLF line endings', () => {
    const input = '# 1\r\nLat Machine | 3\'\r\n90.. 9\r\n';
    expect(formatLogbookSpaces(input)).toBe('# 1\nLat Machine | 3\'\n90.. 9\n');
  });

  it('handles empty and already-formatted strings', () => {
    expect(formatLogbookSpaces('')).toBe('');
    const clean = '# 1\n\nBench | 2\'\n80.. 8, 8\n';
    expect(formatLogbookSpaces(clean)).toBe(clean);
  });

  it('normalizes Dates: headers and preserves DD-MM-YYYY date lines', () => {
    const input = [
      '# 1',
      '  dates:   ',
      '  05-01-2026  ',
      '12-01-2026',
      '-',
      '',
      '# 2',
      'Dates: ',
      '08-01-2026',
    ].join('\n');

    const expected = [
      '# 1',
      'Dates:',
      '05-01-2026',
      '12-01-2026',
      '-',
      '',
      '# 2',
      'Dates:',
      '08-01-2026',
    ].join('\n');

    expect(formatLogbookSpaces(input)).toBe(expected);
  });

  it('preserves inline -- comments verbatim on set lines', () => {
    const input = '  90 ..9 + 2 ,  7@ 8 -- keep + / @ .. intact  \n';
    expect(formatLogbookSpaces(input)).toBe('90.. 9+2, 7@8 -- keep + / @ .. intact\n');
  });
});
