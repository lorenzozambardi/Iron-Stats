import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Settings, Target, BookOpen, Sliders, Activity, Scale, Play, Save, Bot } from 'lucide-react';
import { MUSCLES } from '../parser';

const MACRO_MUSCLES = Array.from(new Set(Object.values(MUSCLES))).sort();

const MACRO_SUB_MAP = {};
Object.entries(MUSCLES).forEach(([sub, macro]) => {
  if (!MACRO_SUB_MAP[macro]) MACRO_SUB_MAP[macro] = [];
  MACRO_SUB_MAP[macro].push(sub);
});

const CURVE_OPTIONS = [
  { id: 'constant', label: 'Costante (Piatta)' },
  { id: 'sigmoid', label: 'Sigmoide (Enfasi Contrazione)' },
  { id: 'inv_sigmoid', label: 'Sigmoide Inversa (Enfasi Allungamento)' },
  { id: 'linear', label: 'Lineare Decrescente' }
];

export default function GeneratorConfig({ isMobile }) {
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <Bot size={48} color="var(--accent-primary)" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Generator Mobile</h2>
        <p>Work in progress...<br />Please use the desktop version for now.</p>
      </div>
    );
  }

  const [markdownContent, setMarkdownContent] = useState('');

  // Form State
  const [globalParams, setGlobalParams] = useState({
    days: 4,
    minSets: 1, maxSets: 6,
    minReps: 5, maxReps: 20,
    minEx: 3, maxEx: 10,
    iterations: 10000,
    calibrationSteps: 1000
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [error, setError] = useState(null);
  const [rightTab, setRightTab] = useState('info');

  const [weights, setWeights] = useState({
    curve: 0.0,
    vol: 0.0,
    ton: 0.0,
    tut: 0.0,
    distr: 0.0,
    variety: 0.0,
    balance: 0.0
  });

  const calculateSoftmax = (wObj) => {
    const keys = Object.keys(wObj);
    // Trucco di stabilizzazione numerica per Softmax: sottrarre il massimo per evitare Infinity
    const maxVal = Math.max(...keys.map(k => wObj[k]));
    const expValues = keys.map(k => Math.exp(wObj[k] - maxVal));
    const sumExp = expValues.reduce((a, b) => a + b, 0);
    const normalized = {};
    keys.forEach((k, i) => {
      normalized[k] = expValues[i] / sumExp;
    });
    return normalized;
  };
  
  const normalizedWeights = useMemo(() => calculateSoftmax(weights), [weights]);

  const [targets, setTargets] = useState({
    vol: 100,
    ton: 100,
    tut: 100
  });

  const [muscleCurves, setMuscleCurves] = useState(() => {
    const initial = {};
    MACRO_MUSCLES.forEach(m => initial[m] = 'inv_sigmoid');
    return initial;
  });


  const [volumeDist, setVolumeDist] = useState(() => {
    const initial = { macros: {}, subs: {} };
    const numMacros = MACRO_MUSCLES.length;
    const baseMacroPct = Math.floor(100 / numMacros);
    let macroRemainder = 100 - baseMacroPct * numMacros;

    MACRO_MUSCLES.forEach(m => {
      initial.macros[m] = baseMacroPct + (macroRemainder > 0 ? 1 : 0);
      macroRemainder--;
      
      initial.subs[m] = {};
      const subs = MACRO_SUB_MAP[m];
      const baseSubPct = Math.floor(100 / subs.length);
      let subRemainder = 100 - baseSubPct * subs.length;
      
      subs.forEach(s => {
        initial.subs[m][s] = baseSubPct + (subRemainder > 0 ? 1 : 0);
        subRemainder--;
      });
    });
    return initial;
  });

  const [expandedMacro, setExpandedMacro] = useState(null);

  useEffect(() => {
    fetch('/GENERATOR_MATH_MODEL.md')
      .then(res => res.text())
      .then(text => setMarkdownContent(text))
      .catch(err => console.error("Failed to load Markdown", err));
  }, []);

  const handleGenerate = async () => {
    
    setIsGenerating(true);
    setError(null);
    setGeneratedResult(null);
    
    try {
      const payload = {
        days: globalParams.days,
        minSets: globalParams.minSets, maxSets: globalParams.maxSets,
        minReps: globalParams.minReps, maxReps: globalParams.maxReps,
        minEx: globalParams.minEx, maxEx: globalParams.maxEx,
        iterations: globalParams.iterations,
        calibrationSteps: globalParams.calibrationSteps,
        weights: normalizedWeights,
        ratios: {
          vol: targets.vol / 100,
          ton: targets.ton / 100,
          tut: targets.tut / 100
        },
        muscleTargets: muscleCurves,
        volumeDist
      };
      
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore sconosciuto dal server");
      setGeneratedResult(data);
      setRightTab('result');
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveProgram = async () => {
    if (!generatedResult) return;
    
    let markdown = '';
    generatedResult.days.forEach((day, idx) => {
      markdown += `# ${idx + 1}\n`;
      day.forEach(ex => {
        markdown += `${ex.exercise} | ${ex.rest} |\n`;
        const setsStr = ex.sets.map(s => {
          let str = s.base_reps.toString();
          if (s.partial_reps > 0) str += `+${s.partial_reps}`;
          return str;
        }).join('.');
        markdown += `0..${setsStr}\n\n`; // 0 is a dummy load
      });
    });

    const programName = prompt("Inserisci il nome della nuova scheda (es. AI_Program):", "Scheda_AI");
    if (!programName) return;

    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: programName, content: markdown })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Scheda salvata con successo! Ora la trovi nel Logbook.");
    } catch (err) {
      alert("Errore durante il salvataggio: " + err.message);
    }
  };

  const handleWeightChange = (key, val) => {
    setWeights(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const handleVolumeChange = (type, macro, sub, val) => {
    const v = parseInt(val) || 0;
    setVolumeDist(prev => {
      const next = { ...prev };
      if (type === 'macro') {
        next.macros = { ...prev.macros, [macro]: v };
      } else {
        next.subs = { ...prev.subs, [macro]: { ...prev.subs[macro], [sub]: v } };
      }
      return next;
    });
  };

  const macroSum = Object.values(volumeDist.macros).reduce((a, b) => a + b, 0);
  const isMacroValid = macroSum === 100;
  const invalidSubs = Object.keys(volumeDist.subs).filter(m => {
    return Object.values(volumeDist.subs[m]).reduce((a, b) => a + b, 0) !== 100;
  });
  const isVolumeValid = isMacroValid && invalidSubs.length === 0;

  return (
    <div className="generator-container" style={{ display: 'flex', gap: '20px', height: '100%', overflow: 'hidden' }}>
      
      {/* Left Pane: Configuration UI */}
      <div className="config-pane" style={{ flex: '1', overflowY: 'auto', padding: '20px', background: '#1c1c1e', borderRadius: '12px', border: '1px solid #333' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <Settings size={20} color="#007aff" /> Configurazione Generatore (WIP)
        </h2>

        {/* Global Params */}
        <div className="config-section" style={{ marginBottom: '25px', background: '#2c2c2e', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} /> Limiti Globali
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Giorni (D) [3-7]</label>
              <input type="number" min="3" max="7" value={globalParams.days} onChange={e => setGlobalParams({...globalParams, days: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Serie (Min - Max)</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input type="number" value={globalParams.minSets} onChange={e => setGlobalParams({...globalParams, minSets: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
                <input type="number" value={globalParams.maxSets} onChange={e => setGlobalParams({...globalParams, maxSets: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Ripetizioni (Min - Max)</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input type="number" value={globalParams.minReps} onChange={e => setGlobalParams({...globalParams, minReps: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
                <input type="number" value={globalParams.maxReps} onChange={e => setGlobalParams({...globalParams, maxReps: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Esercizi/Giorno (Min - Max)</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                <input type="number" value={globalParams.minEx} onChange={e => setGlobalParams({...globalParams, minEx: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
                <input type="number" value={globalParams.maxEx} onChange={e => setGlobalParams({...globalParams, maxEx: parseInt(e.target.value)})} style={{ width: '50%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Iterazioni (SA)</label>
              <input type="number" step="1000" min="1000" value={globalParams.iterations} onChange={e => setGlobalParams({...globalParams, iterations: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '5px' }}>Calibrazione (Auto-Scale)</label>
              <input type="number" step="100" min="0" value={globalParams.calibrationSteps} onChange={e => setGlobalParams({...globalParams, calibrationSteps: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} title="Numero di schede casuali per tarare le magnitudo. 0 per disabilitare." />
            </div>
          </div>
        </div>

        {/* Volume Distribution (Macro & Micro) */}
        <div className="config-section" style={{ marginBottom: '25px', background: '#2c2c2e', padding: '15px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={16} /> Distribuzione Volumi (Macro/Micro)
            </h3>
            <span style={{ fontSize: '0.8rem', color: isVolumeValid ? '#30d158' : '#ff453a', fontWeight: 'bold' }}>
              {isVolumeValid ? 'OK' : 'Errori % (Somma != 100)'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {MACRO_MUSCLES.map(m => {
              const mSum = Object.values(volumeDist.subs[m]).reduce((a, b) => a + b, 0);
              const mValid = mSum === 100;
              const isExpanded = expandedMacro === m;
              return (
                <div key={m} style={{ background: '#1c1c1e', padding: '10px', borderRadius: '6px', border: `1px solid ${!mValid ? '#ff453a' : '#3a3a3c'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <button 
                      onClick={() => setExpandedMacro(isExpanded ? null : m)}
                      style={{ background: 'transparent', border: 'none', color: '#007aff', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left', width: '90px', fontSize: '0.9rem' }}
                    >
                      {isExpanded ? '▼' : '▶'} {m}
                    </button>
                    <input 
                      type="range" min="0" max="100" step="1" 
                      value={volumeDist.macros[m]} 
                      onChange={e => handleVolumeChange('macro', m, null, e.target.value)} 
                      style={{ flex: '1', accentColor: '#30d158' }} 
                    />
                    <span style={{ width: '40px', textAlign: 'right', fontSize: '0.85rem', color: isMacroValid ? 'white' : '#ff453a' }}>
                      {volumeDist.macros[m]}%
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '15px', paddingLeft: '15px', borderLeft: '2px solid #3a3a3c', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#8e8e93', marginBottom: '4px' }}>
                        <span>Sottogruppi ({m})</span>
                        <span style={{ color: mValid ? '#30d158' : '#ff453a' }}>Somma: {mSum}%</span>
                      </div>
                      {MACRO_SUB_MAP[m].map(sub => (
                        <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label style={{ width: '120px', fontSize: '0.75rem', color: '#d1d1d6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</label>
                          <input 
                            type="range" min="0" max="100" step="1" 
                            value={volumeDist.subs[m][sub]} 
                            onChange={e => handleVolumeChange('sub', m, sub, e.target.value)} 
                            style={{ flex: '1', accentColor: '#ff9f0a' }} 
                          />
                          <span style={{ width: '35px', textAlign: 'right', fontSize: '0.75rem', color: mValid ? 'white' : '#ff453a' }}>
                            {volumeDist.subs[m][sub]}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Objective Weights */}
        <div className="config-section" style={{ marginBottom: '25px', background: '#2c2c2e', padding: '15px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Scale size={16} /> Pesi Obiettivo (Valori Reali)
            </h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(weights).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ width: '80px', fontSize: '0.85rem', color: '#d1d1d6', textTransform: 'capitalize' }}>w_{key}</label>
                <input type="number" step="0.5" value={val} onChange={e => handleWeightChange(key, e.target.value)} style={{ width: '70px', padding: '6px', borderRadius: '6px', background: '#1c1c1e', border: '1px solid #3a3a3c', color: 'white' }} />
                <div style={{ flex: '1', height: '8px', background: '#1c1c1e', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${normalizedWeights[key] * 100}%`, height: '100%', background: '#007aff' }}></div>
                </div>
                <span style={{ width: '50px', fontSize: '0.85rem', textAlign: 'right', color: '#007aff', fontWeight: 'bold' }}>
                  {(normalizedWeights[key] * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '12px', textAlign: 'center' }}>
            I numeri reali vengono convertiti in percentuali (Somma = 100%) tramite funzione Softmax.
          </p>
        </div>

        {/* Target Ratios */}
        <div className="config-section" style={{ marginBottom: '25px', background: '#2c2c2e', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} /> Efficienza Target (0-100%)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(targets).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ width: '80px', fontSize: '0.85rem', color: '#d1d1d6', textTransform: 'capitalize' }}>{key} Ratio</label>
                <input type="range" min="0" max="100" step="5" value={val} onChange={e => setTargets(prev => ({...prev, [key]: parseInt(e.target.value)}))} style={{ flex: '1', accentColor: '#ff9f0a' }} />
                <span style={{ width: '40px', fontSize: '0.85rem', textAlign: 'right', color: '#ff9f0a' }}>{val}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Muscle Target Curves */}
        <div className="config-section" style={{ background: '#2c2c2e', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} /> Target Curve per Muscolo
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
            {MACRO_MUSCLES.map(m => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#d1d1d6' }}>{m}</span>
                <select 
                  value={muscleCurves[m]} 
                  onChange={e => setMuscleCurves(prev => ({...prev, [m]: e.target.value}))}
                  style={{ background: '#1c1c1e', color: 'white', border: '1px solid #3a3a3c', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', width: '160px' }}
                >
                  {CURVE_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={handleGenerate} 
          disabled={isGenerating || !isVolumeValid}
          style={{ marginTop: '20px', width: '100%', padding: '12px', background: (isGenerating || !isVolumeValid) ? '#636366' : '#30d158', color: (isGenerating || !isVolumeValid) ? '#aeaeb2' : 'black', border: 'none', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: (isGenerating || !isVolumeValid) ? 'not-allowed' : 'pointer' }}
        >
          {isGenerating ? <Activity size={18} className="spin" /> : <Play size={18} />}
          {isGenerating ? 'Calcolo in corso...' : 'Avvia Risolutore (Numpy)'}
        </button>

        {error && (
          <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(255, 69, 58, 0.2)', color: '#ff453a', borderRadius: '8px', fontSize: '0.9rem' }}>
            <strong>Errore:</strong> {error}
          </div>
        )}
      </div>

      {/* Right Pane: Markdown Documentation or Result */}
      <div className="docs-pane" style={{ flex: '1', display: 'flex', flexDirection: 'column', padding: '20px', background: '#1c1c1e', borderRadius: '12px', border: '1px solid #333' }}>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <button 
            onClick={() => setRightTab('info')}
            style={{ padding: '8px 16px', background: rightTab === 'info' ? '#007aff' : 'transparent', color: rightTab === 'info' ? 'white' : '#8e8e93', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: rightTab === 'info' ? 'bold' : 'normal' }}
          >
            <BookOpen size={18} /> Modello Matematico
          </button>
          <button 
            onClick={() => setRightTab('result')}
            disabled={!generatedResult}
            style={{ padding: '8px 16px', background: rightTab === 'result' ? '#30d158' : 'transparent', color: rightTab === 'result' ? 'black' : (generatedResult ? 'white' : '#48484a'), border: 'none', borderRadius: '8px', cursor: generatedResult ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: rightTab === 'result' ? 'bold' : 'normal' }}
          >
            <Activity size={18} /> Risultato Generato
          </button>
        </div>

        {rightTab === 'info' && (
          <div className="markdown-content" style={{ flex: '1', overflowY: 'auto', lineHeight: '1.6', fontSize: '0.9rem', color: '#d1d1d6', paddingRight: '10px', paddingBottom: '100px' }}>
            {markdownContent ? (
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({node, ...props}) => <h1 style={{fontSize: '1.5rem', color: 'white', marginBottom: '15px'}} {...props} />,
                  h2: ({node, ...props}) => <h2 style={{fontSize: '1.2rem', color: '#007aff', marginTop: '20px', marginBottom: '10px'}} {...props} />,
                  h3: ({node, ...props}) => <h3 style={{fontSize: '1.0rem', color: '#ff9f0a', marginTop: '15px', marginBottom: '10px'}} {...props} />,
                  p: ({node, ...props}) => <p style={{marginBottom: '10px'}} {...props} />,
                  ul: ({node, ...props}) => <ul style={{marginLeft: '20px', marginBottom: '15px'}} {...props} />,
                  li: ({node, ...props}) => <li style={{marginBottom: '5px'}} {...props} />,
                  blockquote: ({node, ...props}) => <blockquote style={{borderLeft: '4px solid #007aff', paddingLeft: '10px', margin: '10px 0', background: 'rgba(0, 122, 255, 0.1)', padding: '10px'}} {...props} />
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            ) : (
              <p>Caricamento documentazione in corso...</p>
            )}
          </div>
        )}

        {rightTab === 'result' && generatedResult && (
          <div style={{ flex: '1', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '10px' }}>
            <h3 style={{ color: '#30d158', marginBottom: '20px', fontSize: '1.4rem' }}>
              Scheda Ottimizzata (Costo: {generatedResult.final_cost.toFixed(2)})
            </h3>
            
            <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', paddingBottom: '20px' }}>
              {generatedResult.days.map((day, dIdx) => (
                <div key={dIdx} style={{ minWidth: '320px', flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ color: '#007aff', marginBottom: '15px', fontSize: '1.2rem', borderBottom: '2px solid #3a3a3c', paddingBottom: '10px' }}>Giorno {dIdx + 1}</h4>
                  {day.map((ex, exIdx) => (
                    <div key={exIdx} style={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: '10px', padding: '15px', marginBottom: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: 'white', fontSize: '1.1rem' }}>{ex.exercise}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#8e8e93', border: '1px solid #3a3a3c', padding: '2px 6px', borderRadius: '4px' }}>Info</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <span style={{ border: '1px solid rgba(88, 86, 214, 0.4)', color: '#8281d9', background: 'rgba(88, 86, 214, 0.1)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>{ex.muscles}</span>
                        <span style={{ border: '1px solid rgba(255, 255, 255, 0.2)', color: '#d1d1d6', background: 'rgba(255, 255, 255, 0.05)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>{ex.rest} rest</span>
                      </div>
                      <div style={{ marginTop: '15px', border: '1px solid #3a3a3c', borderRadius: '8px', padding: '12px', background: '#2c2c2e' }}>
                        <div style={{ textAlign: 'center', color: '#8e8e93', fontSize: '0.8rem', marginBottom: '8px' }}>Volume & RPE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {ex.sets.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: '15px', padding: '4px 0', borderBottom: i < ex.sets.length - 1 ? '1px dashed #3a3a3c' : 'none' }}>
                               <span style={{ fontSize: '1rem', color: '#30d158', fontWeight: 'bold' }}>x {s.base_reps}{s.partial_reps > 0 ? '+'+s.partial_reps : ''}</span>
                               <span style={{ fontSize: '1rem', color: '#8e8e93' }}>@{s.rpe}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button 
              onClick={handleSaveProgram}
              style={{ marginTop: 'auto', width: '100%', padding: '15px', background: '#007aff', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <Save size={20} /> Salva Scheda nel Logbook
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
