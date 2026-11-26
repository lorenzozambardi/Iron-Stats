import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense, startTransition, useOptimistic } from 'react';
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
  Undo2,
  Redo2,
  Settings,
  Timer,
  User,
  SlidersHorizontal
} from 'lucide-react';
import {
  parseLogbook,
  getExercisesWithOverrides
} from './parser';
import { getStorageConfig, setStorageConfig, pickDirectory } from './offlineApi.js';
import { App as CapacitorApp } from '@capacitor/app';

import LogbookPreview from './components/LogbookPreview';
const GeneratorConfig = lazy(() => import('./components/GeneratorConfig'));
import DatabaseTab from './components/tabs/DatabaseTab';
import DashboardTab from './components/tabs/DashboardTab';
import StopwatchTab from './components/tabs/StopwatchTab';
import EasyEditor from './components/EasyEditor';
import ProfileEasyEditor from './components/ProfileEasyEditor';
import FoldableEditor from './components/FoldableEditor';
import { LockWheelPicker, DualWeekSlider } from './components/FilterControls';
import { isWeekInRange, formatWeekRangeLabel } from './components/helpers';
import { getLogbookFilterMeta, filterLogbookText, mergeFilteredLogbook } from './components/editorFilterUtils';
import { formatLogbookSpaces } from './formatLogbook';
import { SettingsPanel } from './components/SettingsPanel';
import {
  DATE_FORMAT_STORAGE_KEY,
  getActiveProfileName,
  getDateFormat,
  loadProfile,
  loadProfileFromFile,
  parseProfileMarkdown,
  saveProfileToFile,
  serializeProfileToMarkdown,
  setActiveProfileName,
} from './profileUtils';
const ExerciseModal = lazy(() => import('./components/ExerciseModal').then(m => ({ default: m.ExerciseModal })));

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

const isValidHexColor = (val) => typeof val === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val);

const hexToRgba = (hex, alpha) => {
  let r = 0, g = 0, b = 0;
  if (!isValidHexColor(hex)) return `rgba(0, 0, 0, ${alpha})`;
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
  { id: 'charcoal', primary: '#181818', label: 'Charcoal' }
];

const SEC_PALETTES = [
  { id: 'black', color: '#000000', glass: 'rgba(0, 0, 0, 0.6)', glassActive: 'rgba(0, 0, 0, 0.85)', label: 'Pure Black' },
  { id: 'darkest', color: '#090909', glass: 'rgba(9, 9, 9, 0.6)', glassActive: 'rgba(9, 9, 9, 0.85)', label: 'Darkest' },
  { id: 'dark', color: '#181818', glass: 'rgba(24, 24, 24, 0.6)', glassActive: 'rgba(24, 24, 24, 0.85)', label: 'Dark' },
  { id: 'slate', color: '#1e1e1e', glass: 'rgba(30, 30, 30, 0.6)', glassActive: 'rgba(30, 30, 30, 0.85)', label: 'Slate' },
  { id: 'zinc', color: '#272727', glass: 'rgba(39, 39, 39, 0.6)', glassActive: 'rgba(39, 39, 39, 0.85)', label: 'Zinc' }
];

export default function App() {
  // Data State
  const [logbookText, setLogbookText] = useState('');
  const [debouncedLogbookText, setDebouncedLogbookText] = useState('');
  const [editingProfileMd, setEditingProfileMd] = useState(false);
  const editingProfileMdRef = useRef(false);
  useEffect(() => {
    editingProfileMdRef.current = editingProfileMd;
  }, [editingProfileMd]);
  const [profileMdText, setProfileMdText] = useState('');
  const profileMdTextRef = useRef('');
  useEffect(() => {
    profileMdTextRef.current = profileMdText;
  }, [profileMdText]);
  const profileSaveTimeoutRef = useRef(null);
  const profileMdReqIdRef = useRef(0);
  const profileMdDirtyRef = useRef(false);
  useEffect(() => () => {
    if (profileSaveTimeoutRef.current) clearTimeout(profileSaveTimeoutRef.current);
  }, []);
  const [exercisesDb, setExercisesDb] = useState([]);
  const [activeTab, setActiveTab] = useState('editor'); // Default to editor view
  const [selectedMetricDetail, setSelectedMetricDetail] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [showDesktopSettings, setShowDesktopSettings] = useState(false);
  const [muscleSearch, setMuscleSearch] = useState('');
  const [highlightStyle, setHighlightStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [editorType, setEditorType] = useState(() => localStorage.getItem('editor-type') || 'manual');
  const [dateFormat, setDateFormat] = useState(() => getDateFormat());

  useEffect(() => {
    try {
      localStorage.setItem(DATE_FORMAT_STORAGE_KEY, dateFormat);
    } catch {
      // Ignore storage errors
    }
  }, [dateFormat]);

  const [appPalette, setAppPalette] = useState(() => localStorage.getItem('app-palette') || 'indigo');
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
    let validBg = false;
    if (isValidHexColor(bgPalette)) {
      primaryBg = bgPalette;
      validBg = true;
    } else {
      const b = BG_PALETTES.find(x => x.id === bgPalette);
      if (b) {
        primaryBg = b.primary;
        validBg = true;
      }
    }
    root.style.setProperty('--bg-primary', primaryBg);
    if (validBg) localStorage.setItem('bg-palette', bgPalette);

    let secBg = '#111111', secGlass = 'rgba(17,17,17,0.6)', secGlassActive = 'rgba(17,17,17,0.85)';
    let validSec = false;
    if (isValidHexColor(secPalette)) {
      secBg = secPalette;
      secGlass = hexToRgba(secPalette, 0.6);
      secGlassActive = hexToRgba(secPalette, 0.85);
      validSec = true;
    } else {
      const s = SEC_PALETTES.find(x => x.id === secPalette);
      if (s) {
        secBg = s.color;
        secGlass = s.glass;
        secGlassActive = s.glassActive;
        validSec = true;
      }
    }
    root.style.setProperty('--bg-secondary', secBg);
    root.style.setProperty('--bg-glass', secGlass);
    root.style.setProperty('--bg-glass-active', secGlassActive);
    if (validSec) localStorage.setItem('sec-palette', secPalette);

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
  const [historyLength, setHistoryLength] = useState(1);
  const [committedHistoryText, setCommittedHistoryText] = useState('');
  const textHistoryRef = useRef(['']);
  const isUndoRedoAction = useRef(false);
  const skipNextHistoryPushRef = useRef(false);
  const textHistoryTimeoutRef = useRef(null);
  const logbookTextRef = useRef(logbookText);
  const scheduleSaveRef = useRef(null);

  useEffect(() => {
    logbookTextRef.current = logbookText;
  }, [logbookText]);

  const historyIndexRef = useRef(0);
  const resetTextHistory = useCallback((initialText) => {
    if (textHistoryTimeoutRef.current) {
      clearTimeout(textHistoryTimeoutRef.current);
      textHistoryTimeoutRef.current = null;
    }
    textHistoryRef.current = [initialText];
    historyIndexRef.current = 0;
    setHistoryIndex(0);
    setHistoryLength(1);
    setCommittedHistoryText(initialText);
  }, []);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    return () => {
      if (textHistoryTimeoutRef.current) clearTimeout(textHistoryTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
     if (textHistoryTimeoutRef.current) {
        clearTimeout(textHistoryTimeoutRef.current);
        textHistoryTimeoutRef.current = null;
     }
     if (isUndoRedoAction.current) {
        isUndoRedoAction.current = false;
        return;
     }
     if (skipNextHistoryPushRef.current) {
        skipNextHistoryPushRef.current = false;
        if (textHistoryRef.current.length > 0) {
          textHistoryRef.current[historyIndexRef.current] = logbookText;
        }
        return;
     }
     
     textHistoryTimeoutRef.current = setTimeout(() => {
         textHistoryTimeoutRef.current = null;
         const currentIdx = historyIndexRef.current;
         if (currentIdx < textHistoryRef.current.length - 1) {
            textHistoryRef.current = textHistoryRef.current.slice(0, currentIdx + 1);
         }
         if (textHistoryRef.current[textHistoryRef.current.length - 1] !== logbookText) {
            textHistoryRef.current.push(logbookText);
            if (textHistoryRef.current.length > 50) {
               textHistoryRef.current.shift();
            }
            const nextIdx = textHistoryRef.current.length - 1;
            historyIndexRef.current = nextIdx;
            setHistoryIndex(nextIdx);
            setCommittedHistoryText(logbookText);
         }
         setHistoryLength(textHistoryRef.current.length);
     }, 500);
  }, [logbookText]);

  const flushPendingHistory = useCallback(() => {
    if (textHistoryTimeoutRef.current) {
      clearTimeout(textHistoryTimeoutRef.current);
      textHistoryTimeoutRef.current = null;
    }
    let idx = historyIndexRef.current;
    const latest = logbookTextRef.current;
    if (textHistoryRef.current[idx] !== latest) {
      if (idx < textHistoryRef.current.length - 1) {
        textHistoryRef.current = textHistoryRef.current.slice(0, idx + 1);
      }
      textHistoryRef.current.push(latest);
      if (textHistoryRef.current.length > 50) {
        textHistoryRef.current.shift();
      }
      idx = textHistoryRef.current.length - 1;
      historyIndexRef.current = idx;
      setHistoryIndex(idx);
      setHistoryLength(textHistoryRef.current.length);
      setCommittedHistoryText(latest);
    }
    return idx;
  }, []);

  const handleUndo = useCallback(() => {
     if (editingProfileMdRef.current) return;
     const currentIdx = flushPendingHistory();
     if (currentIdx > 0) {
        const newIndex = currentIdx - 1;
        const targetText = textHistoryRef.current[newIndex];
        if (targetText !== logbookTextRef.current) {
          isUndoRedoAction.current = true;
          setLogbookText(targetText);
          setDebouncedLogbookText(targetText);
          scheduleSaveRef.current?.(targetText);
        }
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        setCommittedHistoryText(targetText);
     }
  }, [flushPendingHistory]);

  const handleRedo = useCallback(() => {
     if (editingProfileMdRef.current) return;
     if (textHistoryTimeoutRef.current) {
        clearTimeout(textHistoryTimeoutRef.current);
        textHistoryTimeoutRef.current = null;
     }
     const currentIdx = historyIndexRef.current;
     if (currentIdx < textHistoryRef.current.length - 1) {
        const newIndex = currentIdx + 1;
        const targetText = textHistoryRef.current[newIndex];
        if (targetText !== logbookTextRef.current) {
          isUndoRedoAction.current = true;
          setLogbookText(targetText);
          setDebouncedLogbookText(targetText);
          scheduleSaveRef.current?.(targetText);
        }
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        setCommittedHistoryText(targetText);
     }
  }, []);

  const canUndo = !editingProfileMd && (historyIndex > 0 || logbookText !== committedHistoryText);
  const canRedo = !editingProfileMd && historyIndex < historyLength - 1;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const baselineHeightRef = useRef(
    typeof window !== 'undefined'
      ? (window.visualViewport ? window.visualViewport.height : window.innerHeight) || 800
      : 800
  );

  // Hide bottom nav when virtual keyboard is active on mobile.
  // Compares visualViewport height against the tracked non-keyboard viewport baseline,
  // ignoring pinch-zoom so split-screen mode and zoom don't falsely hide navigation.
  useEffect(() => {
    const updateBaselineOnOrientation = () => {
      baselineHeightRef.current = (window.visualViewport ? window.visualViewport.height : window.innerHeight) || 800;
      setIsKeyboardOpen(false);
    };

    const updateKeyboardState = () => {
      if (window.visualViewport && window.visualViewport.scale > 1.05) {
        return;
      }
      const currentH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      if (currentH > baselineHeightRef.current) {
        baselineHeightRef.current = currentH;
      }
      const baseH = baselineHeightRef.current || 800;
      const keyboardVisible = currentH < baseH * 0.75;
      setIsKeyboardOpen(keyboardVisible);
    };

    let focusTimer = null;
    const handleFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(updateKeyboardState, 50);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleFocus);
    window.addEventListener('orientationchange', updateBaselineOnOrientation);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardState);
      window.visualViewport.addEventListener('scroll', updateKeyboardState);
    } else {
      window.addEventListener('resize', updateKeyboardState);
    }

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleFocus);
      window.removeEventListener('orientationchange', updateBaselineOnOrientation);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardState);
        window.visualViewport.removeEventListener('scroll', updateKeyboardState);
      } else {
        window.removeEventListener('resize', updateKeyboardState);
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
  const scrollTabStateTimeoutRef = useRef(null);
  const isTouchingRef = useRef(false);
  const touchStartPosRef = useRef(null);
  const prevIsMobileRef = useRef(null);

  const dismissVirtualKeyboard = useCallback((onlyTextInputs = false) => {
    const active = document.activeElement;
    if (!active || active === document.body || typeof active.blur !== 'function') return;
    if (onlyTextInputs) {
      const isTextInput = typeof active.matches === 'function' && active.matches(
        'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]'
      );
      if (!isTextInput) return;
    }
    active.blur();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (scrollTabTimeout.current) clearTimeout(scrollTabTimeout.current);
      if (scrollTabStateTimeoutRef.current) clearTimeout(scrollTabStateTimeoutRef.current);
    };
  }, []);

  // Sync scroll position on mount for mobile and whenever crossing desktop -> mobile breakpoint
  useEffect(() => {
    const crossedIntoMobile = isMobile && prevIsMobileRef.current !== true;
    prevIsMobileRef.current = isMobile;
    if (crossedIntoMobile && swipeContainerRef.current) {
      const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
      const index = tabOrder.indexOf(activeTab);
      if (index >= 0) {
        swipeContainerRef.current.scrollTo({ left: index * swipeContainerRef.current.clientWidth, behavior: 'instant' });
      }
    }
  }, [isMobile, activeTab]);

  useEffect(() => {
    dismissVirtualKeyboard(false);
  }, [activeTab, dismissVirtualKeyboard]);

  const syncCurrentTab = useCallback(() => {
    if (isTouchingRef.current || !swipeContainerRef.current) return;
    if (bottomNavIndicatorRef.current) {
      bottomNavIndicatorRef.current.style.transition = '';
    }
    const container = swipeContainerRef.current;
    const width = container.clientWidth;
    if (width === 0) return;

    const index = Math.round(container.scrollLeft / width);
    const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
    if (index >= 0 && index < tabOrder.length) {
      const currentTab = tabOrder[index];
      if (activeTab !== currentTab) {
        dismissVirtualKeyboard(false);
        setActiveTab(currentTab);
      }
      if (selectedMetricDetail && currentTab !== 'dashboard') {
        setSelectedMetricDetail(null);
      }
    }
  }, [activeTab, selectedMetricDetail, dismissVirtualKeyboard]);

  const handleTouchStart = useCallback((e) => {
    isTouchingRef.current = true;
    touchStartPosRef.current = e.touches?.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    // Dismiss virtual keyboard only when touching outside inputs / editors
    const active = document.activeElement;
    const target = e.target;
    const isInteractiveTarget = target && typeof target.closest === 'function' && Boolean(
      target.closest('input, textarea, select, [contenteditable="true"], .cm-editor')
    );
    if (!isInteractiveTarget && (!target || !active?.contains?.(target))) {
      dismissVirtualKeyboard(false);
    }
  }, [dismissVirtualKeyboard]);

  const handleTouchMove = useCallback((e) => {
    const start = touchStartPosRef.current;
    if (!start || !e.touches || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if ((dx * dx) + (dy * dy) > 100) {
      touchStartPosRef.current = null;
      dismissVirtualKeyboard(true);
    }
  }, [dismissVirtualKeyboard]);

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    touchStartPosRef.current = null;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    // Allow momentum or CSS snap to settle before committing final tab state
    scrollTimeoutRef.current = setTimeout(syncCurrentTab, 150);
  }, [syncCurrentTab]);

  const handleScroll = useCallback((e) => {
    if (window.innerWidth > 768) return; // Only apply activeTab scroll sync on mobile

    if (isScrollingToTab.current) return; // Ignore programmatic scrolls to prevent transition conflicts
    
    const container = e.target;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width === 0) return;
    
    const exactIndex = scrollLeft / width;
    const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
    const activeIndex = tabOrder.indexOf(activeTab);
    if (activeIndex !== -1 && Math.abs(exactIndex - activeIndex) > 0.08) {
      dismissVirtualKeyboard(true);
    }
    
    // Dynamically track the finger
    if (bottomNavIndicatorRef.current) {
      bottomNavIndicatorRef.current.style.transition = 'none'; // Ensure no transition during swipe
      bottomNavIndicatorRef.current.style.transform = `translateX(${exactIndex * 52}px)`;
    }
    
    // Do NOT commit tab changes while user's finger is on the screen
    if (isTouchingRef.current) return;

    // Settle debounce when not touching (e.g. momentum or snap animation after finger release)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(syncCurrentTab, 100);
  }, [syncCurrentTab, activeTab, dismissVirtualKeyboard]);

  // Listen to native scrollend event when browser snap animation finishes
  useEffect(() => {
    const container = swipeContainerRef.current;
    if (!container) return;

    const handleScrollEnd = () => {
      if (!isTouchingRef.current && !isScrollingToTab.current) {
        syncCurrentTab();
      }
    };

    container.addEventListener('scrollend', handleScrollEnd);
    return () => {
      container.removeEventListener('scrollend', handleScrollEnd);
    };
  }, [syncCurrentTab]);

  // Helper to scroll to tab programmatically
  const scrollToTab = useCallback((tabName) => {
    dismissVirtualKeyboard(false);

    if (swipeContainerRef.current) {
      const tabOrder = ['stopwatch', 'editor', 'dashboard', 'db', 'generator'];
      const index = tabOrder.indexOf(tabName);
      if (index !== -1) {
        // We use behavior: 'auto' to jump instantly
        isScrollingToTab.current = true;
        if (scrollTabTimeout.current) clearTimeout(scrollTabTimeout.current);
        scrollTabTimeout.current = setTimeout(() => {
          isScrollingToTab.current = false;
          if (bottomNavIndicatorRef.current) {
            bottomNavIndicatorRef.current.style.transition = '';
          }
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
        if (scrollTabStateTimeoutRef.current) clearTimeout(scrollTabStateTimeoutRef.current);
        scrollTabStateTimeoutRef.current = setTimeout(() => {
          scrollTabStateTimeoutRef.current = null;
          setActiveTab(tabName);
        }, 0);
      }
    }
  }, [dismissVirtualKeyboard]);


  // Ref to control SettingsPanel's local storage drawer without re-rendering App
  const storageDrawerRef = useRef({ isOpen: false, close: null });

  const resetStorageDrawer = () => {
    storageDrawerRef.current.close?.();
  };
  const initCfg = getStorageConfig();
  const [pendingDirType, setPendingDirType] = useState(initCfg.dirType === 'custom' ? 'documents' : initCfg.dirType);
  const [pendingSubfolder, setPendingSubfolder] = useState(initCfg.subfolder);

  const applyStorageConfig = () => {
    const resolvedDirType = pendingDirType === 'custom' ? 'documents' : pendingDirType;
    setStorageConfig(resolvedDirType, pendingSubfolder);
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

  const overrideLinesText = useMemo(() => {
    if (!debouncedLogbookText || !debouncedLogbookText.toLowerCase().includes('override:')) return '';
    return debouncedLogbookText
      .split('\n')
      .filter(l => l.trim().toLowerCase().startsWith('override:'))
      .join('\n');
  }, [debouncedLogbookText]);

  const activeExercises = useMemo(() => {
    return getExercisesWithOverrides(overrideLinesText, exercisesDb);
  }, [overrideLinesText, exercisesDb]);

  // Profiles & Programs State
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfileName());
  const activeProfileRef = useRef(activeProfile);
  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);
  const [currentProgram, setCurrentProgram] = useState(() => localStorage.getItem('lastSelectedProgram') || 'S1M3');
  const currentProgramRef = useRef(currentProgram);
  useEffect(() => {
    currentProgramRef.current = currentProgram;
  }, [currentProgram]);
  const [programs, setPrograms] = useState(['S1M3']);
  const [showNewProgramModal, setShowNewProgramModal] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramError, setNewProgramError] = useState('');
  const [editorMode, setEditorMode] = useState('edit'); // 'edit', 'preview'
  const [optimisticEditorMode, setOptimisticEditorMode] = useOptimistic(editorMode);
  const handleEditorModeChange = useCallback((nextMode) => {
    if (nextMode === optimisticEditorMode) return;
    startTransition(() => {
      setOptimisticEditorMode(nextMode);
      setEditorMode(nextMode);
    });
  }, [optimisticEditorMode, setOptimisticEditorMode]);

  // Manual Editor Filter State (Session & Microcycles; persisted in sessionStorage across backgrounding, cleared on close)
  const [editorFiltersOpen, setEditorFiltersOpen] = useState(false);
  const [editorFilterSession, setEditorFilterSession] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('iron-stats-editor-filter') || '{}');
      return saved.session || 'all';
    } catch {
      return 'all';
    }
  });
  const [editorFilterWeekFrom, setEditorFilterWeekFrom] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('iron-stats-editor-filter') || '{}');
      return saved.weekFrom || 'all';
    } catch {
      return 'all';
    }
  });
  const [editorFilterWeekTo, setEditorFilterWeekTo] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('iron-stats-editor-filter') || '{}');
      return saved.weekTo || 'all';
    } catch {
      return 'all';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem('iron-stats-editor-filter', JSON.stringify({
        session: editorFilterSession,
        weekFrom: editorFilterWeekFrom,
        weekTo: editorFilterWeekTo,
      }));
    } catch {
      // Ignore storage quota/availability errors
    }
  }, [editorFilterSession, editorFilterWeekFrom, editorFilterWeekTo]);
  const [prevEditorProgram, setPrevEditorProgram] = useState(currentProgram);
  const [prevEditorProfile, setPrevEditorProfile] = useState(activeProfile);
  if (currentProgram !== prevEditorProgram || activeProfile !== prevEditorProfile) {
    setPrevEditorProgram(currentProgram);
    setPrevEditorProfile(activeProfile);
    setEditorFilterSession('all');
    setEditorFilterWeekFrom('all');
    setEditorFilterWeekTo('all');
  }
  const editorFilterContentRef = useRef(null);
  const [editorFilterHeight, setEditorFilterHeight] = useState(0);
  useEffect(() => {
    const el = editorFilterContentRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.ceil(el.getBoundingClientRect().height);
      setEditorFilterHeight(prev => (prev === next ? prev : next));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [isMobile, activeTab, editorType, editingProfileMd, editorFilterSession, editorFilterWeekFrom, editorFilterWeekTo]);

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
    if (!showExerciseModal || !editingOriginalName) return false;
    return logbookText.split('\n').some(line => {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith('override:')) return false;
      const match = trimmed.match(/^override:\s*([^|]+)\|/i);
      if (!match) return false;
      return match[1].trim().toLowerCase() === editingOriginalName.toLowerCase();
    });
  }, [showExerciseModal, logbookText, editingOriginalName]);

  // UI Status State
  const [syncStatus, setSyncStatus] = useState('saved'); // 'saved', 'syncing', 'error'
  const [syncError, setSyncError] = useState('');
  const [syncErrorKind, setSyncErrorKind] = useState('save'); // 'bootstrap' | 'load' | 'save'
  const saveTimeoutRef = useRef(null); // useRef instead of useState to avoid re-render on debounce
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let backListener = null;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (profileOpen) window.dispatchEvent(new Event('close-profile-page'));
      else if (selectedMetricDetail) window.dispatchEvent(new Event('close-metric-detail'));
      else if (showNewProgramModal) setShowNewProgramModal(false);
      else if (showExerciseModal) setShowExerciseModal(false);
      else if (storageDrawerRef.current.isOpen) resetStorageDrawer();
      else if (showMobileSettings) {
        setShowMobileSettings(false);
        resetStorageDrawer();
      }
      else if (canGoBack) window.history.back();
      else CapacitorApp.exitApp();
    }).then(listener => {
      if (cancelled) {
        listener.remove();
      } else {
        backListener = listener;
      }
    });

    return () => {
      cancelled = true;
      if (backListener) backListener.remove();
    };
  }, [profileOpen, selectedMetricDetail, showNewProgramModal, showExerciseModal, showMobileSettings]);

  const loadInitialData = useCallback((markSyncing = false) => {
    const reqId = ++loadRequestIdRef.current;
    let resolvedProg = localStorage.getItem('lastSelectedProgram') || 'S1M3';

    Promise.resolve()
      .then(() => {
        if (markSyncing && reqId === loadRequestIdRef.current) {
          setSyncStatus('syncing');
          setSyncError('');
        }
        return fetch('/api/exercises');
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load exercises database');
        return res.json();
      })
      .then(exs => {
        if (reqId !== loadRequestIdRef.current) return null;
        setExercisesDb(exs);
        return fetch('/api/profiles').then(r => (r.ok ? r.json() : [])).catch(() => []);
      })
      .then(async (profs) => {
        if (profs === null || reqId !== loadRequestIdRef.current) return null;
        const profileList = Array.isArray(profs) ? profs : [];
        setProfiles(profileList);
        const savedProfile = getActiveProfileName();
        const resolvedProfile = savedProfile && profileList.includes(savedProfile)
          ? savedProfile
          : (profileList.includes('Lorenzo') ? 'Lorenzo' : (profileList[0] || ''));
        activeProfileRef.current = resolvedProfile;
        setActiveProfile(resolvedProfile);
        setActiveProfileName(resolvedProfile);
        const loadedProfile = await loadProfileFromFile(resolvedProfile);
        if (reqId !== loadRequestIdRef.current) return null;
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: loadedProfile }));
        const query = resolvedProfile ? `?profile=${encodeURIComponent(resolvedProfile)}` : '';
        return fetch(`/api/programs${query}`);
      })
      .then(res => {
        if (!res || reqId !== loadRequestIdRef.current) return null;
        if (!res.ok) throw new Error('Failed to load programs list');
        return res.json();
      })
      .then(progs => {
        if (!progs || reqId !== loadRequestIdRef.current) return null;
        const prof = activeProfileRef.current;
        const progList = Array.isArray(progs) ? progs : [];
        setPrograms(progList);
        if (progList.length === 0) {
          currentProgramRef.current = '';
          setCurrentProgram('');
          resetTextHistory('');
          setLogbookText('');
          setDebouncedLogbookText('');
          setSyncStatus('saved');
          setSyncError('');
          return null;
        }
        const savedProg = localStorage.getItem(prof ? `lastSelectedProgram_${prof}` : 'lastSelectedProgram')
          || localStorage.getItem('lastSelectedProgram');
        resolvedProg = savedProg && progList.includes(savedProg)
          ? savedProg
          : (progList.includes('S1M3') ? 'S1M3' : progList[0]);
        const profQuery = prof ? `&profile=${encodeURIComponent(prof)}` : '';
        return fetch(`/api/logbook?program=${encodeURIComponent(resolvedProg)}${profQuery}`);
      })
      .then(res => {
        if (!res || reqId !== loadRequestIdRef.current) return null;
        if (!res.ok) throw new Error('Failed to load logbook');
        return res.text();
      })
      .then(text => {
        if (text === null || reqId !== loadRequestIdRef.current) return;
        currentProgramRef.current = resolvedProg;
        setCurrentProgram(resolvedProg);
        resetTextHistory(text);
        setLogbookText(text);
        setDebouncedLogbookText(text);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        if (reqId !== loadRequestIdRef.current) return;
        setSyncErrorKind('bootstrap');
        setSyncStatus('error');
        setSyncError(err.message);
      });
  }, [resetTextHistory]);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Parse logbook text whenever it changes or the exercises DB updates
  const workoutData = useMemo(() => {
    if (debouncedLogbookText && exercisesDb.length > 0) {
      return parseLogbook(debouncedLogbookText, exercisesDb);
    }
    return [];
  }, [debouncedLogbookText, exercisesDb]);

  const isManualLogbookMode = !editingProfileMd && editorType !== 'easy';

  const editorFilterMeta = useMemo(
    () => (isManualLogbookMode ? getLogbookFilterMeta(logbookText) : { sessions: [], getWeeksForSession: () => [] }),
    [isManualLogbookMode, logbookText]
  );

  const editorSessionsList = editorFilterMeta.sessions;

  const editorWeeksList = useMemo(
    () => editorFilterMeta.getWeeksForSession(editorFilterSession),
    [editorFilterMeta, editorFilterSession]
  );

  const editorSessionWheelOptions = useMemo(() => [
    { value: 'all', label: 'All' },
    ...editorSessionsList.map(s => ({ value: String(s), label: `S${s}` }))
  ], [editorSessionsList]);

  const editorWeekRangeLabel = formatWeekRangeLabel(editorFilterWeekFrom, editorFilterWeekTo);
  const hasAnyEditorFilter = editorFilterSession !== 'all' || editorWeekRangeLabel !== null;

  const editorFilterSummary = useMemo(() => {
    const parts = [];
    if (editorFilterSession !== 'all') parts.push(`S${editorFilterSession}`);
    if (editorWeekRangeLabel) parts.push(editorWeekRangeLabel);
    return parts.length > 0 ? parts.join(' · ') : 'Filters';
  }, [editorFilterSession, editorWeekRangeLabel]);

  const clearAllEditorFilters = useCallback(() => {
    setEditorFilterSession('all');
    setEditorFilterWeekFrom('all');
    setEditorFilterWeekTo('all');
  }, []);

  const filteredEditorResult = useMemo(() => {
    if (!isManualLogbookMode || !hasAnyEditorFilter) {
      return { text: logbookText, lineMap: null, isFiltered: false };
    }
    return filterLogbookText(logbookText, {
      session: editorFilterSession,
      weekFrom: editorFilterWeekFrom,
      weekTo: editorFilterWeekTo,
    });
  }, [isManualLogbookMode, hasAnyEditorFilter, logbookText, editorFilterSession, editorFilterWeekFrom, editorFilterWeekTo]);

  const filteredEditorLineMapRef = useRef(null);
  useEffect(() => {
    filteredEditorLineMapRef.current = filteredEditorResult.lineMap;
  }, [filteredEditorResult.lineMap]);

  const editorFilteredWorkoutData = useMemo(() => {
    if (!isManualLogbookMode || !hasAnyEditorFilter) return workoutData;
    let data = workoutData;
    if (editorFilterSession !== 'all') {
      const sNum = parseInt(editorFilterSession, 10);
      data = data.filter(d => d.session === sNum);
    }
    if (editorFilterWeekFrom !== 'all' || editorFilterWeekTo !== 'all') {
      data = data
        .map(ex => ({
          ...ex,
          weeks: ex.weeks.filter(w => isWeekInRange(w.week_num, editorFilterWeekFrom, editorFilterWeekTo)),
        }))
        .filter(ex => ex.weeks.length > 0);
    }
    return data;
  }, [isManualLogbookMode, hasAnyEditorFilter, workoutData, editorFilterSession, editorFilterWeekFrom, editorFilterWeekTo]);

  // Cursor Tracking State for scroll sync
  const [activeCursorLine, setActiveCursorLine] = useState(null);
  const editorModeRef = useRef(editorMode);
  useEffect(() => {
    editorModeRef.current = editorMode;
  }, [editorMode]);

  const handleCursorLineChange = useCallback((line) => {
    if (editorModeRef.current === 'preview') {
      const lineMap = filteredEditorLineMapRef.current;
      if (!lineMap) {
        setActiveCursorLine(line);
        return;
      }
      let mapped = lineMap[line];
      if (mapped === null || mapped === undefined) {
        for (let i = Math.min(line, lineMap.length - 1); i >= 0; i--) {
          if (lineMap[i] !== null && lineMap[i] !== undefined) {
            mapped = lineMap[i];
            break;
          }
        }
      }
      setActiveCursorLine(mapped ?? null);
    }
  }, []);

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


  // Load a program's markdown content dynamically
  const loadProgram = (progName, profName = activeProfileRef.current) => {
    const reqId = ++loadRequestIdRef.current;
    setSyncStatus('syncing');
    const profQuery = profName ? `&profile=${encodeURIComponent(profName)}` : '';
    fetch(`/api/logbook?program=${encodeURIComponent(progName)}${profQuery}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${progName}.md`);
        return res.text();
      })
      .then(text => {
        if (reqId !== loadRequestIdRef.current) return;
        currentProgramRef.current = progName;
        resetTextHistory(text);
        setLogbookText(text);
        setDebouncedLogbookText(text);
        setCurrentProgram(progName);
        localStorage.setItem('lastSelectedProgram', progName); // Save program selection
        if (profName) localStorage.setItem(`lastSelectedProgram_${profName}`, progName);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        if (reqId !== loadRequestIdRef.current) return;
        setSyncErrorKind('load');
        setSyncStatus('error');
        setSyncError(err.message);
      });
  };

  const saveProfileMdContent = useCallback(async (textToSave) => {
    if (profileSaveTimeoutRef.current) {
      clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }
    setSyncStatus('syncing');
    try {
      const parsed = parseProfileMarkdown(textToSave);
      await saveProfileToFile(parsed, activeProfileRef.current);
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: parsed }));
      setSyncStatus('saved');
      setSyncError('');
    } catch (err) {
      setSyncErrorKind('save-profile');
      setSyncStatus('error');
      setSyncError(err.message);
    }
  }, []);

  const scheduleDebouncedProfileSave = useCallback((newText) => {
    if (profileSaveTimeoutRef.current) clearTimeout(profileSaveTimeoutRef.current);
    profileSaveTimeoutRef.current = setTimeout(() => {
      profileSaveTimeoutRef.current = null;
      saveProfileMdContent(newText);
    }, 800);
  }, [saveProfileMdContent]);

  const toggleProfileMdEditor = useCallback(async () => {
    const reqId = ++profileMdReqIdRef.current;
    if (editingProfileMd) {
      editingProfileMdRef.current = false;
      setEditingProfileMd(false);
      if (profileSaveTimeoutRef.current) {
        clearTimeout(profileSaveTimeoutRef.current);
        profileSaveTimeoutRef.current = null;
        await saveProfileMdContent(profileMdTextRef.current);
      }
      return;
    }
    const profName = activeProfileRef.current;
    const cached = loadProfile(profName);
    const cachedMd = serializeProfileToMarkdown(cached);
    profileMdDirtyRef.current = false;
    profileMdTextRef.current = cachedMd;
    setProfileMdText(cachedMd);
    editingProfileMdRef.current = true;
    setEditingProfileMd(true);
    setEditorMode('edit');

    loadProfileFromFile(profName).then((loaded) => {
      if (
        reqId !== profileMdReqIdRef.current ||
        !editingProfileMdRef.current ||
        profileMdDirtyRef.current ||
        activeProfileRef.current !== profName
      ) {
        return;
      }
      const freshMd = serializeProfileToMarkdown(loaded);
      if (freshMd !== cachedMd) {
        profileMdTextRef.current = freshMd;
        setProfileMdText(freshMd);
      }
    }).catch(() => {});
  }, [editingProfileMd, saveProfileMdContent]);

  const handleProfileSelect = async (profName) => {
    if (!profName || profName === activeProfileRef.current) return;
    const reqId = ++loadRequestIdRef.current;
    profileMdReqIdRef.current += 1;
    if (profileSaveTimeoutRef.current) {
      clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
      await saveProfileMdContent(profileMdTextRef.current);
      if (reqId !== loadRequestIdRef.current) return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      if (currentProgramRef.current) {
        await saveLogbookContent(logbookTextRef.current, currentProgramRef.current);
        if (reqId !== loadRequestIdRef.current) return;
      }
    }
    editingProfileMdRef.current = false;
    setEditingProfileMd(false);
    activeProfileRef.current = profName;
    setActiveProfile(profName);
    setActiveProfileName(profName);

    const loadedProfile = await loadProfileFromFile(profName);
    if (reqId !== loadRequestIdRef.current) return;
    window.dispatchEvent(new CustomEvent('profile-updated', { detail: loadedProfile }));

    try {
      const res = await fetch(`/api/programs?profile=${encodeURIComponent(profName)}`);
      if (!res.ok) throw new Error('Failed to load programs list');
      const progs = await res.json();
      if (reqId !== loadRequestIdRef.current) return;
      const progList = Array.isArray(progs) ? progs : [];
      setPrograms(progList);
      if (progList.length > 0) {
        const savedProg = localStorage.getItem(`lastSelectedProgram_${profName}`);
        const nextProg = savedProg && progList.includes(savedProg) ? savedProg : progList[0];
        loadProgram(nextProg, profName);
      } else {
        currentProgramRef.current = '';
        setCurrentProgram('');
        resetTextHistory('');
        setLogbookText('');
        setDebouncedLogbookText('');
        setSyncStatus('saved');
        setSyncError('');
      }
    } catch (err) {
      if (reqId !== loadRequestIdRef.current) return;
      setPrograms([]);
      currentProgramRef.current = '';
      setCurrentProgram('');
      resetTextHistory('');
      setLogbookText('');
      setDebouncedLogbookText('');
      setSyncErrorKind('bootstrap');
      setSyncStatus('error');
      setSyncError(err?.message || `Failed to switch to profile ${profName}`);
    }
  };

  // Handle program switching with auto-flush
  const handleProgramChange = async (progName) => {
    if (!progName) return;
    setEditingProfileMd(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      if (currentProgramRef.current) {
        await saveLogbookContent(logbookTextRef.current, currentProgramRef.current);
      }
    }
    loadProgram(progName);
  };

  // Create a new program in the backend
  const handleCreateProgram = async () => {
    const cleanName = newProgramName.replace(/[^a-zA-Z0-9_\- ()]/g, '').trim();
    if (!cleanName) {
      setNewProgramError('Please enter a valid program name.');
      return;
    }

    if (cleanName.toLowerCase() === 'profile') {
      setNewProgramError('The name "profile" is reserved.');
      return;
    }

    if (programs.includes(cleanName)) {
      setNewProgramError('A program with this name already exists.');
      return;
    }

    if (saveTimeoutRef.current && currentProgramRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      await saveLogbookContent(logbookTextRef.current, currentProgramRef.current);
    }

    fetch('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, profile: activeProfileRef.current })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => { throw new Error(data.error || 'Failed to create program') });
        }
        return res.json();
      })
      .then((data) => {
        setPrograms(prev => [...prev, data.name]);
        setShowNewProgramModal(false);
        setNewProgramName('');
        loadProgram(data.name);
      })
      .catch(err => {
        setNewProgramError(err.message);
      });
  };

  // Exercise CRUD Actions
  const handleOpenAddExercise = useCallback(() => {
    setEditingExercise(null);
    setEditingOriginalName('');
    setEditingCurveIndex(null);
    setMuscleSearch('');
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
  }, []);

  const handleOpenEditExercise = useCallback((ex) => {
    setEditingExercise(ex);
    setEditingOriginalName(ex.name);
    setEditingCurveIndex(null);
    setMuscleSearch('');
    const entries = Object.entries(ex.muscles_distr || {});
    const rawPcts = entries.map(([, p]) => (typeof p === 'number' ? p : (p.magnitude || 0)) * 100);
    const floored = rawPcts.map(v => Math.floor(v));
    const sumRaw = rawPcts.reduce((a, b) => a + b, 0);
    if (Math.abs(sumRaw - 100) < 0.5 && entries.length > 0) {
      let rem = 100 - floored.reduce((a, b) => a + b, 0);
      const order = rawPcts
        .map((v, idx) => ({ idx, frac: v - floored[idx] }))
        .sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < rem && i < order.length; i++) {
        floored[order[i].idx] += 1;
      }
    }
    setExerciseForm({
      name: ex.name,
      fatigue: ex.fatigue,
      load_coeff: ex.load_coeff,
      load_multiplier: ex.load_multiplier !== undefined ? ex.load_multiplier : 1.0,
      load_offset: ex.load_offset !== undefined ? ex.load_offset : 0.0,
      is_isolation: !!ex.is_isolation,
      muscles: entries.map(([m, p], idx) => ({
        name: m,
        percentage: Math.abs(sumRaw - 100) < 0.5 ? floored[idx] : Math.round(rawPcts[idx]),
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
  }, []);

  const buildValidatedExercise = (name) => {
    if (name.includes('|')) {
      setExerciseError('Exercise name cannot contain "|".');
      return null;
    }

    const fatigue = parseFloat(exerciseForm.fatigue);
    const load_coeff = parseFloat(exerciseForm.load_coeff);
    const load_multiplier = parseFloat(exerciseForm.load_multiplier);
    const load_offset = parseFloat(exerciseForm.load_offset);

    if (!Number.isFinite(fatigue) || fatigue < 0 || fatigue > 10) {
      setExerciseError('Fatigue must be a number between 0 and 10.');
      return null;
    }
    if (!Number.isFinite(load_coeff) || load_coeff < 0 || load_coeff > 2) {
      setExerciseError('Load coefficient must be a number between 0 and 2.');
      return null;
    }
    if (!Number.isFinite(load_multiplier) || load_multiplier <= 0) {
      setExerciseError('Load multiplier must be strictly positive.');
      return null;
    }
    if (!Number.isFinite(load_offset)) {
      setExerciseError('Load offset must be a valid number.');
      return null;
    }

    const musclesDistr = {};
    let totalMag = 0.0;
    for (const m of exerciseForm.muscles) {
      const pct = Number(m.percentage);
      if (!Number.isFinite(pct) || pct < 0.0) {
        setExerciseError(`Muscle percentage for ${m.name} must be non-negative.`);
        return null;
      }
      const x0 = m.x0 ?? 0.0;
      const y0 = m.y0 ?? 1.0;
      const x1 = m.x1 ?? 0.33;
      const y1 = m.y1 ?? 1.0;
      const x2 = m.x2 ?? 0.66;
      const y2 = m.y2 ?? 1.0;
      const x3 = m.x3 ?? 1.0;
      const y3 = m.y3 ?? 1.0;
      if (!(0.0 <= x0 && x0 < x1 && x1 < x2 && x2 < x3 && x3 <= 1.0)) {
        setExerciseError(`Invalid ROM progression for ${m.name}: require 0 <= x0 < x1 < x2 < x3 <= 1.`);
        return null;
      }
      if (Math.min(y0, y1, y2, y3) < 0.0) {
        setExerciseError(`Negative tension control point for ${m.name}.`);
        return null;
      }
      const mag = pct / 100.0;
      musclesDistr[m.name] = {
        x0, y0, x1, y1, x2, y2, x3, y3,
        magnitude: mag
      };
      totalMag += mag;
    }
    if (totalMag <= 0.0) {
      setExerciseError('Muscle distribution magnitudes must sum to a positive value.');
      return null;
    }
    if (Math.abs(totalMag - 1.0) > 1e-12) {
      for (const mName of Object.keys(musclesDistr)) {
        musclesDistr[mName].magnitude /= totalMag;
      }
    }

    return {
      name,
      fatigue,
      load_coeff,
      load_multiplier,
      load_offset,
      is_isolation: !!exerciseForm.is_isolation,
      muscles_distr: musclesDistr
    };
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

    if (exerciseForm.muscles.some(m => !Number.isFinite(Number(m.percentage)) || Number(m.percentage) < 0)) {
      setExerciseError('Muscle percentages must be non-negative.');
      return;
    }

    const totalPct = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
    if (totalPct !== 100) {
      setExerciseError(`Total muscle distribution must sum to exactly 100% (currently ${totalPct}%).`);
      return;
    }

    const savedExercise = buildValidatedExercise(name);
    if (!savedExercise) return;

    let updatedList = [];
    const existsInGlobalDb = editingOriginalName && exercisesDb.some(ex => ex.name === editingOriginalName);
    if (existsInGlobalDb) {
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
        if (existsInGlobalDb && editingOriginalName && editingOriginalName.toLowerCase() !== name.toLowerCase()) {
          const lines = logbookTextRef.current.split('\n');
          let modified = false;
          const updatedLines = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed.toLowerCase().startsWith('override:')) return line;
            const match = trimmed.match(/^override:\s*([^|]+)(\|.*)$/i);
            if (match && match[1].trim().toLowerCase() === editingOriginalName.toLowerCase()) {
              modified = true;
              return `override: ${name} ${match[2].trimStart()}`;
            }
            return line;
          });
          if (modified) {
            const newText = updatedLines.join('\n');
            setLogbookText(newText);
            setDebouncedLogbookText(newText);
            if (currentProgramRef.current) {
              saveLogbookContent(newText, currentProgramRef.current);
            }
          }
        }
        setShowExerciseModal(false);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncErrorKind('save');
        setSyncStatus('error');
        setSyncError(err.message);
        setExerciseError(err.message);
      });
  };

  const handleDeleteExercise = (exerciseName) => {
    if (!window.confirm(`Are you sure you want to delete "${exerciseName}"?`)) {
      return;
    }

    const existsInGlobal = exercisesDb.some(ex => ex.name === exerciseName);
    const updatedList = exercisesDb.filter(ex => ex.name !== exerciseName);

    const removeOverrideLineIfPresent = () => {
      const lines = logbookTextRef.current.split('\n');
      const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed.toLowerCase().startsWith('override:')) return true;
        const match = trimmed.match(/^override:\s*([^|]+)\|/i);
        if (!match) return true;
        return match[1].trim().toLowerCase() !== exerciseName.toLowerCase();
      });
      if (filtered.length !== lines.length) {
        const newText = filtered.join('\n');
        setLogbookText(newText);
        setDebouncedLogbookText(newText);
        saveLogbookContent(newText, currentProgramRef.current);
      }
    };

    if (!existsInGlobal) {
      removeOverrideLineIfPresent();
      setShowExerciseModal(false);
      return;
    }

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
        removeOverrideLineIfPresent();
        setShowExerciseModal(false);
        setSyncStatus('saved');
        setSyncError('');
      })
      .catch(err => {
        setSyncErrorKind('save');
        setSyncStatus('error');
        setSyncError(err.message);
      });
  };

  const handleSaveExerciseForProgramOnly = () => {
    if (!currentProgramRef.current) {
      setExerciseError('Create or select a program before saving program-specific overrides.');
      return;
    }

    const name = exerciseForm.name.trim();
    if (!name) {
      setExerciseError('Exercise name is required.');
      return;
    }

    if (exerciseForm.muscles.length === 0) {
      setExerciseError('At least one muscle group must be selected.');
      return;
    }

    if (exerciseForm.muscles.some(m => !Number.isFinite(Number(m.percentage)) || Number(m.percentage) < 0)) {
      setExerciseError('Muscle percentages must be non-negative.');
      return;
    }

    const totalPct = exerciseForm.muscles.reduce((sum, m) => sum + m.percentage, 0);
    if (totalPct !== 100) {
      setExerciseError(`Total muscle distribution must sum to exactly 100% (currently ${totalPct}%).`);
      return;
    }

    const validated = buildValidatedExercise(name);
    if (!validated) return;
    const { fatigue, load_coeff, load_multiplier, load_offset, is_isolation, muscles_distr: musclesDistr } = validated;

    const overrideLine = `override: ${name} | fatigue=${fatigue} | load_coeff=${load_coeff} | load_multiplier=${load_multiplier} | load_offset=${load_offset} | is_isolation=${is_isolation} | muscles_distr=${JSON.stringify(musclesDistr)}`;

    const lines = logbookText.split('\n');
    const searchName = editingOriginalName || name;
    const existingIdx = lines.findIndex(line => {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith('override:')) return false;
      const match = trimmed.match(/^override:\s*([^|]+)\|/i);
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
        if (lines[i].trim().toLowerCase().startsWith('override:')) {
          insertIdx = i + 1;
        } else {
          break;
        }
      }
      lines.splice(insertIdx, 0, overrideLine);
      newText = lines.join('\n');
    }

    setLogbookText(newText);
    setDebouncedLogbookText(newText);
    saveLogbookContent(newText, currentProgramRef.current);
    setShowExerciseModal(false);
  };

  const handleRemoveOverride = () => {
    if (!currentProgramRef.current) {
      setShowExerciseModal(false);
      return;
    }

    const searchName = editingOriginalName || exerciseForm.name.trim();
    if (!searchName) return;

    const lines = logbookText.split('\n');
    const existingIdx = lines.findIndex(line => {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith('override:')) return false;
      const match = trimmed.match(/^override:\s*([^|]+)\|/i);
      if (!match) return false;
      return match[1].trim().toLowerCase() === searchName.toLowerCase();
    });

    if (existingIdx !== -1) {
      lines.splice(existingIdx, 1);
      const newText = lines.join('\n');
      setLogbookText(newText);
      setDebouncedLogbookText(newText);
      saveLogbookContent(newText, currentProgramRef.current);
    }
    setShowExerciseModal(false);
  };


  // Handle manual / debounced auto-saving to [program].md
  const saveLogbookContent = useCallback((newText, progName = currentProgramRef.current) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (!progName) {
      setSyncErrorKind('save');
      setSyncStatus('error');
      setSyncError('No program selected. Create a program first.');
      return Promise.resolve();
    }
    const formattedText = formatLogbookSpaces(newText);
    if (formattedText !== newText && progName === currentProgramRef.current) {
      skipNextHistoryPushRef.current = true;
      setLogbookText(formattedText);
      setCommittedHistoryText(formattedText);
    }
    setSyncStatus('syncing');
    const prof = activeProfileRef.current;
    const profQuery = prof ? `&profile=${encodeURIComponent(prof)}` : '';
    return fetch(`/api/logbook?program=${encodeURIComponent(progName)}${profQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: formattedText
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
        setSyncErrorKind('save');
        setSyncStatus('error');
        setSyncError(`Failed to save: ${err.message}`);
      });
  }, []);

  const scheduleDebouncedSave = useCallback((textToSave) => {
    const progAtEdit = currentProgramRef.current;
    setSyncStatus('syncing');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveLogbookContent(textToSave, progAtEdit);
    }, 1500);
  }, [saveLogbookContent]);

  const handleEasyLogbookChange = useCallback((newText) => {
    setLogbookText(newText);
    scheduleDebouncedSave(newText);
  }, [scheduleDebouncedSave]);

  const handleManualLogbookChange = useCallback((newText) => {
    setLogbookText(newText);
    scheduleDebouncedSave(newText);
  }, [scheduleDebouncedSave]);

  const handleFilteredManualLogbookChange = useCallback((editedText) => {
    if (!hasAnyEditorFilter) {
      handleManualLogbookChange(editedText);
      return;
    }
    const prevMaxWeek = editorWeeksList.length > 0 ? editorWeeksList[editorWeeksList.length - 1] : null;
    const merged = mergeFilteredLogbook(logbookTextRef.current, editedText, {
      session: editorFilterSession,
      weekFrom: editorFilterWeekFrom,
      weekTo: editorFilterWeekTo,
    });
    if (editorFilterWeekTo !== 'all' && prevMaxWeek !== null && Number(editorFilterWeekTo) === prevMaxWeek) {
      const nextWeeks = getLogbookFilterMeta(merged).getWeeksForSession(editorFilterSession);
      const nextMaxWeek = nextWeeks.length > 0 ? nextWeeks[nextWeeks.length - 1] : prevMaxWeek;
      if (nextMaxWeek > prevMaxWeek) {
        setEditorFilterWeekTo(String(nextMaxWeek));
      }
    }
    handleManualLogbookChange(merged);
  }, [hasAnyEditorFilter, editorWeeksList, editorFilterSession, editorFilterWeekFrom, editorFilterWeekTo, handleManualLogbookChange]);

  useEffect(() => {
    scheduleSaveRef.current = scheduleDebouncedSave;
  }, [scheduleDebouncedSave]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <button className="mobile-burger-btn" style={{ pointerEvents: 'auto' }} onClick={() => { resetStorageDrawer(); setShowMobileSettings(true); }}>
          <Settings size={22} color="var(--text-primary)" strokeWidth={1.5} />
        </button>

        <div className="brand" style={{ pointerEvents: 'auto' }}>
          <h1 style={{ textAlign: 'right' }}>Iron Stats</h1>
        </div>

        {/* Tab Selection */}
        <div className={`tab-nav ${showMobileSettings ? 'mobile-open' : ''}`} ref={tabNavRef}>
          <button className="mobile-close-btn" onClick={() => { setShowMobileSettings(false); resetStorageDrawer(); }}>×</button>
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
                showProgramSelector={true}
                profiles={profiles}
                activeProfile={activeProfile}
                handleProfileSelect={handleProfileSelect}
                currentProgram={currentProgram}
                handleProgramChange={handleProgramChange}
                programs={programs}
                setShowNewProgramModal={setShowNewProgramModal}
                syncStatus={syncStatus}
                storageDrawerRef={storageDrawerRef}
                getStorageConfig={getStorageConfig}
                handlePickFolder={handlePickFolder}
                storagePickError={storagePickError}
                handleResetStorage={handleResetStorage}
                pendingDirType={pendingDirType}
                setPendingDirType={setPendingDirType}
                pendingSubfolder={pendingSubfolder}
                setPendingSubfolder={setPendingSubfolder}
                applyStorageConfig={applyStorageConfig}
                dateFormat={dateFormat}
                setDateFormat={setDateFormat}
              />
            </div>
          </div>
        </div>

        {/* Header Controls (Desktop) */}
        <div className="header-controls desktop-only" style={{ position: 'relative' }}>
          {/* Profile Selector */}
          {profiles.length > 0 && (
            <div className="program-selector-container">
              <span className="program-label">Profile:</span>
              <select
                className="program-select"
                aria-label="Active Profile"
                value={activeProfile}
                onChange={(e) => handleProfileSelect(e.target.value)}
              >
                {profiles.map(prof => (
                  <option key={prof} value={prof}>
                    {prof}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Program Selector */}
          <div className="program-selector-container">
            <span className="program-label">Program:</span>
            <select 
              className="program-select"
              aria-label="Active Program"
              value={currentProgram}
              onChange={(e) => handleProgramChange(e.target.value)}
              disabled={programs.length === 0}
            >
              {programs.length === 0 ? (
                <option value="" disabled>No programs</option>
              ) : (
                programs.map(prog => (
                  <option key={prog} value={prog}>
                    {prog}
                  </option>
                ))
              )}
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
               syncStatus === 'saved' ? (editingProfileMd ? 'Synced with profile' : (currentProgram ? `Synced with ${currentProgram}` : 'Synced')) : 'Offline'}
            </span>
          </div>

          <button 
            className="tab-btn settings-desktop-btn" 
            onClick={() => {
              setShowDesktopSettings(!showDesktopSettings);
              resetStorageDrawer();
            }}
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
              background: 'var(--bg-secondary, #121212)',
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
                showProgramSelector={false}
                storageDrawerRef={storageDrawerRef}
                getStorageConfig={getStorageConfig}
                handlePickFolder={handlePickFolder}
                storagePickError={storagePickError}
                handleResetStorage={handleResetStorage}
                pendingDirType={pendingDirType}
                setPendingDirType={setPendingDirType}
                pendingSubfolder={pendingSubfolder}
                setPendingSubfolder={setPendingSubfolder}
                applyStorageConfig={applyStorageConfig}
                dateFormat={dateFormat}
                setDateFormat={setDateFormat}
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
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 8px' }}
            onClick={() => {
              if (syncErrorKind === 'bootstrap') loadInitialData(true);
              else if (syncErrorKind === 'load') loadProgram(currentProgramRef.current);
              else if (syncErrorKind === 'save-profile') saveProfileMdContent(profileMdTextRef.current);
              else saveLogbookContent(logbookTextRef.current, currentProgramRef.current);
            }}
          >
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Workspace Area */}
      <div className="main-workspace">
        <div 
          className="swipe-views-container" 
          ref={swipeContainerRef} 
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
        
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
                   disabled={!canUndo}
                   style={{ opacity: !canUndo ? 0.3 : 1 }}
                >
                  <Undo2 size={18} />
                </button>
                <button 
                   className="mode-pill-btn" 
                   onClick={handleRedo} 
                   disabled={!canRedo}
                   style={{ opacity: !canRedo ? 0.3 : 1 }}
                >
                  <Redo2 size={18} />
                </button>
              </div>

              {/* Mobile Editor Mode Toggles Pill */}
              <div className="mobile-editor-pill-nav" style={{ marginLeft: 0, pointerEvents: 'auto' }}>
                 <div className={`mobile-editor-mode-group ${editingProfileMd ? 'is-collapsed' : ''}`}>
                   <div className="mobile-editor-mode-indicator" style={{ left: 0, transform: `translateX(${optimisticEditorMode === 'edit' ? 0 : 38}px)` }}></div>
                   <button className={`mode-pill-btn ${optimisticEditorMode === 'edit' ? 'active' : ''}`} onClick={() => handleEditorModeChange('edit')}><Pencil size={18} /></button>
                   <button className={`mode-pill-btn ${optimisticEditorMode === 'preview' ? 'active' : ''}`} onClick={() => handleEditorModeChange('preview')}><Eye size={18} /></button>
                   {editorType !== 'easy' && (
                     <button
                       type="button"
                       id="mobile-editor-filters-toggle"
                       className={`mode-pill-btn ${(editorFiltersOpen || hasAnyEditorFilter) ? 'filter-active' : ''}`}
                       onClick={() => setEditorFiltersOpen(prev => !prev)}
                       title="Filter Sessions & Microcycles"
                       aria-label="Filter Sessions & Microcycles"
                     >
                       <SlidersHorizontal size={18} />
                     </button>
                   )}
                   <div className="pill-divider"></div>
                 </div>
                 <button
                   type="button"
                   className={`mode-pill-btn ${editingProfileMd ? 'active' : ''}`}
                   onClick={toggleProfileMdEditor}
                   title="Profile Editor"
                   aria-label="Profile Editor"
                 >
                   <User size={18} />
                 </button>
                 <div className="pill-divider"></div>
                 <button
                   className="btn-save-circle"
                   onClick={() => (editingProfileMd ? saveProfileMdContent(profileMdText) : saveLogbookContent(logbookText))}
                   title="Save Now"
                 >
                   <Save size={18} />
                 </button>
              </div>
            </div>
          )}
          
          {(isMobile || activeTab === 'editor') && (
          <div className={`editor-tab-workspace ${isManualLogbookMode && editorFiltersOpen ? 'has-editor-filters-open' : ''}`}>
            {/* Editor Sub-Header */}
            <div className="editor-control-bar" style={editingProfileMd ? { justifyContent: 'flex-end' } : undefined}>
              {/* Edit Mode Toggles */}
              {!editingProfileMd && (
                <div className={`editor-mode-toggles mode-${optimisticEditorMode}`}>
                  <div className="editor-mode-indicator"></div>
                  <button 
                    className={`mode-toggle-btn ${optimisticEditorMode === 'edit' ? 'active' : ''}`}
                    onClick={() => handleEditorModeChange('edit')}
                  >
                    Edit
                  </button>
                  <button 
                    className={`mode-toggle-btn ${optimisticEditorMode === 'preview' ? 'active' : ''}`}
                    onClick={() => handleEditorModeChange('preview')}
                  >
                    Preview
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="editor-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {isManualLogbookMode && (
                  <button
                    type="button"
                    id="editor-filters-toggle"
                    className={`btn ${editorFiltersOpen || hasAnyEditorFilter ? 'btn-primary' : ''}`}
                    onClick={() => setEditorFiltersOpen(prev => !prev)}
                    title="Filter Sessions & Microcycles"
                  >
                    <SlidersHorizontal size={14} /> {editorFilterSummary}
                  </button>
                )}
                <button
                  type="button"
                  className={editingProfileMd ? 'btn btn-primary' : 'btn'}
                  onClick={toggleProfileMdEditor}
                  title="Profile Editor"
                  aria-label="Profile Editor"
                >
                  <User size={15} />
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => (editingProfileMd ? saveProfileMdContent(profileMdText) : saveLogbookContent(logbookText))}
                >
                  <Save size={14} /> Save Now
                </button>
              </div>
            </div>

            {/* Manual Editor Filter Bar (Session & Microcycles, smoothly expands/collapses) */}
            {isManualLogbookMode && (
              <div style={{
                height: editorFiltersOpen ? `${editorFilterHeight}px` : '0px',
                opacity: editorFiltersOpen ? 1 : 0,
                marginTop: isMobile && editorFiltersOpen ? '72px' : '0px',
                marginBottom: editorFiltersOpen ? (isMobile ? '0px' : '12px') : '0px',
                overflow: 'hidden',
                borderRadius: 'var(--card-radius)',
                willChange: 'height, opacity',
                transition: 'height 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms ease, margin-top 350ms cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 350ms cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: editorFiltersOpen ? 'auto' : 'none',
                flexShrink: 0,
              }}>
                <div ref={editorFilterContentRef} style={{
                  display: 'flex', flexDirection: 'column', gap: '12px',
                  padding: isMobile ? '12px' : '14px 16px',
                  margin: isMobile ? '0 8px' : 0,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '18px' : '12px' }}>
                    <LockWheelPicker
                      label="Session"
                      options={editorSessionWheelOptions}
                      value={editorFilterSession}
                      onChange={val => setEditorFilterSession(val)}
                      itemWidth={38}
                    />
                    <DualWeekSlider
                      label="Microcycles"
                      weeks={editorWeeksList}
                      fromVal={editorFilterWeekFrom}
                      toVal={editorFilterWeekTo}
                      onChange={(f, t) => { setEditorFilterWeekFrom(f); setEditorFilterWeekTo(t); }}
                    />
                  </div>
                  {hasAnyEditorFilter && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '99px', color: 'var(--color-fatigue)', borderColor: 'rgba(244,63,94,0.25)' }}
                        onClick={clearAllEditorFilters}
                      >
                        ✕ Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Split / Main Editor container */}
            <div className={`editor-split-container mode-${editingProfileMd ? 'edit' : editorMode}`}>
              
              {/* Text Area Column (kept mounted for instant edit/preview & easy/manual switching) */}
              <div
                className="editor-panel"
                style={{ display: (editingProfileMd || editorMode === 'edit') ? 'flex' : 'none' }}
              >
                <div className="editor-wrapper">
                  {editingProfileMd && (
                    editorType === 'easy' ? (
                      <ProfileEasyEditor
                        key={activeProfile}
                        profile={parseProfileMarkdown(profileMdText)}
                        dateFormat={dateFormat}
                        onChange={(nextProfile) => {
                          const nextMd = serializeProfileToMarkdown(nextProfile);
                          profileMdDirtyRef.current = true;
                          profileMdTextRef.current = nextMd;
                          setProfileMdText(nextMd);
                          scheduleDebouncedProfileSave(nextMd);
                          window.dispatchEvent(new CustomEvent('profile-updated', { detail: nextProfile }));
                        }}
                      />
                    ) : (
                      <FoldableEditor
                        key={`__profile_md__:${activeProfile}`}
                        value={profileMdText}
                        onChange={(newText) => {
                          profileMdDirtyRef.current = true;
                          profileMdTextRef.current = newText;
                          setProfileMdText(newText);
                          scheduleDebouncedProfileSave(newText);
                        }}
                        exercisesDb={[]}
                      />
                    )
                  )}
                  {!editingProfileMd && editorType === 'easy' && (
                    <div style={{ flex: 1, width: '100%', minWidth: 0, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <EasyEditor 
                        logbookText={logbookText}
                        onChange={handleEasyLogbookChange}
                        exercisesDb={activeExercises}
                      />
                    </div>
                  )}
                  {editorType !== 'easy' && (
                    <div style={{ flex: 1, width: '100%', minWidth: 0, minHeight: 0, height: '100%', display: !editingProfileMd ? 'flex' : 'none', flexDirection: 'column' }}>
                      <FoldableEditor
                        key={`${activeProfile}:${currentProgram}`}
                        value={filteredEditorResult.text}
                        onChange={handleFilteredManualLogbookChange}
                        exercisesDb={activeExercises}
                        onCursorLineChange={handleCursorLineChange}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Live Preview Column (only rendered when preview mode is active) */}
              {!editingProfileMd && editorMode === 'preview' && (
                <div className="preview-panel" style={{ display: 'flex' }}>
                  <div className="preview-container">
                    <LogbookPreview 
                      workoutData={editorFilteredWorkoutData} 
                      activeExerciseStartLine={activeExerciseStartLine}
                      activeWeekLineIndex={activeWeekLineIndex}
                      editorMode={editorMode}
                      dateFormat={dateFormat}
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
          exercisesDb={exercisesDb}
          selectedMetricDetail={selectedMetricDetail}
          setSelectedMetricDetail={setSelectedMetricDetail}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          dateFormat={dateFormat}
          activeProfile={activeProfile}
        />
        {/* TAB CONTENT: EXERCISE DATABASE */}
        <DatabaseTab
          isMobile={isMobile}
          isActive={activeTab === 'db'}
          activeExercises={activeExercises}
          handleOpenAddExercise={handleOpenAddExercise}
          handleOpenEditExercise={handleOpenEditExercise}
          overrideLinesText={overrideLinesText}
          currentProgram={currentProgram}
        />
        {/* TAB CONTENT: GENERATOR */}
        <div className={`swipe-view ${activeTab === 'generator' ? 'active-desktop' : ''}`} id="view-generator">
          {(isMobile || activeTab === 'generator') && (
          <div className="tab-workspace-flat" style={{ height: 'calc(100vh - 80px)', padding: '20px' }}>
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-muted)' }}>Loading Generator...</div>}>
              <GeneratorConfig
                isMobile={isMobile}
                activeProfile={activeProfile}
                onProgramCreated={(name) => {
                  setPrograms(prev => (prev.includes(name) ? prev : [...prev, name]));
                }}
              />
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* Mobile Bottom Navigation Bar */}
      {!showMobileSettings && (
        <div className={`mobile-bottom-nav${isKeyboardOpen ? ' keyboard-open' : ''}`}>
        <div 
          className="mobile-bottom-nav-indicator" 
          ref={bottomNavIndicatorRef}
          style={{ transform: `translateX(${['stopwatch', 'editor', 'dashboard', 'db', 'generator'].indexOf(activeTab) * 52}px)` }} 
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
