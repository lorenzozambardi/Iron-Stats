import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { customFoldService, isSetLine } from '../components/customFoldService';

describe('customFoldService', () => {
  it('identifies set lines correctly', () => {
    expect(isSetLine('90..10')).toBe(true);
    expect(isSetLine('90.. 9+2, 7+2')).toBe(true);
    expect(isSetLine('10@8')).toBe(true);
    expect(isSetLine('old 80..10')).toBe(true);
    expect(isSetLine('Lat Machine | 3\'')).toBe(false);
    expect(isSetLine('# 1')).toBe(false);
    expect(isSetLine('Dates:')).toBe(false);
    expect(isSetLine('19-11-2026')).toBe(false);
    expect(isSetLine('-')).toBe(false);
  });

  it('folds Dates: blocks independently without capturing exercises', () => {
    const text = [
      '# 1',
      'Dates:',
      '05-01-2026',
      '12-01-2026',
      '',
      'Lat Machine | 3\'',
      '90.. 10'
    ].join('\n');

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService]
    });

    const datesLine = state.doc.line(2);
    const foldRange = foldable(state, datesLine.from, datesLine.to);
    expect(foldRange).not.toBeNull();
    const lastDateLine = state.doc.line(4);
    expect(foldRange.from).toBe(datesLine.to);
    expect(foldRange.to).toBe(lastDateLine.to);

    // Date lines themselves are not foldable
    const dateLine = state.doc.line(3);
    expect(foldable(state, dateLine.from, dateLine.to)).toBeNull();
  });

  it('folds markdown day headers correctly', () => {
    const text = [
      '# Day 1',
      'Lat Machine | 3\'',
      '90..10',
      '# Day 2',
      'Squat | 4\'',
      '120..5'
    ].join('\n');

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService]
    });

    const line1 = state.doc.line(1);
    const foldRange = foldable(state, line1.from, line1.to);

    expect(foldRange).not.toBeNull();
    const line3 = state.doc.line(3);
    expect(foldRange.from).toBe(line1.to);
    expect(foldRange.to).toBe(line3.to);
  });

  it('folds exercise blocks correctly', () => {
    const text = [
      '# Day 1',
      'Lat Machine | 3\'',
      '90..10',
      '90..9',
      'Machine T-Bar | 2\'',
      '60..10'
    ].join('\n');

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService]
    });

    const line2 = state.doc.line(2);
    const foldRange = foldable(state, line2.from, line2.to);

    expect(foldRange).not.toBeNull();
    const line4 = state.doc.line(4);
    expect(foldRange.from).toBe(line2.to);
    expect(foldRange.to).toBe(line4.to);
  });

  it('returns null for lines that cannot be folded', () => {
    const text = [
      '# Day 1',
      'Lat Machine | 3\'',
      '90..10'
    ].join('\n');

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService]
    });

    const line3 = state.doc.line(3); // '90..10' (leaf set line)
    const foldRange = foldable(state, line3.from, line3.to);
    expect(foldRange).toBeNull();
  });

  it('folds profile.md metric blocks (value , DD-MM-YYYY)', () => {
    const text = [
      'weight',
      '71.5 , 20-11-2026',
      '72 , 19-11-2026',
      'bodyfat',
      '10.8 , 20-11-2026',
    ].join('\n');

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService],
    });

    const weightLine = state.doc.line(1);
    const weightFold = foldable(state, weightLine.from, weightLine.to);
    expect(weightFold).not.toBeNull();
    expect(weightFold.from).toBe(weightLine.to);
    expect(weightFold.to).toBe(state.doc.line(3).to);

    const bfLine = state.doc.line(4);
    const bfFold = foldable(state, bfLine.from, bfLine.to);
    expect(bfFold).not.toBeNull();
    expect(bfFold.from).toBe(bfLine.to);
    expect(bfFold.to).toBe(state.doc.line(5).to);
  });
});
