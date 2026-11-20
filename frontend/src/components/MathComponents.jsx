import { useMemo } from 'react';
import katex from 'katex';

const Latex = ({ math, block = false }) => {
  const { html, error } = useMemo(() => {
    try {
      return {
        html: katex.renderToString(math, {
          displayMode: block,
          throwOnError: false
        }),
        error: false,
      };
    } catch (err) {
      console.error("KaTeX rendering error:", err);
      return { html: '', error: true };
    }
  }, [math, block]);

  if (block) {
    const blockStyle = {
      fontSize: 'clamp(0.72rem, 2.6vw, 0.94rem)',
      lineHeight: 1.5,
      maxWidth: '100%',
    };
    if (error) {
      return <div style={blockStyle}>{math}</div>;
    }
    return <div style={blockStyle} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (error) {
    return <span>{math}</span>;
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
