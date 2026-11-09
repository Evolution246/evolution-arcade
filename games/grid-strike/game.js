import { N, FLEET, randomFleet, rotateShip, fits, cellsOf, resolve, cpuShot, newKnowledge, learn } from "./logic.js";
import { onlineReady } from "../../js/net.js";
import { createRoom, joinRoom, cleanCode, myName, saveName } from "../../js/duo.js";

const GAME = "grid-strike";
const $ = (id) => document.getElementById(id);
const show = (id) => ["menu", "wait", "game"].forEach((k) => ($(k).hidden = k !== id));
const other = (p) => (p === "x" ? "o" : "x");

let mode = null, level = "medium";
let G = null;            // local view of the match
let score = { me: 0, them: 0 };
let room = null, R = null, me = "x";
let cpu = null;          // { fleet, k, hitsOnMe:Set } in vs-computer mode
let sel = null;          // selected ship id during setup
const resolving = new Set();

function fresh(starterIsMe = true) {
  return { phase: "setup", turn: starterIsMe ? "me" : "them", fleet: randomFleet(), myShots: new Map(), theirShots: new Map(),
    mySunk: [], theirSunk: [], winner: null, lastMine: -1, lastTheirs: -1, ready: false, rivalReady: false, starterIsMe };
}

// ---------- grids ----------
function buildGrid(el, onTap) {
  el.innerHTML = "";
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement("button");
    b.className = "c"; b.dataset.i = i;
    b.setAttribute("aria-label", `${"ABCDEFGHIJ"[i % N]}${Math.floor(i / N) + 1}`);
    b.onclick = () => onTap(i);
    el.appendChild(b);
  }
  return [...el.children];
}
const enemyCells = buildGrid($("enemy"), fireAt);
const mineCells = buildGrid($("mine"), setupTap);

function shipClass(s, i) {
  const k = s.cells.indexOf(i);
  let c = " ship";
  if (s.vert) { if (k === 0) c += " v0"; if (k === s.len - 1) c += " v1"; c += " h0 h1"; }
  else { if (k === 0) c += " h0"; if (k === s.len - 1) c += " h1"; c += " v0 v1"; }
  return c;
}
function boom(cell) {
  const e = document.createElement("div"); e.className = "explode";
  cell.appendChild(e); setTimeout(() => e.remove(), 520);
}

function render() {
  if (!G) return;
  const setup = G.phase === "setup";
  $("enemyBox").hidden = setup;
  $("setupBar").hidden = !setup || (mode === "online" && G.ready);
  $("mine").classList.toggle("small", !setup);
  $("mineLbl").firstElementChild.textContent = setup ? "YOUR FLEET · PLACEMENT" : "YOUR FLEET";
  // my grid
  const sunkMine = new Set(G.theirSunk.flatMap((s) => s.cells));
  mineCells.forEach((el, i) => {
    const s = G.fleet.find((x) => x.cells.includes(i));
    const shot = G.theirShots.get(i);
    el.className = "c" + (s ? shipClass(s, i) : "") + (shot === "h" ? " hit" : shot === "m" ? " miss" : "") +
      (sunkMine.has(i) ? " sunk" : "") + (setup && s && s.id === sel ? " sel" : "") + (i === G.lastTheirs ? " last" : "");
  });
  // enemy grid
  const sunkThem = new Set(G.mySunk.flatMap((s) => s.cells));
  const reveal = G.winner === "them" && cpu ? cpu.fleet : null;
  enemyCells.forEach((el, i) => {
    const shot = G.myShots.get(i);
    const rs = reveal && !shot ? reveal.find((x) => x.cells.includes(i)) : null;
    el.className = "c" + (shot === "h" ? " hit" : shot === "m" ? " miss" : " open") + (sunkThem.has(i) ? " sunk" : "") +
      (rs ? shipClass(rs, i) : "") + (i === G.lastMine ? " last" : "");
  });
  const canFire = G.phase === "battle" && G.turn === "me" && !G.waiting && !(mode === "online" && R?.pending);
  $("enemy").classList.toggle("fire", canFire);
  // fleet chips + HUD
  const sunkIds = new Set(G.mySunk.map((s) => s.id));
  $("enemyFleet").innerHTML = FLEET.map((s) => `<span class="${sunkIds.has(s.id) ? "dead" : ""}"><i style="width:${s.len * 7}px"></i>${s.name}</span>`).join("");
  $("leftMe").textContent = `${5 - G.theirSunk.length} SHIPS`;
  $("leftThem").textContent = `${5 - G.mySunk.length} SHIPS`;
  $("shotsLbl").textContent = `${G.myShots.size} SHOTS · ${[...G.myShots.values()].filter((v) => v === "h").length} HITS`;
  $("mineSub").textContent = setup ? "" : `${[...G.theirShots.values()].filter((v) => v === "h").length} HITS TAKEN`;
  $("whoMe").classList.toggle("turn", G.phase === "battle" && G.turn === "me");
  $("whoThem").classList.toggle("turn", G.phase === "battle" && G.turn === "them");
  $("score").textContent = `${score.me} – ${score.them}`;
  // status
  const st = $("status"), hint = $("hint");
  st.className = "status"; hint.textContent = "";
  if (setup) {
    if (mode === "online" && G.ready) { st.textContent = G.rivalReady ? "STARTING…" : "WAITING FOR RIVAL"; hint.textContent = "Your fleet is locked in."; }
    else { st.textContent = "PLACE YOUR FLEET"; hint.textContent = sel ? "Tap the ship again to turn it, or tap an empty square to move it." : "Tap a ship to select it. Shuffle for a new layout."; }
  } else if (G.winner) {
    st.textContent = G.winner === "me" ? "VICTORY · FLEET DESTROYED" : "YOUR FLEET IS GONE";
    st.classList.add(G.winner === "me" ? "win" : "lose");
  } else if (G.turn === "me") { st.textContent = R?.pending ? "FIRING…" : "YOUR SHOT"; hint.textContent = G.note || "Tap a square in enemy waters."; }
  else { st.textContent = mode === "cpu" ? "CPU IS AIMING…" : "RIVAL IS AIMING…"; hint.textContent = G.note || ""; }
  const again = $("again");
  again.hidden = !G.winner;
  if (G.winner && mode === "online") {
    const rm = R?.rematch || {};
    again.textContent = rm[me] ? "WAITING FOR RIVAL…" : rm[other(me)] ? "RIVAL WANTS A REMATCH ▶" : "REMATCH";
    again.disabled = !!rm[me];
  } else { again.textContent = "REMATCH"; again.disabled = false; }
}

// ---------- setup ----------
function setupTap(i) {
  if (!G || G.phase !== "setup" || (mode === "online" && G.ready)) return;
  const s = G.fleet.find((x) => x.cells.includes(i));
  if (s) {
    if (sel === s.id) {
      const f = rotateShip(G.fleet, s.id);
      if (f) G.fleet = f; else flash(i);
    } else sel = s.id;
  } else if (sel) {
    const ship = G.fleet.find((x) => x.id === sel);
    const taken = new Set(G.fleet.filter((x) => x.id !== sel).flatMap((x) => x.cells));
    if (fits(i, ship.len, ship.vert, taken)) G.fleet = G.fleet.map((x) => (x.id === sel ? { ...x, c: i, cells: cellsOf(i, x.len, x.vert) } : x));
    else flash(i);
  }
  saveFleet(); render();
}
function flash(i) { const el = mineCells[i]; el.animate([{ background: "#5a0d0d" }, { background: "" }], { duration: 300 }); }
$("shuffle").onclick = () => { if (!G) return; G.fleet = randomFleet(); sel = null; saveFleet(); render(); };
$("ready").onclick = () => {
  if (!G) return; sel = null;
  if (mode === "cpu") { G.phase = "battle"; render(); if (G.turn === "them") cpuTurn(); return; }
  G.ready = true; saveFleet(); room.set(`ready/${me}`, true); render();
};

// ---------- firing ----------
function fireAt(i) {
  if (!G || G.phase !== "battle" || G.turn !== "me" || G.waiting || G.myShots.has(i)) return;
  if (mode === "cpu") {
    const r = resolve(cpu.fleet, new Set([...G.myShots].filter(([, v]) => v === "h").map(([c]) => c)), i);
    G.myShots.set(i, r.res === "hit" ? "h" : "m"); G.lastMine = i;
    if (r.sunk) G.mySunk.push({ id: r.sunk.id, cells: r.sunk.cells });
    G.note = r.sunk ? `You sank their ${r.sunk.name}!` : r.res === "hit" ? "Hit!" : "Miss.";
    if (r.res === "hit") requestAnimationFrame(() => boom(enemyCells[i]));
    if (r.allSunk) { G.winner = "me"; G.phase = "over"; score.me++; render(); return; }
    G.turn = "them"; render(); cpuTurn(); return;
  }
  if (R?.pending) return;
  G.waiting = true; render();
  room.set("pending", { by: me, c: i, n: (R?.shotCount || 0) + 1 }).finally(() => { G.waiting = false; });
}
function cpuTurn() {
  setTimeout(() => {
    if (mode !== "cpu" || !G || G.phase !== "battle") return;
    const c = cpuShot(cpu.k, level);
    const r = resolve(G.fleet, cpu.hitsOnMe, c);
    if (r.res === "hit") cpu.hitsOnMe.add(c);
    learn(cpu.k, c, r);
    G.theirShots.set(c, r.res === "hit" ? "h" : "m"); G.lastTheirs = c;
    if (r.sunk) G.theirSunk.push({ id: r.sunk.id, cells: r.sunk.cells });
    G.note = r.sunk ? `They sank your ${r.sunk.name}.` : r.res === "hit" ? "They hit one of your ships." : "They missed.";
    if (r.res === "hit") requestAnimationFrame(() => boom(mineCells[c]));
    if (r.allSunk) { G.winner = "them"; G.phase = "over"; score.them++; }
    else G.turn = "me";
    render();
  }, 750 + Math.random() * 450);
}

// ---------- modes ----------
function startCpu() {
  mode = "cpu"; score = { me: 0, them: 0 };
  $("nameMe").textContent = "YOU"; $("nameThem").textContent = `CPU · ${level.toUpperCase()}`; $("scoreLbl").textContent = "SCORE";
  newCpuRound(true); show("game");
}
function newCpuRound(meFirst) {
  G = fresh(meFirst); sel = null;
  cpu = { fleet: randomFleet(), k: newKnowledge(), hitsOnMe: new Set() };
  $("banner").hidden = true; render();
}
$("again").onclick = () => {
  if (mode === "cpu") return newCpuRound(!G.starterIsMe);
  room.set(`rematch/${me}`, true);
};
$("toMenu").onclick = async () => { await leave(); mode = null; G = null; show("menu"); };
$("level").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  level = b.dataset.l; [...$("level").children].forEach((x) => x.classList.toggle("on", x === b));
};
$("goCpu").onclick = startCpu;

// ---------- online ----------
const note = (t, err) => { $("onlineNote").textContent = t; $("onlineNote").className = "note" + (err ? " err" : ""); };
$("name").value = myName();
if (!onlineReady) { ["goCreate", "goJoin", "joinCode"].forEach((k) => ($(k).disabled = true)); note("Online rooms are coming soon."); }
$("joinCode").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); note(""); });
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("goJoin").click(); });
$("goCreate").onclick = async () => {
  saveName($("name").value); note("Creating room…");
  try { enter(await createRoom(GAME, { phase: "setup", round: 1, starter: "x", score: { x: 0, o: 0 } })); note(""); }
  catch (e) { console.error(e); note("Couldn't create a room. Check your connection and try again.", true); }
};
$("goJoin").onclick = async () => {
  saveName($("name").value); note("Joining…");
  try { enter(await joinRoom(GAME, $("joinCode").value)); note(""); }
  catch (e) { console.error(e); note(e.message || "Couldn't reach the game server.", true); }
};
const fleetKey = () => `gs:${room?.code}:${R?.round || 1}:${me}`;
function saveFleet() { if (mode === "online" && room) try { localStorage.setItem(fleetKey(), JSON.stringify(G.fleet)); } catch {} }
function loadFleet() { try { const f = JSON.parse(localStorage.getItem(fleetKey())); return Array.isArray(f) && f.length === 5 ? f : null; } catch { return null; } }
// Firebase may hand back sparse arrays for numeric keys, so skip empty slots
const toMap = (o) => new Map(Object.entries(o || {}).filter(([, v]) => v != null).map(([k, v]) => [+k, v]));
const sunkList = (o) => Object.entries(o || {}).map(([id, cells]) => ({ id, cells }));

function enter(h) {
  room = h; mode = "online"; me = h.seat; G = null; cpu = null;
  $("scoreLbl").textContent = "ROOM " + h.code; $("waitCode").textContent = h.code;
  h.listen((r) => {
    if (!r) { leave(); show("menu"); return note("That room was closed.", true); }
    const newRound = !R || (R.round || 1) !== (r.round || 1);
    R = r;
    const them = other(me), nm = r.names || {};
    $("nameMe").textContent = "YOU"; $("nameThem").textContent = nm[them] || "RIVAL";
    score = { me: r.score?.[me] || 0, them: r.score?.[them] || 0 };
    if (!G || newRound) { G = fresh(r.starter === me); const f = loadFleet(); if (f) G.fleet = f; else saveFleet(); sel = null; }
    G.phase = r.phase || "setup";
    G.ready = !!r.ready?.[me]; G.rivalReady = !!r.ready?.[them];
    G.turn = r.turn ? (r.turn === me ? "me" : "them") : (r.starter === me ? "me" : "them");
    const prevMine = G.myShots.size, prevTheirs = G.theirShots.size;
    G.myShots = toMap(r.shots?.[me]); G.theirShots = toMap(r.shots?.[them]);
    G.mySunk = sunkList(r.sunk?.[me]); G.theirSunk = sunkList(r.sunk?.[them]);
    G.lastMine = r.lastShot?.[me] ?? -1; G.lastTheirs = r.lastShot?.[them] ?? -1;
    G.winner = r.winner ? (r.winner === me ? "me" : "them") : null;
    if (G.myShots.size > prevMine && G.myShots.get(G.lastMine) === "h") requestAnimationFrame(() => boom(enemyCells[G.lastMine]));
    if (G.theirShots.size > prevTheirs && G.theirShots.get(G.lastTheirs) === "h") requestAnimationFrame(() => boom(mineCells[G.lastTheirs]));
    G.note = r.lastNote?.[me] || "";
    // both ready: seat X starts the battle
    if (me === "x" && G.phase === "setup" && r.ready?.x && r.ready?.o) h.update({ phase: "battle", turn: r.starter || "x" });
    // a shot at my fleet: my device answers hit or miss (fleets never leave each player's phone)
    if (r.pending && r.pending.by === them && G.phase === "battle") answer(r.pending);
    // rematch
    if (me === "x" && r.rematch?.x && r.rematch?.o && G.winner)
      h.update({ phase: "setup", ready: null, shots: null, sunk: null, pending: null, winner: null, turn: null, lastShot: null, lastNote: null,
        rematch: null, round: (r.round || 1) + 1, starter: other(r.starter || "x"), shotCount: 0 });
    const on = r.online || {};
    $("banner").hidden = !(r.players?.[them] && !on[them]);
    $("banner").textContent = "Your rival dropped off. The game continues when they rejoin with the same link.";
    if (me === "x" && !r.players?.o) show("wait"); else show("game");
    render();
  });
}
function answer(p) {
  const key = `${R.round}:${p.n}`;
  if (resolving.has(key)) return;
  resolving.add(key);
  const them = other(me);
  const hitsSoFar = new Set([...G.theirShots].filter(([, v]) => v === "h").map(([c]) => c));
  const r = resolve(G.fleet, hitsSoFar, p.c);
  const up = {
    [`shots/${them}/${p.c}`]: r.res === "hit" ? "h" : "m",
    [`lastShot/${them}`]: p.c,
    [`lastNote/${them}`]: r.sunk ? `You sank their ${r.sunk.name}!` : r.res === "hit" ? "Hit!" : "Miss.",
    [`lastNote/${me}`]: r.sunk ? `They sank your ${r.sunk.name}.` : r.res === "hit" ? "They hit one of your ships." : "They missed.",
    pending: null, shotCount: p.n,
  };
  if (r.sunk) up[`sunk/${them}/${r.sunk.id}`] = r.sunk.cells;
  if (r.allSunk) { up.winner = them; up.phase = "over"; up[`score/${them}`] = (R.score?.[them] || 0) + 1; }
  else up.turn = me;
  room.update(up).catch((e) => { console.error(e); resolving.delete(key); });
}
async function leave() { if (room) { const h = room; room = null; R = null; await h.close(false); } }
$("share").onclick = async () => {
  const r = await room.share("Grid Strike", `Battle me in Grid Strike. Room ${room.code}`);
  if (r === "copied") $("shareNote").textContent = "Link copied. Send it to your friend.";
};
$("cancelWait").onclick = async () => { const h = room; room = null; await h?.close(true); mode = null; show("menu"); };

const qs = new URLSearchParams(location.search);
if (qs.get("room") && onlineReady) { $("joinCode").value = cleanCode(qs.get("room")); $("goJoin").click(); }
else if (qs.get("mode") === "cpu") startCpu();
