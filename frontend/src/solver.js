import defaultExercises from './defaultExercises.json';

const COEFF_ASSISTED = 0.5;
const COEFF_PARTIAL = 0.5;

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
function getBezierCurve(prof, resolution = 50) {
    const t = Array.from({ length: resolution }, (_, i) => i / (resolution - 1));
    let xSpan = prof.x3 - prof.x0;
    if (xSpan === 0) xSpan = 1.0;

    const y = new Float32Array(resolution);
    for (let i = 0; i < resolution; i++) {
        const tv = t[i];
        const yv = Math.pow(1 - tv, 3) * prof.y0 + 
                   3 * Math.pow(1 - tv, 2) * tv * prof.y1 + 
                   3 * (1 - tv) * Math.pow(tv, 2) * prof.y2 + 
                   Math.pow(tv, 3) * prof.y3;
        y[i] = yv;
    }

    // Calculate x for integration
    const x = new Float32Array(resolution);
    for (let i = 0; i < resolution; i++) {
        const tv = t[i];
        x[i] = prof.x0 + xSpan * (3 * Math.pow(1 - tv, 2) * tv * prof.x1 + 
                                  3 * (1 - tv) * Math.pow(tv, 2) * prof.x2 + 
                                  Math.pow(tv, 3));
    }

    let area = 0.0;
    for (let i = 0; i < resolution - 1; i++) {
        const dx = x[i+1] - x[i];
        const yAvg = (y[i] + y[i+1]) / 2.0;
        area += yAvg * dx;
    }

    const res = new Float32Array(resolution);
    if (area > 0) {
        const scale = prof.magnitude / area;
        for (let i = 0; i < resolution; i++) {
            res[i] = y[i] * scale;
        }
    }
    return res;
}

// --- REST CALCULATOR ---
export function calculateRest(fatigue) {
    let mins = 1.0;
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
                curve: 0.35,
                vol: 0.15,
                ton: 0.1,
                tut: 0.1,
                distr: 0.2,
                variety: 0.1,
                balance: 0.1
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
            this.config.iterations = Math.min(this.config.iterations, 100000);
        }

        this.db = db;
        this.resolution = 50;

        // Process DB to add precalculated fields
        this.db.forEach(ex => {
            ex.load_multiplier = ex.load_multiplier || 1.0;
            ex.load_offset = ex.load_offset || 0.0;
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

        this.T_m = {};
        const subs_dict = this.config.volume_dist.subs || {};
        for (const m in this.config.muscle_targets) {
            const curveType = this.config.muscle_targets[m];
            const curve = getTargetCurve(curveType, this.resolution);
            if (subs_dict[m]) {
                for (const sub in subs_dict[m]) {
                    this.T_m[sub] = curve;
                }
            } else {
                this.T_m[m] = curve;
            }
        }

        this.all_submuscles = new Set();
        this.db.forEach(ex => {
            for (const m in ex.muscles_distr) {
                this.all_submuscles.add(m);
            }
        });

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
                    const partials = rpe >= 9.0 ? randomChoice([0, 0, 0, 2, 4]) : 0;
                    ex.sets.push(new ScheduledSet(reps, partials, rpe));
                }
                state.days[d].push(ex);
            }
        }
        return state;
    }

    /**
     * Evaluates the fitness (cost) of a given WorkoutState (a generated program).
     * Lower cost is better. The cost is a weighted sum of several error metrics:
     * - E_curva: Mean Squared Error (MSE) against the target muscle activation curves.
     * - E_vol/ton/tut: Ratio errors for effective vs total volume/tonnage/tut.
     * - E_distr: Muscle distribution error (actual vs target volume distribution).
     * - E_variety: Penalty for reusing the same exercises (unique exercises / total exercises).
     * - E_balance: Variance of daily fatigue and volume to ensure balanced days.
     * 
     * The final raw weighted cost (moCost) is multiplied by 10000.0 to expand the 
     * gradient for the Simulated Annealing temperature scale (which starts at T=50.0).
     * A hard penalty of 1000.0 is applied per duplicate exercise on the same day.
     */
    evaluateWorkout(state) {
        let totalVol = 0.0, effVol = 0.0;
        let totalTon = 0.0, effTon = 0.0;
        let totalTut = 0.0, effTut = 0.0;

        const V_m = {};
        const subVols = {};
        this.all_submuscles.forEach(m => {
            V_m[m] = new Float32Array(this.resolution);
            subVols[m] = 0.0;
        });

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

                    totalTut += sTotal * 2.0;
                    effTut += sEff * 2.0;

                    exFatigue += (sTotal * load * ex.fatigue * ex.load_coeff * 0.01);

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
                            vmCurve[i] += baseCurve[i] * exPartialReps * this.partial_mask[i];
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
        let E_curva = 0.0;
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
                    sumSq += Math.pow(normV - target[i], 2);
                }
                E_curva += sumSq / this.resolution;
                trainedMuscles++;
            }
        }
        if (trainedMuscles > 0) E_curva /= trainedMuscles;

        // 2. Ratio Errors
        const E_vol = totalVol > 0 ? Math.pow(effVol / totalVol - this.config.target_ratios.vol, 2) : 0.0;
        const E_ton = totalTon > 0 ? Math.pow(effTon / totalTon - this.config.target_ratios.ton, 2) : 0.0;
        const E_tut = totalTut > 0 ? Math.pow(effTut / totalTut - this.config.target_ratios.tut, 2) : 0.0;

        // 3. Distribution Error
        let E_distr = 0.0;
        let totalSubVol = 0.0;
        for (const m in subVols) totalSubVol += subVols[m];
        
        if (totalSubVol > 0) {
            for (const m of this.all_submuscles) {
                const targetPct = this.target_sub_vol[m] || 0.0;
                const actualPct = (subVols[m] || 0.0) / totalSubVol;
                E_distr += Math.pow(actualPct - targetPct, 2);
            }
            E_distr /= 2.0;
        }

        // 5. Variety Error
        let E_variety = 0.0;
        if (totalExercises > 0) {
            const varietyRatio = uniqueExercises.size / totalExercises;
            E_variety = Math.pow(1.0 - varietyRatio, 2);
        }

        // 6. Balance Error
        let E_balance = 0.0;
        if (dailyFatigue.length > 1) {
            const maxDayFatigue = this.config.max_ex * this.config.max_sets * this.config.max_reps * 15.0;
            const maxVarF = Math.pow(maxDayFatigue / 2.0, 2);
            
            const meanF = dailyFatigue.reduce((a, b) => a + b, 0) / dailyFatigue.length;
            const varFatigue = dailyFatigue.reduce((a, b) => a + Math.pow(b - meanF, 2), 0) / dailyFatigue.length;
            const normVarF = maxVarF > 0 ? varFatigue / maxVarF : 0.0;

            const maxDayVol = this.config.max_ex * this.config.max_sets * this.config.max_reps;
            const maxVarV = Math.pow(maxDayVol / 2.0, 2);
            
            const meanV = dailyVol.reduce((a, b) => a + b, 0) / dailyVol.length;
            const varVol = dailyVol.reduce((a, b) => a + Math.pow(b - meanV, 2), 0) / dailyVol.length;
            const normVarV = maxVarV > 0 ? varVol / maxVarV : 0.0;

            E_balance = (normVarF + normVarV) / 2.0;
        }

        const rawMetrics = {
            curve: E_curva,
            vol: E_vol,
            ton: E_ton,
            tut: E_tut,
            distr: E_distr,
            variety: E_variety,
            balance: E_balance
        };

        const scaled = {};
        for (const k in rawMetrics) {
            let scale = this.scales[k] || 1.0;
            if (scale === 0.0) scale = 1e-6;
            scaled[k] = rawMetrics[k] / scale;
        }

        const moCost = 
            this.config.weights.curve * scaled.curve +
            this.config.weights.vol * scaled.vol +
            this.config.weights.ton * scaled.ton +
            this.config.weights.tut * scaled.tut +
            (this.config.weights.distr || 0.2) * scaled.distr +
            (this.config.weights.variety || 0.1) * scaled.variety +
            (this.config.weights.balance || 0.1) * scaled.balance;

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
        const mutations = ['add_ex', 'remove_ex', 'swap_ex', 'add_set', 'remove_set', 'mut_reps', 'mut_rpe', 'mut_partials'];
        const mType = randomChoice(mutations);

        if (mType === 'add_ex') {
            if (day.length < this.config.max_ex) {
                const ex = new ScheduledExercise(this.getRandomExercise());
                for (let i = 0; i < this.config.min_sets; i++) {
                    ex.sets.push(new ScheduledSet(10, 0, 8.0));
                }
                day.push(ex);
            }
        } else if (mType === 'remove_ex') {
            if (day.length > this.config.min_ex) {
                day.splice(randomInt(0, day.length - 1), 1);
            }
        } else if (mType === 'swap_ex') {
            if (day.length > 0) {
                const idx = randomInt(0, day.length - 1);
                const newEx = new ScheduledExercise(this.getRandomExercise());
                newEx.sets = day[idx].sets.map(s => s.clone());
                day[idx] = newEx;
            }
        } else if (mType === 'add_set') {
            if (day.length > 0) {
                const ex = randomChoice(day);
                if (ex.sets.length < this.config.max_sets) {
                    ex.sets.push(new ScheduledSet(10, 0, 8.0));
                }
            }
        } else if (mType === 'remove_set') {
            if (day.length > 0) {
                const ex = randomChoice(day);
                if (ex.sets.length > this.config.min_sets) {
                    ex.sets.pop();
                }
            }
        } else if (mType === 'mut_reps') {
            if (day.length > 0) {
                const ex = randomChoice(day);
                if (ex.sets.length > 0) {
                    const s = randomChoice(ex.sets);
                    s.base_reps += randomChoice([-2, -1, 1, 2]);
                    s.base_reps = Math.max(this.config.min_reps, Math.min(this.config.max_reps, s.base_reps));
                }
            }
        } else if (mType === 'mut_rpe') {
            if (day.length > 0) {
                const ex = randomChoice(day);
                if (ex.sets.length > 0) {
                    const s = randomChoice(ex.sets);
                    s.rpe += randomChoice([-0.5, 0.5]);
                    s.rpe = Math.max(5.0, Math.min(10.0, s.rpe));
                }
            }
        } else if (mType === 'mut_partials') {
            if (day.length > 0) {
                const ex = randomChoice(day);
                if (ex.sets.length > 0) {
                    const s = randomChoice(ex.sets);
                    if (s.rpe >= 9.0) {
                        s.partial_reps = randomChoice([0, 2, 4, 6]);
                    } else {
                        s.partial_reps = 0;
                    }
                }
            }
        }

        return newState;
    }

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
    solve(iterations = 10000, initialTemp = 100.0, coolingRate = null, progressCallback = null) {
        if (!coolingRate) {
            coolingRate = iterations > 0 ? Math.pow(0.01 / initialTemp, 1.0 / iterations) : 0.995;
        }

        this.calibrate();

        let currentState = this.generateRandomState();
        let currentCost = this.evaluateWorkout(currentState);

        let bestState = currentState;
        let bestCost = currentCost;

        let T = initialTemp;

        for (let i = 0; i < iterations; i++) {
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

            if (progressCallback && i % 500 === 0) {
                progressCallback({
                    iteration: i,
                    total: iterations,
                    temp: T,
                    currentCost,
                    bestCost
                });
            }
        }

        return { bestState, bestCost };
    }
}
