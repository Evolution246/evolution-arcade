// Tic-Tac-Gone rules + computer opponent. No DOM here, so it runs in Node tests too.
// State: { x:[cells oldest→newest], o:[...], turn:"x"|"o", winner:null|"x"|"o", line:null|[a,b,c], starter:"x"|"o", n:moveCount }

export const MAX = 3;
export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const other = (p) => (p === "x" ? "o" : "x");

export function newGame(starter = "x") {
  return { x: [], o: [], turn: starter, winner: null, line: null, starter, n: 0 };
}

// Firebase drops empty arrays, so always normalize before use.
export function norm(s) {
  return { x: s.x || [], o: s.o || [], turn: s.turn, winner: s.winner || null, line: s.line || null, starter: s.starter || "x", n: s.n || 0 };
}

export const ownerOf = (s, c) => (s.x.includes(c) ? "x" : s.o.includes(c) ? "o" : null);

// The piece that disappears when this player makes their next move (null if they have < 3 down).
export const nextToVanish = (s, p) => (s[p].length >= MAX ? s[p][0] : null);

export function legal(s) {
  if (s.winner) return [];
  const out = [];
  for (let c = 0; c < 9; c++) if (!ownerOf(s, c)) out.push(c);
  return out;
}

function winLine(cells) {
  if (cells.length < 3) return null;
  return LINES.find((l) => l.every((c) => cells.includes(c))) || null;
}

// Place, drop the oldest if over the limit, then check for a win.
// The vanished piece is gone before the check, so it can't count toward a line.
export function play(s, cell) {
  if (s.winner || ownerOf(s, cell) !== null || cell < 0 || cell > 8) return null;
  const p = s.turn;
  const mine = [...s[p], cell];
  let gone = null;
  if (mine.length > MAX) gone = mine.shift();
  const line = winLine(mine);
  return { ...s, [p]: mine, turn: other(p), winner: line ? p : null, line, n: s.n + 1, gone };
}

// ---------- computer opponent ----------
const key = (s) => s.turn + s.x.join("") + "|" + s.o.join("");

// Count lines a player could finish: two of theirs + an empty cell they'll still have after their next move.
function threats(s, p) {
  const keep = s[p].length >= MAX ? s[p].slice(1) : s[p];
  let t = 0;
  for (const l of LINES) {
    let mine = 0, empty = 0;
    for (const c of l) {
      if (keep.includes(c)) mine++;
      else if (!ownerOf(s, c)) empty++;
    }
    if (mine === 2 && empty === 1) t++;
  }
  return t;
}

function search(s, depth, alpha, beta, memo) {
  if (s.winner) return -1000 - depth; // the player who just moved won, so it's bad for s.turn
  if (depth === 0) return (threats(s, s.turn) - threats(s, other(s.turn))) * 10 + (s[s.turn].includes(4) ? 3 : 0) - (s[other(s.turn)].includes(4) ? 3 : 0);
  const k = key(s) + depth;
  if (memo.has(k)) return memo.get(k);
  let best = -Infinity;
  for (const c of order(legal(s))) {
    const v = -search(play(s, c), depth - 1, -beta, -alpha, memo);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  memo.set(k, best);
  return best;
}
const PRI = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const order = (cells) => [...cells].sort((a, b) => PRI.indexOf(a) - PRI.indexOf(b));

export const LEVELS = {
  easy: { depth: 1, slip: 0.45 },   // grabs an instant win most of the time, otherwise wanders
  medium: { depth: 3, slip: 0.12 }, // sees a move or two ahead
  hard: { depth: 9, slip: 0 },      // plays it straight
};

export function cpuMove(s, level = "medium", rand = Math.random) {
  const moves = legal(s);
  if (!moves.length) return null;
  const { depth, slip } = LEVELS[level] || LEVELS.medium;
  if (rand() < slip) return moves[Math.floor(rand() * moves.length)];
  let best = -Infinity, picks = [];
  const memo = new Map();
  for (const c of order(moves)) {
    const v = -search(play(s, c), depth - 1, -Infinity, Infinity, memo);
    if (v > best) { best = v; picks = [c]; }
    else if (v === best) picks.push(c);
  }
  return picks[Math.floor(rand() * picks.length)];
}
