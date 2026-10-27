import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { customFoldService } from '../components/customFoldService';

describe('customFoldService', () => {
  it('correctly identifies folds for days and exercises', () => {
    const text = `# 1
Lat Machine | 3'
90..9+2.7+2
90..9+2.8+2

Machine T-Bar | 2'30"
60..9+2.6+2

# 2
20 SM Bench | 3'
35..5.30..7`;

    const state = EditorState.create({
      doc: text,
      extensions: [customFoldService]
    });

    // Check Day 1 (line 1)
    const line1 = state.doc.line(1);
    const fold1Result = foldable(state, line1.from, line1.to);
    expect(fold1Result).not.toBeNull();
    const line7 = state.doc.line(7);
    expect(fold1Result.to).toBe(line7.to);

    // Check Lat Machine (line 2)
    const line2 = state.doc.line(2);
    const fold2Result = foldable(state, line2.from, line2.to);
    expect(fold2Result).not.toBeNull();
    // Lat Machine should fold lines 3 and 4
    const line4 = state.doc.line(4);
    expect(fold2Result.to).toBe(line4.to);

    // Check set line (line 3) -> should not fold
    const line3 = state.doc.line(3);
    const fold3Result = foldable(state, line3.from, line3.to);
    expect(fold3Result).toBeNull();
  });
});
