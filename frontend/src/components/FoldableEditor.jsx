import { useMemo, useCallback, useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { foldGutter } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { linter, lintGutter, forceLinting } from '@codemirror/lint';
import { customFoldService } from './customFoldService';
import { fuzzyScore } from './helpers';

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    width: '100%',
    backgroundColor: 'transparent',
    color: '#e2e8f0',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    color: 'var(--accent-primary, #818cf8)',
    borderRadius: '4px',
    padding: '0 5px',
    marginLeft: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.82rem',
    fontWeight: '500'
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
  },
  '.cm-gutter-lint': {
    width: '16px'
  },
  '.cm-lint-marker': {
    width: '10px',
    height: '10px'
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #f87171',
    textUnderlineOffset: '3px'
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #fbbf24',
    textUnderlineOffset: '3px'
  },
  '.cm-lintRange-info': {
    backgroundImage: 'none',
    textDecoration: 'underline dotted #60a5fa',
    textUnderlineOffset: '3px'
  },
  '.cm-tooltip-lint': {
    backgroundColor: 'var(--bg-glass-active, #181818) !important',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15)) !important',
    borderRadius: '8px !important',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7) !important',
    color: '#e2e8f0 !important',
    fontSize: '0.82rem !important',
    maxWidth: '340px'
  },
  '.cm-diagnostic': {
    padding: '6px 10px !important',
    borderLeftWidth: '3px !important'
  },
  '.cm-diagnostic-error': {
    borderLeftColor: '#f87171 !important'
  },
  '.cm-diagnostic-warning': {
    borderLeftColor: '#fbbf24 !important'
  },
  '.cm-diagnostic-info': {
    borderLeftColor: '#60a5fa !important'
  },
  '.cm-diagnosticAction': {
    backgroundColor: 'rgba(99, 102, 241, 0.2) !important',
    color: '#a5b4fc !important',
    border: '1px solid rgba(99, 102, 241, 0.35) !important',
    borderRadius: '4px !important',
    padding: '2px 7px !important',
    marginLeft: '8px !important',
    cursor: 'pointer !important',
    fontSize: '0.76rem !important'
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

const FoldableEditor = forwardRef(function FoldableEditor({
  value,
  onChange,
  exercisesDb = [],
  onCursorLineChange,
  diagnostics = [],
  onDismissDiagnostic
}, ref) {
  const exercisesDbRef = useRef(exercisesDb);
  exercisesDbRef.current = exercisesDb;

  const onCursorLineChangeRef = useRef(onCursorLineChange);
  onCursorLineChangeRef.current = onCursorLineChange;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  const onDismissDiagnosticRef = useRef(onDismissDiagnostic);
  onDismissDiagnosticRef.current = onDismissDiagnostic;

  const editorViewRef = useRef(null);
  const lastEmittedValueRef = useRef(value);
  const [initialValue] = useState(value);

  useImperativeHandle(ref, () => ({
    scrollToLine(lineIndex) {
      const view = editorViewRef.current;
      if (!view) return;
      const lineNum = Math.max(1, Math.min(lineIndex + 1, view.state.doc.lines));
      const line = view.state.doc.line(lineNum);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' })
      });
      view.focus();
    }
  }), []);

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
            options: scored.map(({ ex }) => ({
              label: ex.name,
              type: 'keyword',
              detail: Object.keys(ex.muscles_distr || {})[0] || '',
              apply: `${ex.name} | 2'`
            }))
          };
        }
      ]
    });
  }, []);

  const lintExtension = useMemo(() => {
    return linter((view) => {
      const list = diagnosticsRef.current;
      if (!list || list.length === 0) return [];
      const doc = view.state.doc;
      const cmDiagnostics = [];

      for (const d of list) {
        const lineNum = d.lineIndex + 1;
        if (lineNum < 1 || lineNum > doc.lines) continue;
        const line = doc.line(lineNum);
        const from = Math.min(line.to, line.from + Math.max(0, d.from ?? 0));
        const to = Math.min(line.to, Math.max(from, line.from + (d.to ?? line.length)));

        const entry = {
          from,
          to,
          severity: d.severity || 'warning',
          message: d.message
        };

        const actions = [];
        if (d.suggestion !== undefined) {
          actions.push({
            name: d.replaceFullLine ? 'Format line' : `Use "${d.suggestion}"`,
            apply(targetView, f, t) {
              targetView.dispatch({
                changes: { from: f, to: t, insert: d.suggestion }
              });
            }
          });
        }
        if (d.category === 'anomaly' && onDismissDiagnosticRef.current) {
          actions.push({
            name: 'Mark as OK',
            apply() {
              onDismissDiagnosticRef.current(d);
            }
          });
        }
        if (actions.length > 0) {
          entry.actions = actions;
        }

        cmDiagnostics.push(entry);
      }

      return cmDiagnostics;
    }, { delay: 0 });
  }, []);

  const extensions = useMemo(() => [
    customFoldService,
    foldGutterExtension,
    lintGutter(),
    lintExtension,
    EditorView.lineWrapping,
    exerciseCompletion,
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet && onCursorLineChangeRef.current) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onCursorLineChangeRef.current(line.number - 1);
      }
    })
  ], [exerciseCompletion, lintExtension]);

  useEffect(() => {
    if (editorViewRef.current) {
      forceLinting(editorViewRef.current);
    }
  }, [diagnostics]);

  const handleChange = useCallback((val) => {
    lastEmittedValueRef.current = val;
    if (onChangeRef.current) {
      onChangeRef.current(val);
    }
  }, []);

  const handleCreateEditor = useCallback((view) => {
    editorViewRef.current = view;
  }, []);

  // Only sync external value changes (program switch, undo/redo, modal edits) into CodeMirror.
  // Never echo back the user's own keystrokes, which prevents cursor resets during fast typing / IME.
  useEffect(() => {
    if (value === lastEmittedValueRef.current) return;
    lastEmittedValueRef.current = value;
    const view = editorViewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      const sel = view.state.selection.main;
      const maxPos = value.length;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
        selection: {
          anchor: Math.min(sel.anchor, maxPos),
          head: Math.min(sel.head, maxPos)
        }
      });
    }
  }, [value]);

  return (
    <div className="foldable-editor-root">
      <CodeMirror
        value={initialValue}
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={handleCreateEditor}
        basicSetup={BASIC_SETUP}
      />
    </div>
  );
});

export default FoldableEditor;
