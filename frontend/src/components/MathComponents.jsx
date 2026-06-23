import React, { useState, useEffect } from 'react';

let katexPromise = null;
const loadKatex = () => {
  if (!katexPromise) {
    katexPromise = import('katex').then((module) => module.default || module);
  }
  return katexPromise;
};

const Latex = ({ math, block = false }) => {
  const [html, setHtml] = useState(math);

  useEffect(() => {
    let active = true;
    loadKatex().then((katex) => {
      if (!active) return;
      try {
        const rendered = katex.renderToString(math, {
          displayMode: block,
          throwOnError: false
        });
        setHtml(rendered);
      } catch (err) {
        console.error("KaTeX rendering error:", err);
      }
    });
    return () => {
      active = false;
    };
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
