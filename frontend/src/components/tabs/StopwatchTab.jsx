import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

const Stopwatch = registerPlugin('Stopwatch');

const STORAGE_KEYS = {
  RUNNING: 'iron_stats_stopwatch_running',
  START_TIME: 'iron_stats_stopwatch_start_time',
  ACCUMULATED: 'iron_stats_stopwatch_accumulated'
};

const SESSION_STORAGE_KEYS = {
  RUNNING: 'iron_stats_session_running',
  START_TIME: 'iron_stats_session_start_time',
  ACCUMULATED: 'iron_stats_session_accumulated'
};

const safeParseInt = (val) => {
  const n = parseInt(val || '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const formatTime = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};

const formatSessionTime = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const StopwatchTab = React.memo(({ activeTab, isMobile }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isSessionRunning, setIsSessionRunning] = useState(false);

  const containerRef = useRef(null);
  const timeDisplayRef = useRef(null);
  const sessionDisplayRef = useRef(null);
  const isVisibleRef = useRef(false);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const isRunningRef = useRef(false);
  const animFrameRef = useRef(null);

  const sessionStartTimeRef = useRef(0);
  const sessionAccumulatedRef = useRef(0);
  const isSessionRunningRef = useRef(false);
  const sessionIntervalRef = useRef(null);

  // Directly update DOM element text without causing React component re-renders
  const updateDisplay = useCallback((ms) => {
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(ms);
    }
  }, []);

  const updateSessionDisplay = useCallback((ms) => {
    if (sessionDisplayRef.current) {
      sessionDisplayRef.current.textContent = formatSessionTime(ms);
    }
  }, []);

  // Sync ref with state & localStorage
  const setRunningState = (running) => {
    isRunningRef.current = running;
    setIsRunning(running);
    localStorage.setItem(STORAGE_KEYS.RUNNING, running ? 'true' : 'false');
  };

  const setSessionRunningState = (running) => {
    isSessionRunningRef.current = running;
    setIsSessionRunning(running);
    localStorage.setItem(SESSION_STORAGE_KEYS.RUNNING, running ? 'true' : 'false');
  };

  const calculateElapsed = useCallback(() => {
    if (isRunningRef.current && startTimeRef.current > 0) {
      return accumulatedRef.current + Math.max(0, Date.now() - startTimeRef.current);
    }
    return accumulatedRef.current;
  }, []);

  const calculateSessionElapsed = useCallback(() => {
    if (isSessionRunningRef.current && sessionStartTimeRef.current > 0) {
      return sessionAccumulatedRef.current + Math.max(0, Date.now() - sessionStartTimeRef.current);
    }
    return sessionAccumulatedRef.current;
  }, []);

  const stopLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const stopSessionLoop = useCallback(() => {
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    let lastRender = 0;
    const tick = (now) => {
      // Update DOM directly every ~20ms (50fps) without React state reconciliation
      if (now - lastRender >= 20) {
        lastRender = now;
        updateDisplay(calculateElapsed());
      }
      const isVisible = isMobile ? isVisibleRef.current : (activeTab === 'stopwatch');
      if (isRunningRef.current && isVisible) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [calculateElapsed, isMobile, activeTab, stopLoop, updateDisplay]);

  const startSessionLoop = useCallback(() => {
    stopSessionLoop();
    updateSessionDisplay(calculateSessionElapsed());
    sessionIntervalRef.current = setInterval(() => {
      const isVisible = isMobile ? isVisibleRef.current : (activeTab === 'stopwatch');
      if (isSessionRunningRef.current && isVisible) {
        updateSessionDisplay(calculateSessionElapsed());
      } else {
        stopSessionLoop();
      }
    }, 250);
  }, [calculateSessionElapsed, isMobile, activeTab, stopSessionLoop, updateSessionDisplay]);

  // Option A: IntersectionObserver on container element to detect viewport entry instantly during swipe
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.isIntersecting && entry.intersectionRatio > 0;
        isVisibleRef.current = visible;

        if (visible) {
          const current = calculateElapsed();
          updateDisplay(current);
          if (isRunningRef.current) {
            startLoop();
          }

          const currentSession = calculateSessionElapsed();
          updateSessionDisplay(currentSession);
          if (isSessionRunningRef.current) {
            startSessionLoop();
          }
        } else {
          stopLoop();
          stopSessionLoop();
        }
      },
      { threshold: [0, 0.01] }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [calculateElapsed, calculateSessionElapsed, startLoop, startSessionLoop, stopLoop, stopSessionLoop, updateDisplay, updateSessionDisplay]);

  // Handle desktop tab activation
  useEffect(() => {
    if (!isMobile) {
      if (activeTab === 'stopwatch') {
        const current = calculateElapsed();
        updateDisplay(current);
        if (isRunningRef.current) {
          startLoop();
        }

        const currentSession = calculateSessionElapsed();
        updateSessionDisplay(currentSession);
        if (isSessionRunningRef.current) {
          startSessionLoop();
        }
      } else {
        stopLoop();
        stopSessionLoop();
      }
    }
  }, [activeTab, isMobile, calculateElapsed, calculateSessionElapsed, startLoop, startSessionLoop, stopLoop, stopSessionLoop, updateDisplay, updateSessionDisplay]);

  const latestTabStateRef = useRef({
    activeTab,
    isMobile,
    startLoop,
    stopLoop,
    startSessionLoop,
    updateDisplay,
    updateSessionDisplay,
    calculateElapsed,
    calculateSessionElapsed,
  });
  useEffect(() => {
    latestTabStateRef.current = {
      activeTab,
      isMobile,
      startLoop,
      stopLoop,
      startSessionLoop,
      updateDisplay,
      updateSessionDisplay,
      calculateElapsed,
      calculateSessionElapsed,
    };
  }, [activeTab, isMobile, startLoop, stopLoop, startSessionLoop, updateDisplay, updateSessionDisplay, calculateElapsed, calculateSessionElapsed]);

  // Initial load & native/visibility listener registration (mount-only to prevent re-init on tab switches)
  useEffect(() => {
    let cancelled = false;
    const isNative = Capacitor.isNativePlatform();
    const isCurrentlyVisible = () => {
      const { isMobile: mob, activeTab: tab } = latestTabStateRef.current;
      return mob ? isVisibleRef.current : (tab === 'stopwatch');
    };

    const loadFromLocalStorage = () => {
      const storedRunning = localStorage.getItem(STORAGE_KEYS.RUNNING) === 'true';
      const storedStartTime = safeParseInt(localStorage.getItem(STORAGE_KEYS.START_TIME));
      const storedAccumulated = safeParseInt(localStorage.getItem(STORAGE_KEYS.ACCUMULATED));

      accumulatedRef.current = storedAccumulated;
      startTimeRef.current = storedStartTime;
      setRunningState(storedRunning);

      if (storedRunning && storedStartTime > 0) {
        const cur = storedAccumulated + Math.max(0, Date.now() - storedStartTime);
        latestTabStateRef.current.updateDisplay(cur);
        if (isCurrentlyVisible()) {
          latestTabStateRef.current.startLoop();
        }
      } else {
        latestTabStateRef.current.updateDisplay(storedAccumulated);
      }
    };

    // Always restore session timer from localStorage
    const storedSessionRunning = localStorage.getItem(SESSION_STORAGE_KEYS.RUNNING) === 'true';
    const storedSessionStart = safeParseInt(localStorage.getItem(SESSION_STORAGE_KEYS.START_TIME));
    const storedSessionAccumulated = safeParseInt(localStorage.getItem(SESSION_STORAGE_KEYS.ACCUMULATED));

    sessionAccumulatedRef.current = storedSessionAccumulated;
    sessionStartTimeRef.current = storedSessionStart;
    setSessionRunningState(storedSessionRunning);

    if (storedSessionRunning && storedSessionStart > 0) {
      const curSession = storedSessionAccumulated + Math.max(0, Date.now() - storedSessionStart);
      latestTabStateRef.current.updateSessionDisplay(curSession);
      if (isCurrentlyVisible()) {
        latestTabStateRef.current.startSessionLoop();
      }
    } else {
      latestTabStateRef.current.updateSessionDisplay(storedSessionAccumulated);
    }

    let listenerHandle = null;
    if (isNative) {
      // Request notification permission on Android 13+
      if (Stopwatch.requestNotificationPermission) {
        Stopwatch.requestNotificationPermission().catch(() => {});
      }

      // Initialize persistent notification service
      if (Stopwatch.init) {
        Stopwatch.init().catch(() => {});
      }

      // Query native state
      Stopwatch.getState()
        .then((state) => {
          if (cancelled || !state) return;
          const running = !!state.isRunning;
          accumulatedRef.current = state.accumulatedTime || 0;
          startTimeRef.current = state.startTime || 0;
          setRunningState(running);
          const t = state.time || 0;
          latestTabStateRef.current.updateDisplay(t);
          if (running && isCurrentlyVisible()) {
            latestTabStateRef.current.startLoop();
          }
        })
        .catch(() => {
          if (!cancelled) loadFromLocalStorage();
        });

      // Listen for notification action events (Pause / Resume / Reset)
      Stopwatch.addListener('stopwatchChange', (data) => {
        if (cancelled || !data) return;
        const running = !!data.isRunning;
        const acc = data.accumulatedTime || 0;
        const st = data.startTime || 0;
        accumulatedRef.current = acc;
        startTimeRef.current = st;
        setRunningState(running);

        if (!running) {
          localStorage.setItem(STORAGE_KEYS.ACCUMULATED, acc.toString());
          localStorage.setItem(STORAGE_KEYS.START_TIME, '0');
        } else {
          localStorage.setItem(STORAGE_KEYS.START_TIME, st.toString());
          localStorage.setItem(STORAGE_KEYS.ACCUMULATED, acc.toString());
        }

        const currentElapsed = data.time != null
          ? data.time
          : (running && st > 0 ? (acc + Math.max(0, Date.now() - st)) : acc);
        latestTabStateRef.current.updateDisplay(currentElapsed);
        if (running && isCurrentlyVisible()) {
          latestTabStateRef.current.startLoop();
        } else {
          latestTabStateRef.current.stopLoop();
        }
      }).then((handle) => {
        if (cancelled) {
          handle?.remove?.();
        } else {
          listenerHandle = handle;
        }
      });
    } else {
      loadFromLocalStorage();
    }

    const resync = () => {
      if (cancelled) return;
      const isVisible = isCurrentlyVisible();

      const s = latestTabStateRef.current.calculateSessionElapsed();
      latestTabStateRef.current.updateSessionDisplay(s);
      if (isSessionRunningRef.current && isVisible) {
        latestTabStateRef.current.startSessionLoop();
      }

      if (isNative) {
        Stopwatch.getState().then((state) => {
          if (cancelled || !state) return;
          const running = !!state.isRunning;
          accumulatedRef.current = state.accumulatedTime || 0;
          startTimeRef.current = state.startTime || 0;
          setRunningState(running);
          const t = state.time || 0;
          latestTabStateRef.current.updateDisplay(t);
          if (running && isVisible) {
            latestTabStateRef.current.startLoop();
          }
        }).catch(() => {
          if (cancelled) return;
          const t = latestTabStateRef.current.calculateElapsed();
          latestTabStateRef.current.updateDisplay(t);
        });
      } else {
        const t = latestTabStateRef.current.calculateElapsed();
        latestTabStateRef.current.updateDisplay(t);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    let appStateHandle = null;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        resync();
      }
    }).then((handle) => {
      if (cancelled) {
        handle?.remove?.();
      } else {
        appStateHandle = handle;
      }
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (listenerHandle?.remove) listenerHandle.remove();
      if (appStateHandle?.remove) appStateHandle.remove();
    };
  }, []);

  useLayoutEffect(() => {
    updateDisplay(calculateElapsed());
    updateSessionDisplay(calculateSessionElapsed());
  }, [isMobile, activeTab, isRunning, isSessionRunning, calculateElapsed, calculateSessionElapsed, updateDisplay, updateSessionDisplay]);

  // Cleanup intervals/frames on unmount
  useEffect(() => {
    return () => {
      stopLoop();
      stopSessionLoop();
    };
  }, [stopLoop, stopSessionLoop]);

  const startSessionTimer = (now = Date.now()) => {
    sessionStartTimeRef.current = now;
    setSessionRunningState(true);
    updateSessionDisplay(calculateSessionElapsed());
    startSessionLoop();
    localStorage.setItem(SESSION_STORAGE_KEYS.START_TIME, now.toString());
  };

  const handleSessionStartStop = () => {
    if (isSessionRunning) {
      const now = Date.now();
      const currentElapsed = sessionAccumulatedRef.current + (sessionStartTimeRef.current > 0 ? Math.max(0, now - sessionStartTimeRef.current) : 0);
      sessionAccumulatedRef.current = currentElapsed;
      sessionStartTimeRef.current = 0;
      setSessionRunningState(false);
      stopSessionLoop();
      updateSessionDisplay(currentElapsed);

      localStorage.setItem(SESSION_STORAGE_KEYS.ACCUMULATED, currentElapsed.toString());
      localStorage.setItem(SESSION_STORAGE_KEYS.START_TIME, '0');
    } else {
      startSessionTimer();
    }
  };

  const handleSessionReset = () => {
    sessionAccumulatedRef.current = 0;
    sessionStartTimeRef.current = 0;
    setSessionRunningState(false);
    stopSessionLoop();
    updateSessionDisplay(0);

    localStorage.setItem(SESSION_STORAGE_KEYS.ACCUMULATED, '0');
    localStorage.setItem(SESSION_STORAGE_KEYS.START_TIME, '0');
  };

  const handleStartStop = async () => {
    const isNative = Capacitor.isNativePlatform();
    if (isRunning) {
      // Pause
      const now = Date.now();
      const currentElapsed = accumulatedRef.current + (startTimeRef.current > 0 ? Math.max(0, now - startTimeRef.current) : 0);
      accumulatedRef.current = currentElapsed;
      startTimeRef.current = 0;
      setRunningState(false);
      stopLoop();
      updateDisplay(currentElapsed);

      localStorage.setItem(STORAGE_KEYS.ACCUMULATED, currentElapsed.toString());
      localStorage.setItem(STORAGE_KEYS.START_TIME, '0');

      if (isNative) {
        try {
          await Stopwatch.pause();
        } catch {
          // Handled safely
        }
      }
    } else {
      // Start / Resume
      const now = Date.now();
      startTimeRef.current = now;
      setRunningState(true);
      updateDisplay(calculateElapsed());
      startLoop();

      localStorage.setItem(STORAGE_KEYS.START_TIME, now.toString());

      // Auto-start session timer on first rest start if not yet started
      if (!isSessionRunningRef.current && sessionAccumulatedRef.current === 0) {
        startSessionTimer(now);
      }

      if (isNative) {
        try {
          await Stopwatch.start();
        } catch {
          // Handled safely
        }
      }
    }
  };

  const handleReset = async () => {
    const isNative = Capacitor.isNativePlatform();
    accumulatedRef.current = 0;
    startTimeRef.current = 0;
    setRunningState(false);
    stopLoop();
    updateDisplay(0);

    localStorage.setItem(STORAGE_KEYS.ACCUMULATED, '0');
    localStorage.setItem(STORAGE_KEYS.START_TIME, '0');

    if (isNative) {
      try {
        await Stopwatch.reset();
      } catch {
        // Handled safely
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`swipe-view ${activeTab === 'stopwatch' ? 'active-desktop' : ''}`}
      id="view-stopwatch"
      style={{ justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}
    >
      {(isMobile || activeTab === 'stopwatch') && (
        <>
          <div
            className="mobile-editor-pill-nav"
            style={{
              position: 'absolute',
              top: '18px',
              right: '12px',
              margin: 0,
              height: '46px',
              gap: '10px',
              padding: '4px 4px 4px 14px'
            }}
          >
            <span style={{ fontSize: '0.8rem', lineHeight: 1, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.5)' }}>
              Session
            </span>
            <span
              ref={sessionDisplayRef}
              style={{
                fontSize: '1.1rem',
                lineHeight: 1,
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                color: '#fff',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <button
                className={isSessionRunning ? 'btn' : 'btn btn-primary'}
                onClick={handleSessionStartStop}
                aria-label={isSessionRunning ? 'Pause session timer' : 'Start session timer'}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '99px',
                  padding: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  ...(isSessionRunning ? { background: 'rgba(255, 255, 255, 0.12)', border: '1px solid var(--border-color)', color: '#fff' } : { boxShadow: '0 4px 12px var(--accent-primary-glow)' })
                }}
              >
                {isSessionRunning ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button
                className="btn"
                onClick={handleSessionReset}
                aria-label="Reset session timer"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '99px',
                  padding: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-color)',
                  color: '#fff'
                }}
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px', width: '100%', maxWidth: '360px', padding: '20px' }}>
            <div
              ref={timeDisplayRef}
              style={{
                fontSize: '4.5rem',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                color: '#fff',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-2px'
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleStartStop}
                style={{ width: '100%', height: '100px', borderRadius: '99px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.6rem', fontWeight: 'normal', gap: '16px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)' }}
              >
                {isRunning ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <button 
                className="btn" 
                onClick={handleReset}
                style={{ width: '100%', height: '100px', borderRadius: '99px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--border-color)', fontSize: '1.6rem', fontWeight: 'normal', gap: '16px', color: '#fff', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)' }}
              >
                <RotateCcw size={32} />
                Reset
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default StopwatchTab;
