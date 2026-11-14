import { useState, useRef, useEffect, useCallback } from 'react';

const mod = (n, m) => ((n % m) + m) % m;

/**
 * Combination-lock style circular vertical wheel picker.
 * Selected item is centered in white; neighbors above/below step down in gray and fade out.
 */
export const LockWheelPicker = ({ label, options, value, onChange, width = '130px', accentColor = 'var(--accent-primary)' }) => {
  const containerRef = useRef(null);
  const ITEM_H = 24;
  const HALF_VISIBLE = 2; // 2 neighbors above + 1 center + 2 below = 5 rows

  const count = options.length;
  const activeIdx = Math.max(0, options.findIndex(o => String(o.value) === String(value)));

  // Continuous virtual index (can go negative or >= count for seamless circular drag)
  const [virtualIdx, setVirtualIdx] = useState(activeIdx);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, startVirtual: activeIdx, moved: false });
  const virtualRef = useRef(activeIdx);

  useEffect(() => {
    virtualRef.current = virtualIdx;
  }, [virtualIdx]);

  // Sync virtualIdx when external value changes (and not dragging)
  useEffect(() => {
    if (dragRef.current.active || count === 0) return;
    const currentMod = mod(Math.round(virtualRef.current), count);
    if (currentMod !== activeIdx) {
      // Move by shortest circular distance
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
      wheelAccum += e.deltaY;
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
      startY: e.clientY,
      startVirtual: virtualRef.current,
      moved: false
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 3) dragRef.current.moved = true;
    // Dragging up advances index (like spinning a lock wheel upward)
    const nextV = dragRef.current.startVirtual - dy / ITEM_H;
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
  const fracOffset = virtualIdx - baseCenter; // [-0.5, 0.5]
  const offsets = count === 1 ? [0] : [-2, -1, 0, 1, 2];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width, flexShrink: 0 }}>
      {label && (
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: String(value) !== 'all' && String(value) !== '' ? accentColor : 'var(--text-muted)',
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
          width: '100%',
          height: `${ITEM_H * (HALF_VISIBLE * 2 + 1)}px`,
          overflow: 'hidden',
          cursor: count > 1 ? (isDragging ? 'grabbing' : 'ns-resize') : 'default',
          touchAction: 'none',
          userSelect: 'none',
          background: 'rgba(0, 0, 0, 0.28)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: 'inset 0 6px 14px rgba(0,0,0,0.55), inset 0 -6px 14px rgba(0,0,0,0.55)',
        }}
      >
        {/* Center lock-slot highlight band */}
        <div
          style={{
            position: 'absolute',
            left: '4px',
            right: '4px',
            top: '50%',
            height: `${ITEM_H}px`,
            transform: 'translateY(-50%)',
            background: 'rgba(255, 255, 255, 0.06)',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {/* Circular options with top/bottom fade mask */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 18%, #000 38%, #000 62%, rgba(0,0,0,0.55) 82%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 18%, #000 38%, #000 62%, rgba(0,0,0,0.55) 82%, transparent 100%)',
            zIndex: 2
          }}
        >
          {offsets.map((rel) => {
            const slotIdx = baseCenter + rel;
            const optIdx = mod(slotIdx, count);
            const opt = options[optIdx];
            const dist = Math.abs(rel - fracOffset);
            const isCenter = dist < 0.45;

            // Grayer & smaller as distance from center grows
            const opacity = Math.max(0.18, 1 - dist * 0.36);
            const scale = Math.max(0.82, 1 - dist * 0.075);
            const color = isCenter
              ? '#ffffff'
              : dist < 1.35
                ? '#a1a1aa'
                : '#52525b';
            const yPx = (HALF_VISIBLE + rel - fracOffset) * ITEM_H;

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
                  left: 0,
                  right: 0,
                  top: 0,
                  height: `${ITEM_H}px`,
                  transform: `translateY(${yPx}px) scale(${scale})`,
                  transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 8px',
                  fontSize: isCenter ? '0.82rem' : '0.75rem',
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
  const [draggingThumb, setDraggingThumb] = useState(null); // 'from' | 'to' | null
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
        : `W${weeks[fromIdx]} – W${weeks[toIdx]}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 220px', minWidth: '180px', padding: '4px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: isAll ? 'var(--text-muted)' : accentColor
        }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>{rangeText}</span>
          {!isAll && (
            <button
              type="button"
              onClick={() => onChange('all', 'all')}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '99px',
                fontSize: '0.65rem',
                padding: '1px 7px',
                cursor: 'pointer'
              }}
            >
              All
            </button>
          )}
        </div>
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          cursor: weeks.length > 1 ? 'pointer' : 'default',
          touchAction: 'none',
          userSelect: 'none'
        }}
      >
        {/* Base rail */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '5px',
          borderRadius: '99px',
          background: 'rgba(255, 255, 255, 0.12)'
        }} />

        {/* Active interval bar */}
        <div style={{
          position: 'absolute',
          left: `${leftPct}%`,
          width: `${Math.max(0, rightPct - leftPct)}%`,
          height: '5px',
          borderRadius: '99px',
          background: accentColor,
          boxShadow: `0 0 10px ${accentColor}`
        }} />

        {/* Week tick dots */}
        {weeks.length > 1 && weeks.length <= 20 && weeks.map((w, i) => {
          const pct = (i / maxIdx) * 100;
          const inRange = i >= fromIdx && i <= toIdx;
          return (
            <span
              key={w}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                width: '3px',
                height: '3px',
                borderRadius: '50%',
                transform: 'translateX(-50%)',
                background: inRange ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)',
                pointerEvents: 'none'
              }}
            />
          );
        })}

        {/* From Thumb */}
        {weeks.length > 1 && (
          <div
            data-thumb="from"
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              width: draggingThumb === 'from' ? '20px' : '16px',
              height: draggingThumb === 'from' ? '20px' : '16px',
              borderRadius: '50%',
              background: '#ffffff',
              border: `2.5px solid ${accentColor}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              transform: 'translateX(-50%)',
              transition: draggingThumb === 'from' ? 'none' : 'left 100ms ease, width 100ms ease, height 100ms ease',
              zIndex: draggingThumb === 'from' ? 4 : 3,
              cursor: 'grab'
            }}
          />
        )}

        {/* To Thumb */}
        {weeks.length > 1 && (
          <div
            data-thumb="to"
            style={{
              position: 'absolute',
              left: `${rightPct}%`,
              width: draggingThumb === 'to' ? '20px' : '16px',
              height: draggingThumb === 'to' ? '20px' : '16px',
              borderRadius: '50%',
              background: '#ffffff',
              border: `2.5px solid ${accentColor}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              transform: 'translateX(-50%)',
              transition: draggingThumb === 'to' ? 'none' : 'left 100ms ease, width 100ms ease, height 100ms ease',
              zIndex: draggingThumb === 'to' ? 4 : 3,
              cursor: 'grab'
            }}
          />
        )}
      </div>

      {/* Min / Max labels */}
      {weeks.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '-4px' }}>
          <span>W{weeks[0]}</span>
          {weeks.length > 4 && <span>W{weeks[Math.floor(maxIdx / 2)]}</span>}
          <span>W{weeks[maxIdx]}</span>
        </div>
      )}
    </div>
  );
};
