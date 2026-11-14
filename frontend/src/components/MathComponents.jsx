import { useMemo } from 'react';
import katex from 'katex';

const Latex = ({ math, block = false }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false
      });
    } catch (err) {
      console.error("KaTeX rendering error:", err);
      return math;
    }
  }, [math]);

  if (block) {
    return (
      <div
        className="katex-wrap-block"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const MathBlock = ({ children, color }) => (
  <div
    className="math-block-card"
    style={{
      background: 'rgba(255, 255, 255, 0.025)',
      border: '1px solid var(--border-color)',
      borderLeft: `3px solid ${color}`,
      padding: '14px 16px',
      borderRadius: '10px',
      margin: '8px 0 12px 0',
      color: '#f8fafc',
      lineHeight: '1.7',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}
  >
    {children}
  </div>
);

export { Latex, MathBlock };
