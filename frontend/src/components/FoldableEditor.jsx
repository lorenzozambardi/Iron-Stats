import { useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { foldGutter } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
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
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--bg-glass-active, #18181b) !important',
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

export default function FoldableEditor({
  value,
  onChange,
  exercisesDb = [],
  onCursorLineChange
}) {
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
          if (query.length < 2 || !exercisesDb || exercisesDb.length === 0) {
            return null;
          }

          const scored = exercisesDb
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
  }, [exercisesDb]);

  const extensions = useMemo(() => [
    customFoldService,
    foldGutterExtension,
    EditorView.lineWrapping,
    exerciseCompletion,
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet && onCursorLineChange) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onCursorLineChange(line.number - 1);
      }
    })
  ], [exerciseCompletion, onCursorLineChange]);

  const handleChange = useCallback((val) => {
    onChange(val);
  }, [onChange]);

  return (
    <div className="foldable-editor-root">
      <CodeMirror
        value={value}
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={handleChange}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: true,
          history: true,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false
        }}
      />
    </div>
  );
}
