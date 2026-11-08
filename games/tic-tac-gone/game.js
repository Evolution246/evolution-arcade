import { newGame, norm, play, legal, cpuMove, nextToVanish, ownerOf, other, LINES, MAX } from "./logic.js";
import { onlineReady, net, playerId, newCode, cleanCode } from "../../js/net.js";

const GAME = "tic-tac-gone";
const $ = (id) => document.getElementById(id);
const show = (id) => ["menu", "wait", "game"].forEach((k) => ($(k).hidden = k !== id));

const SVG = {
  x: '<svg viewBox="0 0 40 40" class="mk x"><path d="M6 6L34 34M34 6L6 34" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" fill="none"/></svg>',
  o: '<svg viewBox="0 0 40 40" class="mk o"><circle cx="20" cy="20" r="14" stroke="currentColor" stroke-width="4.5" fill="none"/></svg>',
};

// ---------- session ----------
let mode = null;        // "cpu" | "local" | "online"
let level = "medium";
let me = "x";           // which piece this screen controls (cpu/online)
let s = newGame("x");
let score = { x: 0, o: 0 };
let names = { x: "YOU", o: "CPU" };
let busy = false;       // CPU is thinking
let lastN = -1;         // last move number drawn (for the vanish animation)
let room = null;        // online: { code, ref, unsub, fb, players, online }

// ---------- board ----------
const board = $("board");
for (let i = 0; i < 9; i++) {
  const c = document.createElement("button");
  c.className = "cell";
  c.setAttribute("role", "gridcell");
  c.dataset.i = i;
  c.onclick = () => tap(i);
  board.appendChild(c);
}
const cells = [...board.children];

function canTap() {
  if (s.winner || busy) return false;
  if (mode === "local") return true;
  if (mode === "online" && (!room || !room.players?.o)) return false;
  return s.turn === me;
}

function render() {
  const doomed = s.winner ? null : nextToVanish(s, s.turn);
  cells.forEach((c, i) => {
    const p = ownerOf(s, i);
    const had = c.dataset.p || "";
    if ((p || "") !== had) { c.innerHTML = p ? SVG[p] : ""; c.dataset.p = p || ""; }
    c.className = "cell" + (p ? " full " + p : "") + (i === doomed ? " doomed" : "") + (s.line && s.line.includes(i) ? " wincell" : "");
    c.setAttribute("aria-label", `Square ${i + 1}: ${p ? p.toUpperCase() : "empty"}${i === doomed ? ", vanishes next" : ""}`);
  });
  // vanish animation for the piece that just left the board
  if (s.n !== lastN && s.gone != null && lastN !== -1) {
    const mover = other(s.turn);
    const g = document.createElement("div");
    g.className = "ghost mk " + mover;
    g.innerHTML = SVG[mover];
    cells[s.gone].appendChild(g);
    setTimeout(() => g.remove(), 600);
  }
  lastN = s.n;
  board.querySelector(".strike")?.remove();
  if (s.line) {
    const [a, , b] = s.line, pt = (i) => [(i % 3) * 33.33 + 16.67, Math.floor(i / 3) * 33.33 + 16.67];
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    board.insertAdjacentHTML("beforeend", `<svg class="strike ${s.winner}" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></svg>`);
  }
  board.classList.toggle("locked", !canTap());

  // HUD
  for (const p of ["x", "o"]) {
    $("name" + p.toUpperCase()).textContent = names[p];
    $("who" + p.toUpperCase()).classList.toggle("turn", !s.winner && s.turn === p);
    $("pc" + p.toUpperCase()).innerHTML = Array.from({ length: MAX }, (_, i) =>
      `<span class="pip ${i < s[p].length ? "" : "used"}">${SVG[p]}</span>`).join("");
  }
  $("score").textContent = `${score.x} – ${score.o}`;

  // status
  const st = $("status"), hint = $("hint");
  st.className = "status";
  if (s.winner) {
    const mine = mode === "local" || s.winner === me;
    st.textContent = mode === "local" ? `${names[s.winner]} WINS` : mine ? "YOU WIN" : mode === "cpu" ? "CPU WINS" : "YOUR RIVAL WINS";
    st.classList.add(mine ? "win" : "lose");
    hint.textContent = "";
  } else if (mode === "online" && !room?.players?.o) {
    st.textContent = "WAITING FOR PLAYER 2";
    hint.textContent = "";
  } else {
    const turnName = mode === "local" ? `${names[s.turn]}'S MOVE` : s.turn === me ? "YOUR MOVE" : busy ? "CPU THINKING…" : mode === "cpu" ? "CPU'S MOVE" : "RIVAL'S MOVE";
    st.textContent = turnName;
    const you = mode === "local" || s.turn === me;
    hint.textContent = doomed != null ? (you ? `Your flickering ${s.turn.toUpperCase()} vanishes when you move.` : `Their flickering ${s.turn.toUpperCase()} vanishes when they move.`) : "";
  }
  const showAgain = !!s.winner;
  $("again").hidden = !showAgain;
  if (showAgain && mode === "online") {
    const r = room?.rematch || {};
    $("again").textContent = r[me] ? "WAITING FOR RIVAL…" : r[other(me)] ? "RIVAL WANTS A REMATCH ▶" : "REMATCH";
    $("again").disabled = !!r[me];
  } else { $("again").textContent = "REMATCH"; $("again").disabled = false; }
}

// ---------- moves ----------
function tap(i) {
  if (!canTap()) return;
  if (mode === "online") return onlineMove(i);
  const nx = play(s, i);
  if (!nx) return;
  apply(nx);
  if (mode === "cpu" && !s.winner && s.turn !== me) cpuTurn();
}

function apply(nx) {
  s = nx;
  if (s.winner) score[s.winner]++;
  render();
}

function cpuTurn() {
  busy = true; render();
  const started = performance.now();
  setTimeout(() => {
    const c = cpuMove(s, level);
    const wait = Math.max(0, 450 - (performance.now() - started)); // feel like a player, not a vending machine
    setTimeout(() => { busy = false; if (mode === "cpu") apply(play(s, c)); }, wait);
  }, 30);
}

// ---------- modes ----------
function startCpu() {
  mode = "cpu"; me = "x"; names = { x: "YOU", o: `CPU · ${level.toUpperCase()}` };
  score = { x: 0, o: 0 }; s = newGame("x"); lastN = -1; $("scoreLbl").textContent = "SCORE";
  show("game"); render();
}
function startLocal() {
  mode = "local"; names = { x: "PLAYER 1", o: "PLAYER 2" };
  score = { x: 0, o: 0 }; s = newGame("x"); lastN = -1; $("scoreLbl").textContent = "SCORE";
  show("game"); render();
}
$("again").onclick = () => {
  if (mode === "online") return onlineRematch();
  s = newGame(other(s.starter)); lastN = -1; render();
  if (mode === "cpu" && s.turn !== me) cpuTurn();
};
$("toMenu").onclick = () => { leaveRoom(); mode = null; show("menu"); };

$("level").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  level = b.dataset.l;
  [...$("level").children].forEach((x) => x.classList.toggle("on", x === b));
};
$("goCpu").onclick = startCpu;
$("goLocal").onclick = startLocal;

// ---------- online ----------
const note = (t, err) => { $("onlineNote").textContent = t; $("onlineNote").className = "note" + (err ? " err" : ""); };
const id = playerId();

if (!onlineReady) {
  $("goCreate").disabled = $("goJoin").disabled = $("joinCode").disabled = true;
  note("Online rooms are coming soon. Play the computer or a friend on this device for now.");
}
$("joinCode").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); note(""); });
$("goJoin").onclick = () => joinRoom(cleanCode($("joinCode").value));
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("goJoin").click(); });
$("goCreate").onclick = createRoom;

async function createRoom() {
  try {
    note("Creating room…");
    const fb = await net();
    const { db, ref, get, set, serverTimestamp } = fb;
    let code;
    for (let tries = 0; tries < 6; tries++) {
      code = newCode();
      if (!(await get(ref(db, `rooms/${code}/game`))).exists()) break;
    }
    await set(ref(db, `rooms/${code}`), {
      game: GAME, created: serverTimestamp(), players: { x: id }, state: newGame("x"), score: { x: 0, o: 0 },
    });
    note("");
    enterRoom(fb, code, "x");
  } catch (err) { console.error(err); note("Couldn't create a room. Check your connection and try again.", true); }
}

async function joinRoom(code) {
  if (code.length !== 4) return note("Room codes are 4 characters.", true);
  try {
    note("Joining " + code + "…");
    const fb = await net();
    const { db, ref, get, runTransaction } = fb;
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) return note("No room with that code. Double-check it with your friend.", true);
    const r = snap.val();
    if (r.game !== GAME) return note("That code is for a different game.", true);
    if (r.players?.x === id) return enterRoom(fb, code, "x");
    if (r.players?.o === id) return enterRoom(fb, code, "o");
    if (r.players?.o) return note("That room is already full.", true);
    const res = await runTransaction(ref(db, `rooms/${code}/players/o`), (cur) => (cur ? undefined : id));
    if (!res.committed) return note("Someone else just took that seat.", true);
    note("");
    enterRoom(fb, code, "o");
  } catch (err) { console.error(err); note("Couldn't reach the game server. Try again in a moment.", true); }
}

function enterRoom(fb, code, seat) {
  leaveRoom();
  const { db, ref, onValue, set, onDisconnect } = fb;
  mode = "online"; me = seat; score = { x: 0, o: 0 }; lastN = -1;
  names = seat === "x" ? { x: "YOU", o: "RIVAL" } : { x: "RIVAL", o: "YOU" };
  $("scoreLbl").textContent = "ROOM " + code;
  const roomRef = ref(db, `rooms/${code}`);
  room = { code, fb, ref: roomRef, players: null, rematch: null };
  const here = ref(db, `rooms/${code}/online/${seat}`);
  set(here, true); onDisconnect(here).remove();
  room.here = here;
  history.replaceState(null, "", "?room=" + code);
  $("waitCode").textContent = code;

  room.unsub = onValue(roomRef, (snap) => {
    const r = snap.val();
    if (!r) { leaveRoom(); show("menu"); return note("That room was closed.", true); }
    room.players = r.players || {};
    room.rematch = r.rematch || null;
    score = { x: r.score?.x || 0, o: r.score?.o || 0 };
    s = norm(r.state || newGame("x"));
    if (r.state?.gone != null) s.gone = r.state.gone;
    // both asked for a rematch: seat X resets the board, alternating who starts
    if (seat === "x" && r.rematch?.x && r.rematch?.o && s.winner) {
      fb.update(roomRef, { state: newGame(other(s.starter)), rematch: null });
    }
    const rivalSeat = other(seat);
    const banner = $("banner");
    banner.hidden = !(room.players[rivalSeat] && !(r.online || {})[rivalSeat]);
    banner.textContent = "Your rival dropped off. They can rejoin with the same link.";
    if (seat === "x" && !room.players.o) show("wait"); else show("game");
    render();
  });
}

async function onlineMove(i) {
  const { runTransaction, ref, db } = room.fb;
  const code = room.code;
  let won = null;
  board.classList.add("locked");
  try {
    await runTransaction(ref(db, `rooms/${code}/state`), (cur) => {
      if (!cur) return cur;
      const st = norm(cur);
      if (st.turn !== me || st.winner) return; // not ours: abort
      const nx = play(st, i);
      if (!nx) return;
      won = nx.winner;
      return nx;
    });
    if (won) await runTransaction(ref(db, `rooms/${code}/score/${won}`), (v) => (v || 0) + 1);
  } catch (err) { console.error(err); render(); }
}

function onlineRematch() {
  const { set, ref, db } = room.fb;
  set(ref(db, `rooms/${room.code}/rematch/${me}`), true);
}

function leaveRoom() {
  if (!room) return;
  room.unsub?.();
  if (room.here) room.fb.remove(room.here).catch(() => {});
  room = null;
  history.replaceState(null, "", location.pathname);
}

$("share").onclick = async () => {
  const url = location.origin + location.pathname + "?room=" + room.code;
  const text = `Play me in Tic-Tac-Gone. Room ${room.code}`;
  try {
    if (navigator.share) await navigator.share({ title: "Tic-Tac-Gone", text, url });
    else { await navigator.clipboard.writeText(url); $("shareNote").textContent = "Link copied. Send it to your friend."; }
  } catch {}
};
$("cancelWait").onclick = async () => {
  if (room) { try { await room.fb.remove(room.ref); } catch {} }
  leaveRoom(); mode = null; show("menu");
};

// ---------- entry ----------
const params = new URLSearchParams(location.search);
if (params.get("room")) {
  const code = cleanCode(params.get("room"));
  $("joinCode").value = code;
  if (onlineReady) joinRoom(code);
} else if (params.get("mode") === "cpu") startCpu();
