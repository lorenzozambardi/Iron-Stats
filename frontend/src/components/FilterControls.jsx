import { useState, useRef, useEffect, useCallback } from 'react';

const mod = (n, m) => ((n % m) + m) % m;

/**
 * Minimal lateral (horizontal) circular lock-wheel picker.
 * Selected item is centered in white; neighbors left/right fade out in grayer shades.
 */
export const LockWheelPicker = ({ label, options, value, onChange, itemWidth = 84 }) => {
  const containerRef = useRef(null);

  const count = options.length;
  const activeIdx = Math.max(0, options.findIndex(o => String(o.value) === String(value)));

  const [virtualIdx, setVirtualIdx] = useState(activeIdx);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startVirtual: activeIdx, moved: false });
  const virtualRef = useRef(activeIdx);

  useEffect(() => {
    virtualRef.current = virtualIdx;
  }, [virtualIdx]);

  // Sync virtualIdx when external value changes (and not dragging)
  useEffect(() => {
    if (dragRef.current.active || count === 0) return;
    const currentMod = mod(Math.round(virtualRef.current), count);
    if (currentMod !== activeIdx) {
      let diff = activeIdx - currentMod;
      if (diff > count / 2) diff -= count;
      if (diff < -count / 2) diff += count;
      const nextV = Math.round(virtualRef.current) + diff;
      virtualRef.current = nextV;
      setVirtualIdx(nextV);
    }
  }, [activeIdx, count]);

  const commitStep = useCallback((targetVirtual) => {
    if (count === 0) return;
    const snapped = Math.round(targetVirtual);
    virtualRef.current = snapped;
    setVirtualIdx(snapped);
    const nextOption = options[mod(snapped, count)];
    if (nextOption && String(nextOption.value) !== String(value)) {
      onChange(nextOption.value);
    }
  }, [count, options, value, onChange]);

  // Non-passive wheel listener so spinning the dial doesn't scroll the page
  useEffect(() => {
    const el = containerRef.current;
    if (!el || count <= 1) return;
    let wheelAccum = 0;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      wheelAccum += delta;
      if (Math.abs(wheelAccum) >= 22) {
        const dir = wheelAccum > 0 ? 1 : -1;
        wheelAccum = 0;
        commitStep(Math.round(virtualRef.current) + dir);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, commitStep]);

  const handlePointerDown = (e) => {
    if (count <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startVirtual: virtualRef.current,
      moved: false
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 3) dragRef.current.moved = true;
    const nextV = dragRef.current.startVirtual - dx / itemWidth;
    virtualRef.current = nextV;
    setVirtualIdx(nextV);
  };

  const handlePointerUp = (e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragRef.current.moved) {
      commitStep(virtualRef.current);
    }
  };

  if (count === 0) return null;

  const baseCenter = Math.round(virtualIdx);
  const fracOffset = virtualIdx - baseCenter;
  const offsets = count === 1 ? [0] : [-2, -1, 0, 1, 2];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
      {label && (
        <span style={{
          fontSize: '0.68rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#ffffff',
          whiteSpace: 'nowrap',
          minWidth: '92px',
          flexShrink: 0,
          userSelect: 'none'
        }}>
          {label}
        </span>
      )}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          height: '28px',
          overflow: 'hidden',
          cursor: count > 1 ? (isDragging ? 'grabbing' : 'ew-resize') : 'default',
          touchAction: 'none',
          userSelect: 'none',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.45) 14%, #000 36%, #000 64%, rgba(0,0,0,0.45) 86%, transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.45) 14%, #000 36%, #000 64%, rgba(0,0,0,0.45) 86%, transparent 100%)',
        }}
      >
        {offsets.map((rel) => {
          const slotIdx = baseCenter + rel;
          const optIdx = mod(slotIdx, count);
          const opt = options[optIdx];
          const dist = Math.abs(rel - fracOffset);
          const isCenter = dist < 0.45;

          const opacity = Math.max(0.18, 1 - dist * 0.36);
          const scale = Math.max(0.84, 1 - dist * 0.07);
          const color = isCenter
            ? '#ffffff'
            : dist < 1.35
              ? '#9ca3af'
              : '#52525b';
          const xPx = (rel - fracOffset) * itemWidth;

          return (
            <div
              key={`${rel}-${optIdx}`}
              onClick={() => {
                if (!dragRef.current.moved && rel !== 0 && count > 1) {
                  commitStep(baseCenter + rel);
                }
              }}
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                height: '28px',
                width: `${itemWidth}px`,
                transform: `translateX(calc(-50% + ${xPx}px)) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                fontSize: isCenter ? '0.82rem' : '0.74rem',
                fontWeight: isCenter ? 700 : 500,
                color,
                opacity,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: rel !== 0 && count > 1 ? 'pointer' : 'inherit'
              }}
              title={opt.label}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Dual-thumb week interval slider.
 */
export const DualWeekSlider = ({
  weeks = [],
  fromVal,
  toVal,
  onChange,
  label = 'Weeks',
  accentColor = 'var(--accent-primary)'
}) => {
  const trackRef = useRef(null);
  const [draggingThumb, setDraggingThumb] = useState(null);
  const dragStateRef = useRef({ thumb: null, fromIdx: 0, toIdx: 0 });

  const maxIdx = Math.max(0, weeks.length - 1);
  const resolvedFrom = fromVal === 'all' ? 0 : Math.max(0, weeks.indexOf(parseInt(fromVal, 10)));
  const resolvedTo = toVal === 'all' ? maxIdx : Math.max(0, weeks.indexOf(parseInt(toVal, 10)));
  const fromIdx = Math.min(resolvedFrom, resolvedTo);
  const toIdx = Math.max(resolvedFrom, resolvedTo);

  const emitRange = useCallback((fIdx, tIdx) => {
    if (weeks.length === 0) return;
    if (fIdx <= 0 && tIdx >= maxIdx) {
      onChange('all', 'all');
    } else {
      onChange(String(weeks[fIdx]), String(weeks[tIdx]));
    }
  }, [weeks, maxIdx, onChange]);

  const idxFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el || maxIdx <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(frac * maxIdx);
  }, [maxIdx]);

  const handlePointerDown = (e) => {
    if (weeks.length <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const thumbAttr = e.target.getAttribute('data-thumb');
    const clickIdx = idxFromClientX(e.clientX);

    let activeThumb = thumbAttr;
    if (!activeThumb) {
      const distFrom = Math.abs(clickIdx - fromIdx);
      const distTo = Math.abs(clickIdx - toIdx);
      if (distFrom === distTo) {
        activeThumb = clickIdx < fromIdx ? 'from' : 'to';
      } else {
        activeThumb = distFrom < distTo ? 'from' : 'to';
      }
    }

    dragStateRef.current = { thumb: activeThumb, fromIdx, toIdx };
    setDraggingThumb(activeThumb);

    if (!thumbAttr) {
      if (activeThumb === 'from') {
        const nextF = Math.min(clickIdx, toIdx);
        dragStateRef.current.fromIdx = nextF;
        emitRange(nextF, toIdx);
      } else {
        const nextT = Math.max(clickIdx, fromIdx);
        dragStateRef.current.toIdx = nextT;
        emitRange(fromIdx, nextT);
      }
    }
  };

  const handlePointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st.thumb) return;
    const idx = idxFromClientX(e.clientX);
    if (st.thumb === 'from') {
      const nextF = Math.min(idx, st.toIdx);
      if (nextF !== st.fromIdx) {
        st.fromIdx = nextF;
        emitRange(nextF, st.toIdx);
      }
    } else {
      const nextT = Math.max(idx, st.fromIdx);
      if (nextT !== st.toIdx) {
        st.toIdx = nextT;
        emitRange(st.fromIdx, nextT);
      }
    }
  };

  const handlePointerUp = (e) => {
    if (!dragStateRef.current.thumb) return;
    dragStateRef.current.thumb = null;
    setDraggingThumb(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (weeks.length === 0) return null;

  const isAll = fromVal === 'all' && toVal === 'all';
  const leftPct = maxIdx > 0 ? (fromIdx / maxIdx) * 100 : 0;
  const rightPct = maxIdx > 0 ? (toIdx / maxIdx) * 100 : 100;
  const rangeText = weeks.length === 1
    ? `W${weeks[0]}`
    : isAll
      ? `All (W${weeks[0]}–W${weeks[maxIdx]})`
      : fromIdx === toIdx
        ? `W${weeks[fromIdx]}`
        : `W${weeks[fromIdx]}–W${weeks[toIdx]}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
      <span style={{
        fontSize: '0.68rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#ffffff',
        whiteSpace: 'nowrap',
        minWidth: '92px',
        flexShrink: 0,
        userSelect: 'none'
      }}>
        {label}
      </span>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'relative',
            flex: 1,
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            cursor: weeks.length > 1 ? 'pointer' : 'default',
            touchAction: 'none',
            userSelect: 'none'
          }}
        >
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '4px',
            borderRadius: '99px',
            background: 'rgba(255, 255, 255, 0.14)'
          }} />

          <div style={{
            position: 'absolute',
            left: `${leftPct}%`,
            width: `${Math.max(0, rightPct - leftPct)}%`,
            height: '4px',
            borderRadius: '99px',
            background: accentColor,
          }} />

          {weeks.length > 1 && (
            <div
              data-thumb="from"
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: draggingThumb === 'from' ? '18px' : '14px',
                height: draggingThumb === 'from' ? '18px' : '14px',
                borderRadius: '50%',
                background: '#ffffff',
                border: `2px solid ${accentColor}`,
                boxShadow: '0 1px 6px rgba(0,0,0,0.6)',
                transform: 'translateX(-50%)',
                transition: draggingThumb === 'from' ? 'none' : 'left 100ms ease, width 100ms ease, height 100ms ease',
                zIndex: draggingThumb === 'from' ? 4 : 3,
                cursor: 'grab'
              }}
            />
          )}

          {weeks.length > 1 && (
            <div
              data-thumb="to"
              style={{
                position: 'absolute',
                left: `${rightPct}%`,
                width: draggingThumb === 'to' ? '18px' : '14px',
                height: draggingThumb === 'to' ? '18px' : '14px',
                borderRadius: '50%',
                background: '#ffffff',
                border: `2px solid ${accentColor}`,
                boxShadow: '0 1px 6px rgba(0,0,0,0.6)',
                transform: 'translateX(-50%)',
                transition: draggingThumb === 'to' ? 'none' : 'left 100ms ease, width 100ms ease, height 100ms ease',
                zIndex: draggingThumb === 'to' ? 4 : 3,
                cursor: 'grab'
              }}
            />
          )}
        </div>

        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {rangeText}
        </span>
      </div>
    </div>
  );
};
