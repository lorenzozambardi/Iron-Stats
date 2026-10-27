import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

const Stopwatch = registerPlugin('Stopwatch');

const STORAGE_KEYS = {
  RUNNING: 'iron_stats_stopwatch_running',
  START_TIME: 'iron_stats_stopwatch_start_time',
  ACCUMULATED: 'iron_stats_stopwatch_accumulated'
};

const StopwatchTab = React.memo(({ activeTab, isMobile }) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const isRunningRef = useRef(false);
  const animFrameRef = useRef(null);

  // Sync ref with state & localStorage
  const setRunningState = (running) => {
    isRunningRef.current = running;
    setIsRunning(running);
    localStorage.setItem(STORAGE_KEYS.RUNNING, running ? 'true' : 'false');
  };

  const calculateElapsed = useCallback(() => {
    if (isRunningRef.current && startTimeRef.current > 0) {
      return accumulatedRef.current + Math.max(0, Date.now() - startTimeRef.current);
    }
    return accumulatedRef.current;
  }, []);

  // Update timer loop using requestAnimationFrame for smooth display
  useEffect(() => {
    if (!isRunning) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let lastRender = 0;
    const tick = (now) => {
      // Update UI every ~20ms (50fps) to save battery while keeping smooth centiseconds
      if (now - lastRender >= 20) {
        lastRender = now;
        setTime(calculateElapsed());
      }
      if (isRunningRef.current) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isRunning, calculateElapsed]);

  // Initial load: sync with native plugin or localStorage
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

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
          if (state) {
            const running = !!state.isRunning;
            accumulatedRef.current = state.accumulatedTime || 0;
            startTimeRef.current = state.startTime || 0;
            setRunningState(running);
            setTime(state.time || 0);
          }
        })
        .catch(() => {
          loadFromLocalStorage();
        });

      // Listen for notification action events (Pause / Resume / Reset)
      let listenerHandle = null;
      Stopwatch.addListener('stopwatchChange', (data) => {
        if (data) {
          const running = !!data.isRunning;
          accumulatedRef.current = data.accumulatedTime || 0;
          startTimeRef.current = data.startTime || 0;
          setRunningState(running);

          const currentElapsed = data.time != null
            ? data.time
            : (running && data.startTime > 0
                ? (data.accumulatedTime + Math.max(0, Date.now() - data.startTime))
                : data.accumulatedTime);
          setTime(currentElapsed);
        }
      }).then((handle) => {
        listenerHandle = handle;
      });

      return () => {
        if (listenerHandle && listenerHandle.remove) {
          listenerHandle.remove();
        }
      };
    } else {
      loadFromLocalStorage();
    }

    function loadFromLocalStorage() {
      const storedRunning = localStorage.getItem(STORAGE_KEYS.RUNNING) === 'true';
      const storedStartTime = parseInt(localStorage.getItem(STORAGE_KEYS.START_TIME) || '0', 10);
      const storedAccumulated = parseInt(localStorage.getItem(STORAGE_KEYS.ACCUMULATED) || '0', 10);

      accumulatedRef.current = storedAccumulated;
      startTimeRef.current = storedStartTime;
      setRunningState(storedRunning);

      if (storedRunning && storedStartTime > 0) {
        setTime(storedAccumulated + Math.max(0, Date.now() - storedStartTime));
      } else {
        setTime(storedAccumulated);
      }
    }
  }, []);

  // When app returns to foreground / visibility change, resync display immediately
  useEffect(() => {
    const resync = () => {
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        Stopwatch.getState().then((state) => {
          if (state) {
            const running = !!state.isRunning;
            accumulatedRef.current = state.accumulatedTime || 0;
            startTimeRef.current = state.startTime || 0;
            setRunningState(running);
            setTime(state.time || 0);
          }
        }).catch(() => {
          setTime(calculateElapsed());
        });
      } else {
        setTime(calculateElapsed());
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
      appStateHandle = handle;
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (appStateHandle && appStateHandle.remove) {
        appStateHandle.remove();
      }
    };
  }, [calculateElapsed]);

  const handleStartStop = async () => {
    const isNative = Capacitor.isNativePlatform();
    if (isRunning) {
      // Pause
      const now = Date.now();
      const currentElapsed = accumulatedRef.current + (startTimeRef.current > 0 ? (now - startTimeRef.current) : 0);
      accumulatedRef.current = currentElapsed;
      startTimeRef.current = 0;
      setRunningState(false);
      setTime(currentElapsed);

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

      localStorage.setItem(STORAGE_KEYS.START_TIME, now.toString());

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
    setTime(0);

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

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`swipe-view ${activeTab === 'stopwatch' ? 'active-desktop' : ''}`} id="view-stopwatch" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '400px' }}>
      {(isMobile || activeTab === 'stopwatch') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px', width: '100%', maxWidth: '360px', padding: '20px' }}>
          
          <div style={{
            fontSize: '4.5rem',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-2px'
          }}>
            {formatTime(time)}
          </div>

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
      )}
    </div>
  );
});

export default StopwatchTab;
