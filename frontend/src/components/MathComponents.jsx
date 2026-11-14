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

const MathBlock = ({ children, color }) => (
  <div
    style={{
      background: 'rgba(255, 255, 255, 0.025)',
      border: '1px solid var(--border-color)',
      borderLeft: `3px solid ${color}`,
      padding: '12px 14px',
      borderRadius: '10px',
      margin: '8px 0 12px 0',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}
  >
    {children}
  </div>
);

export { Latex, MathBlock };
