export const PROFILE_STORAGE_KEY = 'iron_stats_profile_v1';

export const CIRCUMFERENCE_FIELDS = [
  { key: 'neck', label: 'Neck', bilateral: false },
  { key: 'shoulders', label: 'Shoulders', bilateral: false },
  { key: 'chest', label: 'Chest', bilateral: false },
  { key: 'waist', label: 'Waist', bilateral: false },
  { key: 'hips', label: 'Hips', bilateral: false },
  { key: 'arm', label: 'Arm', bilateral: true, leftKey: 'armLeft', rightKey: 'armRight' },
  { key: 'forearm', label: 'Forearm', bilateral: true, leftKey: 'forearmLeft', rightKey: 'forearmRight' },
  { key: 'thigh', label: 'Thigh', bilateral: true, leftKey: 'thighLeft', rightKey: 'thighRight' },
  { key: 'calf', label: 'Calf', bilateral: true, leftKey: 'calfLeft', rightKey: 'calfRight' },
];

export const DEFAULT_PROFILE = {
  current: {
    birthDate: '1998-01-01',
    sex: 'M',
    weight: 78.5,
    height: 178,
    bodyFat: 13.5,
    neck: 39.0,
    shoulders: 122.0,
    chest: 106.0,
    waist: 79.0,
    hips: 96.0,
    armLeft: 39.5,
    armRight: 39.5,
    forearmLeft: 31.5,
    forearmRight: 31.5,
    thighLeft: 59.0,
    thighRight: 59.0,
    calfLeft: 38.5,
    calfRight: 38.5,
    avgSteps: 8000,
  },
  logs: [],
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw);
    const saved = parsed.current || {};
    const current = { ...DEFAULT_PROFILE.current, ...saved };

    // Migrate legacy single-value limbs if L/R keys are absent
    for (const field of CIRCUMFERENCE_FIELDS) {
      if (!field.bilateral) continue;
      const legacyVal = saved[field.key];
      if (legacyVal !== undefined) {
        if (saved[field.leftKey] === undefined) current[field.leftKey] = legacyVal;
        if (saved[field.rightKey] === undefined) current[field.rightKey] = legacyVal;
      }
    }

    const logs = Array.isArray(parsed.logs) ? parsed.logs : [];

    return { current, logs };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function getLimbAverage(current, field) {
  if (!field.bilateral) return Number(current?.[field.key] || 0);
  const l = Number(current?.[field.leftKey] || 0);
  const r = Number(current?.[field.rightKey] || 0);
  if (l > 0 && r > 0) return (l + r) / 2;
  return l || r || 0;
}

export function calcAge(birthDateStr, refDate = new Date()) {
  if (!birthDateStr || typeof birthDateStr !== 'string') return null;
  const parts = birthDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const dob = new Date(y, m - 1, d);
  if (Number.isNaN(dob.getTime())) return null;

  let age = refDate.getFullYear() - y;
  const monthDiff = refDate.getMonth() - (m - 1);
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < d)) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? age : null;
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

const safePositive = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function calcBMI(weightKg, heightCm) {
  const w = safePositive(weightKg);
  const h = safePositive(heightCm) / 100;
  if (!w || !h) return 0;
  return w / (h * h);
}

export function getBMICategory(bmi) {
  if (!bmi) return '—';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

export function calcLeanMass(weightKg, bodyFatPct) {
  const w = safePositive(weightKg);
  const bf = Math.min(Math.max(Number(bodyFatPct) || 0, 0), 75);
  return w * (1 - bf / 100);
}

export function calcFatMass(weightKg, bodyFatPct) {
  const w = safePositive(weightKg);
  return Math.max(0, w - calcLeanMass(w, bodyFatPct));
}

export function calcFFMI(weightKg, heightCm, bodyFatPct) {
  const lbm = calcLeanMass(weightKg, bodyFatPct);
  const h = safePositive(heightCm) / 100;
  if (!lbm || !h) return { ffmi: 0, normalizedFfmi: 0, category: '—' };
  const ffmi = lbm / (h * h);
  const normalizedFfmi = ffmi + 6.1 * (1.8 - h);
  let category = 'Average';
  if (normalizedFfmi >= 25) category = 'Elite Natural';
  else if (normalizedFfmi >= 23) category = 'Advanced';
  else if (normalizedFfmi >= 21) category = 'Athletic';
  else if (normalizedFfmi >= 19) category = 'Intermediate';
  else if (normalizedFfmi < 17) category = 'Beginner';
  return { ffmi, normalizedFfmi, category };
}

export function calcKatchMcArdleBMR(lbmKg) {
  const lbm = safePositive(lbmKg);
  if (!lbm) return 0;
  return 370 + 21.6 * lbm;
}

export function calcTDEEFromSteps({ bmr, weightKg, avgSteps = 0 }) {
  const baseBmr = safePositive(bmr);
  const w = safePositive(weightKg, 70);
  if (!baseBmr) return { tdee: 0, baseline: 0, stepsKcal: 0 };

  const baseline = baseBmr * 1.15;
  const safeSteps = Math.max(0, Number(avgSteps) || 0);
  const stepsKcal = 0.04 * (w / 70) * safeSteps;

  return {
    tdee: baseline + stepsKcal,
    baseline,
    stepsKcal,
  };
}

export function calcWaistToHeight(waistCm, heightCm) {
  const w = safePositive(waistCm);
  const h = safePositive(heightCm);
  if (!w || !h) return 0;
  return w / h;
}

export function calcVTaper(shouldersCm, waistCm) {
  const s = safePositive(shouldersCm);
  const w = safePositive(waistCm);
  if (!s || !w) return 0;
  return s / w;
}

export function calcChestToWaist(chestCm, waistCm) {
  const c = safePositive(chestCm);
  const w = safePositive(waistCm);
  if (!c || !w) return 0;
  return c / w;
}

const clampScore = (val) => Math.round(Math.min(99, Math.max(20, val)));

const scaleLinear = (val, minVal, maxVal) => {
  if (!Number.isFinite(val) || maxVal === minVal) return 50;
  return clampScore(25 + ((val - minVal) / (maxVal - minVal)) * 70);
};

/**
 * Computes 6 normalized (20-99) radar axes for Current and optional Previous snapshot.
 * Benchmarks are height-normalized so athletes of any stature get fair proportional scores.
 */
export function computeRadarAxes(current, compare = null) {
  const h = safePositive(current?.height, 175);
  const hasCompare = Boolean(compare);
  const cmpH = hasCompare ? safePositive(compare?.height, h) : h;

  const curFfmi = calcFFMI(current?.weight, h, current?.bodyFat).normalizedFfmi;
  const cmpFfmi = hasCompare
    ? calcFFMI(compare?.weight ?? current?.weight, cmpH, compare?.bodyFat ?? current?.bodyFat).normalizedFfmi
    : null;

  const ratio = (obj, key, heightVal) => safePositive(obj?.[key]) / heightVal;

  return [
    {
      key: 'shoulders',
      label: 'SHOULDERS',
      scoreA: scaleLinear(ratio(current, 'shoulders', h), 0.58, 0.75),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'shoulders', cmpH), 0.58, 0.75) : null,
      rawA: safePositive(current?.shoulders),
      rawB: hasCompare ? safePositive(compare?.shoulders) : null,
      unit: 'cm',
    },
    {
      key: 'chest',
      label: 'CHEST',
      scoreA: scaleLinear(ratio(current, 'chest', h), 0.50, 0.66),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'chest', cmpH), 0.50, 0.66) : null,
      rawA: safePositive(current?.chest),
      rawB: hasCompare ? safePositive(compare?.chest) : null,
      unit: 'cm',
    },
    {
      key: 'arm',
      label: 'ARMS',
      scoreA: scaleLinear(ratio(current, 'arm', h), 0.175, 0.255),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'arm', cmpH), 0.175, 0.255) : null,
      rawA: safePositive(current?.arm),
      rawB: hasCompare ? safePositive(compare?.arm) : null,
      unit: 'cm',
    },
    {
      key: 'waist',
      label: 'WAIST',
      // Lower waist-to-height ratio yields a higher conditioning score
      scoreA: scaleLinear(0.58 - ratio(current, 'waist', h), 0.02, 0.17),
      scoreB: hasCompare ? scaleLinear(0.58 - ratio(compare, 'waist', cmpH), 0.02, 0.17) : null,
      rawA: safePositive(current?.waist),
      rawB: hasCompare ? safePositive(compare?.waist) : null,
      unit: 'cm',
    },
    {
      key: 'thigh',
      label: 'THIGHS',
      scoreA: scaleLinear(ratio(current, 'thigh', h), 0.275, 0.375),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'thigh', cmpH), 0.275, 0.375) : null,
      rawA: safePositive(current?.thigh),
      rawB: hasCompare ? safePositive(compare?.thigh) : null,
      unit: 'cm',
    },
    {
      key: 'ffmi',
      label: 'FFMI',
      scoreA: scaleLinear(curFfmi, 17.5, 25.5),
      scoreB: hasCompare ? scaleLinear(cmpFfmi, 17.5, 25.5) : null,
      rawA: Number(curFfmi.toFixed(1)),
      rawB: hasCompare ? Number(cmpFfmi.toFixed(1)) : null,
      unit: '',
    },
  ];
}
