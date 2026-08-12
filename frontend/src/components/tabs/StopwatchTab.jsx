import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const StopwatchTab = React.memo(({ activeTab, isMobile }) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    if (isRunning) {
      lastUpdateRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const dt = now - lastUpdateRef.current;
        setTime((prev) => prev + dt);
        lastUpdateRef.current = now;
      }, 10);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const handleStartStop = () => setIsRunning(!isRunning);
  
  const handleReset = () => {
    setIsRunning(false);
    setTime(0);
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
