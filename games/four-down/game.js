import { newGame, norm, play, legal, cpuMove, other, dropRow, idx, ROWS, COLS } from "./logic.js";
import { onlineReady } from "../../js/net.js";
import { createRoom, joinRoom, cleanCode, myName, saveName } from "../../js/duo.js";

const GAME = "four-down";
const $ = (id) => document.getElementById(id);
const show = (id) => ["menu", "wait", "game"].forEach((k) => ($(k).hidden = k !== id));

let mode = null, level = "medium", me = "x";
let s = newGame("x"), score = { x: 0, o: 0 }, names = { x: "YOU", o: "CPU" };
let busy = false, room = null, R = null;

// ---------- board ----------
const board = $("board"), holes = [];
for (let c = 0; c < COLS; c++) {
  const col = document.createElement("div");
  col.className = "col"; col.dataset.c = c;
  col.setAttribute("aria-label", `Column ${c + 1}`);
  for (let r = ROWS - 1; r >= 0; r--) {
    const h = document.createElement("div");
    h.className = "hole"; h.style.position = "relative";
    col.appendChild(h); holes[idx(c, r)] = h;
  }
  col.onclick = () => tap(c);
  col.onmouseenter = () => hover(c);
  board.appendChild(col);
}
board.onmouseleave = () => ($("ghost").style.opacity = 0);
function hover(c) {
  const g = $("ghost");
  if (!canTap() || dropRow(s.b, c) < 0) { g.style.opacity = 0; return; }
  g.style.left = `calc(${(c * 100) / 7}% + ${6 - (12 * c) / 7 + (c ? 0 : 0)}px)`;
  g.style.left = `calc(6px + (100% - 12px) * ${c} / 7)`;
  g.querySelector("i").className = "d" + s.turn;
  g.style.opacity = 1;
}

function canTap() {
  if (s.winner || busy) return false;
  if (mode === "local") return true;
  if (mode === "online" && !(R && R.players?.o)) return false;
  return s.turn === me;
}

function render() {
  for (let i = 0; i < 42; i++) {
    const h = holes[i], p = s.b[i], d = h.querySelector(".disc");
    if (p === "." && d) d.remove();
    if (p !== "." && (!d || !d.classList.contains("d" + p))) {
      d?.remove();
      const el = document.createElement("div");
      el.className = "disc d" + p;
      el.style.cssText = "position:absolute;inset:0;width:auto;z-index:2";
      el.innerHTML = "<i></i>";
      const r = Math.floor(i / COLS);
      const fall = (ROWS - r) * 108;
      if (i === s.last) {
        el.style.transform = `translateY(-${fall}%)`;
        el.style.setProperty("--dur", (0.12 + (ROWS - r) * 0.055).toFixed(2) + "s");
        requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transform = "translateY(0)")));
      }
      h.appendChild(el);
    }
    const disc = h.querySelector(".disc");
    if (disc) disc.classList.toggle("win", !!(s.line && s.line.includes(i)));
  }
  board.classList.toggle("locked", !canTap());
  $("ghost").style.opacity = 0;
  for (const p of ["x", "o"]) {
    $("name" + p.toUpperCase()).textContent = names[p];
    $("who" + p.toUpperCase()).classList.toggle("turn", !s.winner && s.turn === p);
  }
  $("score").textContent = `${score.x} – ${score.o}`;
  const st = $("status");
  st.className = "status";
  if (s.winner === "draw") st.textContent = "BOARD FULL · DRAW";
  else if (s.winner) {
    const mine = mode === "local" || s.winner === me;
    st.textContent = mode === "local" ? `${names[s.winner]} WINS` : mine ? "YOU WIN" : mode === "cpu" ? "CPU WINS" : "YOUR RIVAL WINS";
    st.classList.add(mine ? "win" : "lose");
  } else if (mode === "online" && !R?.players?.o) st.textContent = "WAITING FOR PLAYER 2";
  else st.textContent = mode === "local" ? `${names[s.turn]}'S MOVE` : s.turn === me ? "YOUR MOVE" : busy ? "CPU THINKING…" : mode === "cpu" ? "CPU'S MOVE" : "RIVAL'S MOVE";
  const again = $("again");
  again.hidden = !s.winner;
  if (s.winner && mode === "online") {
    const rm = R?.rematch || {};
    again.textContent = rm[me] ? "WAITING FOR RIVAL…" : rm[other(me)] ? "RIVAL WANTS A REMATCH ▶" : "REMATCH";
    again.disabled = !!rm[me];
  } else { again.textContent = "REMATCH"; again.disabled = false; }
}

function tap(c) {
  if (!canTap() || dropRow(s.b, c) < 0) return;
  if (mode === "online") return onlineMove(c);
  apply(play(s, c));
  if (mode === "cpu" && !s.winner && s.turn !== me) cpuTurn();
}
function apply(nx) {
  if (!nx) return;
  s = nx;
  if (s.winner && s.winner !== "draw") score[s.winner]++;
  render();
}
function cpuTurn() {
  busy = true; render();
  const t0 = performance.now();
  setTimeout(() => {
    const c = cpuMove(s, level);
    setTimeout(() => { busy = false; if (mode === "cpu") apply(play(s, c)); }, Math.max(0, 500 - (performance.now() - t0)));
  }, 40);
}

// ---------- modes ----------
function start(m) {
  mode = m; score = { x: 0, o: 0 }; s = newGame("x"); me = "x";
  names = m === "cpu" ? { x: "YOU", o: `CPU · ${level.toUpperCase()}` } : { x: "PLAYER 1", o: "PLAYER 2" };
  $("scoreLbl").textContent = "SCORE"; $("banner").hidden = true;
  show("game"); render();
}
$("again").onclick = () => {
  if (mode === "online") return room.set(`rematch/${me}`, true);
  s = newGame(other(s.starter)); render();
  if (mode === "cpu" && s.turn !== me) cpuTurn();
};
$("toMenu").onclick = async () => { await leave(); mode = null; show("menu"); };
$("level").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  level = b.dataset.l;
  [...$("level").children].forEach((x) => x.classList.toggle("on", x === b));
};
$("goCpu").onclick = () => start("cpu");
$("goLocal").onclick = () => start("local");

// ---------- online ----------
const note = (t, err) => { $("onlineNote").textContent = t; $("onlineNote").className = "note" + (err ? " err" : ""); };
$("name").value = myName();
if (!onlineReady) {
  ["goCreate", "goJoin", "joinCode"].forEach((k) => ($(k).disabled = true));
  note("Online rooms are coming soon.");
}
$("joinCode").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); note(""); });
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("goJoin").click(); });
const needName = () => { saveName($("name").value); return true; };
$("goCreate").onclick = async () => {
  needName(); note("Creating room…");
  try { enter(await createRoom(GAME, { state: newGame("x"), score: { x: 0, o: 0 } })); note(""); }
  catch (e) { console.error(e); note("Couldn't create a room. Check your connection and try again.", true); }
};
$("goJoin").onclick = async () => {
  needName(); note("Joining…");
  try { enter(await joinRoom(GAME, $("joinCode").value)); note(""); }
  catch (e) { console.error(e); note(e.message || "Couldn't reach the game server.", true); }
};
function enter(h) {
  room = h; mode = "online"; me = h.seat; score = { x: 0, o: 0 };
  $("scoreLbl").textContent = "ROOM " + h.code; $("waitCode").textContent = h.code;
  h.listen((r) => {
    if (!r) { leave(); show("menu"); return note("That room was closed.", true); }
    R = r;
    const nm = r.names || {};
    names = me === "x" ? { x: "YOU", o: nm.o || "RIVAL" } : { x: nm.x || "RIVAL", o: "YOU" };
    score = { x: r.score?.x || 0, o: r.score?.o || 0 };
    s = norm(r.state || newGame("x"));
    if (me === "x" && r.rematch?.x && r.rematch?.o && s.winner) h.update({ state: newGame(other(s.starter)), rematch: null });
    const rival = other(me), on = r.online || {};
    $("banner").hidden = !(r.players?.[rival] && !on[rival]);
    $("banner").textContent = "Your rival dropped off. They can rejoin with the same link.";
    if (me === "x" && !r.players?.o) show("wait"); else show("game");
    render();
  });
}
async function onlineMove(c) {
  let won = null;
  board.classList.add("locked");
  try {
    await room.tx("state", (cur) => {
      if (!cur) return cur;
      const st = norm(cur);
      if (st.turn !== me || st.winner) return;
      const nx = play(st, c);
      if (!nx) return;
      won = nx.winner;
      return nx;
    });
    if (won && won !== "draw") await room.tx(`score/${won}`, (v) => (v || 0) + 1);
  } catch (e) { console.error(e); render(); }
}
async function leave() { if (room) { const h = room; room = null; R = null; await h.close(false); } }
$("share").onclick = async () => {
  const r = await room.share("Four Down", `Play me in Four Down. Room ${room.code}`);
  if (r === "copied") $("shareNote").textContent = "Link copied. Send it to your friend.";
};
$("cancelWait").onclick = async () => { const h = room; room = null; await h?.close(true); mode = null; show("menu"); };

// ---------- entry ----------
const qs = new URLSearchParams(location.search);
if (qs.get("room") && onlineReady) { $("joinCode").value = cleanCode(qs.get("room")); $("goJoin").click(); }
else if (qs.get("mode") === "cpu") start("cpu");
