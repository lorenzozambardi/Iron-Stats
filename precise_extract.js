const fs = require('fs');
const lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

const stateCode = lines.slice(279, 291).join('\n'); // 280-291
const compCode = lines.slice(925, 1438).join('\n'); // 926-1438
const jsxCode = lines.slice(1837, 2464).join('\n'); // 1838-2464

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
${stateCode}

${compCode}

  return (
${jsxCode}
  );
};

export default React.memo(DashboardTab);
`;

fs.writeFileSync('frontend/src/components/tabs/DashboardTab.jsx', out);
