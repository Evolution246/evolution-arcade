// Launch Control drag-race physics. Same car for every player: skill decides the race.
export const QUARTER = 402.34;          // meters
export const RATIOS = [3.1, 2.15, 1.62, 1.28, 1.05, 0.88];
const K = 140, FORCE = 8.2, GRIP = 16, DRAG = 0.0012, ROLL = 0.15;
export const IDLE = 900, LIMIT = 8200;
export const LAUNCH_WIN = [6000, 6800];
export const SHIFT_WIN = [7200, 7800];
export const NOS_TIME = 2.6, NOS_POW = 0.7;
// power peaks around 6,400 and falls off hard past 7,800, so the green band really is the fastest place to shift
const torque = (r) => Math.max(0.35, 1 - ((r - 6400) / 5200) ** 2) * (r > 7800 ? Math.max(0.25, 1 - (r - 7800) / 650) : 1);

export class Car {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this, { phase: "staged", rpm: IDLE, v: 0, d: 0, t: 0, g: 0, cut: 0, launchRpm: 0, bog: 0, spin: 0,
      nos: 0, nosUsed: false, et: null, trap: null, d60: null, shifts: [], launchGrade: null, limiterTime: 0 });
  }
  // staged: hold rev to climb, release to fall. The needle drifts a little so you have to feather it.
  rev(dt, holding, time) {
    if (this.phase !== "staged") return;
    const target = holding ? 8600 : IDLE;
    const rate = holding ? 2.6 : 3.4;
    this.rpm += (target - this.rpm) * (1 - Math.exp(-rate * dt));
    this.rpm += Math.sin(time * 9.1) * 40 * (holding ? 1 : 0.2);
    if (this.rpm > LIMIT) this.rpm = LIMIT - 300 * Math.random();
    this.rpm = Math.max(IDLE * 0.9, this.rpm);
  }
  launch() {
    if (this.phase !== "staged") return null;
    this.phase = "run";
    this.launchRpm = this.rpm;
    const r = this.rpm;
    if (r < LAUNCH_WIN[0]) { this.bog = 0.9; this.bogPow = Math.max(0.35, r / LAUNCH_WIN[0]); this.launchGrade = "BOGGED"; }
    else if (r > LAUNCH_WIN[1]) { this.spin = 0.9; this.spinPow = Math.max(0.68, 1 - (r - LAUNCH_WIN[1]) / 3000); this.launchGrade = "WHEELSPIN"; }
    else this.launchGrade = "PERFECT LAUNCH";
    return this.launchGrade;
  }
  shift() {
    if (this.phase !== "run" || this.g >= RATIOS.length - 1 || this.cut > 0) return null;
    const r = this.rpm;
    let grade, cut;
    if (r >= SHIFT_WIN[0] && r <= SHIFT_WIN[1]) { grade = "PERFECT"; cut = 0.11; }
    else if (r > SHIFT_WIN[1]) { grade = "LATE"; cut = 0.14; }
    else if (r >= 6400) { grade = "EARLY"; cut = 0.15; }
    else { grade = "WAY EARLY"; cut = 0.2; }
    this.g++; this.cut = cut; this.shifts.push(grade);
    return grade;
  }
  nitro() {
    if (this.phase !== "run" || this.nosUsed) return false;
    this.nosUsed = true; this.nos = NOS_TIME; return true;
  }
  step(dt) {
    if (this.phase !== "run" && this.phase !== "done") return;
    if (this.phase === "done") { // coast down after the line
      this.v *= Math.exp(-dt / 2.6); this.d += this.v * dt;
      this.rpm += (2200 - this.rpm) * (1 - Math.exp(-dt * 1.5)); return;
    }
    this.t += dt;
    let rpm = this.v * RATIOS[this.g] * K;
    if (this.t < 0.35) rpm = Math.max(rpm, this.launchRpm - 1200 * (this.t / 0.35));
    const atLimit = rpm >= LIMIT;
    if (atLimit) { rpm = LIMIT - 200 * Math.random(); this.limiterTime += dt; }
    this.rpm = rpm;
    if (this.cut > 0) this.cut -= dt;
    if (this.nos > 0) this.nos -= dt;
    if (this.bog > 0) this.bog -= dt;
    if (this.spin > 0) this.spin -= dt;
    const nos = this.nos > 0 ? NOS_POW : 0;
    let F = this.cut > 0 || atLimit ? 0 : torque(rpm) * RATIOS[this.g] * FORCE * (1 + nos);
    if (this.bog > 0) F *= this.bogPow;
    let grip = GRIP * (this.nos > 0 ? 1.25 : 1);
    if (this.spin > 0) grip *= this.spinPow;
    F = Math.min(F, grip);
    const a = F - DRAG * this.v * this.v - ROLL;
    this.v = Math.max(0, this.v + a * dt);
    this.d += this.v * dt;
    if (!this.d60 && this.d >= 18.29) this.d60 = this.t;
    if (this.d >= QUARTER) { this.et = this.t - (this.d - QUARTER) / Math.max(1, this.v); this.trap = this.v; this.phase = "done"; }
  }
}

// CPU driver: decides when to launch, shift and hit the nitro. Same car as you.
export const CPU = {
  easy: { rt: [0.36, 0.08], foul: 0.05, launch: [5600, 600], shift: [6950, 450], nos: [3, 7] },
  medium: { rt: [0.27, 0.05], foul: 0.03, launch: [6250, 320], shift: [7400, 260], nos: [2.5, 5] },
  hard: { rt: [0.19, 0.035], foul: 0.02, launch: [6400, 170], shift: [7500, 130], nos: [1.8, 3] },
};
const gauss = (m, s) => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function cpuPlan(level) {
  const c = CPU[level] || CPU.medium;
  const foul = Math.random() < c.foul;
  return {
    rt: foul ? -Math.random() * 0.15 - 0.02 : Math.max(0.02, gauss(c.rt[0], c.rt[1])),
    launchRpm: Math.min(8000, Math.max(3000, gauss(c.launch[0], c.launch[1]))),
    shiftAt: Array.from({ length: 5 }, () => Math.min(8150, Math.max(6000, gauss(c.shift[0], c.shift[1])))),
    nosAt: c.nos[0] + Math.random() * (c.nos[1] - c.nos[0]),
  };
}
