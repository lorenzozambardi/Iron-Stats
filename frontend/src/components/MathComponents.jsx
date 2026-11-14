import { useMemo } from 'react';
import katex from 'katex';

const Latex = ({ math, block = false }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false
      });
    } catch (err) {
      console.error("KaTeX rendering error:", err);
      return math;
    }
  }, [math, block]);

  if (block) {
    return (
      <div
        style={{
          fontSize: 'clamp(0.72rem, 2.6vw, 0.94rem)',
          lineHeight: 1.5,
          maxWidth: '100%',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const MathBlock = ({ children }) => (
  <div
    style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      padding: '14px 16px',
      borderRadius: '12px',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overflowX: 'auto',
    }}
  >
    {children}
  </div>
);

export { Latex, MathBlock };
