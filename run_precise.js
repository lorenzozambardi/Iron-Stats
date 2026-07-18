const fs = require('fs');

let lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

const stateStart = lines.findIndex(l => l.includes('// Dashboard filter state'));
const stateEnd = lines.findIndex(l => l.includes('const activeExercises = useMemo'));

const compStart = lines.findIndex(l => l.includes('// Calculated Metrics'));
const compEnd = lines.findIndex(l => l.includes('// Has any filter active?'));

const jsxStart = lines.findIndex(l => l.includes('{/* DASHBOARD VIEW */}'));
const jsxEnd = lines.findIndex(l => l.includes('{/* TAB CONTENT: EXERCISE DATABASE */}'));

const muscleMetricIdx = lines.findIndex(l => l.includes("const [muscleMetric"));
const progExIdx = lines.findIndex(l => l.includes("const [progressionExercise"));
const overallChartIdx = lines.findIndex(l => l.includes("const [overallChartMetric"));

console.log("Found indices:", {stateStart, stateEnd, compStart, compEnd, jsxStart, jsxEnd, muscleMetricIdx, progExIdx, overallChartIdx});

const stateCode = lines.slice(stateStart, stateEnd).join('\n');
const compCode = lines.slice(compStart, compEnd).join('\n');
const jsxCode = lines.slice(jsxStart + 1, jsxEnd).join('\n'); // exclude DASHBOARD VIEW comment

const dbTabCode = `import React, { useState, useMemo, useCallback } from 'react';
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
  const [muscleMetric, setMuscleMetric] = useState('effective');
  const [progressionExercise, setProgressionExercise] = useState('all_metrics');
  const [overallChartMetric, setOverallChartMetric] = useState('Volume');

${stateCode}

${compCode}

  return (
    <>
${jsxCode}
    </>
  );
};

export default React.memo(DashboardTab);
`;

fs.writeFileSync('frontend/src/components/tabs/DashboardTab.jsx', dbTabCode);

// Modifying App.jsx
let newLines = [];
for (let i = 0; i < lines.length; i++) {
  if (i === muscleMetricIdx || i === progExIdx || i === overallChartIdx) {
    continue;
  }
  if (i >= stateStart && i < stateEnd) {
    continue;
  }
  if (i >= compStart && i < compEnd) {
    continue;
  }
  if (i >= jsxStart && i < jsxEnd) {
    if (i === jsxStart) {
      newLines.push(`        {/* DASHBOARD VIEW */}`);
      newLines.push(`        <DashboardTab
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
        />`);
    }
    continue;
  }
  
  if (lines[i].includes("import DatabaseTab from './components/tabs/DatabaseTab';")) {
    newLines.push("import DatabaseTab from './components/tabs/DatabaseTab';");
    newLines.push("import DashboardTab from './components/tabs/DashboardTab';");
    continue;
  }

  // Need to make sure fuzzyScore is imported if it was used somewhere?
  // It was used in autocomplete. It's imported in helpers.
  // Wait, in main branch, fuzzyScore was in helpers?
  
  newLines.push(lines[i]);
}

fs.writeFileSync('frontend/src/App.jsx', newLines.join('\n'));

