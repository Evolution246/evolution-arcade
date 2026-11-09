// HYPERFLIP table + physics. Units: table is 400 wide x 720 tall, y points down.
export const W = 400, H = 720, BALL_R = 9;
const G = 1150;                       // gravity down the table
const MAX_V = 1900;

// ---------- table geometry ----------
const seg = (x1, y1, x2, y2, o = {}) => ({ x1, y1, x2, y2, e: 0.45, ...o });
const walls = [];
// top arch (center 205,200 r 185), from the left wall over to the plunger lane
const ARC = [];
for (let i = 0; i <= 24; i++) { const a = Math.PI - (i / 24) * Math.PI; ARC.push([205 + 185 * Math.cos(a), 200 - 185 * Math.sin(a)]); }
for (let i = 0; i < ARC.length - 1; i++) walls.push(seg(ARC[i][0], ARC[i][1], ARC[i + 1][0], ARC[i + 1][1], { e: 0.6 }));
walls.push(seg(20, 200, 20, 520));                         // left wall
walls.push(seg(390, 200, 390, 700));                       // outer right wall (plunger side)
walls.push(seg(360, 182, 360, 520));                       // plunger lane inner wall (upper)
walls.push(seg(360, 520, 360, 690));                       // plunger lane inner wall (lower)
walls.push(seg(360, 690, 390, 690, { e: 0.1 }));           // plunger floor
walls.push(seg(20, 520, 112, 616, { e: 0.3 }));            // left inlane guide
walls.push(seg(360, 520, 268, 616, { e: 0.3 }));           // right inlane guide
// top lane guides
for (const x of [140, 180, 220, 260]) walls.push(seg(x, 92, x, 126, { e: 0.4, post: true }));
// slingshots sit flush against the wall and inlane guide (no pockets for the ball to get stuck in)
walls.push(seg(20, 440, 88, 591, { kick: 480, id: "slingL", e: 0.5 }));
walls.push(seg(360, 440, 292, 591, { kick: 480, id: "slingR", e: 0.5 }));
// stand-up target banks (left: H Y P, right: E R !)
export const TARGETS = [
  { id: "t0", x1: 26, y1: 300, x2: 26, y2: 334, ch: "H", bank: 0 },
  { id: "t1", x1: 26, y1: 344, x2: 26, y2: 378, ch: "Y", bank: 0 },
  { id: "t2", x1: 26, y1: 388, x2: 26, y2: 422, ch: "P", bank: 0 },
  { id: "t3", x1: 354, y1: 300, x2: 354, y2: 334, ch: "E", bank: 1 },
  { id: "t4", x1: 354, y1: 344, x2: 354, y2: 378, ch: "R", bank: 1 },
  { id: "t5", x1: 354, y1: 388, x2: 354, y2: 422, ch: "!", bank: 1 },
];
for (const t of TARGETS) walls.push(seg(t.x1, t.y1, t.x2, t.y2, { e: 0.35, target: t.id }));
// the gate stops a ball in play from dropping back into the plunger lane
const GATE = seg(360, 182, 388, 150, { e: 0.3, gate: true });

export const BUMPERS = [
  { x: 152, y: 215, r: 22, id: "b0" }, { x: 248, y: 215, r: 22, id: "b1" }, { x: 200, y: 288, r: 22, id: "b2" },
];
export const CORE = { x: 200, y: 400, r: 14 };
export const LANES = [{ x: 160 }, { x: 200 }, { x: 240 }];
export const POSTS = [{ x: 200, y: 150, r: 5 }];
export const WALLS = walls;
export const GATE_SEG = GATE;

// ---------- flippers ----------
export class Flipper {
  constructor(px, py, side) {
    this.px = px; this.py = py; this.side = side; this.len = 68; this.r = 8;
    const d = Math.PI / 180;
    this.rest = side === "L" ? 30 * d : 150 * d;
    this.up = side === "L" ? -28 * d : 208 * d;
    this.a = this.rest; this.w = 0; this.pressed = false;
  }
  tip() { return [this.px + this.len * Math.cos(this.a), this.py + this.len * Math.sin(this.a)]; }
  update(dt) {
    const target = this.pressed ? this.up : this.rest;
    const speed = this.pressed ? 26 : 15;
    const diff = target - this.a;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    this.w = dt > 0 ? step / dt : 0;
    this.a += step;
  }
}

// ---------- collision helpers ----------
function closest(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [s.x1 + t * dx, s.y1 + t * dy];
}
function bounce(b, nx, ny, e, vpx = 0, vpy = 0) {
  const rvx = b.vx - vpx, rvy = b.vy - vpy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    // a touch of friction along the surface
    const tx = -ny, ty = nx, vt = (b.vx - vpx) * tx + (b.vy - vpy) * ty;
    b.vx -= vt * 0.02 * tx; b.vy -= vt * 0.02 * ty;
    return -vn;
  }
  return 0;
}

// ---------- the world ----------
export class World {
  constructor(events) {
    this.ev = events || (() => {});
    this.flippers = [new Flipper(118, 628, "L"), new Flipper(282, 628, "R")];
    this.balls = [];
    this.cool = new Map();
  }
  addBall(x = 375, y = 678, vx = 0, vy = 0, inLane = true) {
    const b = { x, y, vx, vy, inLane, trail: [], id: Math.random() };
    this.balls.push(b); return b;
  }
  hit(key, ms = 120) { const now = this.time || 0; if ((this.cool.get(key) || -1) > now) return false; this.cool.set(key, now + ms / 1000); return true; }
  step(dt) {
    this.time = (this.time || 0) + dt;
    const n = 10, h = dt / n;
    for (let k = 0; k < n; k++) {
      this.flippers.forEach((f) => f.update(h));
      for (const b of this.balls) this.stepBall(b, h);
    }
    // drains
    for (const b of [...this.balls]) if (b.y > H + 30) { this.balls.splice(this.balls.indexOf(b), 1); this.ev("drain", b); }
    for (const b of this.balls) { b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift(); }
  }
  stepBall(b, h) {
    b.vy += G * h;
    const sp = Math.hypot(b.vx, b.vy); if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.inLane && b.x < 352) { b.inLane = false; this.ev("enter", b); }
    const segs = b.inLane ? WALLS : WALLS.concat([GATE]);
    for (const s of segs) {
      const [cx, cy] = closest(b.x, b.y, s);
      let dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d >= BALL_R || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      b.x = cx + nx * BALL_R; b.y = cy + ny * BALL_R;
      const imp = bounce(b, nx, ny, s.e);
      if (s.kick && imp > 40 && this.hit(s.id, 150)) {
        b.vx += nx * s.kick; b.vy += ny * s.kick;
        this.ev("sling", { id: s.id, x: cx, y: cy });
      } else if (s.target && imp > 60 && this.hit(s.target, 300)) this.ev("target", { id: s.target, x: cx, y: cy });
      else if (imp > 280 && this.hit("wall", 80)) this.ev("wall", { imp });
    }
    for (const p of POSTS) this.circle(b, p.x, p.y, p.r, 0.5, null);
    for (const bm of BUMPERS) this.circle(b, bm.x, bm.y, bm.r, 0.4, bm);
    this.circle(b, CORE.x, CORE.y, CORE.r, 0.55, { core: true });
    for (const f of this.flippers) this.flipper(b, f);
    // top lane rollovers
    if (b.y > 98 && b.y < 124) for (let i = 0; i < LANES.length; i++) {
      if (Math.abs(b.x - LANES[i].x) < 14 && this.hit("lane" + i, 600)) this.ev("lane", { i });
    }
  }
  circle(b, x, y, r, e, obj) {
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy), m = r + BALL_R;
    if (d >= m || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = x + nx * m; b.y = y + ny * m;
    const imp = bounce(b, nx, ny, e);
    if (obj && obj.id && this.hit(obj.id, 90)) {
      // pop bumpers fire the ball away
      const vn = b.vx * nx + b.vy * ny, want = 560;
      if (vn < want) { b.vx += nx * (want - vn); b.vy += ny * (want - vn); }
      this.ev("bumper", { id: obj.id, x, y });
    } else if (obj && obj.core && imp > 50 && this.hit("core", 400)) this.ev("core", { x, y });
  }
  flipper(b, f) {
    const [tx, ty] = f.tip();
    const s = { x1: f.px, y1: f.py, x2: tx, y2: ty };
    const [cx, cy] = closest(b.x, b.y, s);
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), m = BALL_R + f.r;
    if (d >= m || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * m; b.y = cy + ny * m;
    // speed of the flipper surface at the contact point
    const vpx = -f.w * (cy - f.py), vpy = f.w * (cx - f.px);
    const imp = bounce(b, nx, ny, 0.25, vpx, vpy);
    if (imp > 500 && this.hit("flip" + f.side, 120)) this.ev("flipHit", { imp });
  }
  launch(power) {
    for (const b of this.balls) if (b.inLane && b.y > 640 && Math.abs(b.vy) < 30) { b.vy = -power; this.ev("launch", b); return true; }
    return false;
  }
}
