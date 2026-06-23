import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'katex/dist/katex.min.css';
import { 
  BookOpen, 
  Save, 
  BarChart3, 
  Dumbbell, 
  Search, 
  Plus, 
  AlertCircle, 
  RotateCcw,
  Sparkles,
  TrendingUp,
  Edit,
  Trash2,
  Info,
  Pencil,
  Eye,
  Columns,
  FolderOpen,
  Folder,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sliders,
  Activity
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import BezierEditor from './BezierEditor';
import { 
  parseLogbook, 
  calculateMetrics, 
  MUSCLES,
  getExercisesWithOverrides
} from './parser';
import { getStorageConfig, setStorageConfig, pickDirectory } from './offlineApi.js';

import LogbookPreview from './components/LogbookPreview';
import MetricDetailsPage from './components/MetricDetails';
import { renderMetricTooltip } from './components/Tooltips';
import { solveBezierY, getBezierCurveData } from './components/helpers';
export default function App() {
  // Data State
  const [logbookText, setLogbookText] = useState('');
  const [exercisesDb, setExercisesDb] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // Default to editor view
  const [selectedMetricDetail, setSelectedMetricDetail] = useState(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleSearch, setMuscleSearch] = useState('');
  const [muscleMetric, setMuscleMetric] = useState('effective');
  const [progressionExercise, setProgressionExercise] = useState('all_metrics');
  const [overallChartMetric, setOverallChartMetric] = useState('Volume');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Storage folder settings (mobile)
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const initCfg = getStorageConfig();
  const [pendingDirType, setPendingDirType] = useState(initCfg.dirType);
  const [pendingSubfolder, setPendingSubfolder] = useState(initCfg.subfolder);

  const applyStorageConfig = () => {
    setStorageConfig(pendingDirType, pendingSubfolder);
    window.location.reload();
  };

  const [storagePickError, setStoragePickError] = useState('');
  const handlePickFolder = async () => {
    setStoragePickError('');
    try {
      await pickDirectory(); // saves URI to localStorage
      window.location.reload();
    } catch (e) {
      if (e.message !== 'Folder selection cancelled') {
        setStoragePickError(e.message || 'Could not pick folder');
      }
    }
  };

  const handleResetStorage = () => {
    setStorageConfig('documents', 'Algorithmic Bodybuilding');
    setPendingDirType('documents');
    setPendingSubfolder('Algorithmic Bodybuilding');
    window.location.reload();
  };

  // Dynamic sliding highlight for Navbar
  const tabNavRef = useRef(null);
  const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const updateNavbarHighlight = useCallback(() => {
    if (!tabNavRef.current) return;
    const activeBtn = tabNavRef.current.querySelector('.tab-btn.active');
    if (activeBtn) {
      setHighlightStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        opacity: 1
      });
    }
  }, []);

  useEffect(() => {
    updateNavbarHighlight();
    const timer = setTimeout(updateNavbarHighlight, 50);
    window.addEventListener('resize', updateNavbarHighlight);
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(updateNavbarHighlight);
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateNavbarHighlight);
    };
  }, [activeTab, updateNavbarHighlight]);

  // Dashboard filter state
  const [dashFilterSession, setDashFilterSession] = useState('all'); // 'all' or session number
  const [dashFilterWeek, setDashFilterWeek] = useState('all');     // 'all' or week number
  const [compareMode, setCompareMode] = useState(false);
  const [compareProgram, setCompareProgram] = useState('');
  const [compareWorkoutData, setCompareWorkoutData] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  // Per-program filters in compare mode
  const [cmpFilterSession, setCmpFilterSession] = useState('all');
  const [cmpFilterWeek, setCmpFilterWeek] = useState('all');
  // Shared muscle group/subgroup isolation filter
  const [dashMuscleMacro, setDashMuscleMacro] = useState('all');   // 'all' or macro name e.g. 'Back'
  const [dashMuscleSubgroup, setDashMuscleSubgroup] = useState('all'); // 'all' or sub-muscle name

  const activeExercises = useMemo(() => {
    return getExercisesWithOverrides(logbookText, exercisesDb);
  }, [logbookText, exercisesDb]);

  // Programs State
  const [currentProgram, setCurrentProgram] = useState(() => localStorage.getItem('lastSelectedProgram') || 'S1M3');
  const [programs, setPrograms] = useState(['S1M3']);
  const [showNewProgramModal, setShowNewProgramModal] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramError, setNewProgramError] = useState('');
  const [editorMode, setEditorMode] = useState(window.innerWidth <= 768 ? 'edit' : 'split'); // 'edit', 'preview', 'split'

  // Exercise CRUD State
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [editingOriginalName, setEditingOriginalName] = useState('');
  const [exerciseForm, setExerciseForm] = useState({
    name: '',
    fatigue: 5.0,
    load_coeff: 0.5,
    load_multiplier: 1.0,
    load_offset: 0.0,
    is_isolation: false,
    muscles: []
  });
  const [exerciseError, setExerciseError] = useState('');
  const [editingCurveIndex, setEditingCurveIndex] = useState(null);

  const currentHasOverride = useMemo(() => {
    if (!editingOriginalName) return false;
    return logbookText.split('\n').some(line => {
      if (!line.toLowerCase().startsWith('override:')) return false;
      const match = line.match(/^override:\s*([^|]+)\|/i);
      if (!match) return false;
      return match[1].trim().toLowerCase() === editingOriginalName.toLowerCase();
    });
  }, [logbookText, editingOriginalName]);

  // UI Status State
  const [syncStatus, setSyncStatus] = useState('saved'); // 'saved', 'syncing', 'error'
  const [syncError, setSyncError] = useState('');
  const [saveTimeout, setSaveTimeout] = useState(null);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });

  const textareaRef = useRef(null);

  // Load initial data
  useEffect(() => {
    // Fetch exercises first, then programs, then active program
    fetch('/api/exercises')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load exercises database');
        return res.json();
      })
      .then(exs => {
        setExercisesDb(exs);
        return fetch('/api/programs');
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load programs list');
        return res.json();
      })
      .then(progs => {
        if (progs && progs.length > 0) {
          setPrograms(progs);
          const savedProg = localStorage.getItem('lastSelectedProgram');
          const defaultProg = savedProg && progs.includes(savedProg)
            ? savedProg
            : (progs.includes('S1M3') ? 'S1M3' : progs[0]);
          setCurrentProgram(defaultProg);
          return fetch(`/api/logbook?program=${defaultProg}`);
        } else {
          const defaultProg = localStorage.getItem('lastSelectedProgram') || 'S1M3';
          return fetch(`/api/logbook?program=${defaultProg}`);
        }
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load logbook');
        return res.text();
      })
      .then(text => {
        setLogbookText(text);
        setSyncStatus('saved');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(err.message);
      });
  }, []);

  // Parse logbook text whenever it changes or the exercises DB updates
  const workoutData = useMemo(() => {
    if (logbookText && exercisesDb.length > 0) {
      return parseLogbook(logbookText, exercisesDb);
    }
    return [];
  }, [logbookText, exercisesDb]);

  // Cursor Tracking State for scroll sync
  const [activeCursorLine, setActiveCursorLine] = useState(null);

  const activeExerciseStartLine = useMemo(() => {
    if (activeCursorLine === null || !workoutData || workoutData.length === 0) return null;
    let currentExStartLine = null;
    for (let i = 0; i < workoutData.length; i++) {
      const ex = workoutData[i];
      const nextEx = workoutData[i + 1];
      const endLine = nextEx ? nextEx.startLine : Infinity;
      if (activeCursorLine >= ex.startLine && activeCursorLine < endLine) {
        currentExStartLine = ex.startLine;
        break;
      }
    }
    return currentExStartLine;
  }, [activeCursorLine, workoutData]);

  const activeWeekLineIndex = useMemo(() => {
    if (activeCursorLine === null || !workoutData || workoutData.length === 0) return null;
    for (const ex of workoutData) {
      for (const wk of ex.weeks) {
        if (wk.lineIndex === activeCursorLine) {
          return wk.lineIndex;
        }
      }
    }
    return null;
  }, [activeCursorLine, workoutData]);

  const handleCursorMove = (e) => {
    const text = e.target.value;
    const start = e.target.selectionStart;
    const textBefore = text.substring(0, start);
    const lineNum = textBefore.split('\n').length - 1;
    setActiveCursorLine(lineNum);
  };

  // Load a program's markdown content dynamically
  const loadProgram = (progName) => {
    setSyncStatus('syncing');
    fetch(`/api/logbook?program=${progName}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${progName}.md`);
        return res.text();
      })
      .then(text => {
        setLogbookText(text);
        setCurrentProgram(progName);
        localStorage.setItem('lastSelectedProgram', progName); // Save program selection
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(err.message);
      });
  };

  // Handle program switching with auto-flush
  const handleProgramChange = (progName) => {
    if (syncStatus === 'syncing' && saveTimeout) {
      clearTimeout(saveTimeout);
      saveLogbookContent(logbookText, currentProgram);
    }
    loadProgram(progName);
  };

  // Create a new program in the backend
  const handleCreateProgram = () => {
    const cleanName = newProgramName.replace(/[^a-zA-Z0-9_-]/g, '').trim();
    if (!cleanName) {
      setNewProgramError('Please enter a valid program name.');
      return;
    }

    if (programs.includes(cleanName)) {
      setNewProgramError('A program with this name already exists.');
      return;
    }

    fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => { throw new Error(data.error || 'Failed to create program') });
        }
        return res.json();
      })
      .then((data) => {
        setPrograms(prev => [...prev, data.name]);
        setCurrentProgram(data.name);
        setShowNewProgramModal(false);
        setNewProgramName('');
        loadProgram(data.name);
      })
      .catch(err => {
        setNewProgramError(err.message);
      });
  };

  // Exercise CRUD Actions
  const handleOpenAddExercise = () => {
    setEditingExercise(null);
    setEditingOriginalName('');
    setExerciseForm({
      name: '',
      fatigue: 5.0,
      load_coeff: 0.5,
      load_multiplier: 1.0,
      load_offset: 0.0,
      is_isolation: false,
      muscles: []
    });
    setExerciseError('');
    setShowExerciseModal(true);
  };

  const handleOpenEditExercise = (ex) => {
    setEditingExercise(ex);
    setEditingOriginalName(ex.name);
    setExerciseForm({
      name: ex.name,
      fatigue: ex.fatigue,
      load_coeff: ex.load_coeff,
      load_multiplier: ex.load_multiplier !== undefined ? ex.load_multiplier : 1.0,
      load_offset: ex.load_offset !== undefined ? ex.load_offset : 0.0,
      is_isolation: !!ex.is_isolation,
      muscles: Object.entries(ex.muscles_distr).map(([m, p]) => ({
        name: m,
        percentage: typeof p === 'number' ? Math.round(p * 100) : Math.round((p.magnitude || 0) * 100),
        x0: typeof p === 'number' ? 0.0 : (p.x0 ?? 0.0),
        y0: typeof p === 'number' ? 1.0 : (p.y0 ?? 1.0),
        x1: typeof p === 'number' ? 0.33 : (p.x1 ?? 0.33),
        y1: typeof p === 'number' ? 1.0 : (p.y1 ?? 1.0),
        x2: typeof p === 'number' ? 0.66 : (p.x2 ?? 0.66),
        y2: typeof p === 'number' ? 1.0 : (p.y2 ?? 1.0),
        x3: typeof p === 'number' ? 1.0 : (p.x3 ?? 1.0),
        y3: typeof p === 'number' ? 1.0 : (p.y3 ?? 1.0)
      }))
    });
    setExerciseError('');
    setShowExerciseModal(true);
  };

  const handleSaveExercise = () => {
    const name = exerciseForm.name.trim();
    if (!name) {
      setExerciseError('Exercise name is required.');
      return;
    }

    const exists = exercisesDb.some(ex => ex.name.toLowerCase() === name.toLowerCase() && ex.name !== editingOriginalName);
    if (exists) {
      setExerciseError('An exercise with this name already exists.');
      return;
    }

    if (exerciseForm.muscles.length === 0) {
      setExerciseError('At least one muscle group must be selected.');
      return;
    }

    const totalPct = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
    if (totalPct !== 100) {
      setExerciseError(`Total muscle distribution must sum to exactly 100% (currently ${totalPct}%).`);
      return;
    }

    const musclesDistr = {};
    exerciseForm.muscles.forEach(m => {
      musclesDistr[m.name] = {
        x0: m.x0 ?? 0.0,
        y0: m.y0 ?? 1.0,
        x1: m.x1 ?? 0.33,
        y1: m.y1 ?? 1.0,
        x2: m.x2 ?? 0.66,
        y2: m.y2 ?? 1.0,
        x3: m.x3 ?? 1.0,
        y3: m.y3 ?? 1.0,
        magnitude: parseFloat((m.percentage / 100).toFixed(3))
      };
    });

    const savedExercise = {
      name,
      fatigue: parseFloat(exerciseForm.fatigue),
      load_coeff: parseFloat(exerciseForm.load_coeff),
      load_multiplier: parseFloat(exerciseForm.load_multiplier),
      load_offset: parseFloat(exerciseForm.load_offset),
      is_isolation: !!exerciseForm.is_isolation,
      muscles_distr: musclesDistr
    };

    let updatedList = [];
    if (editingOriginalName) {
      updatedList = exercisesDb.map(ex => ex.name === editingOriginalName ? savedExercise : ex);
    } else {
      updatedList = [...exercisesDb, savedExercise];
    }

    setSyncStatus('syncing');
    fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => { throw new Error(data.error || 'Failed to save exercise') });
        }
        return res.json();
      })
      .then(() => {
        setExercisesDb(updatedList);
        setShowExerciseModal(false);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(err.message);
        setExerciseError(err.message);
      });
  };

  const handleDeleteExercise = (exerciseName) => {
    if (!window.confirm(`Are you sure you want to delete "${exerciseName}"?`)) {
      return;
    }

    const updatedList = exercisesDb.filter(ex => ex.name !== exerciseName);

    setSyncStatus('syncing');
    fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedList)
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => { throw new Error(data.error || 'Failed to delete exercise') });
        }
        return res.json();
      })
      .then(() => {
        setExercisesDb(updatedList);
        setShowExerciseModal(false);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(err.message);
      });
  };

  const handleSaveExerciseForProgramOnly = () => {
    const name = exerciseForm.name.trim();
    if (!name) {
      setExerciseError('Exercise name is required.');
      return;
    }

    if (exerciseForm.muscles.length === 0) {
      setExerciseError('At least one muscle group must be selected.');
      return;
    }

    const totalPct = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
    if (totalPct !== 100) {
      setExerciseError(`Total muscle distribution must sum to exactly 100% (currently ${totalPct}%).`);
      return;
    }

    const musclesDistr = {};
    exerciseForm.muscles.forEach(m => {
      musclesDistr[m.name] = {
        y0: m.y0 ?? 1.0,
        x1: m.x1 ?? 0.33,
        y1: m.y1 ?? 1.0,
        x2: m.x2 ?? 0.66,
        y2: m.y2 ?? 1.0,
        y3: m.y3 ?? 1.0,
        magnitude: parseFloat((m.percentage / 100).toFixed(3))
      };
    });

    const fatigue = parseFloat(exerciseForm.fatigue);
    const load_coeff = parseFloat(exerciseForm.load_coeff);
    const load_multiplier = parseFloat(exerciseForm.load_multiplier);
    const load_offset = parseFloat(exerciseForm.load_offset);
    const is_isolation = !!exerciseForm.is_isolation;

    const overrideLine = `override: ${name} | fatigue=${fatigue} | load_coeff=${load_coeff} | load_multiplier=${load_multiplier} | load_offset=${load_offset} | is_isolation=${is_isolation} | muscles_distr=${JSON.stringify(musclesDistr)}`;

    const lines = logbookText.split('\n');
    const searchName = editingOriginalName || name;
    const existingIdx = lines.findIndex(line => {
      if (!line.toLowerCase().startsWith('override:')) return false;
      const match = line.match(/^override:\s*([^|]+)\|/i);
      if (!match) return false;
      return match[1].trim().toLowerCase() === searchName.toLowerCase();
    });

    let newText;
    if (existingIdx !== -1) {
      lines[existingIdx] = overrideLine;
      newText = lines.join('\n');
    } else {
      let insertIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().startsWith('override:')) {
          insertIdx = i + 1;
        } else {
          break;
        }
      }
      lines.splice(insertIdx, 0, overrideLine);
      newText = lines.join('\n');
    }

    setLogbookText(newText);
    saveLogbookContent(newText);
    setShowExerciseModal(false);
  };

  const handleRemoveOverride = () => {
    const searchName = editingOriginalName || exerciseForm.name.trim();
    if (!searchName) return;

    const lines = logbookText.split('\n');
    const existingIdx = lines.findIndex(line => {
      if (!line.toLowerCase().startsWith('override:')) return false;
      const match = line.match(/^override:\s*([^|]+)\|/i);
      if (!match) return false;
      return match[1].trim().toLowerCase() === searchName.toLowerCase();
    });

    if (existingIdx !== -1) {
      lines.splice(existingIdx, 1);
      const newText = lines.join('\n');
      setLogbookText(newText);
      saveLogbookContent(newText);
    }
    setShowExerciseModal(false);
  };


  // Handle manual / debounced auto-saving to [program].md
  const saveLogbookContent = (newText, progName = currentProgram) => {
    setSyncStatus('syncing');
    fetch(`/api/logbook?program=${progName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: newText
    })
      .then(res => {
        if (!res.ok) throw new Error('Server returned error status');
        return res.json();
      })
      .then(() => {
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(`Failed to save: ${err.message}`);
      });
  };

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setLogbookText(newText);
    setSyncStatus('syncing');

    // Update active cursor line on change too
    const start = e.target.selectionStart;
    const textBefore = newText.substring(0, start);
    const lineNum = textBefore.split('\n').length - 1;
    setActiveCursorLine(lineNum);

    // Debounce saving
    if (saveTimeout) clearTimeout(saveTimeout);
    const timeout = setTimeout(() => {
      saveLogbookContent(newText, currentProgram);
    }, 1500);
    setSaveTimeout(timeout);

    // Handle autocomplete triggers
    handleAutocomplete(e);
  };

  // Autocomplete Logic
  const handleAutocomplete = (e) => {
    const val = e.target.value;
    const selectionStart = e.target.selectionStart;
    const beforeCursor = val.substring(0, selectionStart);
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];

    // Trigger autocomplete only on clean exercise-name lines:
    // - not empty, not a session header (#), not a log line (starts with digit)
    // - no | already typed (line is still just the name being written)
    const isHeaderLine =
      currentLine.trim() &&
      !currentLine.includes('#') &&
      !currentLine.includes('|') &&
      !/^\d/.test(currentLine.trim());
    
    if (isHeaderLine && currentLine.length >= 2) {
      // Clean string for matching
      const cleanQuery = currentLine.replace(/\|.*/, '').trim();
      if (cleanQuery.length >= 1) {
        const scored = activeExercises
          .map(ex => ({ ex, score: fuzzyScore(cleanQuery, ex.name) }))
          .filter(({ score }) => score >= 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(({ ex }) => ex);

        setSuggestions(scored);
        setSuggestionIndex(0);
        setShowSuggestions(scored.length > 0);
        
        // Simple heuristic for placing suggestions box near cursor
        const textarea = textareaRef.current;
        if (textarea) {
          const lineCount = beforeCursor.split('\n').length;
          const charCount = currentLine.length;
          setCursorPos({
            top: lineCount * 21.6 + 10 - textarea.scrollTop,
            left: Math.min(charCount * 8 + 30, textarea.clientWidth - 260)
          });
        }
        return;
      }
    }
    setShowSuggestions(false);
  };

  const selectSuggestion = (exName) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const val = logbookText;
    const start = textarea.selectionStart;
    const beforeCursor = val.substring(0, start);
    
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    
    const lineStartIndex = start - currentLine.length;
    let lineEndIndex = val.indexOf('\n', start);
    if (lineEndIndex === -1) lineEndIndex = val.length;

    // Check if the full line already has a | after the cursor
    const fullLine = val.substring(lineStartIndex, lineEndIndex);
    const pipeIndex = fullLine.indexOf('|');
    
    // If there's a pipe, keep everything from | onwards; otherwise just append ' |'
    const afterPipe = pipeIndex !== -1 ? fullLine.substring(pipeIndex) : '|';
    const newLineContent = exName + ' ' + afterPipe;
    const newText = val.substring(0, lineStartIndex) + newLineContent + val.substring(lineEndIndex);

    setLogbookText(newText);
    saveLogbookContent(newText, currentProgram);
    setShowSuggestions(false);

    // Place cursor right after the first pipe
    const cursorAfterPipe = lineStartIndex + exName.length + 1 + 1; // name + space + pipe
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorAfterPipe, cursorAfterPipe);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[suggestionIndex].name);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  // Helper: Append template to editor
  // eslint-disable-next-line no-unused-vars
  const insertTemplate = (type) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let template = '';
    if (type === 'session') {
      const nextSession = Math.max(...workoutData.map(d => d.session), 0) + 1;
      template = `\n# ${nextSession}\nNew Exercise | 2' | \n20..10.10.10\n`;
    } else if (type === 'exercise') {
      template = `\nNew Exercise | 2' | \n20..10.10.10\n`;
    }

    const val = logbookText;
    const start = textarea.selectionStart;
    const before = val.substring(0, start);
    const after = val.substring(start);
    const newText = before + template + after;

    setLogbookText(newText);
    saveLogbookContent(newText);

    setTimeout(() => {
      textarea.focus();
      const pos = start + template.length;
      textarea.setSelectionRange(pos, pos);
    }, 50);
  };

  // Calculated Metrics
  const sessionsList = Array.from(new Set(workoutData.map(d => d.session))).sort((a, b) => a - b);

  // Helper: load a comparison program and parse it
  const loadCompareProgram = (progName) => {
    if (!progName) { setCompareWorkoutData([]); return; }
    setCompareLoading(true);
    fetch(`/api/logbook?program=${progName}`)
      .then(res => res.text())
      .then(text => {
        const parsed = parseLogbook(text, exercisesDb);
        setCompareWorkoutData(parsed);
        setCompareLoading(false);
      })
      .catch(() => { setCompareWorkoutData([]); setCompareLoading(false); });
  };

  // Derived sessions lists for compare program B
  const compareSessionsList = useMemo(() =>
    Array.from(new Set(compareWorkoutData.map(d => d.session))).sort((a, b) => a - b),
  [compareWorkoutData]);

  // All macro muscle groups and their sub-muscles (from MUSCLES map)
  const allMacros = useMemo(() => Array.from(new Set(Object.values(MUSCLES))).sort(), []);
  const subMusclesForMacro = useMemo(() => {
    if (dashMuscleMacro === 'all') return [];
    return Object.entries(MUSCLES).filter(([, macro]) => macro === dashMuscleMacro).map(([sub]) => sub).sort();
  }, [dashMuscleMacro]);

  // Derived: filtered data for the dashboard based on session/week selectors
  const dashFilteredData = useMemo(() => {
    let data = workoutData;
    if (dashFilterSession !== 'all') {
      const sNum = parseInt(dashFilterSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    // Muscle group filter — keep only exercises that touch the selected macro/sub
    if (dashMuscleMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (dashMuscleSubgroup !== 'all') return dashMuscleSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === dashMuscleMacro);
      });
    }
    return data;
  }, [workoutData, dashFilterSession, dashMuscleMacro, dashMuscleSubgroup]);

  // Derived: filtered data for compare program B
  const cmpFilteredData = useMemo(() => {
    let data = compareWorkoutData;
    if (cmpFilterSession !== 'all') {
      const sNum = parseInt(cmpFilterSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    if (dashMuscleMacro !== 'all') {
      data = data.filter(wEx => {
        const ex = wEx.exercise_obj;
        if (dashMuscleSubgroup !== 'all') return dashMuscleSubgroup in ex.muscles_distr;
        return Object.keys(ex.muscles_distr).some(sub => MUSCLES[sub] === dashMuscleMacro);
      });
    }
    return data;
  }, [compareWorkoutData, cmpFilterSession, dashMuscleMacro, dashMuscleSubgroup]);

  // Weeks available after session filter (program A)
  const dashWeeksList = useMemo(() =>
    Array.from(new Set(dashFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [dashFilteredData]);

  // Weeks available for compare program B after its session filter
  const cmpWeeksList = useMemo(() =>
    Array.from(new Set(cmpFilteredData.flatMap(d => d.weeks.map(w => w.week_num)))).sort((a, b) => a - b),
  [cmpFilteredData]);

  // Overall Progression Metrics (by Week) — respects session + muscle filters
  const metricsByWeek = useMemo(() => {
    const weeksToUse = dashFilterWeek === 'all' ? dashWeeksList : dashWeeksList.filter(w => w === parseInt(dashFilterWeek, 10));
    const targetSession = dashFilterSession !== 'all' ? parseInt(dashFilterSession, 10) : null;
    const targetMacro = dashMuscleMacro !== 'all' ? dashMuscleMacro : null;
    const targetSub = dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : null;

    const activeWeeks = weeksToUse.filter(week => {
      // Only filter out incomplete weeks if we are looking at overall progression (no specific session filter)
      if (targetSession !== null) return true;
      if (sessionsList.length === 0) return true;
      return sessionsList.every(sess => 
        workoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });

    return activeWeeks.map(week => {
      const weeklyData = calculateMetrics(dashFilteredData, targetSession, week, targetMacro, targetSub);
      return {
        week: `W${week}`,
        Volume: parseFloat(weeklyData.reduce((s, d) => s + d.volume, 0).toFixed(1)),
        Tonnage: parseFloat(weeklyData.reduce((s, d) => s + d.tonnage, 0).toFixed(1)),
        EffectiveTonnage: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTonnage || 0), 0).toFixed(1)),
        Fatigue: parseFloat(weeklyData.reduce((s, d) => s + d.fatigue, 0).toFixed(1)),
        EffectiveRepsCustom: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveRepsCustom || 0), 0).toFixed(1)),
        Tut: parseFloat(weeklyData.reduce((s, d) => s + (d.totalTut || 0), 0).toFixed(1)),
        EffectiveTut: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTut || 0), 0).toFixed(1)),
        Sets: parseFloat(weeklyData.reduce((s, d) => s + (d.sets || 0), 0).toFixed(1))
      };
    });
  }, [dashFilteredData, dashFilterSession, dashFilterWeek, dashWeeksList, dashMuscleMacro, dashMuscleSubgroup, sessionsList, workoutData]);

  // Compare program B metrics by week — respects its own session/week + shared muscle filters
  const compareMetricsByWeek = useMemo(() => {
    const weeksToUse = cmpFilterWeek === 'all' ? cmpWeeksList : cmpWeeksList.filter(w => w === parseInt(cmpFilterWeek, 10));
    const targetSession = cmpFilterSession !== 'all' ? parseInt(cmpFilterSession, 10) : null;
    const targetMacro = dashMuscleMacro !== 'all' ? dashMuscleMacro : null;
    const targetSub = dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : null;

    const activeWeeks = weeksToUse.filter(week => {
      // Only filter out incomplete weeks if we are looking at overall progression (no specific session filter)
      if (targetSession !== null) return true;
      if (compareSessionsList.length === 0) return true;
      return compareSessionsList.every(sess => 
        compareWorkoutData.some(d => d.session === sess && d.weeks.some(w => w.week_num === week && w.sets.length > 0))
      );
    });

    return activeWeeks.map(week => {
      const weeklyData = calculateMetrics(cmpFilteredData, targetSession, week, targetMacro, targetSub);
      return {
        week: `W${week}`,
        Volume_B: parseFloat(weeklyData.reduce((s, d) => s + d.volume, 0).toFixed(1)),
        Tonnage_B: parseFloat(weeklyData.reduce((s, d) => s + d.tonnage, 0).toFixed(1)),
        EffectiveTonnage_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTonnage || 0), 0).toFixed(1)),
        Fatigue_B: parseFloat(weeklyData.reduce((s, d) => s + d.fatigue, 0).toFixed(1)),
        EffectiveRepsCustom_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveRepsCustom || 0), 0).toFixed(1)),
        Tut_B: parseFloat(weeklyData.reduce((s, d) => s + (d.totalTut || 0), 0).toFixed(1)),
        EffectiveTut_B: parseFloat(weeklyData.reduce((s, d) => s + (d.effectiveTut || 0), 0).toFixed(1)),
        Sets_B: parseFloat(weeklyData.reduce((s, d) => s + (d.sets || 0), 0).toFixed(1))
      };
    });
  }, [cmpFilteredData, cmpFilterSession, cmpFilterWeek, cmpWeeksList, dashMuscleMacro, dashMuscleSubgroup, compareSessionsList, compareWorkoutData]);

  // Merged chart data for compare mode
  const mergedChartData = useMemo(() => {
    if (!compareMode || compareMetricsByWeek.length === 0) return metricsByWeek;
    const allWeeks = Array.from(new Set([...metricsByWeek.map(m => m.week), ...compareMetricsByWeek.map(m => m.week)])).sort();
    return allWeeks.map(w => ({
      week: w,
      ...((metricsByWeek.find(m => m.week === w)) || {}),
      ...((compareMetricsByWeek.find(m => m.week === w)) || {}),
    }));
  }, [compareMode, metricsByWeek, compareMetricsByWeek]);

  // Calculate Muscle distribution breakdown — respects all filters
  const calculateMuscleDistribution = useCallback((dataSource, weekOverride) => {
    const distributions = {};
    const src = dataSource;
    if (!src) return [];
    const effectiveWeekFilter = weekOverride !== undefined ? weekOverride : dashFilterWeek;
    src.forEach(wEx => {
      const ex = wEx.exercise_obj;
      if (!ex) return;
      wEx.weeks.forEach(wData => {
        if (effectiveWeekFilter !== 'all' && wData.week_num !== parseInt(effectiveWeekFilter, 10)) return;
        if (effectiveWeekFilter === 'all' && wData.week_num !== Math.max(...wEx.weeks.map(w => w.week_num))) return;
        wData.sets.forEach(s => {
          Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
            // Muscle group filter
            if (dashMuscleMacro !== 'all' && MUSCLES[subMuscle] !== dashMuscleMacro) return;
            if (dashMuscleSubgroup !== 'all' && subMuscle !== dashMuscleSubgroup) return;
            const macro = MUSCLES[subMuscle] || 'Other';
            let metricValue = 0;
            if (muscleMetric === 'effective') {
              metricValue = s.effectiveRepsCustom || 0;
            } else if (muscleMetric === 'volume') {
              metricValue = s.totalReps !== undefined ? s.totalReps : (s.base_reps + (s.assisted_reps || 0) * 0.5 + (s.partial_reps || 0) * 0.33);
            } else if (muscleMetric === 'sets') {
              metricValue = 1.0;
            }
            const distrVal = typeof distr === 'number' ? distr : (distr?.magnitude || 0);
            const vol = metricValue * distrVal;
            if (!distributions[macro]) distributions[macro] = { total: 0, subMuscles: {} };
            distributions[macro].total += vol;
            if (!distributions[macro].subMuscles[subMuscle]) distributions[macro].subMuscles[subMuscle] = 0;
            distributions[macro].subMuscles[subMuscle] += vol;
          });
        });
      });
    });
    return Object.entries(distributions).map(([macro, data]) => ({
      name: macro,
      value: parseFloat(data.total.toFixed(1)),
      subMuscles: Object.entries(data.subMuscles).map(([sub, val]) => ({
        name: sub,
        value: parseFloat(val.toFixed(1))
      })).sort((a,b) => b.value - a.value)
    })).sort((a,b) => b.value - a.value);
  }, [dashFilterWeek, dashMuscleMacro, dashMuscleSubgroup, muscleMetric]);

  const muscleData = useMemo(() => calculateMuscleDistribution(dashFilteredData), [dashFilteredData, calculateMuscleDistribution]);
  const compareMuscleData = useMemo(() => compareMode ? calculateMuscleDistribution(cmpFilteredData, cmpFilterWeek !== 'all' ? cmpFilterWeek : 'all') : [], [compareMode, cmpFilteredData, cmpFilterWeek, calculateMuscleDistribution]);

  const displayMuscleData = useMemo(() => {
    if (dashMuscleMacro === 'all') return muscleData;
    const macroObj = muscleData.find(m => m.name === dashMuscleMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [muscleData, dashMuscleMacro]);

  const displayCompareMuscleData = useMemo(() => {
    if (dashMuscleMacro === 'all') return compareMuscleData;
    const macroObj = compareMuscleData.find(m => m.name === dashMuscleMacro);
    if (!macroObj) return [];
    return macroObj.subMuscles;
  }, [compareMuscleData, dashMuscleMacro]);

  const cumulativeCurveData = useMemo(() => {
    const topMuscles = displayMuscleData.slice(0, 6).map(m => m.name);
    if (topMuscles.length === 0) return [];

    const resolution = 50;
    const data = [];
    for (let i = 0; i <= resolution; i++) {
      const x = i / resolution;
      const pt = { rom: x };
      topMuscles.forEach(m => pt[m] = 0);
      data.push(pt);
    }

    dashFilteredData.forEach(wEx => {
      const ex = activeExercises.find(e => e.name === wEx.name) || wEx.exercise_obj;
      if (!ex) return;
      
      wEx.weeks.forEach(wData => {
        if (dashFilterWeek !== 'all' && wData.week_num !== parseInt(dashFilterWeek, 10)) return;
        if (dashFilterWeek === 'all' && wData.week_num !== Math.max(...wEx.weeks.map(w => w.week_num))) return;
        
        wData.sets.forEach(s => {
            Object.entries(ex.muscles_distr).forEach(([subMuscle, distr]) => {
              const macro = MUSCLES[subMuscle] || 'Other';
              const isMacroView = dashMuscleMacro === 'all';
              const targetMuscle = isMacroView ? macro : subMuscle;
              
              if (topMuscles.includes(targetMuscle)) {
                let metricValue = 0;
                if (muscleMetric === 'effective') {
                  metricValue = s.effectiveRepsCustom || 0;
                } else if (muscleMetric === 'volume') {
                  metricValue = s.totalReps !== undefined ? s.totalReps : (s.base_reps + (s.assisted_reps || 0) * 0.5 + (s.partial_reps || 0) * 0.33);
                } else if (muscleMetric === 'sets') {
                  metricValue = 1.0;
                }
                
                const distrVal = typeof distr === 'number' ? distr : (distr?.magnitude || 0);
                const x0 = typeof distr === 'object' ? (distr.x0 ?? 0.0) : 0.0;
                const y0 = typeof distr === 'object' ? (distr.y0 ?? 1.0) : 1.0;
                const x1 = typeof distr === 'object' ? (distr.x1 ?? 0.33) : 0.33;
                const y1 = typeof distr === 'object' ? (distr.y1 ?? 1.0) : 1.0;
                const x2 = typeof distr === 'object' ? (distr.x2 ?? 0.66) : 0.66;
                const y2 = typeof distr === 'object' ? (distr.y2 ?? 1.0) : 1.0;
                const x3 = typeof distr === 'object' ? (distr.x3 ?? 1.0) : 1.0;
                const y3 = typeof distr === 'object' ? (distr.y3 ?? 1.0) : 1.0;
                const magnitude = distrVal;
                
                const rawY = [];
                let areaSum = 0;
                for (let i = 0; i <= resolution; i++) {
                  const x = i / resolution;
                  const y = solveBezierY(x, x0, y0, x1, y1, x2, y2, x3, y3);
                  rawY.push(y);
                  areaSum += y;
                }
                const area = areaSum / resolution;
                const factor = area > 0 ? (magnitude / area) : 0;
                
                for (let i = 0; i <= resolution; i++) {
                  const pointVal = rawY[i] * factor;
                  data[i][targetMuscle] += (pointVal * metricValue);
                }
              }
            });
          });
        });
      });

    data.forEach(pt => {
      topMuscles.forEach(m => {
        pt[m] = parseFloat(pt[m].toFixed(2));
      });
    });

    return data;
  }, [dashFilteredData, dashFilterWeek, dashMuscleMacro, muscleMetric, activeExercises, displayMuscleData]);

  // Overall totals (filtered)
  const totalVolume = metricsByWeek.reduce((sum, m) => sum + m.Volume, 0);
  const totalTonnage = metricsByWeek.reduce((sum, m) => sum + m.Tonnage, 0);
  const totalEffectiveTonnage = metricsByWeek.reduce((sum, m) => sum + (m.EffectiveTonnage || 0), 0);
  const totalFatigue = metricsByWeek.reduce((sum, m) => sum + m.Fatigue, 0);
  const totalEffectiveReps = metricsByWeek.reduce((sum, m) => sum + (m.EffectiveRepsCustom || 0), 0);
  const totalTut = metricsByWeek.reduce((sum, m) => sum + (m.Tut || 0), 0);
  const totalEffectiveTut = metricsByWeek.reduce((sum, m) => sum + (m.EffectiveTut || 0), 0);
  const totalSets = metricsByWeek.reduce((sum, m) => sum + (m.Sets || 0), 0);

  // Compare totals
  const compareTotalVolume = compareMetricsByWeek.reduce((sum, m) => sum + (m.Volume_B || 0), 0);
  const compareTotalTonnage = compareMetricsByWeek.reduce((sum, m) => sum + (m.Tonnage_B || 0), 0);
  const compareTotalEffectiveTonnage = compareMetricsByWeek.reduce((sum, m) => sum + (m.EffectiveTonnage_B || 0), 0);
  const compareTotalFatigue = compareMetricsByWeek.reduce((sum, m) => sum + (m.Fatigue_B || 0), 0);
  const compareTotalEffReps = compareMetricsByWeek.reduce((sum, m) => sum + (m.EffectiveRepsCustom_B || 0), 0);
  const compareTotalTut = compareMetricsByWeek.reduce((sum, m) => sum + (m.Tut_B || 0), 0);
  const compareTotalEffectiveTut = compareMetricsByWeek.reduce((sum, m) => sum + (m.EffectiveTut_B || 0), 0);
  const compareTotalSets = compareMetricsByWeek.reduce((sum, m) => sum + (m.Sets_B || 0), 0);

  const getMetricLabelAndUnit = (metric) => {
    switch (metric) {
      case 'Volume': return { name: 'Volume', unit: 'reps' };
      case 'Tonnage': return { name: 'Tonnage', unit: 'kg' };
      case 'EffectiveTonnage': return { name: 'Effective Tonnage', unit: 'kg' };
      case 'Fatigue': return { name: 'Neuromuscular Fatigue', unit: 'units' };
      case 'EffectiveRepsCustom': return { name: 'Effective Reps', unit: 'reps' };
      case 'EffectiveTut': return { name: 'Effective TUT', unit: 's' };
      case 'Tut': return { name: 'TUT', unit: 's' };
      case 'Sets': return { name: 'Sets', unit: '' };
      default: return { name: metric, unit: '' };
    }
  };

  const getMetricColor = (metric) => {
    switch (metric) {
      case 'Volume': return 'var(--color-volume)';
      case 'Tonnage': return 'var(--color-tonnage)';
      case 'EffectiveTonnage': return 'var(--color-effective-tonnage)';
      case 'Fatigue': return 'var(--color-fatigue)';
      case 'EffectiveRepsCustom': return 'var(--accent-secondary)';
      case 'EffectiveTut': return 'var(--color-effective-tut)';
      case 'Tut': return 'var(--color-tut)';
      case 'Sets': return 'var(--color-sets)';
      default: return 'var(--accent-primary)';
    }
  };

  const getMetricColorB = (metric) => {
    switch (metric) {
      case 'Volume': return '#a855f7'; // Purple
      case 'Tonnage': return 'var(--accent-secondary)'; // Lavender/Secondary Accent
      case 'EffectiveTonnage': return '#fda4af'; // Rose/Light pink
      case 'Fatigue': return 'var(--color-tut)'; // Violet
      case 'EffectiveRepsCustom': return 'var(--color-effective-tut)'; // Pink
      case 'EffectiveTut': return 'var(--color-volume)'; // Amber
      case 'Tut': return 'var(--color-tonnage)'; // Emerald
      case 'Sets': return 'var(--color-fatigue)'; // Rose
      default: return 'var(--accent-secondary)';
    }
  };

  // Bounds calculations to scale the selected metric dynamically
  const overallChartBoundsSelected = useMemo(() => {
    const data = compareMode ? mergedChartData : metricsByWeek;
    if (!data || data.length === 0) {
      return ['auto', 'auto'];
    }
    const keyA = overallChartMetric;
    const keyB = `${overallChartMetric}_B`;
    const values = [];
    data.forEach(d => {
      if (d[keyA] !== undefined && !isNaN(d[keyA])) values.push(d[keyA]);
      if (d[keyB] !== undefined && !isNaN(d[keyB])) values.push(d[keyB]);
    });
    if (values.length === 0) return ['auto', 'auto'];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    
    // Provide a small margin (15% of range, or at least 1)
    const margin = range > 0 ? range * 0.15 : Math.max(minVal * 0.1, 1.0);
    const calculatedMin = Math.max(0, minVal - margin);
    const calculatedMax = maxVal + margin;
    return [parseFloat(calculatedMin.toFixed(1)), parseFloat(calculatedMax.toFixed(1))];
  }, [compareMode, mergedChartData, metricsByWeek, overallChartMetric]);

  // Derived: unique exercises list across current and compared programs
  const uniqueExerciseNames = useMemo(() => {
    const names = new Set();
    workoutData.forEach(d => {
      if (d.exercise_obj) names.add(d.exercise_obj.name);
      else if (d.raw_name) names.add(d.raw_name);
    });
    if (compareMode && compareWorkoutData) {
      compareWorkoutData.forEach(d => {
        if (d.exercise_obj) names.add(d.exercise_obj.name);
        else if (d.raw_name) names.add(d.raw_name);
      });
    }
    return Array.from(names).sort();
  }, [workoutData, compareWorkoutData, compareMode]);

  // Derived: chart data for a selected specific exercise over weeks (plots exercise-specific Volume and Tonnage)
  const exerciseChartData = useMemo(() => {
    if (progressionExercise === 'all_metrics') return [];
    
    const weeksSet = new Set();
    
    const getProgData = (dataSrc, suffix = '') => {
      const match = dataSrc.find(d => 
        (d.exercise_obj && d.exercise_obj.name === progressionExercise) || 
        (d.raw_name === progressionExercise)
      );
      if (!match) return {};
      
      const ex = match.exercise_obj || { load_multiplier: 1.0, load_offset: 0.0 };
      const loadMult = ex.load_multiplier !== undefined ? ex.load_multiplier : 1.0;
      const loadOffset = ex.load_offset !== undefined ? ex.load_offset : 0.0;
      
      const res = {};
      match.weeks.forEach(w => {
        weeksSet.add(w.week_num);
        let totalVol = 0;
        let totalTon = 0;
        w.sets.forEach(s => {
          const reps = s.totalReps !== undefined ? s.totalReps : (s.base_reps + (s.assisted_reps || 0) * 0.5 + (s.partial_reps || 0) * 0.33);
          totalVol += reps;
          const actualLoad = (s.load * loadMult) + loadOffset;
          totalTon += actualLoad * reps;
        });
        res[`W${w.week_num}`] = {
          [`Tonnage${suffix}`]: parseFloat(totalTon.toFixed(1)),
          [`Volume${suffix}`]: parseFloat(totalVol.toFixed(1))
        };
      });
      return res;
    };

    const progA = getProgData(workoutData, '');
    const progB = compareMode && compareWorkoutData ? getProgData(compareWorkoutData, '_B') : {};
    
    const sortedWeeks = Array.from(weeksSet).sort((a, b) => a - b);
    return sortedWeeks.map(wNum => {
      const wKey = `W${wNum}`;
      return {
        week: wKey,
        ...(progA[wKey] || {}),
        ...(progB[wKey] || {})
      };
    });
  }, [progressionExercise, workoutData, compareWorkoutData, compareMode]);

  // Bounds calculations to separate exercise Tonnage (upper half) and Volume (lower half) in the exercise trend chart
  const exerciseChartBounds = useMemo(() => {
    if (progressionExercise === 'all_metrics' || exerciseChartData.length === 0) {
      return { tonnageDomain: ['auto', 'auto'], volumeDomain: ['auto', 'auto'] };
    }

    let tValues = [];
    let vValues = [];

    exerciseChartData.forEach(d => {
      if (d.Tonnage !== undefined && !isNaN(d.Tonnage)) tValues.push(d.Tonnage);
      if (d.Tonnage_B !== undefined && !isNaN(d.Tonnage_B)) tValues.push(d.Tonnage_B);
      if (d.Volume !== undefined && !isNaN(d.Volume)) vValues.push(d.Volume);
      if (d.Volume_B !== undefined && !isNaN(d.Volume_B)) vValues.push(d.Volume_B);
    });

    const tMin = tValues.length > 0 ? Math.min(...tValues) : 0;
    const tMax = tValues.length > 0 ? Math.max(...tValues) : 100;
    const vMin = vValues.length > 0 ? Math.min(...vValues) : 0;
    const vMax = vValues.length > 0 ? Math.max(...vValues) : 100;

    // Tonnage stays in upper half:
    const tRange = tMax - tMin;
    const tDelta = tRange > 0 ? tRange : Math.max(tMin * 0.1, 10);
    const tonnageMinDomain = tMin - tDelta - tDelta * 0.15;
    const tonnageMaxDomain = tMax + tDelta * 0.15;

    // Volume stays in lower half:
    const vRange = vMax - vMin;
    const vDelta = vRange > 0 ? vRange : Math.max(vMin * 0.1, 10);
    const volumeMinDomain = Math.max(0, vMin - vDelta * 0.15);
    const volumeMaxDomain = vMax + vDelta + vDelta * 0.15;

    return {
      tonnageDomain: [parseFloat(tonnageMinDomain.toFixed(1)), parseFloat(tonnageMaxDomain.toFixed(1))],
      volumeDomain: [parseFloat(volumeMinDomain.toFixed(1)), parseFloat(volumeMaxDomain.toFixed(1))]
    };
  }, [progressionExercise, exerciseChartData]);

  // Helper: delta label for compare mode
  const delta = (a, b) => {
    if (b === 0) return null;
    const d = ((a - b) / b) * 100;
    return { val: d.toFixed(1), pos: d >= 0 };
  };

  // Helper: clear all dashboard filters
  const clearAllDashFilters = () => {
    setDashFilterSession('all'); setDashFilterWeek('all');
    setCmpFilterSession('all'); setCmpFilterWeek('all');
    setDashMuscleMacro('all'); setDashMuscleSubgroup('all');
  };

  // Has any filter active?
  const hasAnyFilter = dashFilterSession !== 'all' || dashFilterWeek !== 'all' ||
    cmpFilterSession !== 'all' || cmpFilterWeek !== 'all' ||
    dashMuscleMacro !== 'all';


  // Fuzzy match helper (fzf-style: each char of needle must appear in order in haystack)
  const fuzzyScore = (needle, haystack) => {
    if (!needle) return 1;
    const n = needle.toLowerCase();
    const h = haystack.toLowerCase();
    let ni = 0, score = 0, lastMatch = -1;
    for (let hi = 0; hi < h.length && ni < n.length; hi++) {
      if (h[hi] === n[ni]) {
        score += 10 - Math.min(hi - lastMatch - 1, 9); // bonus for consecutive
        lastMatch = hi;
        ni++;
      }
    }
    if (ni < n.length) return -1; // not a match
    return score;
  };

  // Filters for exercise DB (fuzzy, always returns best matches)
  const filteredExercises = exerciseSearch
    ? activeExercises
        .map(ex => {
          const nameScore = fuzzyScore(exerciseSearch, ex.name);
          const muscleScore = Math.max(
            0,
            ...Object.keys(ex.muscles_distr).map(m => fuzzyScore(exerciseSearch, m))
          );
          const best = Math.max(nameScore, muscleScore);
          return { ex, score: best };
        })
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ ex }) => ex)
    : activeExercises;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <Dumbbell size={24} color="#f43f5e" />
          <h1>Algorithmic Bodybuilding</h1>
          <span className="badge">v1.0.0</span>
        </div>

        <button className="mobile-burger-btn" onClick={() => setIsMobileMenuOpen(true)}>
          <div className="burger-icon">
            <div />
            <div />
          </div>
        </button>

        {/* Render editor controls in the header on mobile ONLY */}
        {activeTab === 'editor' && (
          <div className="mobile-header-editor-controls">
            <div className="editor-mode-toggles">
              <button 
                className={`mode-toggle-btn ${editorMode === 'edit' ? 'active' : ''}`}
                onClick={() => setEditorMode('edit')}
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <button 
                className={`mode-toggle-btn ${editorMode === 'preview' ? 'active' : ''}`}
                onClick={() => setEditorMode('preview')}
                title="Preview"
              >
                <Eye size={16} />
              </button>
              <button 
                className={`mode-toggle-btn ${editorMode === 'split' ? 'active' : ''}`}
                onClick={() => setEditorMode('split')}
                title="Split View"
              >
                <Columns size={16} />
              </button>
            </div>
            <button className="btn btn-primary btn-save" onClick={() => saveLogbookContent(logbookText)} title="Save">
              <Save size={16} />
            </button>
          </div>
        )}

        {/* Tab Selection */}
        <div className={`tab-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`} ref={tabNavRef}>
          <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>×</button>
          <div 
            className="tab-nav-highlight" 
            style={{
              position: 'absolute',
              top: '4px',
              bottom: '4px',
              left: `${highlightStyle.left}px`,
              width: `${highlightStyle.width}px`,
              opacity: highlightStyle.opacity,
              transition: 'left var(--transition-normal), width var(--transition-normal), opacity var(--transition-fast)',
              pointerEvents: 'none',
              borderRadius: '99px',
              background: 'rgba(99, 102, 241, 0.08)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2), 0 0 10px rgba(99, 102, 241, 0.15)',
              border: 'none',
              zIndex: 0
            }}
          />
          <button 
            className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => { setActiveTab('editor'); setSelectedSession(null); setIsMobileMenuOpen(false); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Edit size={16} /> Editor
          </button>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSelectedSession(null); setIsMobileMenuOpen(false); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <BarChart3 size={16} /> Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('sessions'); setIsMobileMenuOpen(false); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <BookOpen size={16} /> Sessions
          </button>
          <button 
            className={`tab-btn ${activeTab === 'db' ? 'active' : ''}`}
            onClick={() => { setActiveTab('db'); setSelectedSession(null); setIsMobileMenuOpen(false); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Search size={16} /> Exercise DB
          </button>

          {/* Header Controls inside lateral menu for Mobile */}
          <div className="header-controls">
            {/* Program Selector */}
            <div className="program-selector-container">
              <span className="program-label">Program:</span>
              <select 
                className="program-select"
                value={currentProgram}
                onChange={(e) => handleProgramChange(e.target.value)}
              >
                {programs.map(prog => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))}
              </select>
              <button 
                className="btn-icon-small" 
                onClick={() => setShowNewProgramModal(true)}
                title="Create New Program"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Sync Indicator */}
            <div className="status-badge">
              <div className={`status-dot ${syncStatus}`}></div>
              <span>
                {syncStatus === 'syncing' ? 'Saving...' :
                 syncStatus === 'error' ? 'Sync Error' :
                 syncStatus === 'saved' ? `Synced with ${currentProgram}.md` : 'Offline'}
              </span>
            </div>

            {/* Storage Folder Settings */}
            <div className="storage-settings-container">
              <button
                className="storage-toggle-btn"
                onClick={() => setShowStorageSettings(s => !s)}
              >
                <FolderOpen size={16} className="icon-folder" />
                <span style={{ flex: 1 }}>Storage Folder</span>
                {showStorageSettings ? (
                  <ChevronUp size={14} className="storage-chevron" />
                ) : (
                  <ChevronDown size={14} className="storage-chevron" />
                )}
              </button>

              {showStorageSettings && (() => {
                const cfg = getStorageConfig();
                const isCustom = cfg.dirType === 'custom' && cfg.safUri;
                return (
                  <div className="storage-panel">

                    {/* Current folder status */}
                    <div className={`storage-status-card ${isCustom ? 'custom' : ''}`}>
                      <div className="storage-status-title">
                        <Folder size={12} />
                        <span>Current Folder</span>
                      </div>
                      <div className="storage-status-path">
                        {isCustom ? cfg.safDisplayName : `Documents/${cfg.subfolder}`}
                      </div>
                    </div>

                    {/* Primary action: pick any folder */}
                    <button className="storage-primary-btn" onClick={handlePickFolder}>
                      <FolderOpen size={18} />
                      <span>Pick Any Folder</span>
                    </button>

                    {storagePickError && (
                      <div className="storage-error-alert">
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        <span>{storagePickError}</span>
                      </div>
                    )}

                    {isCustom && (
                      <button className="storage-reset-btn" onClick={handleResetStorage}>
                        <RotateCcw size={14} />
                        <span>Reset to Default</span>
                      </button>
                    )}

                    {/* Divider */}
                    <div className="storage-fallback-section">
                      <div className="storage-divider-title">
                        <Sliders size={12} />
                        <span>Use standard</span>
                      </div>

                      <div className="storage-form-group">
                        <label className="storage-form-label">Location Type</label>
                        <select
                          className="storage-select"
                          value={pendingDirType === 'custom' ? 'documents' : pendingDirType}
                          onChange={e => setPendingDirType(e.target.value)}
                        >
                          <option value="documents">📁 Public Documents (PC sync)</option>
                          <option value="data">🔒 Private App Storage</option>
                        </select>
                      </div>

                      <div className="storage-form-group">
                        <label className="storage-form-label">Subfolder Name</label>
                        <input
                          type="text"
                          className="storage-input"
                          value={pendingSubfolder}
                          onChange={e => setPendingSubfolder(e.target.value)}
                          placeholder="e.g. Algorithmic Bodybuilding"
                        />
                        <div className="storage-path-preview">
                          {pendingDirType === 'data'
                            ? `App private storage/${pendingSubfolder || '(root)'}`
                            : `Documents/${pendingSubfolder || '(root)'}`}
                        </div>
                      </div>

                      <button className="storage-apply-btn" onClick={applyStorageConfig}>
                        <RefreshCw size={14} />
                        <span>Apply &amp; Refresh</span>
                      </button>
                    </div>

                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Header Controls (Desktop) */}
        <div className="header-controls desktop-only">
          {/* Program Selector */}
          <div className="program-selector-container">
            <span className="program-label">Program:</span>
            <select 
              className="program-select"
              value={currentProgram}
              onChange={(e) => handleProgramChange(e.target.value)}
            >
              {programs.map(prog => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </select>
            <button 
              className="btn-icon-small" 
              onClick={() => setShowNewProgramModal(true)}
              title="Create New Program"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Sync Indicator */}
          <div className="status-badge">
            <div className={`status-dot ${syncStatus}`}></div>
            <span>
              {syncStatus === 'saved' && `Synced with ${currentProgram}.md`}
              {syncStatus === 'syncing' && 'Saving changes...'}
              {syncStatus === 'error' && 'Sync Error'}
            </span>
          </div>
        </div>
      </header>

      {/* Sync Error Banner */}
      {syncStatus === 'error' && (
        <div className="sync-error-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{syncError}</span>
          </div>
          <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => saveLogbookContent(logbookText)}>
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Workspace Area */}
      <div className="main-workspace">
        
        {/* Full-Page Editor Tab */}
        {activeTab === 'editor' ? (
          <div className="editor-tab-workspace">
            {/* Editor Sub-Header */}
            <div className="editor-control-bar">
              {/* Edit Mode Toggles */}
              <div className="editor-mode-toggles">
                <button 
                  className={`mode-toggle-btn ${editorMode === 'edit' ? 'active' : ''}`}
                  onClick={() => setEditorMode('edit')}
                >
                  Edit
                </button>
                <button 
                  className={`mode-toggle-btn ${editorMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setEditorMode('preview')}
                >
                  Preview
                </button>
                <button 
                  className={`mode-toggle-btn ${editorMode === 'split' ? 'active' : ''}`}
                  onClick={() => setEditorMode('split')}
                >
                  Split View
                </button>
              </div>

              {/* Action Buttons */}
              <div className="editor-actions">
                <button className="btn btn-primary" onClick={() => saveLogbookContent(logbookText)}>
                  <Save size={14} /> Save Now
                </button>
              </div>
            </div>

            {/* Split / Main Editor container */}
            <div className={`editor-split-container mode-${editorMode}`}>
              
              {/* Text Area Column */}
              {(editorMode === 'edit' || editorMode === 'split') && (
                <div className="editor-panel">
                  <div className="editor-wrapper">
                    <textarea
                      ref={textareaRef}
                      className="editor-textarea"
                      value={logbookText}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      onKeyUp={handleCursorMove}
                      onClick={handleCursorMove}
                      onFocus={handleCursorMove}
                      placeholder="# 1&#10;Lat machine | 3'&#10;90..9+2.7+2&#10;90..9+2.8+2"
                      spellCheck="false"
                    />

                    {/* Autocomplete Suggestions Box */}
                    {showSuggestions && (
                      <div 
                        className="autocomplete-container"
                        style={{ top: cursorPos.top, left: cursorPos.left }}
                      >
                        {suggestions.map((ex, index) => (
                          <div 
                            key={ex.name}
                            className={`autocomplete-item ${index === suggestionIndex ? 'active' : ''}`}
                            onClick={() => selectSuggestion(ex.name)}
                          >
                            <span>{ex.name}</span>
                            <span className="autocomplete-muscle">
                              {MUSCLES[Object.keys(ex.muscles_distr)[0]] || Object.keys(ex.muscles_distr)[0]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Live Preview Column */}
              {(editorMode === 'preview' || editorMode === 'split') && (
                <div className="preview-panel">
                  <div className="preview-container">
                    <LogbookPreview 
                      workoutData={workoutData} 
                      activeExerciseStartLine={activeExerciseStartLine}
                      activeWeekLineIndex={activeWeekLineIndex}
                      editorMode={editorMode}
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : activeTab === 'metric-details' ? (
          <MetricDetailsPage 
            metric={selectedMetricDetail} 
            onBack={() => { setActiveTab('dashboard'); setSelectedMetricDetail(null); }} 
          />
        ) : (
          <>
            {/* TAB CONTENT: DASHBOARD */}
            {activeTab === 'dashboard' && (
              <div className="glass-card main-content-card">
                <div className="glass-card-body">

                  {/* ── Dashboard Filter Bar ── */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '10px',
                    padding: '14px 16px', marginBottom: '20px',
                    background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)',
                    borderRadius: '12px'
                  }}>

                    {/* Top row: Compare toggle + program picker + clear */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      <button
                        id="dash-compare-toggle"
                        className={`btn ${compareMode ? 'btn-secondary' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        onClick={() => {
                          const next = !compareMode;
                          setCompareMode(next);
                          if (!next) { setCompareWorkoutData([]); setCompareProgram(''); setCmpFilterSession('all'); setCmpFilterWeek('all'); }
                          else if (compareProgram) loadCompareProgram(compareProgram);
                        }}
                      >
                        Compare Programs
                      </button>
                      {compareMode && (
                        <>
                          <select
                            id="dash-compare-program"
                            className="select-control"
                            style={{ minWidth: '130px' }}
                            value={compareProgram}
                            onChange={e => { setCompareProgram(e.target.value); loadCompareProgram(e.target.value); setCmpFilterSession('all'); setCmpFilterWeek('all'); }}
                          >
                            <option value="">— pick program —</option>
                            {programs.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {compareLoading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading…</span>}
                        </>
                      )}
                      {hasAnyFilter && (
                        <button
                          className="btn"
                          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.75rem', color: 'var(--color-fatigue)', borderColor: 'rgba(244,63,94,0.25)' }}
                          onClick={clearAllDashFilters}
                        >
                          ✕ Clear All Filters
                        </button>
                      )}
                    </div>

                    {/* Filter rows */}
                    {compareMode && compareProgram ? (
                      // Compare mode: two columns, one per program
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {/* Program A filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Session</span>
                              <select id="dash-session-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={dashFilterSession}
                                onChange={e => { setDashFilterSession(e.target.value); setDashFilterWeek('all'); }}
                              >
                                <option value="all">All</option>
                                {sessionsList.map(s => <option key={s} value={s}>S{s}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Week</span>
                              <select id="dash-week-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={dashFilterWeek}
                                onChange={e => setDashFilterWeek(e.target.value)}
                              >
                                <option value="all">All</option>
                                {dashWeeksList.map(w => <option key={w} value={w}>W{w}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Program B filters */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }} />
                            {currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Session</span>
                              <select id="cmp-session-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={cmpFilterSession}
                                onChange={e => { setCmpFilterSession(e.target.value); setCmpFilterWeek('all'); }}
                              >
                                <option value="all">All</option>
                                {compareSessionsList.map(s => <option key={s} value={s}>S{s}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Week</span>
                              <select id="cmp-week-filter" className="select-control" style={{ minWidth: '110px', fontSize: '0.78rem' }}
                                value={cmpFilterWeek}
                                onChange={e => setCmpFilterWeek(e.target.value)}
                              >
                                <option value="all">All</option>
                                {cmpWeeksList.map(w => <option key={w} value={w}>W{w}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Shared muscle filter — full width row */}
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Muscle Group</span>
                          <select id="dash-muscle-macro" className="select-control" style={{ minWidth: '130px', fontSize: '0.78rem' }}
                            value={dashMuscleMacro}
                            onChange={e => { setDashMuscleMacro(e.target.value); setDashMuscleSubgroup('all'); }}
                          >
                            <option value="all">All Groups</option>
                            {allMacros.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                            <>
                              <span style={{ color: 'var(--border-color)' }}>›</span>
                              <select id="dash-muscle-sub" className="select-control" style={{ minWidth: '160px', fontSize: '0.78rem' }}
                                value={dashMuscleSubgroup}
                                onChange={e => setDashMuscleSubgroup(e.target.value)}
                              >
                                <option value="all">All {dashMuscleMacro}</option>
                                {subMusclesForMacro.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </>
                          )}
                          {dashMuscleMacro !== 'all' && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(shared across both programs)</span>}
                        </div>
                      </div>
                    ) : (
                      // Normal mode: single row of filters
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Session</span>
                          <select id="dash-session-filter" className="select-control" style={{ minWidth: '120px' }}
                            value={dashFilterSession}
                            onChange={e => { setDashFilterSession(e.target.value); setDashFilterWeek('all'); }}
                          >
                            <option value="all">All Sessions</option>
                            {sessionsList.map(s => <option key={s} value={s}>Session {s}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Week</span>
                          <select id="dash-week-filter" className="select-control" style={{ minWidth: '120px' }}
                            value={dashFilterWeek}
                            onChange={e => setDashFilterWeek(e.target.value)}
                          >
                            <option value="all">All Weeks</option>
                            {dashWeeksList.map(w => <option key={w} value={w}>Week {w}</option>)}
                          </select>
                        </div>
                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Muscle</span>
                          <select id="dash-muscle-macro" className="select-control" style={{ minWidth: '130px' }}
                            value={dashMuscleMacro}
                            onChange={e => { setDashMuscleMacro(e.target.value); setDashMuscleSubgroup('all'); }}
                          >
                            <option value="all">All Groups</option>
                            {allMacros.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        {dashMuscleMacro !== 'all' && subMusclesForMacro.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sub-group</span>
                            <select id="dash-muscle-sub" className="select-control" style={{ minWidth: '160px' }}
                              value={dashMuscleSubgroup}
                              onChange={e => setDashMuscleSubgroup(e.target.value)}
                            >
                              <option value="all">All {dashMuscleMacro}</option>
                              {subMusclesForMacro.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Active filter pills */}
                  {hasAnyFilter && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Filters:</span>
                      {dashFilterSession !== 'all' && <span style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '6px', padding: '2px 10px', color: '#a5b4fc' }}>{currentProgram} · S{dashFilterSession}</span>}
                      {dashFilterWeek !== 'all' && <span style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '6px', padding: '2px 10px', color: '#a5b4fc' }}>{currentProgram} · W{dashFilterWeek}</span>}
                      {cmpFilterSession !== 'all' && <span style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '6px', padding: '2px 10px', color: '#67e8f9' }}>{compareProgram} · S{cmpFilterSession}</span>}
                      {cmpFilterWeek !== 'all' && <span style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: '6px', padding: '2px 10px', color: '#67e8f9' }}>{compareProgram} · W{cmpFilterWeek}</span>}
                      {dashMuscleMacro !== 'all' && <span style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '6px', padding: '2px 10px', color: '#d8b4fe' }}>{dashMuscleSubgroup !== 'all' ? dashMuscleSubgroup : dashMuscleMacro}</span>}
                    </div>
                  )}

                  {/* ── Summary Cards ── */}
                  {compareMode && compareProgram && !compareLoading ? (
                    // Compare mode: 2-column layout with A vs B
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                      {/* Column headers */}
                      <div style={{
                        gridColumn: '1', padding: '8px 16px',
                        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                        color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} />
                        {currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}
                      </div>
                      <div style={{
                        gridColumn: '2', padding: '8px 16px',
                        background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)',
                        borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                        color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }} />
                        {currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}
                      </div>

                      {[['Tonnage', 'tonnage', `${totalTonnage.toLocaleString()} kg`, `${compareTotalTonnage.toLocaleString()} kg`, delta(compareTotalTonnage, totalTonnage)],
                        ['Effective Tonnage', 'effective-tonnage', `${totalEffectiveTonnage.toLocaleString()} kg`, `${compareTotalEffectiveTonnage.toLocaleString()} kg`, delta(compareTotalEffectiveTonnage, totalEffectiveTonnage)],
                        ['Volume', 'volume', `${totalVolume.toLocaleString()} reps`, `${compareTotalVolume.toLocaleString()} reps`, delta(compareTotalVolume, totalVolume)],
                        ['Effective Reps', 'effective', `${totalEffectiveReps.toLocaleString()} reps`, `${compareTotalEffReps.toLocaleString()} reps`, delta(compareTotalEffReps, totalEffectiveReps)],
                        ['Sets', 'sets', `${totalSets.toLocaleString()} sets`, `${compareTotalSets.toLocaleString()} sets`, delta(compareTotalSets, totalSets)],
                        ['TUT', 'tut', `${totalTut.toLocaleString()}s`, `${compareTotalTut.toLocaleString()}s`, delta(compareTotalTut, totalTut)],
                        ['Effective TUT', 'effective-tut', `${totalEffectiveTut.toLocaleString()}s`, `${compareTotalEffectiveTut.toLocaleString()}s`, delta(compareTotalEffectiveTut, totalEffectiveTut)],
                        ['Accumulated Fatigue', 'fatigue', `${totalFatigue.toLocaleString()}`, `${compareTotalFatigue.toLocaleString()}`, delta(compareTotalFatigue, totalFatigue)]
                      ].map(([label, cls, valA, valB, d]) => (
                        <React.Fragment key={label}>
                          <div className={`metric-summary-card ${cls}`} style={{ margin: 0 }} onClick={() => { setSelectedMetricDetail(cls); setActiveTab('metric-details'); }}>
                            <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {label}
                              <span className="info-icon-wrapper">
                                <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                                {renderMetricTooltip(cls)}
                              </span>
                            </span>
                            <span className="metric-value" style={{ fontSize: '1.4rem' }}>{valA}</span>
                            <span className="metric-trend">{currentProgram === compareProgram ? `${currentProgram} (Selection A)` : currentProgram}</span>
                          </div>
                          <div className={`metric-summary-card ${cls}`} style={{ margin: 0, opacity: 0.75 }} onClick={() => { setSelectedMetricDetail(cls); setActiveTab('metric-details'); }}>
                            <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {label}
                              <span className="info-icon-wrapper">
                                <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                                {renderMetricTooltip(cls)}
                              </span>
                            </span>
                            <span className="metric-value" style={{ fontSize: '1.4rem' }}>{valB}</span>
                            {d ? (
                              <span style={{ fontSize: '0.75rem', color: d.pos ? '#10b981' : '#f43f5e' }}>{d.pos ? '▲' : '▼'} {Math.abs(d.val)}% vs {currentProgram === compareProgram ? 'Selection A' : currentProgram}</span>
                            ) : (
                              <span className="metric-trend">{currentProgram === compareProgram ? `${compareProgram} (Selection B)` : compareProgram}</span>
                            )}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="metrics-summary-grid">
                      <div className="metric-summary-card volume" onClick={() => { setSelectedMetricDetail('volume'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Volume
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('volume')}
                          </span>
                        </span>
                        <span className="metric-value">{totalVolume.toLocaleString()} reps</span>
                        <span className="metric-trend">
                          {dashFilterSession !== 'all' ? `Session ${dashFilterSession}` : 'All sessions'}
                          {dashFilterWeek !== 'all' ? ` · Week ${dashFilterWeek}` : ''}
                        </span>
                      </div>
                      <div className="metric-summary-card tonnage" onClick={() => { setSelectedMetricDetail('tonnage'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Tonnage
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('tonnage')}
                          </span>
                        </span>
                        <span className="metric-value">{totalTonnage.toLocaleString()} kg</span>
                        <span className="metric-trend">Load-adjusted</span>
                      </div>
                      <div className="metric-summary-card effective-tonnage" onClick={() => { setSelectedMetricDetail('effective-tonnage'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Effective Tonnage
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('effective-tonnage')}
                          </span>
                        </span>
                        <span className="metric-value">{totalEffectiveTonnage.toLocaleString()} kg</span>
                        <span className="metric-trend">Stimulative load</span>
                      </div>
                      <div className="metric-summary-card effective" onClick={() => { setSelectedMetricDetail('effective'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Effective Reps
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('effective')}
                          </span>
                        </span>
                        <span className="metric-value">{totalEffectiveReps.toLocaleString()} reps</span>
                        <span className="metric-trend">Stimulative reps</span>
                      </div>
                      <div className="metric-summary-card sets" onClick={() => { setSelectedMetricDetail('sets'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Sets
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('sets')}
                          </span>
                        </span>
                        <span className="metric-value">{totalSets.toLocaleString()} sets</span>
                        <span className="metric-trend">Total sets performed</span>
                      </div>
                      <div className="metric-summary-card tut" onClick={() => { setSelectedMetricDetail('tut'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          TUT
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('tut')}
                          </span>
                        </span>
                        <span className="metric-value">{totalTut.toLocaleString()}s</span>
                        <span className="metric-trend">Time under tension</span>
                      </div>
                      <div className="metric-summary-card effective-tut" onClick={() => { setSelectedMetricDetail('effective-tut'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Effective TUT
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('effective-tut')}
                          </span>
                        </span>
                        <span className="metric-value">{totalEffectiveTut.toLocaleString()}s</span>
                        <span className="metric-trend">Stimulative TUT</span>
                      </div>
                      <div className="metric-summary-card fatigue" onClick={() => { setSelectedMetricDetail('fatigue'); setActiveTab('metric-details'); }}>
                        <span className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Accumulated Fatigue
                          <span className="info-icon-wrapper">
                            <Info size={13} style={{ cursor: 'pointer', opacity: 0.6 }} />
                            {renderMetricTooltip('fatigue')}
                          </span>
                        </span>
                        <span className="metric-value">{totalFatigue.toLocaleString()}</span>
                        <span className="metric-trend">Rep-level fatigue</span>
                      </div>
                    </div>
                  )}

                  {/* ── Progress Charts Grid ── */}
                  <div className="analytics-grid">

                    {/* Volume & Tonnage Trends */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span className="chart-title" style={{ fontSize: '0.92rem' }}>
                          {progressionExercise === 'all_metrics'
                            ? (compareMode && compareProgram
                              ? `Weekly Progression Comparison`
                              : 'Weekly Progression')
                            : `Exercise Strength Trend — ${progressionExercise}`}
                        </span>
                        <div className="chart-controls-wrapper">
                          <span className="control-label">Analyze:</span>
                          <select 
                            className="select-control select-small"
                            value={progressionExercise}
                            onChange={(e) => setProgressionExercise(e.target.value)}
                            style={{ minWidth: '160px', padding: '4px 24px 4px 10px', fontSize: '0.75rem', height: '28px' }}
                          >
                            <option value="all_metrics">Overall Program Metrics</option>
                            <optgroup label="Exercises">
                              {uniqueExerciseNames.map(ex => (
                                <option key={ex} value={ex}>{ex}</option>
                              ))}
                            </optgroup>
                          </select>
                          {progressionExercise === 'all_metrics' && (
                            <>
                              <span className="control-label">Metric:</span>
                              <select
                                className="select-control select-small"
                                value={overallChartMetric}
                                onChange={(e) => setOverallChartMetric(e.target.value)}
                                style={{ minWidth: '120px', padding: '4px 24px 4px 10px', fontSize: '0.75rem', height: '28px' }}
                              >
                                <option value="Volume">Volume</option>
                                <option value="Tonnage">Tonnage</option>
                                <option value="EffectiveTonnage">Effective Tonnage</option>
                                <option value="Fatigue">Fatigue</option>
                                <option value="EffectiveRepsCustom">Effective Reps</option>
                                <option value="EffectiveTut">Effective TUT</option>
                                <option value="Tut">TUT</option>
                                <option value="Sets">Sets</option>
                              </select>
                            </>
                          )}
                          <TrendingUp size={15} color="var(--accent-primary)" className="chart-trending-icon" style={{ opacity: 0.8 }} />
                        </div>
                      </div>
                      <div className="dashboard-chart-wrapper" style={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                          {progressionExercise === 'all_metrics' ? (
                            <LineChart data={compareMode ? mergedChartData : metricsByWeek}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={11} />
                              <YAxis 
                                stroke={getMetricColor(overallChartMetric)} 
                                fontSize={11} 
                                domain={overallChartBoundsSelected}
                                tickFormatter={(val) => typeof val === 'number' ? (val % 1 === 0 ? val.toLocaleString() : val.toFixed(1)) : val}
                                label={{ 
                                  value: `${getMetricLabelAndUnit(overallChartMetric).name}${getMetricLabelAndUnit(overallChartMetric).unit ? ` (${getMetricLabelAndUnit(overallChartMetric).unit})` : ''}`, 
                                  angle: -90, 
                                  position: 'insideLeft', 
                                  style: { fill: 'var(--text-muted)', fontSize: 9 } 
                                }}
                              />
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                              <Legend fontSize={10} />
                              <Line 
                                type="monotone" 
                                dataKey={overallChartMetric} 
                                stroke={getMetricColor(overallChartMetric)} 
                                strokeWidth={3} 
                                activeDot={{ r: 6 }} 
                                name={compareMode ? `${getMetricLabelAndUnit(overallChartMetric).name} — Selection A` : `${getMetricLabelAndUnit(overallChartMetric).name}${getMetricLabelAndUnit(overallChartMetric).unit ? ` (${getMetricLabelAndUnit(overallChartMetric).unit})` : ''}`} 
                              />
                              {compareMode && compareProgram && (
                                <Line 
                                  type="monotone" 
                                  dataKey={`${overallChartMetric}_B`} 
                                  stroke={getMetricColorB(overallChartMetric)} 
                                  strokeWidth={2} 
                                  strokeDasharray="6 3" 
                                  activeDot={{ r: 5 }} 
                                  name={`${getMetricLabelAndUnit(overallChartMetric).name} — Selection B`} 
                                />
                              )}
                            </LineChart>
                          ) : (
                            <LineChart data={exerciseChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={11} />
                              <YAxis 
                                yAxisId="left" 
                                stroke="var(--accent-primary)" 
                                fontSize={11} 
                                domain={exerciseChartBounds.tonnageDomain}
                                tickFormatter={(val) => Math.round(val).toLocaleString()}
                                label={{ value: 'Tonnage (kg)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 9 } }} 
                              />
                              <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                stroke="var(--accent-secondary)" 
                                fontSize={11} 
                                domain={exerciseChartBounds.volumeDomain}
                                tickFormatter={(val) => Math.round(val).toLocaleString()}
                                label={{ value: 'Volume (reps)', angle: 90, position: 'insideRight', style: { fill: 'var(--text-muted)', fontSize: 9 } }} 
                              />
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                              <Legend fontSize={10} />
                              <Line yAxisId="left" type="monotone" dataKey="Tonnage" stroke="var(--accent-primary)" strokeWidth={3} activeDot={{ r: 6 }} name={compareMode ? 'Tonnage — Selection A' : 'Tonnage (kg)'} />
                              <Line yAxisId="right" type="monotone" dataKey="Volume" stroke="var(--accent-secondary)" strokeWidth={2.5} name={compareMode ? 'Volume — Selection A' : 'Volume (reps)'} />
                              {compareMode && compareProgram && (
                                <>
                                  <Line yAxisId="left" type="monotone" dataKey="Tonnage_B" stroke="#fda4af" strokeWidth={2} strokeDasharray="6 3" activeDot={{ r: 5 }} name="Tonnage — Selection B" />
                                  <Line yAxisId="right" type="monotone" dataKey="Volume_B" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 2" name="Volume — Selection B" />
                                </>
                              )}
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Muscle Group Volume */}
                    <div className="chart-container">
                      <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {dashMuscleMacro !== 'all' 
                            ? (muscleMetric === 'sets' ? `${dashMuscleMacro} Sub-group Sets` : `${dashMuscleMacro} Sub-group Volume`)
                            : (muscleMetric === 'sets' ? 'Muscle Group Sets' : 'Muscle Group Volume')} <Sparkles size={14} color="var(--accent-primary)" />
                        </span>
                        <select
                          className="select-control select-small"
                          value={muscleMetric}
                          onChange={(e) => setMuscleMetric(e.target.value)}
                        >
                          <option value="effective">Effective Reps</option>
                          <option value="volume">Volume</option>
                          <option value="sets">Sets</option>
                        </select>
                      </div>
                      <div className="muscle-list">
                        {displayMuscleData.map((m, idx) => {
                          const allData = compareMode && displayCompareMuscleData.length > 0
                            ? [...displayMuscleData, ...displayCompareMuscleData]
                            : displayMuscleData;
                          const maxVal = Math.max(...allData.map(item => item.value), 1);
                          const pct = (m.value / maxVal) * 100;
                          const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                          const barColor = colors[idx % colors.length];
                          const compareEntry = compareMode ? displayCompareMuscleData.find(c => c.name === m.name) : null;
                          const comparePct = compareEntry ? (compareEntry.value / maxVal) * 100 : 0;

                          return (
                            <div className="muscle-row" key={m.name}>
                              <div className="muscle-row-header">
                                <span className="muscle-row-name">{m.name}</span>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                  <span className="muscle-row-value">{m.value}</span>
                                  {compareEntry && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)' }}>
                                      vs {compareEntry.value}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Primary bar */}
                              <div className="progress-bar-bg" style={{ position: 'relative', height: compareEntry ? '8px' : '6px' }}>
                                <div
                                  className="progress-bar-fill"
                                  style={{ width: `${pct}%`, backgroundColor: barColor, boxShadow: `0 0 8px ${barColor}40`, height: '100%', position: 'absolute', top: 0 }}
                                />
                                {compareEntry && (
                                  <div
                                    style={{
                                      position: 'absolute', top: 0, left: 0,
                                      width: `${comparePct}%`, height: '100%',
                                      background: 'var(--accent-secondary)',
                                      opacity: 0.35, borderRadius: '99px'
                                    }}
                                  />
                                )}
                              </div>
                              {compareEntry && (
                                <div style={{ display: 'flex', gap: '6px', fontSize: '0.65rem', marginTop: '2px' }}>
                                  <span style={{ color: barColor }}>● {currentProgram}</span>
                                  <span style={{ color: 'var(--accent-secondary)' }}>● {compareProgram}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cumulative Tension Curves Chart */}
                    <div className="chart-container" style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                      <div className="chart-header">
                        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Cumulative Tension Profiles <Activity size={14} color="var(--accent-primary)" />
                        </span>
                      </div>
                      <div style={{ height: '300px', width: '100%', marginTop: '10px' }}>
                        {cumulativeCurveData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={cumulativeCurveData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                              <XAxis 
                                dataKey="rom" 
                                stroke="var(--text-muted)" 
                                fontSize={10} 
                                tickFormatter={(val) => `${Math.round(val * 100)}%`}
                              />
                              <YAxis stroke="var(--text-muted)" fontSize={10} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '8px' }} 
                                labelFormatter={(val) => `ROM: ${Math.round(val * 100)}%`}
                                formatter={(val) => parseFloat(val).toFixed(1)}
                              />
                              <Legend fontSize={10} wrapperStyle={{ paddingTop: '10px' }} />
                              {displayMuscleData.slice(0, 6).map((m, idx) => {
                                const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                                return (
                                  <Line 
                                    key={m.name} 
                                    type="monotone" 
                                    dataKey={m.name} 
                                    name={m.name}
                                    stroke={colors[idx % colors.length]} 
                                    strokeWidth={2.5} 
                                    dot={false}
                                    activeDot={{ r: 4 }} 
                                  />
                                );
                              })}
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No data available for the current selection.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            )}

            {/* TAB CONTENT: SESSIONS VIEW */}
            {activeTab === 'sessions' && (
              <div className="tab-workspace-flat">
                {selectedSession === null ? (
                  <>
                    <div className="session-cards-grid">
                      {sessionsList.map(sessNum => {
                        const sessExercises = workoutData.filter(d => d.session === sessNum);
                        const latestWeek = Math.max(...sessExercises.flatMap(e => e.weeks.map(w => w.week_num)), 1);
                        const latestWeeklyData = calculateMetrics(workoutData, sessNum, latestWeek, null, null);
                        const latestEffReps = latestWeeklyData.reduce((sum, d) => sum + (d.effectiveRepsCustom || 0), 0);
                        
                        // Calculate effective reps per main muscle group in this session for the latest week
                        const muscleEffReps = {};
                        latestWeeklyData.forEach(d => {
                          const wEx = sessExercises.find(e => e.exercise_obj && e.exercise_obj.name === d.name);
                          if (wEx && wEx.exercise_obj) {
                            Object.entries(wEx.exercise_obj.muscles_distr).forEach(([sub, pct]) => {
                              const pctVal = typeof pct === 'number' ? pct : (pct?.magnitude || 0);
                              const main = MUSCLES[sub];
                              if (main) {
                                if (!muscleEffReps[main]) {
                                  muscleEffReps[main] = 0;
                                }
                                muscleEffReps[main] += (d.effectiveRepsCustom || 0) * pctVal;
                              }
                            });
                          }
                        });

                        // Only include main muscle groups with at least 10 effective reps
                        const qualifyingMuscles = Object.entries(muscleEffReps)
                          .filter(([, reps]) => reps >= 10)
                          .map(([main]) => main);
                        const musclesStr = qualifyingMuscles.length > 0 ? qualifyingMuscles.sort().join(', ') : 'None';

                        return (
                          <div 
                            className="session-card" 
                            key={sessNum}
                            onClick={() => setSelectedSession(sessNum)}
                          >
                            <span className="session-card-num">Session {sessNum}</span>
                            <div className="session-card-details">
                              <span>{sessExercises.length} Exercises</span>
                              <span>{latestEffReps.toFixed(0)} Effective Reps (W{latestWeek})</span>
                              <span style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <strong>Muscles:</strong> {musclesStr}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick helper for empty sessions */}
                    {sessionsList.length === 0 && (
                      <div className="empty-state">
                        <AlertCircle size={48} />
                        <h3>No sessions found</h3>
                        <p>Go to the Editor tab to create your training logs.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="session-detail-header">
                      <button className="btn" onClick={() => setSelectedSession(null)}>
                        &larr; Back to Sessions
                      </button>
                      <h2>Session {selectedSession}</h2>
                    </div>

                    {/* Exercises inside the selected session */}
                    {workoutData
                      .filter(d => d.session === selectedSession)
                      .map((wEx, idx) => (
                        <div className="exercise-row-item" key={idx}>
                          <div 
                            className="exercise-row-header"
                            style={{ cursor: wEx.exercise_obj ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (wEx.exercise_obj) {
                                setExpandedExercise(expandedExercise === wEx.exercise_obj.name ? null : wEx.exercise_obj.name);
                              }
                            }}
                          >
                            <div>
                              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {wEx.exercise_obj ? wEx.exercise_obj.name : wEx.raw_name}
                                {wEx.exercise_obj && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 'normal', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '4px', padding: '1px 6px', marginLeft: '8px', background: 'rgba(99, 102, 241, 0.05)' }}>
                                    {expandedExercise === wEx.exercise_obj.name ? 'Hide Info' : 'Show Info'}
                                  </span>
                                )}
                              </h3>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                {wEx.exercise_obj && (
                                  <span className="badge muscle">
                                    {MUSCLES[Object.keys(wEx.exercise_obj.muscles_distr)[0]] || Object.keys(wEx.exercise_obj.muscles_distr)[0]}
                                  </span>
                                )}
                                <span className="badge">{formatRestTime(wEx.rest_seconds)} rest</span>
                                {wEx.concentric !== undefined && (
                                  <span className="badge" style={{ borderColor: 'rgba(139, 92, 246, 0.3)', color: 'var(--color-tut)' }}>
                                    Tempo: {wEx.concentric}-{wEx.shortening_pause}-{wEx.eccentric}-{wEx.lengthening_pause}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Exercise database details expanded */}
                          {wEx.exercise_obj && expandedExercise === wEx.exercise_obj.name && (
                            <div style={{ 
                              marginTop: '4px', 
                              marginBottom: '16px', 
                              padding: '12px', 
                              background: 'rgba(0,0,0,0.2)', 
                              borderRadius: '8px', 
                              border: '1px solid var(--border-color)', 
                              fontSize: '0.8rem' 
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Fatigue:</span> <strong style={{ color: 'var(--text-primary)' }}>{wEx.exercise_obj.fatigue}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Load Coeff:</span> <strong style={{ color: 'var(--text-primary)' }}>{wEx.exercise_obj.load_coeff}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Multiplier:</span> <strong style={{ color: 'var(--text-primary)' }}>{wEx.exercise_obj.load_multiplier}x</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Offset:</span> <strong style={{ color: 'var(--text-primary)' }}>{wEx.exercise_obj.load_offset}kg</strong></div>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Muscle Distribution:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {Object.entries(wEx.exercise_obj.muscles_distr).map(([muscle, pct]) => (
                                    <span key={muscle} className="badge muscle" style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.25)', fontSize: '0.65rem', padding: '2px 6px' }}>
                                      {muscle}: <strong>{Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%</strong>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Weekly set breakdown for this exercise */}
                          <div className="exercise-sets-list">
                            {wEx.weeks.map(wk => {
                              const grouped = groupSets(wk.sets);
                              return (
                                <div className="set-bubble" key={wk.week_num}>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>Week {wk.week_num}</div>
                                  {grouped.map((g, gIdx) => {
                                    if (g.isDropset) {
                                      return (
                                        <div key={gIdx} className="set-bubble-dropset" style={{ margin: '6px 0', padding: '6px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', textAlign: 'center' }}>
                                          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', tracking: '0.05em', color: 'rgba(239, 68, 68, 0.8)', marginBottom: '4px', fontWeight: 'bold' }}>Dropset</div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '3px' }}>
                                            {g.sets.map((s, sIdx) => (
                                              <React.Fragment key={sIdx}>
                                                {sIdx > 0 && <span style={{ color: 'rgba(239, 68, 68, 0.4)', fontSize: '0.7rem' }}>➔</span>}
                                                <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
                                                  <span className="set-bubble-load">{s.load}kg</span>
                                                  <span className="set-bubble-reps">×{s.base_reps + s.assisted_reps}</span>
                                                  {s.partial_reps > 0 && <span style={{ color: 'var(--color-volume)', fontSize: '0.65rem' }}>+{s.partial_reps}p</span>}
                                                  {s.assisted_reps > 0 && <span style={{ color: 'var(--accent-secondary)', fontSize: '0.65rem' }}>({s.assisted_reps}a)</span>}
                                                  <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.65rem', marginLeft: '3px' }}>@{s.rpe}</span>
                                                </span>
                                              </React.Fragment>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      const s = g.set;
                                      return (
                                        <div key={gIdx} style={{ margin: '2px 0', borderBottom: gIdx < grouped.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none', paddingBottom: '4px', paddingTop: '4px' }}>
                                          <span className="set-bubble-load">{s.load}kg</span>
                                          <span className="set-bubble-reps">x {s.base_reps + s.assisted_reps}</span>
                                          {s.partial_reps > 0 && <span style={{ color: 'var(--color-volume)', fontSize: '0.7rem' }}>+{s.partial_reps}p</span>}
                                          {s.assisted_reps > 0 && <span style={{ color: 'var(--accent-secondary)', fontSize: '0.7rem' }}>({s.assisted_reps}a)</span>}
                                          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem', marginLeft: '6px' }}>@{s.rpe}</span>
                                        </div>
                                      );
                                    }
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: EXERCISE DATABASE */}
            {activeTab === 'db' && (
              <div className="tab-workspace-flat" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="filters-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Search size={16} color="var(--text-muted)" />
                  <input 
                    type="text" 
                    className="select-control"
                    style={{ flex: 1, padding: '8px 12px' }}
                    placeholder="Search exercises by name or muscle group..."
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Showing {filteredExercises.length} of {activeExercises.length}
                  </span>
                  <button 
                    className="btn btn-primary" 
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.8rem', height: '36px' }}
                    onClick={handleOpenAddExercise}
                  >
                    <Plus size={14} /> Add Exercise
                  </button>
                </div>

                <div className="exercise-db-grid" style={{ flex: 1, overflowY: 'auto' }}>
                  {filteredExercises.map(ex => (
                    <div 
                      className="exercise-db-card" 
                      key={ex.name}
                      onClick={() => handleOpenEditExercise(ex)}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h4 className="ex-card-title" style={{ margin: 0, wordBreak: 'break-word', fontSize: '0.95rem' }}>{ex.name}</h4>
                            {logbookText.split('\n').some(line => line.toLowerCase().startsWith(`override: ${ex.name.toLowerCase()} |`)) && (
                                <span style={{ 
                                  background: 'rgba(99, 102, 241, 0.15)', 
                                  color: '#818cf8', 
                                  border: '1px solid rgba(99, 102, 241, 0.3)',
                                  alignSelf: 'flex-start',
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  marginTop: '2px',
                                  fontWeight: '500'
                                }}>
                                  Overridden for {currentProgram}
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="ex-card-detail" style={{ margin: '4px 0 10px 0' }}>
                          <span>Fatigue: <b>{ex.fatigue}</b></span>
                          <span>Coeff: <b>{ex.load_coeff}</b></span>
                          {ex.load_multiplier !== 1 && <span>Multiplier: <b>{ex.load_multiplier}x</b></span>}
                          {ex.load_offset !== 0 && <span>Offset: <b>{ex.load_offset}kg</b></span>}
                        </div>
                      </div>
                      <div>
                        <div className="ex-card-muscle-badges">
                          {Object.entries(ex.muscles_distr).map(([muscle, pct]) => (
                            <span key={muscle} className="badge muscle">
                              {muscle} ({Math.round((typeof pct === 'number' ? pct : (pct.magnitude || 0)) * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* New Program Modal Dialog */}
      {showNewProgramModal && (
        <div className="modal-overlay" onClick={() => setShowNewProgramModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Create New Program</h3>
            <div className="modal-body">
              <label htmlFor="new-prog-input" className="modal-label">Program Name</label>
              <input
                id="new-prog-input"
                type="text"
                className="modal-input"
                placeholder="e.g. S1M4, S2M1"
                value={newProgramName}
                onChange={(e) => {
                  setNewProgramName(e.target.value);
                  setNewProgramError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProgram();
                }}
                autoFocus
              />
              {newProgramError && <div className="modal-error">{newProgramError}</div>}
              <p className="modal-help">
                Use alphanumeric characters, underscores, and hyphens. A template workout will be automatically created in the workspace.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => {
                setShowNewProgramModal(false);
                setNewProgramName('');
                setNewProgramError('');
              }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreateProgram}>
                Create Program
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise CRUD Modal Dialog */}
      {showExerciseModal && (
        <div className="modal-overlay" onClick={() => setShowExerciseModal(false)}>
          <div className="modal-card" style={{ maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingRight: '20px' }}>
              <h3 className="modal-title" style={{ borderBottom: 'none' }}>{editingExercise ? 'Edit Exercise' : 'Add Exercise'}</h3>
              {editingExercise && (
                <button
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleDeleteExercise(editingExercise.name)}
                >
                  <Trash2 size={13} /> Delete Exercise
                </button>
              )}
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label className="modal-label">Exercise Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Incline Bench Press"
                  value={exerciseForm.name}
                  onChange={(e) => {
                    setExerciseForm({ ...exerciseForm, name: e.target.value });
                    setExerciseError('');
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="modal-label">Fatigue (0.0 - 10.0)</label>
                  <input
                    type="number"
                    className="modal-input"
                    min="0"
                    max="10"
                    step="0.1"
                    value={exerciseForm.fatigue}
                    onChange={(e) => setExerciseForm({ ...exerciseForm, fatigue: e.target.value })}
                  />
                </div>
                <div>
                  <label className="modal-label">Load Coefficient</label>
                  <input
                    type="number"
                    className="modal-input"
                    min="0"
                    max="2"
                    step="0.01"
                    value={exerciseForm.load_coeff}
                    onChange={(e) => setExerciseForm({ ...exerciseForm, load_coeff: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="modal-label">Load Multiplier</label>
                  <input
                    type="number"
                    className="modal-input"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={exerciseForm.load_multiplier}
                    onChange={(e) => setExerciseForm({ ...exerciseForm, load_multiplier: e.target.value })}
                  />
                </div>
                <div>
                  <label className="modal-label">Load Offset (kg)</label>
                  <input
                    type="number"
                    className="modal-input"
                    min="-100"
                    max="100"
                    step="0.5"
                    value={exerciseForm.load_offset}
                    onChange={(e) => setExerciseForm({ ...exerciseForm, load_offset: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input
                  type="checkbox"
                  id="is-isolation-checkbox"
                  checked={exerciseForm.is_isolation}
                  onChange={(e) => setExerciseForm({ ...exerciseForm, is_isolation: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                />
                <label htmlFor="is-isolation-checkbox" className="modal-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Isolation Exercise
                </label>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                <span className="modal-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Muscle Distribution
                </span>
                
                {exerciseForm.muscles.length > 0 && (
                  <div style={{ width: '100%', height: 160, marginBottom: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px 10px 0 0' }}>
                    <ResponsiveContainer>
                      <LineChart data={getBezierCurveData(exerciseForm.muscles)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="x" type="number" domain={[0, 1]} tickCount={5} stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => val === 0 ? 'Stretch' : val === 1 ? 'Contract' : val} />
                        <YAxis stroke="var(--text-muted)" fontSize={10} width={30} domain={[0, 1]} tickFormatter={(v) => Math.round(v*100)} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)' }} labelFormatter={(l) => `ROM: ${(l*100).toFixed(0)}%`} formatter={(val) => [(val*100).toFixed(1)+'%', 'Tension']} />
                        {exerciseForm.muscles.map((m, i) => {
                           const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                           return <Line key={m.name} type="monotone" dataKey={m.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={2} name={m.name} />;
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                {exerciseForm.muscles.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>
                    No muscle groups assigned yet. Select a muscle below to add it.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {exerciseForm.muscles.map((m, index) => {
                      const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];
                      const dotColor = colors[index % colors.length];
                      return (
                      <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: dotColor }}></span>
                            {m.name}
                          </span>
                          <button
                            type="button"
                            className="btn-icon-small"
                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => {
                              const updated = exerciseForm.muscles.filter((_, i) => i !== index);
                              setExerciseForm({ ...exerciseForm, muscles: updated });
                              setExerciseError('');
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}>
                            <button 
                              type="button" 
                              className="btn btn-outline" 
                              style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', height: '32px' }}
                              onClick={() => setEditingCurveIndex(index)}
                            >
                              <Sliders size={14} style={{ marginRight: '6px' }} />
                              Scolpisci Curva
                            </button>
                          </div>
                          <div>
                            <label className="modal-label" style={{ fontSize: '0.7rem' }}>Magnitude (%)</label>
                            <input type="number" className="modal-input" min="0" max="100" step="1" value={m.percentage} onChange={(e) => {
                              const updated = [...exerciseForm.muscles];
                              updated[index] = { ...m, percentage: parseInt(e.target.value) || 0 };
                              setExerciseForm({ ...exerciseForm, muscles: updated });
                            }} style={{ padding: '4px 8px', fontSize: '0.8rem' }} />
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
                
                {editingCurveIndex !== null && (
                  <div style={{ marginTop: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        Curva di Tensione: {exerciseForm.muscles[editingCurveIndex]?.name}
                      </h4>
                      <button 
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                        onClick={() => setEditingCurveIndex(null)}
                      >
                        Fatto
                      </button>
                    </div>
                    <BezierEditor 
                      value={exerciseForm.muscles[editingCurveIndex] || {}}
                      onChange={(newCurve) => {
                        const updated = [...exerciseForm.muscles];
                        updated[editingCurveIndex] = { ...updated[editingCurveIndex], ...newCurve };
                        setExerciseForm({ ...exerciseForm, muscles: updated });
                      }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
                      Trascina i punti arancioni per impostare la tensione iniziale e finale.<br/>
                      Trascina le maniglie blu per modificare l'accelerazione della resistenza.
                    </p>
                  </div>
                )}

                {editingCurveIndex === null && Object.keys(MUSCLES).filter(m => !exerciseForm.muscles.some(added => added.name === m)).length > 0 && (() => {
                  const available = Object.keys(MUSCLES).filter(m => !exerciseForm.muscles.some(added => added.name === m));
                  const scored = muscleSearch
                    ? available
                        .map(m => {
                          const n = muscleSearch.toLowerCase();
                          const h = (m + ' ' + MUSCLES[m]).toLowerCase();
                          let ni = 0, score = 0, last = -1;
                          for (let hi = 0; hi < h.length && ni < n.length; hi++) {
                            if (h[hi] === n[ni]) { score += 10 - Math.min(hi - last - 1, 9); last = hi; ni++; }
                          }
                          return { m, score: ni < n.length ? -1 : score };
                        })
                        .filter(x => x.score >= 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 6)
                    : [];

                  const addMuscle = (name) => {
                    const currentSum = exerciseForm.muscles.reduce((sum, x) => sum + x.percentage, 0);
                    const defaultPct = Math.max(0, 100 - currentSum);
                    setExerciseForm({
                      ...exerciseForm,
                      muscles: [...exerciseForm.muscles, { name, percentage: defaultPct, x0: 0, y0: 1, x1: 0.33, y1: 1, x2: 0.66, y2: 1, x3: 1, y3: 1 }]
                    });
                    setExerciseError('');
                    setMuscleSearch('');
                  };

                  return (
                    <div style={{ marginTop: '12px' }}>
                      <input
                        type="text"
                        className="modal-input"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(5, 7, 15, 0.85)', color: 'var(--text-primary)', borderColor: 'rgba(99,102,241,0.3)' }}
                        placeholder="🔍 Search muscle to add… (Tab to select top)"
                        value={muscleSearch}
                        onChange={(e) => setMuscleSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && scored.length > 0) {
                            e.preventDefault();
                            addMuscle(scored[0].m);
                          }
                        }}
                      />
                      {scored.length > 0 && (
                        <div style={{
                          marginTop: '6px',
                          background: '#080b14',
                          border: '1px solid rgba(99,102,241,0.45)',
                          borderRadius: '8px',
                          overflow: 'hidden'
                        }}>
                          {scored.map(({ m }, i) => (
                            <div
                              key={m}
                              style={{
                                padding: '9px 14px', cursor: 'pointer', fontSize: '0.85rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                color: 'var(--text-primary)',
                                borderBottom: i < scored.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                background: i === 0 ? 'rgba(99,102,241,0.10)' : 'transparent'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.22)'}
                              onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(99,102,241,0.10)' : 'transparent'}
                              onMouseDown={(e) => { e.preventDefault(); addMuscle(m); }}
                            >
                              <span>
                                {i === 0 && <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', marginRight: '6px', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '3px', padding: '1px 4px' }}>Tab ↵</span>}
                                {m}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--accent-secondary)', background: 'rgba(6,182,212,0.12)', padding: '2px 7px', borderRadius: '4px' }}>{MUSCLES[m]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Muscle validation bar */}
                {(() => {
                  const currentSum = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
                  return (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Distribution Total:</span>
                        <span style={{ fontWeight: 'bold', color: currentSum === 100 ? '#22c55e' : '#ef4444' }}>
                          {currentSum}% / 100%
                        </span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, currentSum)}%`,
                          background: currentSum === 100 ? '#22c55e' : '#eab308',
                          transition: 'width 0.2s ease, background-color 0.2s ease'
                        }} />
                      </div>
                    </div>
                  );
                })()}

              </div>

              {exerciseError && <div className="modal-error" style={{ marginTop: '4px' }}>{exerciseError}</div>}

            </div>
            <div className="modal-actions">
              {currentHasOverride && (
                <button
                  className="btn btn-danger"
                  style={{ marginRight: 'auto' }}
                  onClick={handleRemoveOverride}
                >
                  Remove Override
                </button>
              )}
              <button className="btn" onClick={() => setShowExerciseModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveExerciseForProgramOnly}
                disabled={exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100}
                style={{
                  opacity: exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100 ? 0.6 : 1,
                  cursor: exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100 ? 'not-allowed' : 'pointer'
                }}
              >
                Save for {currentProgram} Only
              </button>
              <button
                className="btn btn-success-solid"
                onClick={handleSaveExercise}
                disabled={exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100}
                style={{
                  opacity: exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100 ? 0.6 : 1,
                  cursor: exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0) !== 100 ? 'not-allowed' : 'pointer'
                }}
              >
                Save Globally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
