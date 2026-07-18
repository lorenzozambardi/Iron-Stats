const fs = require('fs');
let appJsx = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// 1. Remove extra state
const stateExtraStart = appJsx.indexOf('  const [muscleMetric');
const stateExtraEnd = appJsx.indexOf('  const [isMobileMenuOpen');
appJsx = appJsx.substring(0, stateExtraStart) + appJsx.substring(stateExtraEnd);

// 2. Remove dashboard state
const stateStart = appJsx.indexOf('  // Dashboard filter state');
const stateEnd = appJsx.indexOf('  const activeExercises = useMemo');
appJsx = appJsx.substring(0, stateStart) + appJsx.substring(stateEnd);

// 3. Remove computations
const compStart = appJsx.indexOf('  // Calculated Metrics');
const compEnd = appJsx.indexOf('  return (');
appJsx = appJsx.substring(0, compStart) + appJsx.substring(compEnd);

// 4. Replace JSX
const jsxStart = appJsx.indexOf('{/* DASHBOARD VIEW */}');
const jsxEnd = appJsx.indexOf('{/* TAB CONTENT: EXERCISE DATABASE */}');
const replacementJsx = `{/* DASHBOARD VIEW */}
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
        `;
appJsx = appJsx.substring(0, jsxStart) + replacementJsx + appJsx.substring(jsxEnd);

// 5. Add import
const importDatabaseTab = "import DatabaseTab from './components/tabs/DatabaseTab';";
const importDashboardTab = "import DashboardTab from './components/tabs/DashboardTab';";
appJsx = appJsx.replace(importDatabaseTab, `${importDatabaseTab}\n${importDashboardTab}`);

fs.writeFileSync('frontend/src/App.jsx', appJsx);
