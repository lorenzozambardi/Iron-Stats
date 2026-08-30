import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import 'katex/dist/katex.min.css';
import {
  Save,
  BarChart3,
  Search,
  Plus,
  AlertCircle,
  RotateCcw,
  Bot,
  Edit,
  Pencil,
  Eye,
  Columns,
  Undo2,
  Redo2,
  Settings,
  Timer
} from 'lucide-react';
import {
  parseLogbook,
  MUSCLES,
  getExercisesWithOverrides
} from './parser';
import { getStorageConfig, setStorageConfig, pickDirectory } from './offlineApi.js';
import { App as CapacitorApp } from '@capacitor/app';

import LogbookPreview from './components/LogbookPreview';
import { fuzzyScore } from './components/helpers';
const GeneratorConfig = lazy(() => import('./components/GeneratorConfig'));
import DatabaseTab from './components/tabs/DatabaseTab';
import DashboardTab from './components/tabs/DashboardTab';
import StopwatchTab from './components/tabs/StopwatchTab';
import EasyEditor from './components/EasyEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { ExerciseModal } from './components/ExerciseModal';

const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];

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

const DEFAULT_METRIC_COLORS = {
  'color-volume': '#f59e0b',
  'color-effective-volume': '#fbbf24',
  'color-tonnage': '#10b981',
  'color-effective-tonnage': '#34d399',
  'color-weighted-tonnage': '#06b6d4',
  'color-effective-weighted-tonnage': '#22d3ee',
  'color-tut': '#8b5cf6',
  'color-effective-tut': '#a78bfa',
  'color-sets': '#3b82f6',
  'color-fatigue': '#f43f5e'
};

const METRIC_COLOR_CONFIG = [
  { key: 'color-volume', label: 'Volume' },
  { key: 'color-effective-volume', label: 'Effective Reps' },
  { key: 'color-tonnage', label: 'Tonnage' },
  { key: 'color-effective-tonnage', label: 'Effective Tonnage' },
  { key: 'color-weighted-tonnage', label: 'Weighted Tonnage' },
  { key: 'color-effective-weighted-tonnage', label: 'Eff. Weighted Tonnage' },
  { key: 'color-tut', label: 'TUT' },
  { key: 'color-effective-tut', label: 'Effective TUT' },
  { key: 'color-sets', label: 'Sets' },
  { key: 'color-fatigue', label: 'Fatigue' }
];

export default function App() {
  // Data State
  const [logbookText, setLogbookText] = useState('');
  const [debouncedLogbookText, setDebouncedLogbookText] = useState('');
  const [exercisesDb, setExercisesDb] = useState([]);
  const [activeTab, setActiveTab] = useState('editor'); // Default to editor view
  const [selectedMetricDetail, setSelectedMetricDetail] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showDesktopSettings, setShowDesktopSettings] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [muscleSearch, setMuscleSearch] = useState('');
  const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [editorType, setEditorType] = useState(() => localStorage.getItem('editor-type') || 'manual');

  const [appPalette, setAppPalette] = useState(() => localStorage.getItem('app-palette') || 'indigo');
  const [bgPalette, setBgPalette] = useState(() => localStorage.getItem('bg-palette') || 'black');
  const [secPalette, setSecPalette] = useState(() => localStorage.getItem('sec-palette') || 'darkest');
  const [secAccentPalette, setSecAccentPalette] = useState(() => localStorage.getItem('sec-accent-palette') || 'cyan');

  const [metricColors, setMetricColors] = useState(() => {
    try {
      const saved = localStorage.getItem('metric-colors');
      return saved ? { ...DEFAULT_METRIC_COLORS, ...JSON.parse(saved) } : DEFAULT_METRIC_COLORS;
    } catch {
      return DEFAULT_METRIC_COLORS;
    }
  });

  const updateMetricColor = (key, value) => {
    setMetricColors(prev => ({ ...prev, [key]: value }));
  };

  const resetMetricColors = () => {
    setMetricColors(DEFAULT_METRIC_COLORS);
  };

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

    // Apply metric colors
    Object.entries(metricColors).forEach(([k, v]) => {
      root.style.setProperty(`--${k}`, v);
    });
    localStorage.setItem('metric-colors', JSON.stringify(metricColors));
  }, [appPalette, bgPalette, secPalette, secAccentPalette, metricColors]);

  // History State for Undo/Redo
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);
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
         setHistoryLength(textHistoryRef.current.length);
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
  }, [activeTab]);

  const handleScroll = useCallback((e) => {
    if (window.innerWidth > 768) return; // Only apply activeTab scroll sync on mobile

    // Dismiss virtual keyboard if user is scrolling to change pages
    if (document.activeElement && typeof document.activeElement.blur === 'function' && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

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
    if (document.activeElement && typeof document.activeElement.blur === 'function' && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

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

        // Execute physical scroll immediately on mobile
        if (window.innerWidth <= 768) {
          swipeContainerRef.current.scrollTo({
            left: index * swipeContainerRef.current.clientWidth,
            behavior: 'auto'
          });
        }
        
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
    setStorageConfig('documents', 'Iron Stats');
    setPendingDirType('documents');
    setPendingSubfolder('Iron Stats');
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

  useEffect(() => {
    let backListener;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (selectedMetricDetail) window.dispatchEvent(new Event('close-metric-detail'));
      else if (showNewProgramModal) setShowNewProgramModal(false);
      else if (showExerciseModal) setShowExerciseModal(false);
      else if (showMobileSettings) setShowMobileSettings(false);
      else if (showStorageSettings) setShowStorageSettings(false);
      else if (showSuggestions) setShowSuggestions(false);
      else if (canGoBack) window.history.back();
      else CapacitorApp.exitApp();
    }).then(listener => {
      backListener = listener;
    });

    return () => {
      if (backListener) backListener.remove();
    };
  }, [selectedMetricDetail, showNewProgramModal, showExerciseModal, showMobileSettings, showStorageSettings, showSuggestions]);

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
          <h1 style={{ textAlign: 'right' }}>Iron Stats</h1>
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
              background: 'var(--accent-primary-subtle)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2), 0 0 10px var(--accent-primary-glow)',
              border: 'none',
              zIndex: 0
            }}
          />
          <button 
            className={`tab-btn ${activeTab === 'stopwatch' ? 'active' : ''}`}
            onClick={() => scrollToTab('stopwatch')}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Timer size={16} /> Stopwatch
          </button>
          <button 
            className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => scrollToTab('editor')}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Edit size={16} /> Editor
          </button>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => scrollToTab('dashboard')}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <BarChart3 size={16} /> Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === 'db' ? 'active' : ''}`}
            onClick={() => scrollToTab('db')}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Search size={16} /> Exercise DB
          </button>
          <button 
            className={`tab-btn flex items-center gap-2 ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => scrollToTab('generator')}
            style={{ zIndex: 1, position: 'relative' }}
          >
            <Bot size={16} /> Generator
          </button>

          {/* Header Controls inside lateral menu for Mobile */}
          <div className="header-controls">
            <div className="palette-settings-container" style={{ width: '100%', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <SettingsPanel
                editorType={editorType}
                setEditorType={setEditorType}
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                appPalette={appPalette}
                setAppPalette={setAppPalette}
                APP_PALETTES={APP_PALETTES}
                secAccentPalette={secAccentPalette}
                setSecAccentPalette={setSecAccentPalette}
                bgPalette={bgPalette}
                setBgPalette={setBgPalette}
                BG_PALETTES={BG_PALETTES}
                secPalette={secPalette}
                setSecPalette={setSecPalette}
                SEC_PALETTES={SEC_PALETTES}
                metricColors={metricColors}
                updateMetricColor={updateMetricColor}
                resetMetricColors={resetMetricColors}
                METRIC_COLOR_CONFIG={METRIC_COLOR_CONFIG}
                DEFAULT_METRIC_COLORS={DEFAULT_METRIC_COLORS}
                showProgramSelector={true}
                currentProgram={currentProgram}
                handleProgramChange={handleProgramChange}
                programs={programs}
                setShowNewProgramModal={setShowNewProgramModal}
                syncStatus={syncStatus}
                showStorageSettings={showStorageSettings}
                toggleStorageSettings={toggleStorageSettings}
                isStorageClosing={isStorageClosing}
                getStorageConfig={getStorageConfig}
                handlePickFolder={handlePickFolder}
                storagePickError={storagePickError}
                handleResetStorage={handleResetStorage}
                pendingDirType={pendingDirType}
                setPendingDirType={setPendingDirType}
                pendingSubfolder={pendingSubfolder}
                setPendingSubfolder={setPendingSubfolder}
                applyStorageConfig={applyStorageConfig}
              />
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
            className="tab-btn settings-desktop-btn" 
            onClick={() => setShowDesktopSettings(!showDesktopSettings)}
            title="Settings"
            style={{ marginLeft: '8px', padding: '6px', background: showDesktopSettings ? 'rgba(255, 255, 255, 0.03)' : '' }}
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
              <SettingsPanel
                editorType={editorType}
                setEditorType={setEditorType}
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                appPalette={appPalette}
                setAppPalette={setAppPalette}
                APP_PALETTES={APP_PALETTES}
                secAccentPalette={secAccentPalette}
                setSecAccentPalette={setSecAccentPalette}
                bgPalette={bgPalette}
                setBgPalette={setBgPalette}
                BG_PALETTES={BG_PALETTES}
                secPalette={secPalette}
                setSecPalette={setSecPalette}
                SEC_PALETTES={SEC_PALETTES}
                metricColors={metricColors}
                updateMetricColor={updateMetricColor}
                resetMetricColors={resetMetricColors}
                METRIC_COLOR_CONFIG={METRIC_COLOR_CONFIG}
                DEFAULT_METRIC_COLORS={DEFAULT_METRIC_COLORS}
                showProgramSelector={false}
                showStorageSettings={showStorageSettings}
                toggleStorageSettings={toggleStorageSettings}
                isStorageClosing={isStorageClosing}
                getStorageConfig={getStorageConfig}
                handlePickFolder={handlePickFolder}
                storagePickError={storagePickError}
                handleResetStorage={handleResetStorage}
                pendingDirType={pendingDirType}
                setPendingDirType={setPendingDirType}
                pendingSubfolder={pendingSubfolder}
                setPendingSubfolder={setPendingSubfolder}
                applyStorageConfig={applyStorageConfig}
              />
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
        <div className={`swipe-view ${activeTab === 'editor' ? 'active-desktop' : ''}`} id="view-editor">
          
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
                   disabled={historyIndex >= historyLength - 1}
                   style={{ opacity: historyIndex >= historyLength - 1 ? 0.3 : 1 }}
                >
                  <Redo2 size={18} />
                </button>
              </div>

              {/* Mobile Editor Mode Toggles Pill */}
              <div className="mobile-editor-pill-nav" style={{ marginLeft: 0, pointerEvents: 'auto' }}>
                 <div className="mobile-editor-mode-indicator" style={{ transform: `translateX(${editorMode === 'edit' ? 0 : editorMode === 'preview' ? 38 : 76}px)` }}></div>
                 <button className={`mode-pill-btn ${editorMode === 'edit' ? 'active' : ''}`} onClick={() => setEditorMode('edit')}><Pencil size={18} /></button>
                 <button className={`mode-pill-btn ${editorMode === 'preview' ? 'active' : ''}`} onClick={() => setEditorMode('preview')}><Eye size={18} /></button>
                 {editorType !== 'easy' && (
                   <button className={`mode-pill-btn ${editorMode === 'split' ? 'active' : ''}`} onClick={() => setEditorMode('split')}><Columns size={18} /></button>
                 )}
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
              <div className={`editor-mode-toggles mode-${editorMode} ${editorType === 'easy' ? 'easy-toggles' : ''}`}>
                <div className="editor-mode-indicator"></div>
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
                {editorType !== 'easy' && (
                  <button 
                    className={`mode-toggle-btn ${editorMode === 'split' ? 'active' : ''}`}
                    onClick={() => setEditorMode('split')}
                  >
                    Split View
                  </button>
                )}
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
                    {editorType === 'easy' ? (
                      <EasyEditor 
                        logbookText={logbookText}
                        onChange={(newText) => {
                          setLogbookText(newText);
                          setDebouncedLogbookText(newText);
                        }}
                        exercisesDb={exercisesDb}
                      />
                    ) : (
                      <>
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
                      </>
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
      <ExerciseModal
        showExerciseModal={showExerciseModal}
        setShowExerciseModal={setShowExerciseModal}
        editingExercise={editingExercise}
        handleDeleteExercise={handleDeleteExercise}
        exerciseForm={exerciseForm}
        setExerciseForm={setExerciseForm}
        exerciseError={exerciseError}
        setExerciseError={setExerciseError}
        isMobile={isMobile}
        tensionSliderPos={tensionSliderPos}
        setTensionSliderPos={setTensionSliderPos}
        editingCurveIndex={editingCurveIndex}
        setEditingCurveIndex={setEditingCurveIndex}
        muscleSearch={muscleSearch}
        setMuscleSearch={setMuscleSearch}
        currentHasOverride={currentHasOverride}
        handleRemoveOverride={handleRemoveOverride}
        handleSaveExerciseForProgramOnly={handleSaveExerciseForProgramOnly}
        handleSaveExercise={handleSaveExercise}
        currentProgram={currentProgram}
        chartColors={CHART_COLORS}
      />

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
          onClick={() => scrollToTab('stopwatch')}
        >
          <Timer size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => scrollToTab('editor')}
        >
          <Edit size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => scrollToTab('dashboard')}
        >
          <BarChart3 size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'db' ? 'active' : ''}`}
          onClick={() => scrollToTab('db')}
        >
          <Search size={20} />
        </button>
        <button 
          className={`bottom-nav-btn ${activeTab === 'generator' ? 'active' : ''}`}
          onClick={() => scrollToTab('generator')}
        >
          <Bot size={20} />
        </button>
        </div>
      )}
    </div>
  );
}
