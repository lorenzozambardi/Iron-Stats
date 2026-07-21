import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
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
  Bot,
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
  Activity,
  Undo2,
  Redo2,
  Settings,
  Timer
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
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
import { formatRestTime, groupSets, fuzzyScore, solveBezierY, getBezierCurveData } from './components/helpers';
const GeneratorConfig = lazy(() => import('./components/GeneratorConfig'));
import DatabaseTab from './components/tabs/DatabaseTab';
import DashboardTab from './components/tabs/DashboardTab';
import StopwatchTab from './components/tabs/StopwatchTab';

const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];

export default function App() {
  // Data State
  const [logbookText, setLogbookText] = useState('');
  const [debouncedLogbookText, setDebouncedLogbookText] = useState('');
  const [exercisesDb, setExercisesDb] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // Default to editor view
  const [selectedMetricDetail, setSelectedMetricDetail] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showDesktopSettings, setShowDesktopSettings] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleSearch, setMuscleSearch] = useState('');
  const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const [appPalette, setAppPalette] = useState(() => localStorage.getItem('app-palette') || 'indigo');

  const APP_PALETTES = [
    { id: 'red', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.25)', label: 'Red' },
    { id: 'rose', color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.25)', label: 'Rose' },
    { id: 'pink', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.25)', label: 'Pink' },
    { id: 'orange', color: '#f97316', glow: 'rgba(249, 115, 22, 0.25)', label: 'Orange' },
    { id: 'amber', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)', label: 'Amber' },
    { id: 'yellow', color: '#eab308', glow: 'rgba(234, 179, 8, 0.25)', label: 'Yellow' },
    { id: 'lime', color: '#84cc16', glow: 'rgba(132, 204, 22, 0.25)', label: 'Lime' },
    { id: 'emerald', color: '#10b981', glow: 'rgba(16, 185, 129, 0.25)', label: 'Emerald' },
    { id: 'teal', color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.25)', label: 'Teal' },
    { id: 'cyan', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.25)', label: 'Cyan' },
    { id: 'sky', color: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.25)', label: 'Sky' },
    { id: 'indigo', color: '#6366f1', glow: 'rgba(99, 102, 241, 0.25)', label: 'Indigo' },
    { id: 'violet', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.25)', label: 'Violet' },
    { id: 'fuchsia', color: '#d946ef', glow: 'rgba(217, 70, 239, 0.25)', label: 'Fuchsia' },
    { id: 'slate', color: '#64748b', glow: 'rgba(100, 116, 139, 0.25)', label: 'Slate' }
  ];

  const hexToRgba = (hex, alpha) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const BG_PALETTES = [
    { id: 'black', primary: '#000000', label: 'Pure Black' },
    { id: 'darkest', primary: '#050505', label: 'Darkest' },
    { id: 'dark', primary: '#0a0a0a', label: 'Dark' },
    { id: 'zinc', primary: '#111111', label: 'Zinc' },
    { id: 'charcoal', primary: '#18181b', label: 'Charcoal' }
  ];

  const SEC_PALETTES = [
    { id: 'black', color: '#000000', glass: 'rgba(0, 0, 0, 0.6)', glassActive: 'rgba(0, 0, 0, 0.85)', label: 'Pure Black' },
    { id: 'darkest', color: '#09090b', glass: 'rgba(9, 9, 11, 0.6)', glassActive: 'rgba(9, 9, 11, 0.85)', label: 'Darkest' },
    { id: 'dark', color: '#18181b', glass: 'rgba(24, 24, 27, 0.6)', glassActive: 'rgba(24, 24, 27, 0.85)', label: 'Dark' },
    { id: 'zinc', color: '#27272a', glass: 'rgba(39, 39, 42, 0.6)', glassActive: 'rgba(39, 39, 42, 0.85)', label: 'Zinc' },
    { id: 'slate', color: '#1e1e1e', glass: 'rgba(30, 30, 30, 0.6)', glassActive: 'rgba(30, 30, 30, 0.85)', label: 'Slate' }
  ];

  const [bgPalette, setBgPalette] = useState(() => localStorage.getItem('bg-palette') || 'black');
  const [secPalette, setSecPalette] = useState(() => localStorage.getItem('sec-palette') || 'darkest');
  const [secAccentPalette, setSecAccentPalette] = useState(() => localStorage.getItem('sec-accent-palette') || 'cyan');

  useEffect(() => {
    const root = document.documentElement;
    const p = APP_PALETTES.find(x => x.id === appPalette);
    if (p) {
      root.style.setProperty('--accent-primary', p.color);
      root.style.setProperty('--accent-primary-glow', p.glow);
      root.style.setProperty('--accent-primary-subtle', hexToRgba(p.color, 0.1));
      localStorage.setItem('app-palette', appPalette);
    }
    
    let primaryBg = '#000000';
    if (bgPalette.startsWith('#')) primaryBg = bgPalette;
    else {
      const b = BG_PALETTES.find(x => x.id === bgPalette);
      if (b) primaryBg = b.primary;
    }
    root.style.setProperty('--bg-primary', primaryBg);
    localStorage.setItem('bg-palette', bgPalette);

    let secBg = '#111111', secGlass = 'rgba(17,17,17,0.6)', secGlassActive = 'rgba(17,17,17,0.85)';
    if (secPalette.startsWith('#')) {
      secBg = secPalette;
      secGlass = hexToRgba(secPalette, 0.6);
      secGlassActive = hexToRgba(secPalette, 0.85);
    } else {
      const s = SEC_PALETTES.find(x => x.id === secPalette);
      if (s) {
        secBg = s.color;
        secGlass = s.glass;
        secGlassActive = s.glassActive;
      }
    }
    root.style.setProperty('--bg-secondary', secBg);
    root.style.setProperty('--bg-glass', secGlass);
    root.style.setProperty('--bg-glass-active', secGlassActive);
    localStorage.setItem('sec-palette', secPalette);

    // Apply secondary accent color
    const sp = APP_PALETTES.find(x => x.id === secAccentPalette);
    if (sp) {
      root.style.setProperty('--accent-secondary', sp.color);
      root.style.setProperty('--accent-secondary-glow', sp.glow);
      root.style.setProperty('--accent-secondary-subtle', hexToRgba(sp.color, 0.1));
      localStorage.setItem('sec-accent-palette', secAccentPalette);
    }
  }, [appPalette, bgPalette, secPalette, secAccentPalette]);

  // History State for Undo/Redo
  const [historyIndex, setHistoryIndex] = useState(0);
  const textHistoryRef = useRef(['']);
  const isUndoRedoAction = useRef(false);
  const textHistoryTimeoutRef = useRef(null);

  useEffect(() => {
     if (isUndoRedoAction.current) {
        isUndoRedoAction.current = false;
        return;
     }
     
     if (textHistoryTimeoutRef.current) clearTimeout(textHistoryTimeoutRef.current);
     textHistoryTimeoutRef.current = setTimeout(() => {
         if (historyIndex < textHistoryRef.current.length - 1) {
            textHistoryRef.current = textHistoryRef.current.slice(0, historyIndex + 1);
         }
         if (textHistoryRef.current[textHistoryRef.current.length - 1] !== logbookText) {
            textHistoryRef.current.push(logbookText);
            if (textHistoryRef.current.length > 50) {
               textHistoryRef.current.shift();
            }
            setHistoryIndex(textHistoryRef.current.length - 1);
         }
     }, 500);
  }, [logbookText, historyIndex]);

  const handleUndo = useCallback(() => {
     if (historyIndex > 0) {
        isUndoRedoAction.current = true;
        const newIndex = historyIndex - 1;
        setLogbookText(textHistoryRef.current[newIndex]);
        setHistoryIndex(newIndex);
     }
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
     if (historyIndex < textHistoryRef.current.length - 1) {
        isUndoRedoAction.current = true;
        const newIndex = historyIndex + 1;
        setLogbookText(textHistoryRef.current[newIndex]);
        setHistoryIndex(newIndex);
     }
  }, [historyIndex]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Hide bottom nav when virtual keyboard is active on mobile.
  // Compares visualViewport height against physical screen.height to accurately detect keyboard open/close,
  // preventing the navbar from sliding up on top of the keyboard on mobile Chrome/Android.
  useEffect(() => {
    const getNav = () => document.querySelector('.mobile-bottom-nav');

    const updateKeyboardState = () => {
      const nav = getNav();
      if (!nav) return;

      const screenH = window.screen.height || window.outerHeight || 800;
      const currentH = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      // Virtual keyboard is open if visible viewport height drops below 75% of physical screen height
      const isKeyboardOpen = currentH < screenH * 0.75;

      if (isKeyboardOpen) {
        nav.classList.add('keyboard-open');
      } else {
        nav.classList.remove('keyboard-open');
      }
    };

    const handleFocus = () => setTimeout(updateKeyboardState, 50);

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleFocus);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState);
      window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleFocus);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardState);
        window.visualViewport.removeEventListener('scroll', updateKeyboardState);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLogbookText(logbookText);
    }, 500);
    return () => clearTimeout(timer);
  }, [logbookText]);

  // Swipeable views container ref
  const swipeContainerRef = useRef(null);
  const bottomNavIndicatorRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const isScrollingToTab = useRef(false);
  const scrollTabTimeout = useRef(null);

  // Sync initial scroll position on mount for mobile
  useEffect(() => {
    if (swipeContainerRef.current && window.innerWidth <= 768) {
      const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
      const index = tabOrder.indexOf(activeTab === 'metric-details' ? 'dashboard' : activeTab);
      if (index > 0) {
        swipeContainerRef.current.scrollTo({ left: index * swipeContainerRef.current.clientWidth, behavior: 'instant' });
      }
    }
  }, []);

  const handleScroll = useCallback((e) => {
    if (window.innerWidth > 768) return; // Only apply activeTab scroll sync on mobile
    if (isScrollingToTab.current) return; // Ignore programmatic scrolls to prevent transition conflicts
    
    const container = e.target;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width === 0) return;
    
    const exactIndex = scrollLeft / width;
    
    // Dynamically track the finger
    if (bottomNavIndicatorRef.current) {
      bottomNavIndicatorRef.current.style.transition = 'none'; // Ensure no transition during swipe
      bottomNavIndicatorRef.current.style.transform = `translateX(${exactIndex * 52}px)`;
    }
    
    // Debounce the heavy state update to prevent lag during the swipe
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      // Calculate which tab is mostly visible
      const index = Math.round(exactIndex);
      const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
      if (index >= 0 && index < tabOrder.length) {
        const currentTab = tabOrder[index];
        if (activeTab !== currentTab && activeTab !== 'metric-details') {
          setActiveTab(currentTab);
        } else if (activeTab === 'metric-details' && currentTab !== 'dashboard') {
           // If we are on metric-details and scroll away from dashboard, update activeTab
           setActiveTab(currentTab);
           setSelectedMetricDetail(null);
        }
      }
    }, 100); // Wait 100ms after last scroll event before triggering full React re-render
  }, [activeTab]);

  // Helper to scroll to tab programmatically
  const scrollToTab = useCallback((tabName) => {
    if (swipeContainerRef.current) {
      const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
      // If we go to metric-details, scroll to dashboard
      const targetName = tabName === 'metric-details' ? 'dashboard' : tabName;
      const index = tabOrder.indexOf(targetName);
      if (index !== -1) {
        // We use behavior: 'auto' to jump instantly
        isScrollingToTab.current = true;
        if (scrollTabTimeout.current) clearTimeout(scrollTabTimeout.current);
        scrollTabTimeout.current = setTimeout(() => {
          isScrollingToTab.current = false;
        }, 50); // clear flag quickly since it's instant

        if (bottomNavIndicatorRef.current) {
          bottomNavIndicatorRef.current.style.transition = 'none'; // Instant
          bottomNavIndicatorRef.current.style.transform = `translateX(${index * 52}px)`;
        }
        
        // Immediately update icon colors via DOM to prevent lag from deferred React state
        const navContainer = document.querySelector('.mobile-bottom-nav');
        if (navContainer) {
          const btns = navContainer.querySelectorAll('.bottom-nav-btn');
          btns.forEach((btn, i) => {
            if (i === index) btn.classList.add('active');
            else btn.classList.remove('active');
          });
        }
        
        // Header controls visibility is managed naturally by swipe view layout

        // Execute physical scroll immediately
        swipeContainerRef.current.scrollTo({
          left: index * swipeContainerRef.current.clientWidth,
          behavior: 'auto'
        });
        
        // Defer the heavy React state update so it doesn't block the browser from painting the jump
        setTimeout(() => {
          setActiveTab(tabName);
        }, 0);
      }
    }
  }, []);


  // Storage folder settings (mobile)
  const [showStorageSettings, setShowStorageSettings] = useState(false);
  const [isStorageClosing, setIsStorageClosing] = useState(false);

  const toggleStorageSettings = () => {
    if (showStorageSettings) {
      setIsStorageClosing(true);
      setTimeout(() => {
        setShowStorageSettings(false);
        setIsStorageClosing(false);
      }, 250);
    } else {
      setShowStorageSettings(true);
    }
  };
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

  const activeExercises = useMemo(() => {
    return getExercisesWithOverrides(debouncedLogbookText, exercisesDb);
  }, [debouncedLogbookText, exercisesDb]);

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
  const [tensionSliderPos, setTensionSliderPos] = useState(50); // 0-100 ROM % for mobile scrubber

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
  const saveTimeoutRef = useRef(null); // useRef instead of useState to avoid re-render on debounce

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
        setDebouncedLogbookText(text);
        setSyncStatus('saved');
      })
      .catch(err => {
        setSyncStatus('error');
        setSyncError(err.message);
      });
  }, []);

  // Parse logbook text whenever it changes or the exercises DB updates
  const workoutData = useMemo(() => {
    if (debouncedLogbookText && exercisesDb.length > 0) {
      return parseLogbook(debouncedLogbookText, exercisesDb);
    }
    return [];
  }, [debouncedLogbookText, exercisesDb]);

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
        setDebouncedLogbookText(text);
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
    if (syncStatus === 'syncing' && saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
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
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveLogbookContent(newText, currentProgram);
    }, 1500);

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


  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <button className="mobile-burger-btn" style={{ pointerEvents: 'auto' }} onClick={() => setShowMobileSettings(true)}>
          <Settings size={22} color="var(--text-primary)" strokeWidth={1.5} />
        </button>

        <div className="brand" style={{ pointerEvents: 'auto' }}>
          <h1 style={{ textAlign: 'right' }}>Algorithmic<br/>Bodybuilding</h1>
        </div>

        {/* Tab Selection */}
        <div className={`tab-nav ${showMobileSettings ? 'mobile-open' : ''}`} ref={tabNavRef}>
          <button className="mobile-close-btn" onClick={() => setShowMobileSettings(false)}>×</button>
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
            className={`tab-btn ${activeTab === 'stopwatch' ? 'active' : ''}`}
            onClick={() => { scrollToTab('stopwatch'); setSelectedSession(null); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Timer size={16} /> Cronometro
          </button>
          <button 
            className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => { scrollToTab('editor'); setSelectedSession(null); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Edit size={16} /> Editor
          </button>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { scrollToTab('dashboard'); setSelectedSession(null); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <BarChart3 size={16} /> Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'db' ? 'active' : ''}`}
            onClick={() => { scrollToTab('db'); setSelectedSession(null); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Search size={16} /> Exercise DB
          </button>
          <button 
            className={`tab-btn flex items-center gap-2 ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => { scrollToTab('generator'); }}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Bot size={16} /> Generator
          </button>

          {/* Header Controls inside lateral menu for Mobile */}
          <div className="header-controls">
            {/* Palette Settings */}
            <div className="palette-settings-container" style={{ width: '100%', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme Color</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  {APP_PALETTES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setAppPalette(p.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: p.color,
                        border: appPalette === p.id ? '2px solid white' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Color</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  {APP_PALETTES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSecAccentPalette(p.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: p.color,
                        border: secAccentPalette === p.id ? '2px solid white' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Background Color</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  {BG_PALETTES.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setBgPalette(b.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: b.primary,
                        border: bgPalette === b.id ? '2px solid white' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      title={b.label}
                    />
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
                    <input 
                      type="text" 
                      value={bgPalette.startsWith('#') ? bgPalette.substring(1) : ''}
                      onChange={(e) => setBgPalette('#' + e.target.value)}
                      placeholder="hex"
                      style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Background Color</div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  {SEC_PALETTES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSecPalette(s.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: s.color,
                        border: secPalette === s.id ? '2px solid white' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      title={s.label}
                    />
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
                    <input 
                      type="text" 
                      value={secPalette.startsWith('#') ? secPalette.substring(1) : ''}
                      onChange={(e) => setSecPalette('#' + e.target.value)}
                      placeholder="hex"
                      style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>
            </div>
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
                onClick={toggleStorageSettings}
              >
                <FolderOpen size={16} className="icon-folder" />
                <span style={{ flex: 1 }}>Storage Folder</span>
                <ChevronDown size={14} className={`storage-chevron${showStorageSettings ? ' open' : ''}`} />
              </button>

              {(showStorageSettings || isStorageClosing) && (() => {
                const cfg = getStorageConfig();
                const isCustom = cfg.dirType === 'custom' && cfg.safUri;
                return (
                  <div className={`storage-panel${isStorageClosing ? ' closing' : ''}`}>

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
        <div className="header-controls desktop-only" style={{ position: 'relative' }}>
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

          <button 
            className="btn-icon-small" 
            onClick={() => setShowDesktopSettings(!showDesktopSettings)}
            title="Settings"
            style={{ marginLeft: '8px', background: showDesktopSettings ? 'var(--accent-primary)' : '' }}
          >
            <Settings size={18} />
          </button>

          {showDesktopSettings && (
            <div className="desktop-settings-dropdown" style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '12px',
              background: 'var(--bg-glass)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--card-radius)',
              padding: '20px',
              width: 'max-content',
              maxWidth: '400px',
              zIndex: 3000,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {/* Storage Folder Settings */}
              <div className="storage-settings-container" style={{ width: '100%' }}>
                <button
                  className="storage-toggle-btn"
                  onClick={toggleStorageSettings}
                >
                  <FolderOpen size={16} className="icon-folder" />
                  <span style={{ flex: 1 }}>Storage Folder</span>
                  <ChevronDown size={14} className={`storage-chevron${showStorageSettings ? ' open' : ''}`} />
                </button>

                {(showStorageSettings || isStorageClosing) && (() => {
                  const cfg = getStorageConfig();
                  const isCustom = cfg.dirType === 'custom' && cfg.safUri;
                  return (
                    <div className={`storage-panel${isStorageClosing ? ' closing' : ''}`}>
                      <div className={`storage-status-card ${isCustom ? 'custom' : ''}`}>
                        <div className="storage-status-title">
                          <Folder size={12} />
                          <span>Current Folder</span>
                        </div>
                        <div className="storage-status-path">
                          {isCustom ? cfg.safDisplayName : `Documents/${cfg.subfolder}`}
                        </div>
                      </div>

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

              {/* Desktop Palette Selectors */}
              <div className="palette-settings-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Theme Color</div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {APP_PALETTES.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setAppPalette(p.id)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: p.color,
                          border: appPalette === p.id ? '2px solid white' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        title={p.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Color</div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {APP_PALETTES.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSecAccentPalette(p.id)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: p.color,
                          border: secAccentPalette === p.id ? '2px solid white' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        title={p.label}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Background Color</div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {BG_PALETTES.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setBgPalette(b.id)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: b.primary,
                          border: bgPalette === b.id ? '2px solid white' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        title={b.label}
                      />
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
                      <input 
                        type="text" 
                        value={bgPalette.startsWith('#') ? bgPalette.substring(1) : ''}
                        onChange={(e) => setBgPalette('#' + e.target.value)}
                        placeholder="hex"
                        style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                        maxLength={6}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Secondary Background Color</div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {SEC_PALETTES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSecPalette(s.id)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: s.color,
                          border: secPalette === s.id ? '2px solid white' : '2px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        title={s.label}
                      />
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#</span>
                      <input 
                        type="text" 
                        value={secPalette.startsWith('#') ? secPalette.substring(1) : ''}
                        onChange={(e) => setSecPalette('#' + e.target.value)}
                        placeholder="hex"
                        style={{ width: '50px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                        maxLength={6}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
        <div className="swipe-views-container" ref={swipeContainerRef} onScroll={handleScroll}>
        
        {/* Full-Page Stopwatch Tab */}
        <StopwatchTab activeTab={activeTab} isMobile={isMobile} />

        {/* Full-Page Editor Tab */}
        <div className={`swipe-view ${activeTab === 'editor' ? 'active-desktop' : ''}`} id="view-editor" style={{ position: 'relative' }}>
          
          {/* Mobile Editor Controls (belonging ONLY to the editor swipe view page) */}
          {isMobile && (
            <div id="mobile-header-editor-controls" style={{ 
              position: 'absolute', 
              top: '18px', 
              right: '12px', 
              zIndex: 50, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              pointerEvents: 'none' 
            }}>
              {/* Undo / Redo */}
              <div className="mobile-editor-pill-nav" style={{ margin: 0, padding: '4px', pointerEvents: 'auto' }}>
                <button 
                   className="mode-pill-btn" 
                   onClick={handleUndo} 
                   disabled={historyIndex === 0}
                   style={{ opacity: historyIndex === 0 ? 0.3 : 1 }}
                >
                  <Undo2 size={18} />
                </button>
                <button 
                   className="mode-pill-btn" 
                   onClick={handleRedo} 
                   disabled={historyIndex === textHistoryRef.current.length - 1}
                   style={{ opacity: historyIndex === textHistoryRef.current.length - 1 ? 0.3 : 1 }}
                >
                  <Redo2 size={18} />
                </button>
              </div>

              {/* Mobile Editor Mode Toggles Pill */}
              <div className="mobile-editor-pill-nav" style={{ marginLeft: 0, pointerEvents: 'auto' }}>
                 <div className="mobile-editor-mode-indicator" style={{ transform: `translateX(${editorMode === 'edit' ? 0 : editorMode === 'preview' ? 38 : 76}px)` }}></div>
                 <button className={`mode-pill-btn ${editorMode === 'edit' ? 'active' : ''}`} onClick={() => setEditorMode('edit')}><Pencil size={18} /></button>
                 <button className={`mode-pill-btn ${editorMode === 'preview' ? 'active' : ''}`} onClick={() => setEditorMode('preview')}><Eye size={18} /></button>
                 <button className={`mode-pill-btn ${editorMode === 'split' ? 'active' : ''}`} onClick={() => setEditorMode('split')}><Columns size={18} /></button>
                 <div className="pill-divider"></div>
                 <button className="btn-save-circle" onClick={() => saveLogbookContent(logbookText)}><Save size={18} /></button>
              </div>
            </div>
          )}
          
          {(isMobile || activeTab === 'editor') && (
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
          )}
        </div>

        {/* DASHBOARD VIEW */}
        <DashboardTab
          isMobile={isMobile}
          activeTab={activeTab}
          workoutData={workoutData}
          currentProgram={currentProgram}
          programs={programs}
          activeExercises={activeExercises}
          exercisesDb={exercisesDb}
          selectedMetricDetail={selectedMetricDetail}
          setSelectedMetricDetail={setSelectedMetricDetail}
          scrollToTab={scrollToTab}
          setSelectedSession={setSelectedSession}
        />
        {/* TAB CONTENT: EXERCISE DATABASE */}
        <DatabaseTab
          isMobile={isMobile}
          activeTab={activeTab}
          activeExercises={activeExercises}
          handleOpenAddExercise={handleOpenAddExercise}
          handleOpenEditExercise={handleOpenEditExercise}
          debouncedLogbookText={debouncedLogbookText}
          currentProgram={currentProgram}
          exerciseSearch={exerciseSearch}
          setExerciseSearch={setExerciseSearch}
        />
        {/* TAB CONTENT: GENERATOR */}
        <div className={`swipe-view ${activeTab === 'generator' ? 'active-desktop' : ''}`} id="view-generator">
          {(isMobile || activeTab === 'generator') && (
          <div className="tab-workspace-flat" style={{ height: 'calc(100vh - 80px)', padding: '20px' }}>
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>Loading Generator...</div>}>
              <GeneratorConfig isMobile={isMobile} />
            </Suspense>
          </div>
          )}
        </div>

        {/* END SWIPE VIEWS CONTAINER */}
      </div>
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
        <div className="modal-overlay" style={{ background: 'var(--bg-primary)', backdropFilter: 'none' }} onClick={() => setShowExerciseModal(false)}>
          <div className="modal-card" style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, border: 'none', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
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
                  <div style={{ width: '100%', marginBottom: isMobile ? '8px' : '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px 10px 0 0' }}>
                    <ResponsiveContainer width="99%" height={isMobile ? 140 : 160}>
                      <LineChart data={getBezierCurveData(exerciseForm.muscles)} style={isMobile ? { pointerEvents: 'none' } : undefined}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="x" type="number" domain={[0, 1]} tickCount={5} stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => val === 0 ? 'Stretch' : val === 1 ? 'Contract' : val} />
                        <YAxis stroke="var(--text-muted)" fontSize={10} width={30} domain={[0, 1]} tickFormatter={(v) => Math.round(v*100)} />
                        {!isMobile && <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid var(--border-color)' }} labelFormatter={(l) => `ROM: ${(l*100).toFixed(0)}%`} formatter={(val) => [(val*100).toFixed(1)+'%', 'Tension']} />}
                        {isMobile && <ReferenceLine x={tensionSliderPos / 100} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="4 4" />}
                        {exerciseForm.muscles.map((m, i) => {
                           return <Line key={m.name} type="monotone" dataKey={m.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} name={m.name} />;
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                    {isMobile && (
                      <div style={{ padding: '4px 8px 10px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {/* Per-muscle tension values at current ROM — above slider so finger doesn't cover */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                          {exerciseForm.muscles.map((m, i) => {
                            const y = solveBezierY(
                              tensionSliderPos / 100,
                              m.x0 ?? 0.0, m.y0 ?? 1.0,
                              m.x1 ?? 0.33, m.y1 ?? 1.0,
                              m.x2 ?? 0.66, m.y2 ?? 1.0,
                              m.x3 ?? 1.0, m.y3 ?? 1.0
                            );
                            const magnitude = parseFloat(m.percentage) / 100.0;
                            // Normalize: get max Y same way getBezierCurveData does
                            let maxY = 0;
                            for (let r = 0; r <= 50; r++) {
                              const my = solveBezierY(r / 50, m.x0 ?? 0.0, m.y0 ?? 1.0, m.x1 ?? 0.33, m.y1 ?? 1.0, m.x2 ?? 0.66, m.y2 ?? 1.0, m.x3 ?? 1.0, m.y3 ?? 1.0);
                              if (my > maxY) maxY = my;
                            }
                            const normalizedY = maxY > 0 ? (y / maxY) * magnitude : 0;
                            const color = CHART_COLORS[i % CHART_COLORS.length];
                            return (
                              <span key={m.name} style={{
                                fontSize: '0.68rem',
                                color: color,
                                background: 'rgba(0,0,0,0.35)',
                                padding: '2px 8px',
                                borderRadius: '100px',
                                border: `1px solid ${color}33`,
                                whiteSpace: 'nowrap'
                              }}>
                                {m.name}: {(normalizedY * 100).toFixed(1)}%
                              </span>
                            );
                          })}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          ROM: {tensionSliderPos}%
                        </div>
                        {/* ROM scrubber slider — at the bottom so finger doesn't cover labels */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>Stretch</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={tensionSliderPos}
                            onChange={(e) => setTensionSliderPos(parseInt(e.target.value))}
                            className="tension-scrubber-slider"
                            style={{
                              flex: 1,
                              accentColor: 'var(--accent-primary)'
                            }}
                          />
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '44px' }}>Contract</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {exerciseForm.muscles.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>
                    No muscle groups assigned yet. Select a muscle below to add it.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {exerciseForm.muscles.map((m, index) => {
                      const dotColor = CHART_COLORS[index % CHART_COLORS.length];
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
                        placeholder="Search muscle to add… (Tab to select top)"
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
            {(() => {
              const muscleSum = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
              const isInvalid = muscleSum !== 100;
              const disabledStyle = { opacity: isInvalid ? 0.6 : 1, cursor: isInvalid ? 'not-allowed' : 'pointer' };
              return (
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
                disabled={isInvalid}
                style={disabledStyle}
              >
                Save for {currentProgram} Only
              </button>
              <button
                className="btn btn-success-solid"
                onClick={handleSaveExercise}
                disabled={isInvalid}
                style={disabledStyle}
              >
                Save Globally
              </button>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      {(!isMobile || !showMobileSettings) && (
        <div className="mobile-bottom-nav">
        <div 
          className="mobile-bottom-nav-indicator" 
          ref={bottomNavIndicatorRef}
          style={{ transform: `translateX(${['stopwatch', 'editor', 'dashboard', 'db', 'generator'].indexOf(activeTab === 'metric-details' ? 'dashboard' : activeTab) * 52}px)` }} 
        />
        <button 
          className={`bottom-nav-btn ${activeTab === 'stopwatch' ? 'active' : ''}`}
          onClick={() => { scrollToTab('stopwatch'); setSelectedSession(null); }}
        >
          <Timer size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => { scrollToTab('editor'); setSelectedSession(null); }}
        >
          <Edit size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => { scrollToTab('dashboard'); setSelectedSession(null); }}
        >
          <BarChart3 size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'db' ? 'active' : ''}`}
          onClick={() => { scrollToTab('db'); setSelectedSession(null); }}
        >
          <Search size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'generator' ? 'active' : ''}`}
          onClick={() => { scrollToTab('generator'); }}
        >
          <Bot size={20} />
        </button>
        </div>
      )}
    </div>
  );
}
