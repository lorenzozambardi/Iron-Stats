import defaultExercises from './defaultExercises.json';
import { bezierArea, solveBezierY } from './components/helpers';
import { MUSCLES } from './parser';

const COEFF_PARTIAL = 0.33;

// --- TARGET CURVES GENERATORS ---
function getTargetCurve(curveType, resolution = 50) {
    const t = Array.from({ length: resolution }, (_, i) => i / (resolution - 1));
    if (curveType === 'constant') {
        return new Float32Array(resolution).fill(1);
    } else if (curveType === 'sigmoid') {
        return new Float32Array(t.map(v => 1 / (1 + Math.exp(-10 * (v - 0.5)))));
    } else if (curveType === 'inv_sigmoid') {
        return new Float32Array(t.map(v => 1 / (1 + Math.exp(10 * (v - 0.5)))));
    } else if (curveType === 'linear') {
        return new Float32Array(t.map(v => 1 - v));
    } else {
        return new Float32Array(resolution).fill(1);
    }
}

// --- BEZIER CURVE CALCULATION ---
function getBezierCurve(rawProf, resolution = 50) {
    const prof = typeof rawProf === 'number'
        ? { x0: 0.0, y0: 1.0, x1: 0.33, y1: 1.0, x2: 0.66, y2: 1.0, x3: 1.0, y3: 1.0, magnitude: rawProf }
        : rawProf;

    const area = bezierArea(prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3);
    if ((prof.magnitude ?? 0) < 0) {
        throw new RangeError(`Negative Bezier magnitude: ${prof.magnitude}`);
    }

    const res = new Float32Array(resolution);
    if (area > 0) {
        const scale = prof.magnitude / area;
        for (let i = 0; i < resolution; i++) {
            const targetX = i / (resolution - 1);
            res[i] = solveBezierY(targetX, prof.x0, prof.y0, prof.x1, prof.y1, prof.x2, prof.y2, prof.x3, prof.y3) * scale;
        }
    }
    return res;
}

function setTuts(baseReps, partialReps, rpe) {
    let totalTut = 0.0;
    let effTut = 0.0;
    if (baseReps > 0) {
        const effBase = Math.min(baseReps, Math.max(0.0, rpe - 4.0));
        const fullEff = Math.floor(effBase);
        const frac = effBase - fullEff;
        const startIdx = Math.max(0, baseReps - fullEff);
        const baseRir = 10.0 - rpe;

        for (let j = 0; j < baseReps; j++) {
            const rir = baseRir + (baseReps - 1 - j);
            let slowdown;
            if (rir < 1.0) slowdown = 1.60;
            else if (rir < 2.0) slowdown = 1.00;
            else if (rir < 3.0) slowdown = 0.60;
            else if (rir < 4.0) slowdown = 0.35;
            else if (rir < 5.0) slowdown = 0.15;
            else slowdown = 0.0;

            const repTut = 3.0 + slowdown;
            totalTut += repTut;
            if (j >= startIdx) {
                effTut += repTut;
            } else if (frac > 0.0 && j === startIdx - 1) {
                effTut += frac * repTut;
            }
        }
    }
    if (partialReps > 0) {
        const partTut = 1.5 * partialReps;
        totalTut += partTut;
        effTut += partTut;
    }
    return [totalTut, effTut];
}

// --- REST CALCULATOR ---
export function calculateRest(fatigue) {
    let mins;
    if (fatigue <= 2.0) {
        mins = 1.0;
    } else if (fatigue <= 7.0) {
        mins = 1.0 + (fatigue - 2.0) * (2.0 / 5.0);
    } else {
        mins = 3.0 + (fatigue - 7.0) * (0.5 / 3.0);
    }
    
    const roundedMins = Math.round(mins * 2) / 2;
    if (roundedMins === Math.floor(roundedMins)) {
        return `${Math.floor(roundedMins)}'`;
    } else {
        return `${Math.floor(roundedMins)}'30"`;
    }
}

// --- CLASSES ---
class ScheduledSet {
    constructor(baseReps, partialReps, rpe) {
        this.base_reps = baseReps;
        this.partial_reps = partialReps;
        this.rpe = rpe;
    }
    
    get total_reps() {
        return this.base_reps + this.partial_reps * COEFF_PARTIAL;
    }
    
    get effective_reps() {
        const effBase = Math.min(this.base_reps, Math.max(0.0, this.rpe - 4.0));
        return effBase + this.partial_reps * COEFF_PARTIAL;
    }
    
    clone() {
        return new ScheduledSet(this.base_reps, this.partial_reps, this.rpe);
    }
}

class ScheduledExercise {
    constructor(exercise) {
        this.exercise = exercise;
        this.sets = [];
    }
    
    clone() {
        const cloned = new ScheduledExercise(this.exercise);
        cloned.sets = this.sets.map(s => s.clone());
        return cloned;
    }
}

class WorkoutState {
    constructor(days) {
        this.days = Array.from({ length: days }, () => []);
    }
}

// --- UTILS ---
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// --- MAIN SOLVER ---
export class WorkoutSolver {
    constructor(config, db = defaultExercises) {
        this.config = {
            days: 4,
            min_sets: 2,
            max_sets: 5,
            min_reps: 6,
            max_reps: 15,
            min_ex: 4,
            max_ex: 8,
            calibration_steps: 500,
            weights: {
                curve: 0.30,
                vol: 0.15,
                ton: 0.10,
                tut: 0.10,
                distr: 0.15,
                variety: 0.10,
                balance: 0.10
            },
            target_ratios: {
                vol: 0.70,
                ton: 0.70,
                tut: 0.70
            },
            muscle_targets: {},
            volume_dist: { macros: {}, subs: {} },
            ...config
        };

        if (this.config.iterations !== undefined) {
            this.config.iterations = Math.min(Math.max(0, this.config.iterations), 100000);
        }

        this.resolution = 50;

        // Clone exercises and enforce partition-of-unity on muscles_distr without mutating caller DB
        this.db = db.map(ex => {
            const rawDistr = ex.muscles_distr || {};
            const clonedDistr = {};
            let totalMag = 0.0;
            for (const m in rawDistr) {
                const entry = rawDistr[m];
                if (typeof entry === 'number') {
                    if (entry < 0.0) {
                        throw new RangeError(`Negative muscle magnitude: ${entry}`);
                    }
                    clonedDistr[m] = { x0: 0.0, y0: 1.0, x1: 0.33, y1: 1.0, x2: 0.66, y2: 1.0, x3: 1.0, y3: 1.0, magnitude: entry };
                    totalMag += entry;
                } else {
                    const mag = Number(entry?.magnitude ?? 0.0);
                    if (mag < 0.0) {
                        throw new RangeError(`Negative Bezier magnitude: ${mag}`);
                    }
                    clonedDistr[m] = { ...entry, magnitude: mag };
                    totalMag += mag;
                }
            }
            if (Object.keys(clonedDistr).length > 0 && totalMag <= 0.0) {
                throw new RangeError(`Muscle distribution magnitudes must sum to a positive value for ${ex.name}`);
            }
            if (totalMag > 0.0 && Math.abs(totalMag - 1.0) > 1e-12) {
                for (const m in clonedDistr) {
                    clonedDistr[m].magnitude /= totalMag;
                }
            }
            return {
                ...ex,
                load_multiplier: ex.load_multiplier ?? 1.0,
                load_offset: ex.load_offset ?? 0.0,
                muscles_distr: clonedDistr
            };
        });

        this.target_sub_vol = {};
        if (this.config.volume_dist.macros) {
            for (const macro in this.config.volume_dist.macros) {
                const m_val = this.config.volume_dist.macros[macro];
                if (this.config.volume_dist.subs && this.config.volume_dist.subs[macro]) {
                    for (const sub in this.config.volume_dist.subs[macro]) {
                        const s_val = this.config.volume_dist.subs[macro][sub];
                        this.target_sub_vol[sub] = (m_val / 100.0) * (s_val / 100.0);
                    }
                }
            }
        }
        const totalTargetVol = Object.values(this.target_sub_vol).reduce((a, b) => a + b, 0.0);
        if (totalTargetVol <= 0.0) {
            this.target_sub_vol = {};
        } else if (Math.abs(totalTargetVol - 1.0) > 1e-12) {
            for (const sub in this.target_sub_vol) {
                this.target_sub_vol[sub] /= totalTargetVol;
            }
        }

        this.T_m = {};
        const subs_dict = this.config.volume_dist.subs || {};
        const macroToSubs = {};
        for (const [sub, macro] of Object.entries(MUSCLES)) {
            if (!macroToSubs[macro]) macroToSubs[macro] = [];
            macroToSubs[macro].push(sub);
        }
        for (const m in this.config.muscle_targets) {
            if (macroToSubs[m] || (subs_dict[m] && Object.keys(subs_dict[m]).length > 0)) {
                const curve = getTargetCurve(this.config.muscle_targets[m], this.resolution);
                for (const sub of (macroToSubs[m] || [])) {
                    this.T_m[sub] = curve;
                }
                for (const sub in (subs_dict[m] || {})) {
                    this.T_m[sub] = curve;
                }
            }
        }
        for (const m in this.config.muscle_targets) {
            if (!macroToSubs[m] && !(subs_dict[m] && Object.keys(subs_dict[m]).length > 0)) {
                this.T_m[m] = getTargetCurve(this.config.muscle_targets[m], this.resolution);
            }
        }

        this.all_submuscles = new Set();
        this.db.forEach(ex => {
            for (const m in ex.muscles_distr) {
                this.all_submuscles.add(m);
            }
        });
        this.distr_muscles = new Set([...this.all_submuscles, ...Object.keys(this.target_sub_vol)]);

        const t_domain = Array.from({ length: this.resolution }, (_, i) => i / (this.resolution - 1));
        this.partial_mask = new Float32Array(this.resolution);
        for(let i=0; i<this.resolution; i++) this.partial_mask[i] = t_domain[i] <= 0.3333 ? 1.0 : 0.0;
        
        this.default_curve = new Float32Array(this.resolution).fill(1);
        this.scales = {};

        // Precompute curves
        this.ex_curves = {};
        this.db.forEach(ex => {
            this.ex_curves[ex.name] = {};
            for (const m in ex.muscles_distr) {
                this.ex_curves[ex.name][m] = getBezierCurve(ex.muscles_distr[m], this.resolution);
            }
        });

        // Pre-allocate evaluation buffers to avoid GC thrashing during SA loop
        this.V_m_buffers = {};
        this.subVols = {};
        this.all_submuscles.forEach(m => {
            this.V_m_buffers[m] = new Float32Array(this.resolution);
            this.subVols[m] = 0.0;
        });
    }

    getRandomExercise() {
        return randomChoice(this.db);
    }

    generateRandomState() {
        const state = new WorkoutState(this.config.days);
        for (let d = 0; d < this.config.days; d++) {
            const numEx = randomInt(this.config.min_ex, this.config.max_ex);
            for (let i = 0; i < numEx; i++) {
                const ex = new ScheduledExercise(this.getRandomExercise());
                const numSets = randomInt(this.config.min_sets, this.config.max_sets);
                for (let s = 0; s < numSets; s++) {
                    const reps = randomInt(this.config.min_reps, this.config.max_reps);
                    const rpe = randomChoice([7.0, 8.0, 8.5, 9.0, 10.0]);
                    const partials = rpe >= 9.0 ? randomChoice([0, 0, 0, 2, 4, 6]) : 0;
                    ex.sets.push(new ScheduledSet(reps, partials, rpe));
                }
                state.days[d].push(ex);
            }
        }
        return state;
    }

    /**
     * Evaluates the fitness (cost) of a given WorkoutState (a generated program).
     * Lower cost is better. Uses seven normalized error metrics scaled by 10000.0
     * plus a 150.0 * 1000.0 penalty per same-day duplicate exercise.
     *
     * Fast SA surrogates:
     * - Load: Epley-like ``load_multiplier * (100 / (1 + 0.033 * base_reps)) + load_offset``.
     * - TUT: RIR-slowdown dynamic TUT at default ``1-0-2-0`` tempo (distinct from ``E_vol``).
     * - Fatigue: linear ``total_reps * fatigue`` (dimensionally consistent with ``ex.fatigue in [1, 10]``).
     */
    evaluateWorkout(state) {
        let totalVol = 0.0, effVol = 0.0;
        let totalTon = 0.0, effTon = 0.0;
        let totalTut = 0.0, effTut = 0.0;

        const V_m = this.V_m_buffers;
        const subVols = this.subVols;
        for (const m of this.all_submuscles) {
            V_m[m].fill(0);
            subVols[m] = 0.0;
        }

        const uniqueExercises = new Set();
        let totalExercises = 0;
        let penalty = 0.0;

        const dailyFatigue = [];
        const dailyVol = [];

        for (let d = 0; d < state.days.length; d++) {
            let dayFatigue = 0.0;
            let dayVol = 0.0;
            const dayExercises = new Set();

            for (const schedEx of state.days[d]) {
                const ex = schedEx.exercise;

                if (dayExercises.has(ex.name)) {
                    penalty += 150.0;
                }
                dayExercises.add(ex.name);
                uniqueExercises.add(ex.name);
                totalExercises++;

                let exFatigue = 0.0;
                let exBaseReps = 0.0, exPartialReps = 0.0, exTotalReps = 0.0;

                for (const s of schedEx.sets) {
                    const sTotal = s.total_reps;
                    const sEff = s.effective_reps;

                    totalVol += sTotal;
                    effVol += sEff;
                    dayVol += sTotal;

                    const load = ex.load_multiplier * (100.0 / (1.0 + 0.033 * s.base_reps)) + ex.load_offset;
                    totalTon += sTotal * load;
                    effTon += sEff * load;

                    const [sTotTut, sEffTut] = setTuts(s.base_reps, s.partial_reps, s.rpe);
                    totalTut += sTotTut;
                    effTut += sEffTut;

                    exFatigue += sTotal * ex.fatigue;

                    exBaseReps += s.base_reps;
                    exPartialReps += s.partial_reps;
                    exTotalReps += sTotal;
                }

                for (const m in ex.muscles_distr) {
                    const bezierProf = ex.muscles_distr[m];
                    const baseCurve = this.ex_curves[ex.name][m];
                    const vmCurve = V_m[m];
                    
                    for (let i = 0; i < this.resolution; i++) {
                        vmCurve[i] += baseCurve[i] * exBaseReps;
                        if (exPartialReps > 0) {
                            vmCurve[i] += baseCurve[i] * (exPartialReps * COEFF_PARTIAL) * this.partial_mask[i];
                        }
                    }
                    subVols[m] += bezierProf.magnitude * exTotalReps;
                }

                dayFatigue += exFatigue;
            }

            dailyFatigue.push(dayFatigue);
            dailyVol.push(dayVol);
        }

        // 1. Curve Error
        let E_curve = 0.0;
        let trainedMuscles = 0;
        for (const m in V_m) {
            const curve = V_m[m];
            let maxV = 0.0;
            for (let i = 0; i < this.resolution; i++) {
                if (curve[i] > maxV) maxV = curve[i];
            }
            if (maxV > 0) {
                const target = this.T_m[m] || this.default_curve;
                let sumSq = 0.0;
                for (let i = 0; i < this.resolution; i++) {
                    const normV = curve[i] / maxV;
                    const diff = normV - target[i];
                    sumSq += diff * diff;
                }
                E_curve += sumSq / this.resolution;
                trainedMuscles++;
            }
        }
        if (trainedMuscles > 0) E_curve /= trainedMuscles;

        // 2. Ratio Errors
        const vDiff = effVol / totalVol - this.config.target_ratios.vol;
        const E_vol = totalVol > 0 ? vDiff * vDiff : 0.0;
        const tonDiff = effTon / totalTon - this.config.target_ratios.ton;
        const E_ton = totalTon > 0 ? tonDiff * tonDiff : 0.0;
        const tutDiff = effTut / totalTut - this.config.target_ratios.tut;
        const E_tut = totalTut > 0 ? tutDiff * tutDiff : 0.0;

        // 3. Distribution Error
        let E_distr = 0.0;
        let totalSubVol = 0.0;
        for (const m in subVols) totalSubVol += subVols[m];
        const hasTargetDistr = Object.keys(this.target_sub_vol).length > 0;
        
        if (totalSubVol > 0 && hasTargetDistr) {
            for (const m of this.distr_muscles) {
                const targetPct = this.target_sub_vol[m] || 0.0;
                const actualPct = (subVols[m] || 0.0) / totalSubVol;
                const dDiff = actualPct - targetPct;
                E_distr += dDiff * dDiff;
            }
            E_distr *= 0.5;
        }

        // 5. Variety Error
        let E_variety = 0.0;
        if (totalExercises > 0) {
            const varietyRatio = uniqueExercises.size / totalExercises;
            const varDiff = 1.0 - varietyRatio;
            E_variety = varDiff * varDiff;
        }

        // 6. Balance Error
        let E_balance = 0.0;
        if (dailyFatigue.length > 1) {
            const maxSetVol = this.config.max_reps + COEFF_PARTIAL * 6.0;
            const maxDayVol = this.config.max_ex * this.config.max_sets * maxSetVol;
            const maxDayFatigue = maxDayVol * 10.0;
            const maxVarF = (maxDayFatigue * 0.5) * (maxDayFatigue * 0.5);
            
            const meanF = dailyFatigue.reduce((a, b) => a + b, 0) / dailyFatigue.length;
            const varFatigue = dailyFatigue.reduce((a, b) => {
                const d = b - meanF;
                return a + d * d;
            }, 0) / dailyFatigue.length;
            const normVarF = maxVarF > 0 ? varFatigue / maxVarF : 0.0;

            const maxVarV = (maxDayVol * 0.5) * (maxDayVol * 0.5);
            
            const meanV = dailyVol.reduce((a, b) => a + b, 0) / dailyVol.length;
            const varVol = dailyVol.reduce((a, b) => {
                const d = b - meanV;
                return a + d * d;
            }, 0) / dailyVol.length;
            const normVarV = maxVarV > 0 ? varVol / maxVarV : 0.0;

            E_balance = (normVarF + normVarV) * 0.5;
        }

        const rawMetrics = {
            curve: E_curve,
            vol: E_vol,
            ton: E_ton,
            tut: E_tut,
            distr: E_distr,
            variety: E_variety,
            balance: E_balance
        };

        const scaled = {};
        for (const k in rawMetrics) {
            let scale = this.scales[k] ?? 1.0;
            if (scale === 0.0) scale = 1e-6;
            scaled[k] = rawMetrics[k] / scale;
        }

        const moCost = 
            (this.config.weights.curve ?? 0.30) * scaled.curve +
            (this.config.weights.vol ?? 0.15) * scaled.vol +
            (this.config.weights.ton ?? 0.10) * scaled.ton +
            (this.config.weights.tut ?? 0.10) * scaled.tut +
            (this.config.weights.distr ?? 0.15) * scaled.distr +
            (this.config.weights.variety ?? 0.10) * scaled.variety +
            (this.config.weights.balance ?? 0.10) * scaled.balance;

        const cost = (moCost * 10000.0) + (penalty * 1000.0);

        if (this._return_raw) {
            return { cost, rawMetrics };
        }

        return cost;
    }

    mutateWorkout(state) {
        const newState = new WorkoutState(this.config.days);
        const d = randomInt(0, this.config.days - 1);

        for (let i = 0; i < this.config.days; i++) {
            if (i === d) {
                newState.days[i] = state.days[i].map(ex => ex.clone());
            } else {
                newState.days[i] = [...state.days[i]];
            }
        }

        const day = newState.days[d];
        const eligibleAddSet = day.filter(ex => ex.sets.length < this.config.max_sets);
        const eligibleRemSet = day.filter(ex => ex.sets.length > this.config.min_sets);
        const setsOnDay = day.flatMap(ex => ex.sets);
        const eligiblePartialSets = setsOnDay.filter(s => s.rpe >= 9.0);

        const eligibleMutations = [];
        if (day.length < this.config.max_ex) eligibleMutations.push('add_ex');
        if (day.length > this.config.min_ex) eligibleMutations.push('remove_ex');
        if (day.length > 0) eligibleMutations.push('swap_ex');
        if (eligibleAddSet.length > 0) eligibleMutations.push('add_set');
        if (eligibleRemSet.length > 0) eligibleMutations.push('remove_set');
        if (setsOnDay.length > 0 && this.config.min_reps < this.config.max_reps) eligibleMutations.push('mut_reps');
        if (setsOnDay.length > 0) eligibleMutations.push('mut_rpe');
        if (eligiblePartialSets.length > 0) eligibleMutations.push('mut_partials');

        if (eligibleMutations.length === 0) {
            return newState;
        }

        const mType = randomChoice(eligibleMutations);
        const defaultReps = Math.max(this.config.min_reps, Math.min(this.config.max_reps, 10));

        if (mType === 'add_ex') {
            const ex = new ScheduledExercise(this.getRandomExercise());
            for (let i = 0; i < this.config.min_sets; i++) {
                ex.sets.push(new ScheduledSet(defaultReps, 0, 8.0));
            }
            day.push(ex);
        } else if (mType === 'remove_ex') {
            day.splice(randomInt(0, day.length - 1), 1);
        } else if (mType === 'swap_ex') {
            const idx = randomInt(0, day.length - 1);
            const newEx = new ScheduledExercise(this.getRandomExercise());
            newEx.sets = day[idx].sets.map(s => s.clone());
            day[idx] = newEx;
        } else if (mType === 'add_set') {
            const ex = randomChoice(eligibleAddSet);
            ex.sets.push(new ScheduledSet(defaultReps, 0, 8.0));
        } else if (mType === 'remove_set') {
            const ex = randomChoice(eligibleRemSet);
            ex.sets.splice(randomInt(0, ex.sets.length - 1), 1);
        } else if (mType === 'mut_reps') {
            const s = randomChoice(setsOnDay);
            s.base_reps += randomChoice([-2, -1, 1, 2]);
            s.base_reps = Math.max(this.config.min_reps, Math.min(this.config.max_reps, s.base_reps));
        } else if (mType === 'mut_rpe') {
            const s = randomChoice(setsOnDay);
            s.rpe += randomChoice([-0.5, 0.5]);
            s.rpe = Math.max(5.0, Math.min(10.0, s.rpe));
            if (s.rpe < 9.0) {
                s.partial_reps = 0;
            }
        } else if (mType === 'mut_partials') {
            const s = randomChoice(eligiblePartialSets);
            s.partial_reps = randomChoice([0, 2, 4, 6]);
        }

        return newState;
    }

    /**
     * Estimate metric normalization scales ``s_i = 2 * mean(E_i)`` via Monte Carlo sampling
     * over ``calibration_steps`` random states (empirical sample mean, guarded at ``1e-6``).
     */
    calibrate() {
        const steps = this.config.calibration_steps || 500;
        if (steps <= 0) return;

        this._return_raw = true;
        const sums = { curve: 0, vol: 0, ton: 0, tut: 0, distr: 0, variety: 0, balance: 0 };

        for (let i = 0; i < steps; i++) {
            const state = this.generateRandomState();
            const { rawMetrics } = this.evaluateWorkout(state);
            for (const k in sums) {
                sums[k] += rawMetrics[k];
            }
        }

        this._return_raw = false;
        
        for (const k in sums) {
            const meanVal = sums[k] / steps;
            this.scales[k] = meanVal * 2.0;
        }
    }

    /**
     * Runs the Simulated Annealing algorithm to find the optimal WorkoutState.
     * 
     * The algorithm starts with a random workout and a high temperature, allowing it to 
     * accept worse states to escape local minima. The temperature decays over `iterations` 
     * by `coolingRate`. At each step, a mutation (e.g. add/swap exercise, change reps) 
     * is applied and the new state is evaluated.
     */
    async solve(iterations = 10000, initialTemp = 50.0, coolingRate = null, progressCallback = null) {
        const effectiveIterations = Math.min(
            Math.max(0, iterations ?? this.config.iterations ?? 10000),
            100000
        );
        if (!coolingRate) {
            coolingRate = effectiveIterations > 0 ? Math.pow(0.01 / initialTemp, 1.0 / effectiveIterations) : 0.995;
        }

        this.calibrate();

        let currentState = this.generateRandomState();
        let currentCost = this.evaluateWorkout(currentState);

        let bestState = currentState;
        let bestCost = currentCost;

        let T = initialTemp;

        for (let i = 0; i < effectiveIterations; i++) {
            const neighbor = this.mutateWorkout(currentState);
            const neighborCost = this.evaluateWorkout(neighbor);

            if (neighborCost < currentCost) {
                currentState = neighbor;
                currentCost = neighborCost;
                if (neighborCost < bestCost) {
                    bestState = neighbor;
                    bestCost = neighborCost;
                }
            } else {
                const delta = neighborCost - currentCost;
                if (Math.random() < Math.exp(-delta / T)) {
                    currentState = neighbor;
                    currentCost = neighborCost;
                }
            }

            T *= coolingRate;

            if (i % 500 === 0) {
                if (progressCallback) {
                    progressCallback({
                        iteration: i,
                        total: effectiveIterations,
                        temp: T,
                        currentCost,
                        bestCost
                    });
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return { bestState, bestCost };
    }
}
