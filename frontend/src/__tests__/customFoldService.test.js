import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { customFoldService, isSetLine } from '../components/customFoldService';

describe('customFoldService', () => {
  it('identifies set lines correctly', () => {
    expect(isSetLine('90..10')).toBe(true);
    expect(isSetLine('90..9+2.7+2')).toBe(true);
    expect(isSetLine('10@8')).toBe(true);
    expect(isSetLine('old 80..10')).toBe(true);
    expect(isSetLine('Lat Machine | 3\'')).toBe(false);
    expect(isSetLine('# 1')).toBe(false);
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
});
