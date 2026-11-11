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

// 3-point Gauss-Legendre nodes and weights mapped to [0, 1] (exact up to degree 5).
const GL3_HALF_STEP = Math.sqrt(3.0 / 5.0) * 0.5;
const GL3_T = [0.5 - GL3_HALF_STEP, 0.5, 0.5 + GL3_HALF_STEP];
const GL3_W = [5.0 / 18.0, 8.0 / 18.0, 5.0 / 18.0];

export const validateBezierProfile = (x0, y0, x1, y1, x2, y2, x3, y3, magnitude = 0) => {
  if (!(0.0 <= x0 && x0 < x1 && x1 < x2 && x2 < x3 && x3 <= 1.0)) {
    throw new RangeError(`Non-monotone or out-of-domain Bezier x profile: ${x0}, ${x1}, ${x2}, ${x3}`);
  }
  if (Math.min(y0, y1, y2, y3) < 0.0) {
    throw new RangeError(`Negative Bezier y control point: ${y0}, ${y1}, ${y2}, ${y3}`);
  }
  if (magnitude < 0.0) {
    throw new RangeError(`Negative Bezier magnitude: ${magnitude}`);
  }
};

export const bezierArea = (x0, y0, x1, y1, x2, y2, x3, y3) => {
  validateBezierProfile(x0, y0, x1, y1, x2, y2, x3, y3);
  const dx0 = x1 - x0;
  const dx1 = x2 - x1;
  const dx2 = x3 - x2;
  let area = 0.0;
  for (let k = 0; k < 3; k++) {
    const t = GL3_T[k];
    const u = 1.0 - t;
    const u2 = u * u;
    const t2 = t * t;
    const y = (u2 * u) * y0 + 3.0 * u2 * t * y1 + 3.0 * u * t2 * y2 + (t2 * t) * y3;
    const xp = 3.0 * u2 * dx0 + 6.0 * u * t * dx1 + 3.0 * t2 * dx2;
    area += GL3_W[k] * y * xp;
  }
  return area;
};

export const bezierPartialFraction = (x0, y0, x1, y1, x2, y2, x3, y3, xCut = 0.3333) => {
  const totalArea = bezierArea(x0, y0, x1, y1, x2, y2, x3, y3);
  if (totalArea <= 0.0 || xCut <= x0) return 0.0;
  if (xCut >= x3) return 1.0;

  let lower = 0.0;
  let upper = 1.0;
  let tCut = 0.5;
  for (let i = 0; i < 50; i++) {
    const u = 1.0 - tCut;
    const x = (u * u * u) * x0 + 3.0 * (u * u) * tCut * x1 + 3.0 * u * (tCut * tCut) * x2 + (tCut * tCut * tCut) * x3;
    if (Math.abs(x - xCut) < 1e-12 && (upper - lower) < 1e-12) break;
    if (x < xCut) lower = tCut;
    else upper = tCut;
    tCut = 0.5 * (lower + upper);
  }

  const dx0 = x1 - x0;
  const dx1 = x2 - x1;
  const dx2 = x3 - x2;
  let subArea = 0.0;
  for (let k = 0; k < 3; k++) {
    const t = tCut * GL3_T[k];
    const u = 1.0 - t;
    const u2 = u * u;
    const t2 = t * t;
    const y = (u2 * u) * y0 + 3.0 * u2 * t * y1 + 3.0 * u * t2 * y2 + (t2 * t) * y3;
    const xp = 3.0 * u2 * dx0 + 6.0 * u * t * dx1 + 3.0 * t2 * dx2;
    subArea += (tCut * GL3_W[k]) * y * xp;
  }
  return Math.min(1.0, Math.max(0.0, subArea / totalArea));
};

export const solveBezierY = (targetX, x0, y0, x1, y1, x2, y2, x3, y3) => {
  validateBezierProfile(x0, y0, x1, y1, x2, y2, x3, y3);
  if (targetX < x0) return 0.0;
  if (targetX > x3) return 0.0;
  if (targetX === x0) return y0;
  if (targetX === x3) return y3;

  let lower = 0;
  let upper = 1;
  let t = 0.5;
  for (let i = 0; i < 30; i++) {
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    const x = u3 * x0 + 3 * u2 * t * x1 + 3 * u * t2 * x2 + t3 * x3;
    if (Math.abs(x - targetX) < 1e-6 && (upper - lower) < 1e-6) break;
    if (x < targetX) lower = t;
    else upper = t;
    t = (lower + upper) * 0.5;
  }
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return u3 * y0 + 3 * u2 * t * y1 + 3 * u * t2 * y2 + t3 * y3;
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

export const fuzzyScore = (needle, haystack) => {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let ni = 0, score = 0, lastMatch = -1;
  for (let hi = 0; hi < h.length && ni < n.length; hi++) {
    if (h[hi] === n[ni]) {
      score += 10 - Math.min(hi - lastMatch - 1, 9); // bonus for consecutive
      lastMatch = hi;
      ni++;
    }
  }
  if (ni < n.length) return -1; // not a match
  return score;
};
