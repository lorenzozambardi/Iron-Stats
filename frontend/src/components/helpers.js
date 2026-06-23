// Helper to format rest times using ' for minutes and " for seconds, avoiding fractions
export const formatRestTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) {
    return `${m}'${s}"`;
  } else if (m > 0) {
    return `${m}'`;
  } else {
    return `${s}"`;
  }
};

export const solveBezierY = (targetX, x0, y0, x1, y1, x2, y2, x3, y3) => {
  if (targetX < x0) return 0.0;
  if (targetX > x3) return 0.0;
  if (targetX === x0) return y0;
  if (targetX === x3) return y3;
  
  let lower = 0;
  let upper = 1;
  let t = 0.5;
  for (let i = 0; i < 15; i++) {
    const x = Math.pow(1 - t, 3) * x0 + 3 * Math.pow(1 - t, 2) * t * x1 + 3 * (1 - t) * Math.pow(t, 2) * x2 + Math.pow(t, 3) * x3;
    if (Math.abs(x - targetX) < 0.001) break;
    if (x < targetX) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }
  return Math.pow(1 - t, 3) * y0 + 3 * Math.pow(1 - t, 2) * t * y1 + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3) * y3;
};

export const getBezierCurveData = (musclesDistrList, resolution = 50) => {
  const data = [];
  for (let i = 0; i <= resolution; i++) {
    data.push({ x: i / resolution });
  }

  musclesDistrList.forEach((m) => {
    const x0 = m.x0 ?? 0.0;
    const y0 = m.y0 ?? 1.0;
    const x1 = m.x1 ?? 0.33;
    const y1 = m.y1 ?? 1.0;
    const x2 = m.x2 ?? 0.66;
    const y2 = m.y2 ?? 1.0;
    const x3 = m.x3 ?? 1.0;
    const y3 = m.y3 ?? 1.0;
    const magnitude = parseFloat(m.percentage) / 100.0;
    
    const rawY = [];
    let maxY = 0;
    for (let i = 0; i <= resolution; i++) {
      const x = i / resolution;
      const y = solveBezierY(x, x0, y0, x1, y1, x2, y2, x3, y3);
      rawY.push(y);
      if (y > maxY) maxY = y;
    }
    
    for (let i = 0; i <= resolution; i++) {
      if (maxY > 0) {
        data[i][m.name] = (rawY[i] / maxY) * magnitude;
      } else {
        data[i][m.name] = 0.0;
      }
    }
  });
  
  return data;
};

// Helper to group consecutive sets sharing the same dropsetId
export const groupSets = (sets) => {
  if (!sets) return [];
  const groups = [];
  let currentGroup = null;

  for (const s of sets) {
    if (s.dropsetId) {
      if (currentGroup && currentGroup.isDropset && currentGroup.dropsetId === s.dropsetId) {
        currentGroup.sets.push(s);
      } else {
        currentGroup = {
          isDropset: true,
          dropsetId: s.dropsetId,
          sets: [s]
        };
        groups.push(currentGroup);
      }
    } else {
      currentGroup = {
        isDropset: false,
        set: s
      };
      groups.push(currentGroup);
    }
  }
  return groups;
};

// A beautiful custom rendered live preview of the parsed logbook contents
