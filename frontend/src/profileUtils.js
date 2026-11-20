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

export const CIRCUMFERENCE_LOG_KEYS = CIRCUMFERENCE_FIELDS.flatMap((f) =>
  f.bilateral ? [f.leftKey, f.rightKey] : [f.key]
);

export const PROFILE_LOG_META = {
  weight: { label: 'Weight', unit: 'kg', decimals: 1, category: 'core' },
  bodyFat: { label: 'Body Fat', unit: '%', decimals: 1, category: 'core' },
  ...Object.fromEntries(
    CIRCUMFERENCE_FIELDS.flatMap((f) =>
      f.bilateral
        ? [
            [f.leftKey, { label: `${f.label} L`, unit: 'cm', decimals: 1, category: 'circumference' }],
            [f.rightKey, { label: `${f.label} R`, unit: 'cm', decimals: 1, category: 'circumference' }],
          ]
        : [[f.key, { label: f.label, unit: 'cm', decimals: 1, category: 'circumference' }]]
    )
  ),
};

export function formatProfileLogValue(type, value) {
  const meta = PROFILE_LOG_META[type];
  const num = Number(value);
  if (!meta || !Number.isFinite(num)) return String(value ?? '');
  return meta.unit === '%' ? `${num.toFixed(meta.decimals)}%` : `${num.toFixed(meta.decimals)} ${meta.unit}`;
}

export function buildDerivedMetricSeries(logs, current, metricKey, cutoffTs = null) {
  if (!Array.isArray(logs) || !current) return [];
  const relevantTypes = metricKey === 'bmi' ? ['weight'] : ['weight', 'bodyFat'];
  const byDate = new Map();

  for (const item of logs) {
    if (!item || !relevantTypes.includes(item.type) || !item.date) continue;
    const val = Number(item.value);
    if (!Number.isFinite(val) || val <= 0) continue;
    const ts = Number.isFinite(item.ts) ? item.ts : (Date.parse(`${item.date}T12:00:00`) || 0);
    const existing = byDate.get(item.date) || { date: item.date, ts };
    existing[item.type] = val;
    if (ts > existing.ts) existing.ts = ts;
    byDate.set(item.date, existing);
  }

  const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
  if (sorted.length === 0) return [];

  const heightCm = Number(current.height) || 0;
  let lastWeight = sorted.find((d) => d.weight !== undefined)?.weight ?? (Number(current.weight) || 0);
  let lastBf = sorted.find((d) => d.bodyFat !== undefined)?.bodyFat ?? (Number(current.bodyFat) || 0);

  const points = [];
  for (const entry of sorted) {
    if (entry.weight !== undefined) lastWeight = entry.weight;
    if (entry.bodyFat !== undefined) lastBf = entry.bodyFat;

    let value = 0;
    if (metricKey === 'bmi') {
      value = calcBMI(lastWeight, heightCm);
    } else if (metricKey === 'lbm') {
      value = calcLeanMass(lastWeight, lastBf);
    } else if (metricKey === 'fm') {
      value = calcFatMass(lastWeight, lastBf);
    } else if (metricKey === 'ffmi') {
      value = calcFFMI(lastWeight, heightCm, lastBf).normalizedFfmi;
    }

    if (Number.isFinite(value) && value > 0) {
      points.push({ date: entry.date, t: entry.ts, v: Number(value.toFixed(2)) });
    }
  }

  return cutoffTs ? points.filter((p) => p.t >= cutoffTs) : points;
}

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
      if (item && typeof item.type === 'string' && Object.hasOwn(PROFILE_LOG_META, item.type)) {
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

const METRIC_ALIAS_MAP = (() => {
  const map = new Map();
  for (const [key, meta] of Object.entries(PROFILE_LOG_META)) {
    map.set(key.toLowerCase(), key);
    map.set(meta.label.toLowerCase(), key);
  }
  return map;
})();

const normalizeProfileDate = (raw) => {
  const s = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
};

const formatDMY = (isoDateStr) => {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const SCALAR_SECTION_MAP = {
  birthdate: 'birthDate',
  sex: 'sex',
  height: 'height',
  avgsteps: 'avgSteps',
};

const getLocalTodayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function serializeProfileToMarkdown(profile) {
  const cur = { ...DEFAULT_PROFILE.current, ...(profile?.current || {}) };
  const logs = Array.isArray(profile?.logs) ? profile.logs : [];

  const lines = [
    'birthdate',
    formatDMY(cur.birthDate || DEFAULT_PROFILE.current.birthDate),
    'sex',
    String(cur.sex || 'M'),
    'height',
    String(cur.height ?? DEFAULT_PROFILE.current.height),
    'avgsteps',
    String(cur.avgSteps ?? DEFAULT_PROFILE.current.avgSteps),
  ];

  const byType = new Map();
  for (const entry of logs) {
    if (!entry || !Object.hasOwn(PROFILE_LOG_META, entry.type)) continue;
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type).push(entry);
  }

  for (const [key, meta] of Object.entries(PROFILE_LOG_META)) {
    const entries = (byType.get(key) || []).slice().sort(
      (a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0)
    );
    if (entries.length > 0) {
      lines.push(key.toLowerCase());
      for (const entry of entries) {
        const val = Number(entry.value);
        if (!Number.isFinite(val) || !entry.date) continue;
        lines.push(`${Number(val.toFixed(meta.decimals))} , ${formatDMY(entry.date)}`);
      }
    } else if (cur[key] !== '' && cur[key] !== undefined && cur[key] !== null) {
      const val = Number(cur[key]);
      if (Number.isFinite(val)) {
        lines.push(key.toLowerCase(), `${Number(val.toFixed(meta.decimals))} , ${formatDMY(getLocalTodayISO())}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function parseProfileMarkdown(mdText, fallbackProfile = DEFAULT_PROFILE) {
  const baseCurrent = { ...DEFAULT_PROFILE.current, ...(fallbackProfile?.current || {}) };
  if (typeof mdText !== 'string' || !mdText.trim()) {
    return { current: baseCurrent, logs: Array.isArray(fallbackProfile?.logs) ? fallbackProfile.logs : [] };
  }

  const lines = mdText.split(/\r?\n/);
  const logs = [];
  let activeSection = null;
  let activeKind = null; // 'scalar' | 'metric'

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const lower = trimmed.toLowerCase().replace(/^[-*]\s*/, '');
    if (Object.hasOwn(SCALAR_SECTION_MAP, lower)) {
      activeSection = SCALAR_SECTION_MAP[lower];
      activeKind = 'scalar';
      continue;
    }
    const metricKey = METRIC_ALIAS_MAP.get(lower);
    if (metricKey) {
      activeSection = metricKey;
      activeKind = 'metric';
      continue;
    }

    if (!activeSection) continue;

    if (activeKind === 'scalar') {
      if (activeSection === 'birthDate') {
        const iso = normalizeProfileDate(trimmed);
        if (iso) baseCurrent.birthDate = iso;
      } else if (activeSection === 'sex') {
        const s = trimmed.toUpperCase();
        if (s === 'M' || s === 'F') baseCurrent.sex = s;
      } else {
        const num = Number(trimmed);
        if (Number.isFinite(num)) baseCurrent[activeSection] = num;
      }
      continue;
    }

    if (activeKind === 'metric') {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        const val = parseFloat(trimmed.slice(0, commaIdx));
        const date = normalizeProfileDate(trimmed.slice(commaIdx + 1));
        if (date && Number.isFinite(val)) {
          const ts = Date.parse(`${date}T12:00:00`) || 0;
          logs.push({
            id: `md-${date}-${activeSection}-${i}`,
            date,
            ts,
            type: activeSection,
            value: val,
          });
        }
      } else {
        const val = parseFloat(trimmed);
        if (Number.isFinite(val)) {
          baseCurrent[activeSection] = val;
        }
      }
    }
  }

  // Deduplicate same date+type (keep first occurrence) and sort newest first
  const seen = new Set();
  const deduped = [];
  for (const entry of logs) {
    const key = `${entry.date}|${entry.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  deduped.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));

  // Populate current values from the latest log entry for each metric
  const latestApplied = new Set();
  for (const entry of deduped) {
    if (!latestApplied.has(entry.type)) {
      baseCurrent[entry.type] = entry.value;
      latestApplied.add(entry.type);
    }
  }

  return { current: baseCurrent, logs: deduped };
}

export async function loadProfileFromFile() {
  const local = loadProfile();
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        const parsed = parseProfileMarkdown(text, local);
        saveProfile(parsed);
        return parsed;
      }
    } else if (res.status === 404) {
      let seedProfile = local;
      if (!Array.isArray(local.logs) || local.logs.length === 0) {
        const todayIso = getLocalTodayISO();
        const ts = Date.parse(`${todayIso}T12:00:00`) || Date.now();
        const seedLogs = [];
        for (const key of Object.keys(PROFILE_LOG_META)) {
          const val = Number(local.current?.[key]);
          if (Number.isFinite(val) && val > 0) {
            seedLogs.push({ id: `${ts}-${key}`, date: todayIso, ts, type: key, value: val });
          }
        }
        seedProfile = { ...local, logs: seedLogs };
        saveProfile(seedProfile);
      }
      const md = serializeProfileToMarkdown(seedProfile);
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: md,
      }).catch(() => {});
      return seedProfile;
    }
  } catch {
    // Offline/web fallback uses localStorage
  }
  return local;
}

export async function saveProfileToFile(profile) {
  saveProfile(profile);
  try {
    const md = serializeProfileToMarkdown(profile);
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: md,
    });
  } catch {
    // Ignore when /api/profile is unavailable (e.g., plain browser preview)
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
