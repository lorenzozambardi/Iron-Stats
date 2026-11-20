import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Plus } from 'lucide-react';
import {
  CIRCUMFERENCE_FIELDS,
  CIRCUMFERENCE_LOG_KEYS,
  PROFILE_LOG_META,
  calcAge,
  formatDisplayDate,
  formatProfileLogValue,
} from '../profileUtils';

const cardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const sectionTitleStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)',
  margin: 0,
};

const inputStyle = {
  width: '100%',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  outline: 'none',
};

const formatLocalYMD = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function FormattedDateInput({ value, max, dateFormat, onChange, ariaLabel, style }) {
  return (
    <div
      style={{
        ...inputStyle,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        cursor: 'pointer',
        ...style,
      }}
    >
      <span>{value ? formatDisplayDate(value, dateFormat) : '—'}</span>
      <Calendar size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        type="date"
        value={value}
        max={max}
        aria-label={ariaLabel}
        onChange={onChange}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Ignore browsers where showPicker is restricted
          }
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

export default function ProfileEasyEditor({ profile, onChange, dateFormat = 'dd/mm/yyyy' }) {
  const todayStr = useMemo(() => formatLocalYMD(), []);
  const [logDate, setLogDate] = useState(() => formatLocalYMD());
  const [pendingConfirm, setPendingConfirm] = useState(null);

  const { current: savedCurrent, logs = [] } = profile;
  const [current, setDraftCurrent] = useState(savedCurrent);
  const prevSavedRef = useRef(savedCurrent);

  useEffect(() => {
    const prev = prevSavedRef.current;
    const changedKeys = Object.keys(savedCurrent).filter((k) => savedCurrent[k] !== prev[k]);
    if (changedKeys.length > 0) {
      setDraftCurrent((d) => {
        const updated = { ...d };
        for (const k of changedKeys) updated[k] = savedCurrent[k];
        return updated;
      });
    }
    prevSavedRef.current = savedCurrent;
  }, [savedCurrent]);

  const age = useMemo(() => calcAge(current.birthDate), [current.birthDate]);

  const SCALAR_KEYS = new Set(['birthDate', 'sex', 'height', 'avgSteps']);

  const updateCurrent = (key, rawVal) => {
    const isStringField = key === 'birthDate' || key === 'sex';
    let nextVal;
    if (isStringField) {
      nextVal = rawVal;
    } else if (rawVal === '') {
      nextVal = '';
    } else {
      const val = parseFloat(rawVal);
      nextVal = Number.isFinite(val) ? val : 0;
    }
    const nextCurrent = { ...current, [key]: nextVal };
    setDraftCurrent(nextCurrent);
    if (SCALAR_KEYS.has(key)) {
      onChange({ ...profile, current: nextCurrent });
    }
  };

  const getTypesToLog = (typeOrTypes) => {
    let candidates;
    if (typeOrTypes === 'all') {
      candidates = ['weight', 'bodyFat', ...CIRCUMFERENCE_LOG_KEYS];
    } else if (typeOrTypes === 'circumferences') {
      candidates = CIRCUMFERENCE_LOG_KEYS;
    } else if (Array.isArray(typeOrTypes)) {
      candidates = typeOrTypes;
    } else {
      candidates = [typeOrTypes];
    }
    return candidates.filter((t) => {
      const raw = current[t];
      if (raw === '' || raw === null || raw === undefined) return false;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0;
    });
  };

  const applyLogStat = (typesToWrite) => {
    const targetDate = logDate || todayStr;
    const targetTs = Date.parse(`${targetDate}T12:00:00`) || Date.now();
    const now = Date.now();
    const filtered = logs.filter(
      (item) => !(item.date === targetDate && typesToWrite.includes(item.type))
    );
    const newEntries = typesToWrite.map((t) => ({
      id: `${now}-${t}`,
      date: targetDate,
      ts: targetTs,
      type: t,
      value: Number(current[t]) || 0,
    }));
    const merged = [...newEntries, ...filtered].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0)
    );
    onChange({ ...profile, logs: merged.slice(0, 2000) });
  };

  const handleLogStat = (typeOrTypes) => {
    const typesToWrite = getTypesToLog(typeOrTypes);
    if (typesToWrite.length === 0) return;

    const targetDate = logDate || todayStr;
    const conflicts = logs.filter(
      (item) => item.date === targetDate && typesToWrite.includes(item.type)
    );

    if (conflicts.length > 0) {
      const displayDate = formatDisplayDate(targetDate, dateFormat);
      const formattedConflicts = conflicts.map((c) => {
        const label = PROFILE_LOG_META[c.type]?.label || c.type;
        return `${label} (${formatProfileLogValue(c.type, c.value)})`;
      });
      const details = formattedConflicts.length <= 3
        ? formattedConflicts.join(', ')
        : `${formattedConflicts.slice(0, 2).join(', ')} and ${formattedConflicts.length - 2} more`;
      setPendingConfirm({
        title: `Overwrite log for ${displayDate}?`,
        message: `You already logged ${details} for ${displayDate}. Continuing will overwrite that day's entry.`,
        confirmLabel: 'Overwrite',
        accentColor: 'var(--color-volume)',
        onConfirm: () => applyLogStat(typesToWrite),
      });
      return;
    }

    applyLogStat(typesToWrite);
  };

  return (
    <div
      className="easy-editor-container"
      style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '14px', overflowY: 'auto', height: '100%' }}
    >
      {/* Log Date + Log All */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'stretch' }}>
          <FormattedDateInput
            value={logDate}
            max={todayStr}
            dateFormat={dateFormat}
            ariaLabel="Log date"
            onChange={(e) => setLogDate(e.target.value || todayStr)}
            style={{ width: '100%', padding: '7px 14px', fontSize: '0.78rem', borderRadius: '999px', justifyContent: 'center' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={() => handleLogStat('all')}
          >
            <Plus size={14} /> Log All
          </button>
        </div>
      </div>

      {/* Core Biometrics */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Core Biometrics</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">
              Birth Date{age !== null ? ` · ${age} yrs` : ''}
            </span>
            <FormattedDateInput
              value={current.birthDate || ''}
              max={todayStr}
              dateFormat={dateFormat}
              ariaLabel="Birth Date"
              onChange={(e) => updateCurrent('birthDate', e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">Sex</span>
            <select
              style={inputStyle}
              value={current.sex || 'M'}
              onChange={(e) => updateCurrent('sex', e.target.value)}
            >
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">Height (cm)</span>
            <input
              type="number"
              step="1"
              min="100"
              max="250"
              style={inputStyle}
              value={current.height}
              onChange={(e) => updateCurrent('height', e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">Avg. Steps / Day</span>
            <input
              type="number"
              step="500"
              min="0"
              max="100000"
              style={inputStyle}
              value={current.avgSteps ?? 8000}
              onChange={(e) => updateCurrent('avgSteps', e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">Weight (kg)</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                step="0.1"
                min="20"
                max="300"
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                value={current.weight}
                onChange={(e) => updateCurrent('weight', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                onClick={() => handleLogStat('weight')}
              >
                <Plus size={14} /> Log
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span className="profile-stat-label">Body Fat (%)</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                step="0.1"
                min="3"
                max="60"
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                value={current.bodyFat}
                onChange={(e) => updateCurrent('bodyFat', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                onClick={() => handleLogStat('bodyFat')}
              >
                <Plus size={14} /> Log
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Circumferences */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={sectionTitleStyle}>Circumferences (cm)</h3>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '5px 12px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={() => handleLogStat('circumferences')}
          >
            <Plus size={13} /> Log Circumferences
          </button>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
        }}>
          {CIRCUMFERENCE_FIELDS.map((field) => (
            <div
              key={field.key}
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <span className="profile-stat-label">{field.label} (cm)</span>
                {field.bilateral && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      flexShrink: 0,
                    }}
                    onClick={() => handleLogStat([field.leftKey, field.rightKey])}
                  >
                    <Plus size={11} /> Log
                  </button>
                )}
              </div>
              {field.bilateral ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>L</span>
                    <input
                      type="number"
                      step="0.5"
                      min="10"
                      max="250"
                      style={inputStyle}
                      value={current[field.leftKey] ?? ''}
                      onChange={(e) => updateCurrent(field.leftKey, e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>R</span>
                    <input
                      type="number"
                      step="0.5"
                      min="10"
                      max="250"
                      style={inputStyle}
                      value={current[field.rightKey] ?? ''}
                      onChange={(e) => updateCurrent(field.rightKey, e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    step="0.5"
                    min="10"
                    max="250"
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    value={current[field.key] ?? ''}
                    onChange={(e) => updateCurrent(field.key, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      padding: '7px 14px',
                      fontSize: '0.78rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexShrink: 0,
                    }}
                    onClick={() => handleLogStat(field.key)}
                  >
                    <Plus size={14} /> Log
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {pendingConfirm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-editor-confirm-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 10010,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setPendingConfirm(null)}
        >
          <div
            style={{
              ...cardStyle,
              maxWidth: '400px',
              width: '100%',
              borderColor: pendingConfirm.accentColor,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="profile-editor-confirm-title"
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: pendingConfirm.accentColor,
              }}
            >
              {pendingConfirm.title}
            </h3>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {pendingConfirm.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="btn"
                style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                onClick={() => setPendingConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                onClick={() => {
                  pendingConfirm.onConfirm();
                  setPendingConfirm(null);
                }}
              >
                {pendingConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
