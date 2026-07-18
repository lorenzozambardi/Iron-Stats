const fs = require('fs');
let lines = fs.readFileSync('frontend/src/App.jsx', 'utf8').split('\n');

const fuzzyStart = lines.findIndex(l => l.includes('// Fuzzy match helper'));
const fuzzyEnd = fuzzyStart + 16;

const dbStart = lines.findIndex(l => l.includes('{/* TAB CONTENT: EXERCISE DATABASE */}'));
const dbEnd = lines.findIndex(l => l.includes('{/* TAB CONTENT: GENERATOR */}'));

let newLines = [];
for (let i = 0; i < lines.length; i++) {
  if (i >= fuzzyStart && i < fuzzyEnd) continue;
  if (i >= dbStart && i < dbEnd) {
    if (i === dbStart) {
      newLines.push(`        {/* TAB CONTENT: EXERCISE DATABASE */}`);
      newLines.push(`        <DatabaseTab
          isMobile={isMobile}
          activeTab={activeTab}
          activeExercises={activeExercises}
          handleOpenAddExercise={handleOpenAddExercise}
          handleOpenEditExercise={handleOpenEditExercise}
          debouncedLogbookText={debouncedLogbookText}
          currentProgram={currentProgram}
        />`);
    }
    continue;
  }
  
  // Add fuzzyScore to imports
  if (lines[i].includes("import { formatRestTime, groupSets } from './components/helpers';")) {
    newLines.push("import { formatRestTime, groupSets, fuzzyScore } from './components/helpers';");
    continue;
  }

  // Add DatabaseTab to imports
  if (lines[i].includes("import DashboardTab from './components/tabs/DashboardTab';")) {
    newLines.push("import DatabaseTab from './components/tabs/DatabaseTab';");
    newLines.push(lines[i]);
    continue;
  }

  // Also, remove exerciseSearch and muscleSearch if the parent removed them.
  // Wait, parent removed `exerciseSearch` from state.
  if (lines[i].includes("const [exerciseSearch, setExerciseSearch] = useState('');")) {
    continue;
  }

  newLines.push(lines[i]);
}

fs.writeFileSync('frontend/src/App.jsx', newLines.join('\n'));
