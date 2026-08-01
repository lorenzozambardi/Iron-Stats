function parseSetValToLoadRepsRpe(stVal) {
  if (!stVal) return { load: '', reps: '', rpe: '' };
  let rpe = '';
  let mainStr = stVal;
  const atIdx = stVal.indexOf('@');
  if (atIdx !== -1) {
    rpe = stVal.substring(atIdx + 1).trim();
    mainStr = stVal.substring(0, atIdx).trim();
  }

  const parts = mainStr.split('..');
  const load = parts[0] || '';
  const reps = parts.slice(1).join('..') || '';

  return { load, reps, rpe };
}

function combineLoadRepsRpeToSetVal(load, reps, rpe) {
  const l = (load || '').trim();
  const r = (reps || '').trim();
  const rp = (rpe || '').trim();

  if (!l && !r && !rp) return '';
  let base = `${l}..${r}`;
  if (rp) {
    base += `@${rp}`;
  }
  return base;
}

console.log('Test 1:', parseSetValToLoadRepsRpe("35..5@9"));
console.log('Combine 1:', combineLoadRepsRpeToSetVal("35", "5", "9"));
console.log('Test 2:', parseSetValToLoadRepsRpe("30..7@8.5"));
console.log('Combine 2:', combineLoadRepsRpeToSetVal("30", "7", "8.5"));
