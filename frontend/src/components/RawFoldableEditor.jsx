import { useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { foldGutter } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { customFoldService } from './customFoldService';

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: '#e2e8f0',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: '0.88rem'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    lineHeight: '1.6'
  },
  '.cm-content': {
    padding: '14px 0',
    caretColor: '#fff',
    minHeight: '100%'
  },
  '.cm-line': {
    padding: '0 8px'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-muted, #71717a)',
    border: 'none',
    borderRight: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
    userSelect: 'none'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '28px',
    textAlign: 'right'
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 6px 0 2px',
    cursor: 'pointer',
    color: 'var(--text-muted, #71717a)',
    transition: 'color 0.15s ease'
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: 'var(--accent-primary, #6366f1)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
    color: 'var(--accent-primary, #818cf8)',
    borderRadius: '3px',
    padding: '0 4px',
    margin: '0 4px',
    cursor: 'pointer',
    fontFamily: 'inherit'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#fff'
  },
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--bg-glass-active, #18181b) !important',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15)) !important',
    borderRadius: '6px !important',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5) !important'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-primary-subtle, rgba(99, 102, 241, 0.2)) !important',
    color: 'var(--accent-primary, #818cf8) !important'
  }
}, { dark: true });

export default function RawFoldableEditor({
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

          // Only autocomplete if we are typing an exercise name (before '|', not starting with # or digit)
          if (
            textBefore.includes('|') ||
            textBefore.trim().startsWith('#') ||
            /^\d/.test(textBefore.trim())
          ) {
            return null;
          }

          const query = textBefore.trim().toLowerCase();
          if (query.length < 2 || !exercisesDb || exercisesDb.length === 0) {
            return null;
          }

          const matches = exercisesDb
            .filter(ex => ex.name.toLowerCase().includes(query))
            .slice(0, 8)
            .map(ex => ({
              label: ex.name,
              type: 'keyword',
              detail: Object.keys(ex.muscles_distr || {})[0] || '',
              apply: `${ex.name} | 2'`
            }));

          if (matches.length === 0) return null;

          return {
            from: line.from,
            options: matches
          };
        }
      ]
    });
  }, [exercisesDb]);

  const extensions = useMemo(() => [
    customFoldService,
    foldGutter(),
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
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <CodeMirror
        value={value}
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={handleChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false, // We use custom foldGutter with our foldService
          highlightActiveLineGutter: true,
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
