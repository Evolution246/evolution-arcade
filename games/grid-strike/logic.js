// Grid Strike (battleship) rules + computer. No DOM.
export const N = 10;
export const FLEET = [
  { id: "carrier", name: "Carrier", len: 5 },
  { id: "battle", name: "Battleship", len: 4 },
  { id: "cruiser", name: "Cruiser", len: 3 },
  { id: "sub", name: "Sub", len: 3 },
  { id: "destroyer", name: "Destroyer", len: 2 },
];
export const TOTAL = FLEET.reduce((a, s) => a + s.len, 0);
export const cellsOf = (c, len, vert) => Array.from({ length: len }, (_, k) => (vert ? c + k * N : c + k));
export function fits(c, len, vert, taken) {
  const x = c % N, y = Math.floor(c / N);
  if (vert ? y + len > N : x + len > N) return false;
  return cellsOf(c, len, vert).every((i) => !taken.has(i));
}
// ships: [{id,name,len,c,vert,cells}]
export function randomFleet(rand = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = new Set(), ships = [];
    let ok = true;
    for (const s of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const vert = rand() < 0.5, c = Math.floor(rand() * N * N);
        if (fits(c, s.len, vert, taken)) {
          const cells = cellsOf(c, s.len, vert);
          cells.forEach((i) => taken.add(i));
          ships.push({ ...s, c, vert, cells });
          placed = true;
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error("could not place fleet");
}
// try to rotate a ship in place (keeps its first cell; nudges it if needed)
export function rotateShip(ships, id) {
  const s = ships.find((x) => x.id === id);
  const taken = new Set(ships.filter((x) => x.id !== id).flatMap((x) => x.cells));
  const vert = !s.vert;
  const tries = [s.c];
  for (let k = 1; k < s.len; k++) tries.push(vert ? s.c - k * N : s.c - k);
  for (const c of tries) {
    if (c < 0) continue;
    if (!vert && Math.floor(c / N) !== Math.floor(s.c / N)) continue;
    if (fits(c, s.len, vert, taken)) {
      return ships.map((x) => (x.id === id ? { ...x, c, vert, cells: cellsOf(c, x.len, vert) } : x));
    }
  }
  return null;
}
// resolve a shot against a fleet, given that fleet's previous hits (Set of cells)
export function resolve(ships, hitsSoFar, cell) {
  const ship = ships.find((s) => s.cells.includes(cell));
  if (!ship) return { res: "miss" };
  const hits = new Set(hitsSoFar); hits.add(cell);
  const sunk = ship.cells.every((i) => hits.has(i));
  const allSunk = ships.every((s) => s.cells.every((i) => hits.has(i)));
  return { res: "hit", sunk: sunk ? { id: ship.id, name: ship.name, cells: ship.cells } : null, allSunk };
}

// ---------- computer targeting ----------
// knowledge: { shots: Map cell->"miss"|"hit", sunkCells:Set, remaining:[lengths] }
const nb = (c) => {
  const x = c % N, y = Math.floor(c / N), out = [];
  if (x > 0) out.push(c - 1); if (x < N - 1) out.push(c + 1);
  if (y > 0) out.push(c - N); if (y < N - 1) out.push(c + N);
  return out;
};
export function cpuShot(k, level = "medium", rand = Math.random) {
  const open = [];
  for (let i = 0; i < N * N; i++) if (!k.shots.has(i)) open.push(i);
  if (level === "easy") {
    // mostly random, but finishes off a ship it is already hitting half the time
    const live = [...k.shots].filter(([c, v]) => v === "hit" && !k.sunkCells.has(c)).map(([c]) => c);
    if (live.length && rand() < 0.5) {
      const cand = live.flatMap(nb).filter((c) => !k.shots.has(c));
      if (cand.length) return cand[Math.floor(rand() * cand.length)];
    }
    return open[Math.floor(rand() * open.length)];
  }
  const liveHits = [...k.shots].filter(([c, v]) => v === "hit" && !k.sunkCells.has(c)).map(([c]) => c);
  if (level === "medium") {
    if (liveHits.length) {
      // line up two hits if possible
      if (liveHits.length >= 2) {
        const sorted = [...liveHits].sort((a, b) => a - b);
        const sameRow = sorted.every((c) => Math.floor(c / N) === Math.floor(sorted[0] / N));
        const sameCol = sorted.every((c) => c % N === sorted[0] % N);
        const ends = sameRow ? [sorted[0] - 1, sorted[sorted.length - 1] + 1].filter((c) => c >= 0 && Math.floor(c / N) === Math.floor(sorted[0] / N))
          : sameCol ? [sorted[0] - N, sorted[sorted.length - 1] + N].filter((c) => c >= 0 && c < N * N) : [];
        const e = ends.filter((c) => !k.shots.has(c));
        if (e.length) return e[Math.floor(rand() * e.length)];
      }
      const cand = liveHits.flatMap(nb).filter((c) => !k.shots.has(c));
      if (cand.length) return cand[Math.floor(rand() * cand.length)];
    }
    const par = open.filter((c) => ((c % N) + Math.floor(c / N)) % 2 === 0);
    const pool = par.length ? par : open;
    return pool[Math.floor(rand() * pool.length)];
  }
  // hard: probability density of every remaining ship placement
  const score = new Array(N * N).fill(0);
  for (const len of k.remaining) for (const vert of [false, true]) for (let c = 0; c < N * N; c++) {
    const x = c % N, y = Math.floor(c / N);
    if (vert ? y + len > N : x + len > N) continue;
    const cells = cellsOf(c, len, vert);
    if (cells.some((i) => k.shots.get(i) === "miss" || k.sunkCells.has(i))) continue;
    const covers = cells.filter((i) => liveHits.includes(i)).length;
    const w = covers ? 1 + covers * 30 : 1;
    for (const i of cells) if (!k.shots.has(i)) score[i] += w;
  }
  let best = -1, picks = [];
  for (const c of open) { if (score[c] > best) { best = score[c]; picks = [c]; } else if (score[c] === best) picks.push(c); }
  return picks[Math.floor(rand() * picks.length)];
}
export function newKnowledge() { return { shots: new Map(), sunkCells: new Set(), remaining: FLEET.map((s) => s.len) }; }
export function learn(k, cell, r) {
  k.shots.set(cell, r.res);
  if (r.sunk) { r.sunk.cells.forEach((c) => k.sunkCells.add(c)); const i = k.remaining.indexOf(r.sunk.cells.length); if (i >= 0) k.remaining.splice(i, 1); }
}
