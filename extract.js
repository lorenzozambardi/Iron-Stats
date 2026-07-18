const fs = require('fs');
const appJsx = fs.readFileSync('frontend/src/App.jsx', 'utf8');

const stateMatch = appJsx.substring(appJsx.indexOf('  // Dashboard filter state'), appJsx.indexOf('const activeExercises = useMemo'));
const stateExtraMatch = appJsx.substring(appJsx.indexOf('const [muscleMetric'), appJsx.indexOf('const [isMobileMenuOpen'));

const compMatch = appJsx.substring(appJsx.indexOf('  // Calculated Metrics'), appJsx.indexOf('  return ('));

const jsxMatch = appJsx.substring(appJsx.indexOf('{/* DASHBOARD VIEW */}'), appJsx.indexOf('{/* TAB CONTENT: EXERCISE DATABASE */}'));

const out = `import React, { useState, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Info, TrendingUp } from 'lucide-react';
import { MUSCLES, calculateMetrics, parseLogbook } from '../../parser';
import MetricDetailsPage from '../MetricDetails';
import { renderMetricTooltip } from '../Tooltips';
import { solveBezierY } from '../helpers';

const DashboardTab = ({
  isMobile,
  activeTab,
  workoutData,
  currentProgram,
  programs,
  activeExercises,
  exercisesDb,
  selectedMetricDetail,
  setSelectedMetricDetail,
  scrollToTab,
  setSelectedSession
}) => {
${stateExtraMatch}
${stateMatch}
${compMatch}
  return (
    ${jsxMatch.trim()}
  );
};

export default React.memo(DashboardTab);
`;

fs.writeFileSync('frontend/src/components/tabs/DashboardTab.jsx', out);
