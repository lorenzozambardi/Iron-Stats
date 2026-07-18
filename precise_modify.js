const fs = require('fs');
const lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

const stateStart = 279;
const stateEnd = 291;
const compStart = 925;
const compEnd = 1438;
const jsxStart = 1837;
const jsxEnd = 2464;

let newLines = [];

for (let i = 0; i < lines.length; i++) {
  if (i >= stateStart && i < stateEnd) {
    continue;
  }
  if (i >= compStart && i < compEnd) {
    continue;
  }
  if (i >= jsxStart && i < jsxEnd) {
    if (i === jsxStart) {
      newLines.push(`        {/* DASHBOARD VIEW */}
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
        />`);
    }
    continue;
  }
  
  if (lines[i].includes("import DatabaseTab from './components/tabs/DatabaseTab';")) {
    newLines.push("import DashboardTab from './components/tabs/DashboardTab';");
  }
  
  newLines.push(lines[i]);
}

fs.writeFileSync('frontend/src/App.jsx', newLines.join('\n'));
