// Four Down (connect four) rules + computer opponent. No DOM, so it runs in Node tests too.
// Board: 42-char string, index = row*7 + col, row 0 is the BOTTOM. '.' empty, 'x' / 'o' discs.
export const COLS = 7, ROWS = 6;
export const other = (p) => (p === "x" ? "o" : "x");
export const idx = (c, r) => r * COLS + c;

export function newGame(starter = "x") {
  return { b: ".".repeat(42), turn: starter, winner: null, line: null, starter, n: 0, last: -1 };
}
export function norm(s) {
  return { b: s.b || ".".repeat(42), turn: s.turn, winner: s.winner || null, line: s.line || null, starter: s.starter || "x", n: s.n || 0, last: s.last ?? -1 };
}
export function dropRow(b, c) {
  for (let r = 0; r < ROWS; r++) if (b[idx(c, r)] === ".") return r;
  return -1;
}
export const legal = (s) => (s.winner ? [] : [0, 1, 2, 3, 4, 5, 6].filter((c) => dropRow(s.b, c) >= 0));

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function lineAt(b, c, r) {
  const p = b[idx(c, r)];
  for (const [dc, dr] of DIRS) {
    const cells = [idx(c, r)];
    for (const s of [1, -1]) {
      let cc = c + dc * s, rr = r + dr * s;
      while (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && b[idx(cc, rr)] === p) { cells.push(idx(cc, rr)); cc += dc * s; rr += dr * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

export function play(s, c) {
  if (s.winner) return null;
  const r = dropRow(s.b, c);
  if (r < 0) return null;
  const i = idx(c, r);
  const b = s.b.slice(0, i) + s.turn + s.b.slice(i + 1);
  const line = lineAt(b, c, r);
  const full = !b.includes(".");
  return { ...s, b, last: i, n: s.n + 1, turn: other(s.turn), line: line || null, winner: line ? s.turn : full ? "draw" : null };
}

// ---------- computer ----------
const WINDOWS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dc, dr] of DIRS) {
  const w = [];
  for (let k = 0; k < 4; k++) { const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) break; w.push(idx(cc, rr)); }
  if (w.length === 4) WINDOWS.push(w);
}
function evalBoard(b, p) {
  const q = other(p);
  let score = 0;
  for (let r = 0; r < ROWS; r++) { if (b[idx(3, r)] === p) score += 3; else if (b[idx(3, r)] === q) score -= 3; }
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (const i of w) { if (b[i] === p) mine++; else if (b[i] === q) theirs++; }
    if (mine && theirs) continue;
    if (mine === 3) score += 12; else if (mine === 2) score += 3;
    if (theirs === 3) score -= 14; else if (theirs === 2) score -= 3;
  }
  return score;
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function negamax(s, depth, alpha, beta) {
  if (s.winner === "draw") return 0;
  if (s.winner) return -100000 - depth; // previous mover won
  if (depth === 0) return evalBoard(s.b, s.turn);
  let best = -Infinity;
  for (const c of ORDER) {
    if (dropRow(s.b, c) < 0) continue;
    const v = -negamax(play(s, c), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
export const LEVELS = { easy: { depth: 2, slip: 0.35 }, medium: { depth: 4, slip: 0.08 }, hard: { depth: 7, slip: 0 } };
export function cpuMove(s, level = "medium", rand = Math.random) {
  const moves = legal(s);
  if (!moves.length) return null;
  const { depth, slip } = LEVELS[level] || LEVELS.medium;
  // always take a win / block an immediate loss, even on easy
  for (const c of moves) if (play(s, c).winner === s.turn) return c;
  if (rand() < slip) return moves[Math.floor(rand() * moves.length)];
  let best = -Infinity, picks = [];
  for (const c of ORDER) {
    if (!moves.includes(c)) continue;
    const v = -negamax(play(s, c), depth - 1, -Infinity, Infinity);
    if (v > best) { best = v; picks = [c]; } else if (v === best) picks.push(c);
  }
  return picks[Math.floor(rand() * picks.length)];
}
