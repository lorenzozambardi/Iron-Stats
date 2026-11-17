export const PROFILE_STORAGE_KEY = 'iron_stats_profile_v1';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary (1.2×)' },
  { value: 1.375, label: 'Light (1.375×)' },
  { value: 1.55, label: 'Moderate (1.55×)' },
  { value: 1.725, label: 'High / Athlete (1.725×)' },
  { value: 1.9, label: 'Extreme (1.9×)' },
];

export const CIRCUMFERENCE_FIELDS = [
  { key: 'neck', label: 'Neck', hasTarget: false },
  { key: 'shoulders', label: 'Shoulders', hasTarget: true },
  { key: 'chest', label: 'Chest', hasTarget: true },
  { key: 'waist', label: 'Waist', hasTarget: true },
  { key: 'hips', label: 'Hips', hasTarget: false },
  { key: 'arm', label: 'Arm', hasTarget: true },
  { key: 'forearm', label: 'Forearm', hasTarget: false },
  { key: 'thigh', label: 'Thigh', hasTarget: true },
  { key: 'calf', label: 'Calf', hasTarget: true },
];

export const DEFAULT_PROFILE = {
  current: {
    weight: 78.5,
    height: 178,
    bodyFat: 13.5,
    neck: 39.0,
    shoulders: 122.0,
    chest: 106.0,
    waist: 79.0,
    hips: 96.0,
    arm: 39.5,
    forearm: 31.5,
    thigh: 59.0,
    calf: 38.5,
    activityFactor: 1.55,
    sex: 'male',
  },
  targets: {
    weight: 82.0,
    bodyFat: 10.5,
    shoulders: 126.0,
    chest: 110.0,
    waist: 76.0,
    arm: 42.0,
    thigh: 62.0,
    calf: 40.5,
  },
  history: [],
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw);
    return {
      current: { ...DEFAULT_PROFILE.current, ...(parsed.current || {}) },
      targets: { ...DEFAULT_PROFILE.targets, ...(parsed.targets || {}) },
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
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

export function calcNavyBodyFat({ sex = 'male', heightCm, waistCm, neckCm, hipsCm }) {
  const h = safePositive(heightCm);
  const w = safePositive(waistCm);
  const n = safePositive(neckCm);
  if (!h || !w || !n) return null;

  if (sex === 'female') {
    const hip = safePositive(hipsCm);
    const diff = w + hip - n;
    if (!hip || diff <= 0) return null;
    const bf = 495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.221 * Math.log10(h)) - 450;
    return Math.min(Math.max(bf, 5), 60);
  }

  const diff = w - n;
  if (diff <= 0) return null;
  const bf = 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(h)) - 450;
  return Math.min(Math.max(bf, 3), 55);
}

const clampScore = (val) => Math.round(Math.min(99, Math.max(20, val)));

const scaleLinear = (val, minVal, maxVal) => {
  if (!Number.isFinite(val) || maxVal === minVal) return 50;
  return clampScore(25 + ((val - minVal) / (maxVal - minVal)) * 70);
};

/**
 * Computes 6 normalized (20-99) radar axes for Current vs Compare (Target or Previous).
 * Benchmarks are height-normalized so athletes of any stature get fair proportional scores.
 */
export function computeRadarAxes(current, compare) {
  const h = safePositive(current?.height, 175);
  const cmpH = safePositive(compare?.height, h);

  const curFfmi = calcFFMI(current?.weight, h, current?.bodyFat).normalizedFfmi;
  const cmpFfmi = calcFFMI(compare?.weight ?? current?.weight, cmpH, compare?.bodyFat ?? current?.bodyFat).normalizedFfmi;

  const ratio = (obj, key, heightVal) => safePositive(obj?.[key]) / heightVal;

  return [
    {
      key: 'shoulders',
      label: 'SHOULDERS',
      scoreA: scaleLinear(ratio(current, 'shoulders', h), 0.58, 0.75),
      scoreB: scaleLinear(ratio(compare, 'shoulders', cmpH), 0.58, 0.75),
      rawA: safePositive(current?.shoulders),
      rawB: safePositive(compare?.shoulders),
      unit: 'cm',
    },
    {
      key: 'chest',
      label: 'CHEST',
      scoreA: scaleLinear(ratio(current, 'chest', h), 0.50, 0.66),
      scoreB: scaleLinear(ratio(compare, 'chest', cmpH), 0.50, 0.66),
      rawA: safePositive(current?.chest),
      rawB: safePositive(compare?.chest),
      unit: 'cm',
    },
    {
      key: 'arm',
      label: 'ARMS',
      scoreA: scaleLinear(ratio(current, 'arm', h), 0.175, 0.255),
      scoreB: scaleLinear(ratio(compare, 'arm', cmpH), 0.175, 0.255),
      rawA: safePositive(current?.arm),
      rawB: safePositive(compare?.arm),
      unit: 'cm',
    },
    {
      key: 'waist',
      label: 'WAIST',
      // Lower waist-to-height ratio yields a higher conditioning score
      scoreA: scaleLinear(0.58 - ratio(current, 'waist', h), 0.02, 0.17),
      scoreB: scaleLinear(0.58 - ratio(compare, 'waist', cmpH), 0.02, 0.17),
      rawA: safePositive(current?.waist),
      rawB: safePositive(compare?.waist),
      unit: 'cm',
    },
    {
      key: 'thigh',
      label: 'THIGHS',
      scoreA: scaleLinear(ratio(current, 'thigh', h), 0.275, 0.375),
      scoreB: scaleLinear(ratio(compare, 'thigh', cmpH), 0.275, 0.375),
      rawA: safePositive(current?.thigh),
      rawB: safePositive(compare?.thigh),
      unit: 'cm',
    },
    {
      key: 'ffmi',
      label: 'FFMI',
      scoreA: scaleLinear(curFfmi, 17.5, 25.5),
      scoreB: scaleLinear(cmpFfmi, 17.5, 25.5),
      rawA: Number(curFfmi.toFixed(1)),
      rawB: Number(cmpFfmi.toFixed(1)),
      unit: '',
    },
  ];
}
