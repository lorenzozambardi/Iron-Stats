/* eslint-disable react-hooks/refs */
import { memo, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { foldGutter } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { customFoldService } from './customFoldService';
import { resolveImmediateSnippet } from './editorSnippets';
import { isDateLine, isDatesHeader } from '../parser';
import { fuzzyScore } from './helpers';

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    backgroundColor: 'transparent',
    color: '#e5e5e5',
    fontFamily: 'inherit',
    fontSize: 'inherit'
  },
  '.cm-scroller': {
    overflow: 'auto !important',
    height: '100% !important',
    fontFamily: 'inherit',
    lineHeight: '1.6',
    WebkitOverflowScrolling: 'touch'
  },
  '.cm-content': {
    caretColor: '#fff',
    minHeight: '100%',
    padding: '14px 4px 120px 4px'
  },
  '.cm-line': {
    padding: '0 2px'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'rgba(255, 255, 255, 0.35)',
    border: 'none',
    userSelect: 'none',
    paddingLeft: '4px'
  },
  '.cm-foldGutter': {
    width: '18px'
  },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'rgba(255, 255, 255, 0.4)',
    transition: 'color 0.15s ease'
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'var(--accent-primary, #6366f1)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
    color: 'var(--accent-primary, #818cf8)',
    borderRadius: '999px',
    padding: '1px 8px',
    marginLeft: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    fontWeight: '600',
    lineHeight: '1.2',
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'middle'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'transparent !important'
  },
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--bg-glass-active, #181818) !important',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15)) !important',
    borderRadius: '8px !important',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7) !important',
    padding: '4px !important'
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '6px 12px !important',
    borderRadius: '6px !important',
    fontSize: '0.85rem !important'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-primary-subtle, rgba(99, 102, 241, 0.2)) !important',
    color: 'var(--accent-primary, #818cf8) !important'
  }
}, { dark: true });

const foldGutterExtension = foldGutter({
  markerDOM: (open) => {
    const span = document.createElement('span');
    span.style.fontSize = '0.95rem';
    span.style.lineHeight = '1';
    span.style.userSelect = 'none';
    span.style.display = 'inline-block';
    span.style.transform = open ? 'rotate(90deg)' : 'none';
    span.style.transition = 'transform 0.15s ease';
    span.textContent = '›';
    span.style.fontWeight = 'bold';
    return span;
  }
});

const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: true,
  highlightSelectionMatches: false,
  searchKeymap: false,
  history: true,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false
};

const computeMinimalChange = (oldText, newText) => {
  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);
  let prefix = 0;
  while (prefix < minLen && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: oldLen - suffix,
    insert: newText.slice(prefix, newLen - suffix)
  };
};

function FoldableEditor({
  value,
  onChange,
  exercisesDb = [],
  onCursorLineChange
}) {
  const exercisesDbRef = useRef(exercisesDb);
  exercisesDbRef.current = exercisesDb;

  const onCursorLineChangeRef = useRef(onCursorLineChange);
  onCursorLineChangeRef.current = onCursorLineChange;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Defer initial sync via state so it runs after @uiw/react-codemirror's own [value, view] effect
  const [editorView, setEditorView] = useState(null);
  // CodeMirror mounts with an empty doc ('') because value is synced via transactions
  const lastEmittedValueRef = useRef('');
  const pendingLocalValuesRef = useRef([]);
  const isSyncingExternalRef = useRef(false);

  const exerciseCompletion = useMemo(() => {
    return autocompletion({
      override: [
        (context) => {
          const line = context.state.doc.lineAt(context.pos);
          const textBefore = line.text.slice(0, context.pos - line.from);
          const trimmedBefore = textBefore.trim();

          if (
            textBefore.includes('|') ||
            trimmedBefore.startsWith('#') ||
            trimmedBefore.toLowerCase().startsWith('override:') ||
            trimmedBefore.toLowerCase().startsWith('dates:') ||
            isDatesHeader(trimmedBefore) ||
            isDateLine(trimmedBefore) ||
            trimmedBefore === 'date' ||
            trimmedBefore === 'eq' ||
            /^\d/.test(trimmedBefore)
          ) {
            return null;
          }

          const query = trimmedBefore.toLowerCase();
          const currentExercisesDb = exercisesDbRef.current;
          if (query.length < 2 || !currentExercisesDb || currentExercisesDb.length === 0) {
            return null;
          }

          const scored = currentExercisesDb
            .map(ex => ({ ex, score: fuzzyScore(query, ex.name) }))
            .filter(({ score }) => score >= 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 7);

          if (scored.length === 0) return null;

          const startOffset = line.from + line.text.indexOf(trimmedBefore);

          return {
            from: startOffset,
            options: scored.map(({ ex }) => {
              const primaryMuscle = Object.entries(ex.muscles_distr || {})
                .sort(([, a], [, b]) => {
                  const magA = typeof a === 'number' ? a : (a?.magnitude || 0);
                  const magB = typeof b === 'number' ? b : (b?.magnitude || 0);
                  return magB - magA;
                })[0]?.[0] || '';
              return {
                label: ex.name,
                type: 'keyword',
                detail: primaryMuscle,
                apply: `${ex.name} | 2'`
              };
            })
          };
        }
      ]
    });
  }, []);

  const extensions = useMemo(() => [
    customFoldService,
    foldGutterExtension,
    EditorView.lineWrapping,
    exerciseCompletion,
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet && onCursorLineChangeRef.current) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onCursorLineChangeRef.current(line.number - 1);
      }

      if (
        update.docChanged &&
        !isSyncingExternalRef.current &&
        update.state.selection.main.empty &&
        update.transactions.some((tr) => tr.isUserEvent('input.type'))
      ) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        const cursorCol = head - line.from;
        const before = line.text.slice(0, cursorCol);
        const needsDateSnippet = /(?:^|\s)date$/.test(before);
        const needsEqSnippet = /^\s*eq$/.test(before) && line.text.slice(cursorCol).trim().length === 0;
        if (needsDateSnippet || needsEqSnippet) {
          const docLines = needsEqSnippet ? update.state.doc.toString().split('\n') : null;
          const expansion = resolveImmediateSnippet({
            lineText: line.text,
            cursorCol,
            docLines,
            lineIndex: line.number - 1,
          });
          if (expansion) {
            const from = line.from + expansion.replaceFromCol;
            const to = line.from + expansion.replaceToCol;
            const nextCursor = from + expansion.insert.length;
            update.view.dispatch({
              changes: { from, to, insert: expansion.insert },
              selection: { anchor: nextCursor, head: nextCursor },
            });
          }
        }
      }
    })
  ], [exerciseCompletion]);

  const handleChange = useCallback((val) => {
    if (isSyncingExternalRef.current) return;
    lastEmittedValueRef.current = val;
    const pending = pendingLocalValuesRef.current;
    pending.push(val);
    if (pending.length > 50) pending.shift();
    if (onChangeRef.current) {
      onChangeRef.current(val);
    }
  }, []);

  const syncExternalDoc = useCallback((view, targetValue) => {
    const currentDoc = view.state.doc.toString();
    if (currentDoc === targetValue) return;
    const change = computeMinimalChange(currentDoc, targetValue);
    const isFullReplacement = change.from === 0 && change.to === currentDoc.length && currentDoc.length > 0 && targetValue.length > 0;
    const { anchor, head } = view.state.selection.main;
    const delta = change.insert.length - (change.to - change.from);
    const mapPos = (pos) => {
      if (pos <= change.from) return pos;
      if (pos >= change.to) return pos + delta;
      return Math.min(pos, change.from + change.insert.length);
    };
    const nextSelection = isFullReplacement
      ? { anchor: 0, head: 0 }
      : {
          anchor: Math.max(0, Math.min(mapPos(anchor), targetValue.length)),
          head: Math.max(0, Math.min(mapPos(head), targetValue.length))
        };

    isSyncingExternalRef.current = true;
    try {
      view.dispatch({
        changes: change,
        selection: nextSelection,
        annotations: Transaction.addToHistory.of(false)
      });
    } finally {
      isSyncingExternalRef.current = false;
    }
  }, []);

  // Only sync external value changes (program switch, undo/redo, modal edits, save-time formatting) into CodeMirror.
  // Never echo back stale intermediate keystrokes, and apply minimal diffs with mapped selection to prevent cursor resets.
  useEffect(() => {
    if (!editorView) return;

    if (value === lastEmittedValueRef.current) {
      pendingLocalValuesRef.current = [];
      return;
    }

    const pending = pendingLocalValuesRef.current;
    const pendingIdx = pending.indexOf(value);
    if (pendingIdx !== -1) {
      pendingLocalValuesRef.current = pending.slice(pendingIdx + 1);
      return;
    }

    pendingLocalValuesRef.current = [];
    lastEmittedValueRef.current = value;
    syncExternalDoc(editorView, value);
  }, [value, editorView, syncExternalDoc]);

  return (
    <div className="foldable-editor-root">
      <CodeMirror
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={setEditorView}
        basicSetup={BASIC_SETUP}
      />
    </div>
  );
}

export default memo(FoldableEditor);
