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

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

const MathBlock = ({ children, color }) => (
  <div style={{
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '10px 12px',
    borderRadius: '8px',
    margin: '8px 0 12px 0',
    borderLeft: `3px solid ${color}`,
    color: '#f8fafc',
    lineHeight: '1.5',
    overflowX: 'auto'
  }}>
    {children}
  </div>
);


export { Latex, MathBlock };
