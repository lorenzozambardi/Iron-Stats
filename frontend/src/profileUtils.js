export const PROFILE_STORAGE_KEY = 'iron_stats_profile_v1';
export const DATE_FORMAT_STORAGE_KEY = 'iron_stats_date_format';

export const DATE_FORMATS = [
  { id: 'dd/mm/yyyy', label: 'DD/MM/YYYY' },
  { id: 'mm/dd/yyyy', label: 'MM/DD/YYYY' },
  { id: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
];

export function getDateFormat() {
  try {
    const saved = localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
    if (DATE_FORMATS.some((f) => f.id === saved)) return saved;
  } catch {
    // Ignore storage errors
  }
  return 'dd/mm/yyyy';
}

export function formatDisplayDate(isoDateStr, format = 'dd/mm/yyyy') {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  const [y, m, d] = parts;
  if (format === 'mm/dd/yyyy') return `${m}/${d}/${y}`;
  if (format === 'yyyy-mm-dd') return `${y}-${m}-${d}`;
  return `${d}/${m}/${y}`;
}

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
        delete current[field.key];
      }
    }

    const rawLogs = Array.isArray(parsed.logs) ? parsed.logs : [];
    const logs = [];
    for (const item of rawLogs) {
      if (item && (item.type === 'weight' || item.type === 'bodyFat')) {
        logs.push(item);
      } else if (item && (item.weight !== undefined || item.bodyFat !== undefined)) {
        if (item.weight !== undefined) {
          logs.push({ id: `${item.id}-w`, date: item.date, type: 'weight', value: Number(item.weight) });
        }
        if (item.bodyFat !== undefined) {
          logs.push({ id: `${item.id}-bf`, date: item.date, type: 'bodyFat', value: Number(item.bodyFat) });
        }
      }
    }

    return { current, logs };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function getLimbAverage(current, field) {
  if (!field.bilateral) return safePositive(current?.[field.key]);
  const l = safePositive(current?.[field.leftKey]);
  const r = safePositive(current?.[field.rightKey]);
  if (l > 0 && r > 0) return (l + r) / 2;
  return l || r || 0;
}

export function calcAge(birthDateStr, refDate = new Date()) {
  if (!birthDateStr || typeof birthDateStr !== 'string') return null;
  const rawParts = birthDateStr.split('-');
  if (rawParts.length !== 3 || rawParts.some((p) => !/^\d+$/.test(p))) return null;
  const [y, m, d] = rawParts.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dob = new Date(y, m - 1, d);
  if (
    Number.isNaN(dob.getTime()) ||
    dob.getFullYear() !== y ||
    dob.getMonth() !== m - 1 ||
    dob.getDate() !== d
  ) {
    return null;
  }

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

  const armField = CIRCUMFERENCE_FIELDS.find((f) => f.key === 'arm');
  const thighField = CIRCUMFERENCE_FIELDS.find((f) => f.key === 'thigh');
  const getMeasure = (obj, key) => {
    if (!obj) return 0;
    if (key === 'arm' && armField) {
      const avg = getLimbAverage(obj, armField);
      return avg > 0 ? avg : safePositive(obj.arm);
    }
    if (key === 'thigh' && thighField) {
      const avg = getLimbAverage(obj, thighField);
      return avg > 0 ? avg : safePositive(obj.thigh);
    }
    return safePositive(obj[key]);
  };
  const ratio = (obj, key, heightVal) => getMeasure(obj, key) / heightVal;
  const waistScore = (obj, heightVal) => {
    const w = getMeasure(obj, 'waist');
    if (w <= 0) return 20;
    return scaleLinear(0.58 - w / heightVal, 0.02, 0.17);
  };

  return [
    {
      key: 'shoulders',
      label: 'SHOULDERS',
      scoreA: scaleLinear(ratio(current, 'shoulders', h), 0.58, 0.75),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'shoulders', cmpH), 0.58, 0.75) : null,
      rawA: getMeasure(current, 'shoulders'),
      rawB: hasCompare ? getMeasure(compare, 'shoulders') : null,
      unit: 'cm',
    },
    {
      key: 'chest',
      label: 'CHEST',
      scoreA: scaleLinear(ratio(current, 'chest', h), 0.50, 0.66),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'chest', cmpH), 0.50, 0.66) : null,
      rawA: getMeasure(current, 'chest'),
      rawB: hasCompare ? getMeasure(compare, 'chest') : null,
      unit: 'cm',
    },
    {
      key: 'arm',
      label: 'ARMS',
      scoreA: scaleLinear(ratio(current, 'arm', h), 0.175, 0.255),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'arm', cmpH), 0.175, 0.255) : null,
      rawA: getMeasure(current, 'arm'),
      rawB: hasCompare ? getMeasure(compare, 'arm') : null,
      unit: 'cm',
    },
    {
      key: 'waist',
      label: 'WAIST',
      // Lower waist-to-height ratio yields a higher conditioning score
      scoreA: waistScore(current, h),
      scoreB: hasCompare ? waistScore(compare, cmpH) : null,
      rawA: getMeasure(current, 'waist'),
      rawB: hasCompare ? getMeasure(compare, 'waist') : null,
      unit: 'cm',
    },
    {
      key: 'thigh',
      label: 'THIGHS',
      scoreA: scaleLinear(ratio(current, 'thigh', h), 0.275, 0.375),
      scoreB: hasCompare ? scaleLinear(ratio(compare, 'thigh', cmpH), 0.275, 0.375) : null,
      rawA: getMeasure(current, 'thigh'),
      rawB: hasCompare ? getMeasure(compare, 'thigh') : null,
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
