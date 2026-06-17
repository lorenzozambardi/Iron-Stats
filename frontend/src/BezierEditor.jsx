import React, { useState, useRef, useEffect } from 'react';

const BezierEditor = ({ value, onChange }) => {
  // value is { y0, x1, y1, x2, y2, y3 }
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'p0', 'p1', 'p2', 'p3'

  const paddingX = 20;
  const paddingY = 20;
  const innerWidth = 300 - paddingX * 2;
  const innerHeight = 200 - paddingY * 2;

  const toSvgX = (x) => paddingX + x * innerWidth;
  const toSvgY = (y) => paddingY + innerHeight - (y * innerHeight);

  const fromSvgX = (svgX) => Math.max(0, Math.min(1, (svgX - paddingX) / innerWidth));
  const fromSvgY = (svgY) => Math.max(0, Math.min(1, (paddingY + innerHeight - svgY) / innerHeight));

  const handlePointerDown = (e, point) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(point);
  };

  const handlePointerMove = (e) => {
    if (!dragging || !svgRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const y = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    
    const svgX = x - rect.left;
    const svgY = y - rect.top;
    
    const newX = fromSvgX(svgX);
    const newY = fromSvgY(svgY);
    
    const nextVal = { ...value };
    
    if (dragging === 'p0') {
      nextVal.y0 = newY;
    } else if (dragging === 'p3') {
      nextVal.y3 = newY;
    } else if (dragging === 'p1') {
      nextVal.x1 = newX;
      nextVal.y1 = newY;
    } else if (dragging === 'p2') {
      nextVal.x2 = newX;
      nextVal.y2 = newY;
    }
    
    onChange(nextVal);
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('touchmove', handlePointerMove);
        window.removeEventListener('touchend', handlePointerUp);
      };
    }
  }, [dragging, value, onChange]);

  const p0 = { x: 0, y: value.y0 ?? 1 };
  const p1 = { x: value.x1 ?? 0.33, y: value.y1 ?? 1 };
  const p2 = { x: value.x2 ?? 0.66, y: value.y2 ?? 1 };
  const p3 = { x: 1, y: value.y3 ?? 1 };

  const pathD = `M ${toSvgX(p0.x)} ${toSvgY(p0.y)} C ${toSvgX(p1.x)} ${toSvgY(p1.y)}, ${toSvgX(p2.x)} ${toSvgY(p2.y)}, ${toSvgX(p3.x)} ${toSvgY(p3.y)}`;

  return (
    <div style={{ position: 'relative', width: '300px', height: '200px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-accent)', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
      <svg 
        ref={svgRef} 
        width="300" 
        height="200" 
        style={{ cursor: dragging ? 'grabbing' : 'default', touchAction: 'none' }}
      >
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-volume)" />
            <stop offset="100%" stopColor="var(--color-tonnage)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1={paddingX} y1={paddingY + innerHeight / 2} x2={paddingX + innerWidth} y2={paddingY + innerHeight / 2} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <line x1={paddingX + innerWidth / 2} y1={paddingY} x2={paddingX + innerWidth / 2} y2={paddingY + innerHeight} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        
        {/* Handle lines */}
        <line x1={toSvgX(p0.x)} y1={toSvgY(p0.y)} x2={toSvgX(p1.x)} y2={toSvgY(p1.y)} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1={toSvgX(p3.x)} y1={toSvgY(p3.y)} x2={toSvgX(p2.x)} y2={toSvgY(p2.y)} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="3 3" />
        
        {/* Curve */}
        <path d={pathD} fill="none" stroke="url(#curveGradient)" strokeWidth="4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.3))' }} />
        
        {/* Control points (Maniglie blu) */}
        <circle cx={toSvgX(p1.x)} cy={toSvgY(p1.y)} r="7" fill="var(--bg-primary)" stroke="var(--accent-secondary)" strokeWidth="2.5" style={{ cursor: 'grab' }} onPointerDown={(e) => handlePointerDown(e, 'p1')} />
        <circle cx={toSvgX(p2.x)} cy={toSvgY(p2.y)} r="7" fill="var(--bg-primary)" stroke="var(--accent-secondary)" strokeWidth="2.5" style={{ cursor: 'grab' }} onPointerDown={(e) => handlePointerDown(e, 'p2')} />
        
        {/* End points */}
        <circle cx={toSvgX(p0.x)} cy={toSvgY(p0.y)} r="8" fill="var(--color-volume)" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => handlePointerDown(e, 'p0')} />
        <circle cx={toSvgX(p3.x)} cy={toSvgY(p3.y)} r="8" fill="var(--color-tonnage)" style={{ cursor: 'ns-resize' }} onPointerDown={(e) => handlePointerDown(e, 'p3')} />
      </svg>
      {/* Labels */}
      <div style={{ position: 'absolute', bottom: '6px', left: '8px', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>STRETCH</div>
      <div style={{ position: 'absolute', bottom: '6px', right: '8px', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>CONTRACTED</div>
    </div>
  );
};

export default BezierEditor;
