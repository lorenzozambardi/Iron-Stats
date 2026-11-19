import { Calendar, CheckCircle2, AlertTriangle, SlidersHorizontal } from 'lucide-react';

export function ReadinessPanel({ dataset, loading, error, onOpenTimeline }) {
  if (loading) {
    return (
      <div className="sa-card sa-readiness-card">
        <div className="sa-muted">Indexing all macrocycles and body-composition logs…</div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="sa-card sa-readiness-card">
        <div className="sa-inline-alert err">
          <AlertTriangle size={15} />
          <span>{error || 'No logbook data found.'}</span>
        </div>
      </div>
    );
  }

  const { summary, capabilities, qualityFlags } = dataset;
  const rpeBadge =
    capabilities.rpeQuality === 'logged'
      ? { label: 'RPE Logged', cls: 'good' }
      : capabilities.rpeQuality === 'partial'
        ? { label: `RPE Partial (${Math.round(capabilities.rpeLoggedFraction * 100)}%)`, cls: 'warn' }
        : { label: 'RPE Assumed (9.0)', cls: 'warn' };

  const dateBadge =
    capabilities.dateAlignment === 'exact'
      ? { label: 'Dates: Exact', cls: 'good' }
      : capabilities.dateAlignment === 'approximate'
        ? { label: 'Dates: Approx', cls: 'info' }
        : { label: 'Dates: Sequential', cls: 'muted' };

  return (
    <section className="sa-card sa-readiness-card">
      <div className="sa-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="sa-section-title">Dataset Readiness</span>
          <span className={`sa-mini-badge ${capabilities.ready ? 'good' : 'err'}`}>
            {capabilities.ready ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
            {capabilities.ready ? 'Ready' : 'Insufficient Data'}
          </span>
          <span className={`sa-mini-badge ${rpeBadge.cls}`}>{rpeBadge.label}</span>
          <span className={`sa-mini-badge ${dateBadge.cls}`}>
            <Calendar size={11} /> {dateBadge.label}
          </span>
        </div>

        <button type="button" className="sa-pill-btn" onClick={onOpenTimeline}>
          <SlidersHorizontal size={13} /> Edit Timeline
        </button>
      </div>

      <div className="sa-kpi-row">
        <div className="sa-kpi-item">
          <span className="sa-kpi-val">
            {summary.nMacrocyclesIncluded}/{summary.nMacrocyclesTotal}
          </span>
          <span className="sa-kpi-label">Macrocycles</span>
        </div>
        <div className="sa-kpi-item">
          <span className="sa-kpi-val">{summary.nMicrocycles}</span>
          <span className="sa-kpi-label">Microcycles</span>
        </div>
        <div className="sa-kpi-item">
          <span className="sa-kpi-val">{summary.nSets}</span>
          <span className="sa-kpi-label">Logged Sets</span>
        </div>
        <div className="sa-kpi-item">
          <span className="sa-kpi-val">{summary.nExercises}</span>
          <span className="sa-kpi-label">Exercises</span>
        </div>
        <div className="sa-kpi-item">
          <span className="sa-kpi-val">{summary.nWeightLogs + summary.nBodyFatLogs}</span>
          <span className="sa-kpi-label">Body Logs</span>
        </div>
      </div>

      {!capabilities.ready && capabilities.blockingReasons.length > 0 && (
        <div className="sa-inline-alert err" style={{ marginTop: '10px' }}>
          <AlertTriangle size={14} />
          <span>{capabilities.blockingReasons.join(' ')}</span>
        </div>
      )}

      {qualityFlags.length > 0 && (
        <div className="sa-quality-notes">
          {qualityFlags.slice(0, 3).map((fl) => (
            <div key={fl.code} className="sa-quality-note">
              <span className={`sa-dot ${fl.severity}`} />
              <span>{fl.message}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
