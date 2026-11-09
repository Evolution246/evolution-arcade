import { World, W, H, BALL_R, WALLS, BUMPERS, CORE, LANES, TARGETS, POSTS } from "./engine.js";
import { unlock, sfx, isMuted, setMuted } from "./sfx.js";
import { onlineReady, net, playerId, newCode, cleanCode } from "../../js/net.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const now = () => performance.now() / 1000;
const GREEN = "#39ff14";

/* ================= stage / scaling ================= */
// leave a strip at the top for the quit / sound buttons so they never cover the score
function fit() { const s = Math.min(innerWidth / 400, (innerHeight - 48) / 900); $("cab").style.transform = `scale(${s})`; $("cab").style.marginTop = "48px"; }
addEventListener("resize", fit);
const cv = $("table"), cx = cv.getContext("2d");
let best = 0; try { best = +localStorage.getItem("hf-best") || 0; } catch {}
$("best").textContent = best ? `Your best: ${fmt(best)}` : "Play for a high score.";

/* ================= static table art (drawn once) ================= */
const art = document.createElement("canvas"); art.width = 800; art.height = 1440;
(function drawArt() {
  const g = art.getContext("2d"); g.scale(2, 2);
  const bg = g.createRadialGradient(200, 420, 40, 200, 420, 520);
  bg.addColorStop(0, "#0b1a0b"); bg.addColorStop(1, "#020402");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // perspective grid
  g.strokeStyle = "rgba(57,255,20,.06)"; g.lineWidth = 1;
  for (let y = 40; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = -400; x < 800; x += 40) { g.beginPath(); g.moveTo(200 + (x - 200) * 0.35, 0); g.lineTo(x, H); g.stroke(); }
  // logo
  g.save(); g.translate(200, 520); g.font = "900 40px Orb, 'Arial Black', sans-serif"; g.textAlign = "center";
  g.fillStyle = "rgba(57,255,20,.07)"; g.fillText("HYPERFLIP", 0, 0);
  g.font = "400 10px Mono, monospace"; g.fillStyle = "rgba(57,255,20,.18)"; g.fillText("E V O L U T I O N   A R C A D E", 0, 22); g.restore();
  // plunger lane
  g.fillStyle = "#040904"; g.fillRect(360, 180, 30, 520);
  g.strokeStyle = "rgba(57,255,20,.25)"; g.lineWidth = 2;
  for (let y = 600; y > 230; y -= 40) { g.beginPath(); g.moveTo(368, y + 8); g.lineTo(375, y); g.lineTo(382, y + 8); g.stroke(); }
  // slingshot bodies
  for (const [a, b, c] of [[[20, 440], [20, 520], [88, 591]], [[360, 440], [360, 520], [292, 591]]]) {
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.closePath();
    const gr = g.createLinearGradient(a[0], a[1], c[0], c[1]); gr.addColorStop(0, "rgba(57,255,20,.18)"); gr.addColorStop(1, "rgba(57,255,20,.04)");
    g.fillStyle = gr; g.fill();
  }
  // walls with neon glow
  const strokeAll = (w, color, blur) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round"; g.shadowColor = GREEN; g.shadowBlur = blur;
    for (const s of WALLS) { if (s.target) continue; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke(); }
    g.restore();
  };
  strokeAll(5, "rgba(57,255,20,.35)", 18); strokeAll(2.2, GREEN, 8); strokeAll(0.8, "#d9ffd0", 0);
  // posts
  for (const p of POSTS) { g.fillStyle = "#d9ffd0"; g.shadowColor = GREEN; g.shadowBlur = 10; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); g.shadowBlur = 0; }
  // target letters
  g.font = "700 11px Orb, sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(57,255,20,.45)";
  for (const t of TARGETS) g.fillText(t.ch, t.bank ? t.x1 - 16 : t.x1 + 16, (t.y1 + t.y2) / 2 + 4);
  // multiplier inserts
  g.font = "700 10px Orb, sans-serif";
  ["2×", "3×", "4×", "5×"].forEach((s, i) => { g.fillStyle = "rgba(57,255,20,.16)"; g.fillText(s, 152 + i * 32, 568); });
  g.font = "400 9px Mono, monospace"; g.fillStyle = "rgba(57,255,20,.3)"; g.fillText("SHOOT AGAIN", 200, 705);
  g.fillText("CORE", CORE.x, CORE.y + 32);
})();

/* ================= game state ================= */
let world = null;
const S = {
  mode: "solo", playing: false, over: false, score: 0, ball: 1, balls: 3, mult: 1, lanes: [0, 0, 0], targets: [0, 0, 0, 0, 0, 0],
  core: 0, multiball: false, saveUntil: 0, saveUsed: false, skill: 0, skillLive: false, charge: 0, charging: false,
  L: false, R: false, msg: null, fx: [], pops: [], flash: {}, shake: 0, lastPub: 0,
};
const add = (pts, x, y) => {
  const p = pts * S.mult; S.score += p;
  if (x != null) S.pops.push({ x, y, t: now(), txt: "+" + fmt(p) });
};
function say(txt, hot = false, dur = 1.6) { S.msg = { txt, until: now() + dur }; const m = $("msg"); m.textContent = txt; m.className = "dm" + (hot ? " hot" : ""); }
function sparks(x, y, n = 10, color = GREEN) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: now(), life: 0.35 + Math.random() * 0.3, color }); }
}
const waiting = () => world && world.balls.some((b) => b.inLane && b.y > 640 && Math.abs(b.vy) < 30);

function onEvent(e, d) {
  if (!S.playing) return;
  const t = now();
  switch (e) {
    case "bumper": add(1000, d.x, d.y - 26); S.flash[d.id] = t; sparks(d.x, d.y, 12); sfx.bumper(); S.shake = Math.max(S.shake, 2.5); break;
    case "sling": add(250, d.x, d.y); S.flash[d.id] = t; sparks(d.x, d.y, 6); sfx.sling(); break;
    case "wall": sfx.wall(); break;
    case "flipHit": break;
    case "target": {
      const i = +d.id.slice(1), bank = i < 3 ? 0 : 1;
      add(1500, d.x + (bank ? -20 : 20), d.y); sfx.target(); S.flash[d.id] = t;
      S.targets[i] = 1;
      const set = bank ? [3, 4, 5] : [0, 1, 2];
      if (set.every((k) => S.targets[k])) {
        set.forEach((k) => (S.targets[k] = 0));
        if (bank === 0) { S.mult = Math.min(5, S.mult + 1); add(25000); say(`H-Y-P COMPLETE · ${S.mult}×`, true); }
        else { add(50000); S.saveUntil = t + 10; say("E-R-! · BALL SAVE", true); sfx.save(); }
        sfx.fanfare();
      }
      break;
    }
    case "lane": {
      const i = d.i;
      if (S.skillLive) { S.skillLive = false; if (i === S.skill) { add(25000, LANES[i].x, 150); say("SKILL SHOT!", true); sfx.fanfare(); } }
      S.lanes[i] = 1; add(2000, LANES[i].x, 140); sfx.lane();
      if (S.lanes.every(Boolean)) { S.lanes = [0, 0, 0]; S.mult = Math.min(5, S.mult + 1); add(10000); say(`LANES COMPLETE · ${S.mult}×`, true); sfx.fanfare(); }
      break;
    }
    case "core": {
      S.flash.core = t; sparks(CORE.x, CORE.y, 16, "#3dc8ff"); sfx.core();
      if (S.multiball) { add(50000, CORE.x, CORE.y - 30); say("JACKPOT!", true, 2); sfx.fanfare(true); S.shake = 6; }
      else {
        S.core++; add(5000, CORE.x, CORE.y - 30);
        if (S.core >= 3) { S.core = 0; startMultiball(); } else say(`CORE ${S.core}/3`, false, 1.2);
      }
      break;
    }
    case "launch": S.skillLive = true; if (!S.saveUsed) S.saveUntil = t + 8; break;
    case "enter": break;
    case "drain": onDrain(); break;
  }
}
function startMultiball() {
  S.multiball = true; S.saveUntil = now() + 10;
  for (let k = 0; k < 2; k++) world.addBall(170 + k * 60, 150, (k ? 1 : -1) * 120, 120, false);
  say("MULTIBALL!", true, 2.5); sfx.fanfare(true); S.shake = 5;
}
function onDrain() {
  if (world.balls.length > 0) {
    if (world.balls.length === 1 && S.multiball) { S.multiball = false; say("MULTIBALL OVER"); }
    return;
  }
  S.multiball = false;
  if (now() < S.saveUntil) { S.saveUsed = true; S.saveUntil = 0; world.addBall(); say("BALL SAVED", true); sfx.save(); return; }
  sfx.drain();
  if (S.ball >= S.balls) { gameOver(); return; }
  S.ball++; S.saveUsed = false; S.lanes = [0, 0, 0];
  say(`BALL ${S.ball}`, true); world.addBall();
  pub(true);
}

/* ================= input ================= */
function flip(side, down) {
  if (!S.playing) return;
  unlock();
  const key = side === "L" ? "L" : "R";
  if (S[key] === down) return;
  S[key] = down;
  $(side === "L" ? "fbL" : "fbR").classList.toggle("down", down);
  if (waiting()) {
    // with the ball on the plunger, the buttons pull and release it
    if (down && !S.charging) { S.charging = true; S.charge = 0; }
    if (!down && S.charging && !S.L && !S.R) launchNow();
    return;
  }
  world.flippers[side === "L" ? 0 : 1].pressed = down;
  if (down) { sfx.flipper(); S.lanes = side === "L" ? [S.lanes[1], S.lanes[2], S.lanes[0]] : [S.lanes[2], S.lanes[0], S.lanes[1]]; }
}
function launchNow() {
  const p = Math.max(0.15, S.charge);
  S.charging = false; S.charge = 0;
  if (world.launch(1250 + p * 520)) sfx.launch(p);
}
const pointerSide = new Map();
function sideOf(e) { return e.clientX < innerWidth / 2 ? "L" : "R"; }
$("stage").addEventListener("pointerdown", (e) => {
  if (e.target.closest(".cbtn") || e.target.closest("#card")) return;
  e.preventDefault(); const s = sideOf(e); pointerSide.set(e.pointerId, s); flip(s, true);
});
const release = (e) => { const s = pointerSide.get(e.pointerId); if (!s) return; pointerSide.delete(e.pointerId); if (![...pointerSide.values()].includes(s)) flip(s, false); };
["pointerup", "pointercancel"].forEach((ev) => $("stage").addEventListener(ev, release));
addEventListener("keydown", (e) => {
  if ($("stage").hidden) return;
  const k = e.key.toLowerCase();
  if (k === "z" || k === "shift" && e.location === 1) { e.preventDefault(); flip("L", true); }
  else if (k === "m" || k === "shift" && e.location === 2) { e.preventDefault(); flip("R", true); }
  else if (k === " " || k === "enter" || k === "arrowdown") { e.preventDefault(); if (!e.repeat && waiting()) { S.charging = true; S.charge = 0; S.spaceCharge = true; } }
});
addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "z" || (k === "shift" && e.location === 1)) flip("L", false);
  else if (k === "m" || (k === "shift" && e.location === 2)) flip("R", false);
  else if ((k === " " || k === "enter" || k === "arrowdown") && S.spaceCharge) { S.spaceCharge = false; if (S.charging) launchNow(); }
});
addEventListener("blur", () => { flip("L", false); flip("R", false); });
$("mute").onclick = () => { setMuted(!isMuted()); $("mute").textContent = isMuted() ? "🔇" : "🔊"; };
$("mute").textContent = isMuted() ? "🔇" : "🔊";
$("quit").onclick = () => quit();

/* ================= game flow ================= */
function openStage() { $("stage").hidden = false; document.body.style.overflow = "hidden"; fit(); unlock(); }
function newGame(mode) {
  world = new World(onEvent);
  Object.assign(S, { mode, playing: true, over: false, score: 0, ball: 1, mult: 1, lanes: [0, 0, 0], targets: [0, 0, 0, 0, 0, 0], core: 0, multiball: false,
    saveUntil: 0, saveUsed: false, skill: 0, skillLive: false, charge: 0, charging: false, L: false, R: false, fx: [], pops: [], flash: {}, shake: 0 });
  world.addBall();
  $("card").hidden = true;
  say(matchMedia("(pointer:fine)").matches ? "HOLD SPACE · LET GO" : "HOLD ◀ OR ▶ · LET GO", false, 4);
  pub(true);
}
function gameOver() {
  S.playing = false; S.over = true; sfx.over();
  const isBest = S.score > best; if (isBest) { best = S.score; try { localStorage.setItem("hf-best", best); } catch {} }
  $("best").textContent = `Your best: ${fmt(best)}`;
  pub(true);
  if (S.mode === "online") { renderOnlineEnd(); return; }
  card(`<div class="ey">GAME OVER</div><div class="big">${fmt(S.score)}</div>
    <p>${isBest ? "New personal best!" : `Best: ${fmt(best)}`}</p>
    <div class="cb"><button class="a" id="again">PLAY AGAIN</button><button class="b" id="menuBtn">MENU</button></div>`);
  $("again").onclick = () => newGame("solo");
  $("menuBtn").onclick = () => quit();
}
function card(html) { $("cardIn").innerHTML = html; $("card").hidden = false; }
async function quit() {
  S.playing = false; $("stage").hidden = true; document.body.style.overflow = "";
  if (O.room) await leaveRoom();
}
$("goSolo").onclick = () => { openStage(); newGame("solo"); };

/* ================= render loop ================= */
let last = now();
function loop() {
  const t = now(), dt = Math.min(1 / 30, t - last); last = t;
  if (!$("stage").hidden && world) {
    if (S.playing) {
      if (S.charging) { S.charge = Math.min(1, S.charge + dt * 1.1); if (Math.random() < 0.3) sfx.charge(S.charge); }
      if (waiting() && !S.charging) { S.skill = Math.floor(t / 0.55) % 3; }
      world.step(dt);
    }
    draw(t, dt);
    $("score").textContent = fmt(S.score);
    $("ballLbl").textContent = S.over ? "GAME OVER" : `BALL ${S.ball}/${S.balls}`;
    $("mult").textContent = S.mult + "×";
    if (S.msg && t > S.msg.until) { S.msg = null; $("msg").className = "dm"; $("msg").textContent = S.multiball ? "MULTIBALL" : "HYPERFLIP"; }
    if (S.mode === "online") pub(false);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function glow(color, blur) { cx.shadowColor = color; cx.shadowBlur = blur; }
function draw(t, dt) {
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.drawImage(art, 0, 0);
  const sh = S.shake; S.shake = Math.max(0, S.shake - dt * 20);
  cx.setTransform(2, 0, 0, 2, sh ? (Math.random() - 0.5) * sh * 2 : 0, sh ? (Math.random() - 0.5) * sh * 2 : 0);
  // lane inserts
  LANES.forEach((l, i) => {
    const lit = S.lanes[i], sk = S.skillLive || waiting() ? i === S.skill && Math.floor(t * 6) % 2 : false;
    cx.beginPath(); cx.arc(l.x, 140, 6, 0, 7);
    cx.fillStyle = lit ? GREEN : sk ? "#ffd21f" : "#123012"; glow(lit ? GREEN : sk ? "#ffd21f" : "transparent", lit || sk ? 12 : 0); cx.fill();
  });
  cx.shadowBlur = 0;
  // targets
  TARGETS.forEach((tg, i) => {
    const hit = S.flash[tg.id] && t - S.flash[tg.id] < 0.2;
    cx.lineCap = "round"; cx.lineWidth = 6;
    cx.strokeStyle = S.targets[i] ? GREEN : hit ? "#fff" : "#2a5a24"; glow(S.targets[i] ? GREEN : "transparent", S.targets[i] ? 14 : 0);
    cx.beginPath(); cx.moveTo(tg.x1, tg.y1 + 3); cx.lineTo(tg.x2, tg.y2 - 3); cx.stroke();
  });
  cx.shadowBlur = 0;
  // slings flash
  for (const [id, a, c] of [["slingL", [20, 440], [88, 591]], ["slingR", [360, 440], [292, 591]]]) {
    const k = S.flash[id] ? 1 - (t - S.flash[id]) / 0.18 : 0;
    if (k > 0) { cx.strokeStyle = `rgba(255,255,255,${k})`; cx.lineWidth = 4; glow(GREEN, 20); cx.beginPath(); cx.moveTo(...a); cx.lineTo(...c); cx.stroke(); cx.shadowBlur = 0; }
  }
  // bumpers
  for (const b of BUMPERS) {
    const k = S.flash[b.id] ? Math.max(0, 1 - (t - S.flash[b.id]) / 0.2) : 0;
    const gr = cx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
    gr.addColorStop(0, k ? "#ffffff" : "#1a4a12"); gr.addColorStop(1, k ? GREEN : "#061206");
    cx.fillStyle = gr; glow(GREEN, 10 + k * 25); cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 7); cx.fill();
    cx.lineWidth = 2.5; cx.strokeStyle = GREEN; cx.stroke();
    cx.lineWidth = 1; cx.strokeStyle = "rgba(220,255,210,.8)"; cx.beginPath(); cx.arc(b.x, b.y, b.r - 6, 0, 7); cx.stroke();
  }
  cx.shadowBlur = 0;
  // core: 3 charge segments
  const ck = S.flash.core ? Math.max(0, 1 - (t - S.flash.core) / 0.3) : 0;
  const coreCol = S.multiball ? "#ffd21f" : "#3dc8ff";
  for (let i = 0; i < 3; i++) {
    cx.beginPath(); cx.arc(CORE.x, CORE.y, CORE.r + 9, -Math.PI / 2 + i * 2.09 + 0.12, -Math.PI / 2 + (i + 1) * 2.09 - 0.12);
    cx.lineWidth = 4; cx.strokeStyle = S.multiball || i < S.core ? coreCol : "#123044"; glow(coreCol, i < S.core || S.multiball ? 12 : 0); cx.stroke();
  }
  const pulse = 0.6 + 0.4 * Math.sin(t * 5);
  const cg = cx.createRadialGradient(CORE.x, CORE.y, 1, CORE.x, CORE.y, CORE.r);
  cg.addColorStop(0, "#ffffff"); cg.addColorStop(0.4, coreCol); cg.addColorStop(1, "rgba(0,0,0,.6)");
  cx.fillStyle = cg; glow(coreCol, 14 + ck * 30 + pulse * 6); cx.beginPath(); cx.arc(CORE.x, CORE.y, CORE.r, 0, 7); cx.fill(); cx.shadowBlur = 0;
  // multiplier inserts
  cx.font = "700 10px Orb, sans-serif"; cx.textAlign = "center";
  ["2×", "3×", "4×", "5×"].forEach((s, i) => { const on = S.mult >= i + 2; cx.fillStyle = on ? GREEN : "transparent"; glow(GREEN, on ? 10 : 0); if (on) cx.fillText(s, 152 + i * 32, 568); });
  cx.shadowBlur = 0;
  // shoot again
  if (t < S.saveUntil && Math.floor(t * 4) % 2) { cx.font = "400 9px Mono, monospace"; cx.fillStyle = "#ffd21f"; glow("#ffd21f", 10); cx.fillText("SHOOT AGAIN", 200, 705); cx.shadowBlur = 0; }
  // plunger
  const py = 692 + S.charge * 18;
  cx.fillStyle = "#1a3a14"; cx.fillRect(366, py, 18, 700 - py + 20);
  cx.fillStyle = S.charging ? "#ffd21f" : GREEN; glow(cx.fillStyle, 8); cx.fillRect(364, py - 3, 22, 4); cx.shadowBlur = 0;
  if (S.charging) { cx.fillStyle = "rgba(255,210,31,.85)"; cx.fillRect(392, 700 - S.charge * 120, 5, S.charge * 120); }
  // flippers
  for (const f of world.flippers) {
    const [tx, ty] = f.tip();
    cx.lineCap = "round";
    cx.strokeStyle = "rgba(57,255,20,.35)"; cx.lineWidth = f.r * 2 + 6; glow(GREEN, 16);
    cx.beginPath(); cx.moveTo(f.px, f.py); cx.lineTo(tx, ty); cx.stroke();
    cx.shadowBlur = 0;
    const gr = cx.createLinearGradient(f.px, f.py - 8, f.px, f.py + 8); gr.addColorStop(0, "#d9ffd0"); gr.addColorStop(1, GREEN);
    cx.strokeStyle = gr; cx.lineWidth = f.r * 2; cx.beginPath(); cx.moveTo(f.px, f.py); cx.lineTo(tx, ty); cx.stroke();
    cx.fillStyle = "#031003"; cx.beginPath(); cx.arc(f.px, f.py, 3.5, 0, 7); cx.fill();
  }
  // balls
  for (const b of world.balls) {
    b.trail.forEach(([x, y], i) => { cx.fillStyle = `rgba(200,255,190,${(i / b.trail.length) * 0.22})`; cx.beginPath(); cx.arc(x, y, BALL_R * (0.5 + i / b.trail.length / 2), 0, 7); cx.fill(); });
    const gr = cx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#b9c4c8"); gr.addColorStop(1, "#4a5357");
    cx.fillStyle = gr; glow("#ffffff", 10); cx.beginPath(); cx.arc(b.x, b.y, BALL_R, 0, 7); cx.fill(); cx.shadowBlur = 0;
  }
  // sparks
  S.fx = S.fx.filter((p) => t - p.t < p.life);
  for (const p of S.fx) { const k = (t - p.t) / p.life; p.x += p.vx * dt; p.y += p.vy * dt; cx.fillStyle = p.color; cx.globalAlpha = 1 - k; cx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  cx.globalAlpha = 1;
  // score pops
  S.pops = S.pops.filter((p) => t - p.t < 0.8);
  cx.font = "700 11px Orb, sans-serif";
  for (const p of S.pops) { const k = (t - p.t) / 0.8; cx.globalAlpha = 1 - k; cx.fillStyle = "#fff"; glow(GREEN, 8); cx.fillText(p.txt, p.x, p.y - k * 24); }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}

/* ================= online score duel (2–4) ================= */
const O = { room: null, id: playerId(), state: null, round: 0, unsub: null };
const nameKey = "evo-arcade-name";
$("name").value = (() => { try { return localStorage.getItem(nameKey) || ""; } catch { return ""; } })();
const note = (t, err) => { $("onlineNote").textContent = t; $("onlineNote").className = "note" + (err ? " err" : ""); };
if (!onlineReady) { ["goCreate", "goJoin", "joinCode"].forEach((k) => ($(k).disabled = true)); note("Online rooms are coming soon."); }
$("joinCode").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); note(""); });
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("goJoin").click(); });
const myNm = () => { const n = ($("name").value || "").trim().slice(0, 12) || "Player"; try { localStorage.setItem(nameKey, n); } catch {} return n; };
$("goCreate").onclick = async () => {
  unlock(); const nm = myNm(); note("Creating room…");
  try {
    const fb = await net(); const { db, ref, get, set, serverTimestamp } = fb;
    let code; for (let i = 0; i < 6; i++) { code = newCode(); if (!(await get(ref(db, `rooms/${code}/game`))).exists()) break; }
    await set(ref(db, `rooms/${code}`), { game: "hyperflip", created: serverTimestamp(), host: O.id, status: "lobby", round: 0, players: { [O.id]: { name: nm, joined: Date.now() } } });
    note(""); enterRoom(fb, code);
  } catch (e) { console.error(e); note("Couldn't create a room. Check your connection and try again.", true); }
};
$("goJoin").onclick = async () => {
  unlock(); const nm = myNm(); const code = cleanCode($("joinCode").value);
  if (code.length !== 4) return note("Room codes are 4 characters.", true);
  note("Joining…");
  try {
    const fb = await net(); const { db, ref, get, set } = fb;
    const s = await get(ref(db, `rooms/${code}`));
    if (!s.exists()) return note("No room with that code. Double-check it with your friend.", true);
    const r = s.val();
    if (r.game !== "hyperflip") return note("That code is for a different game.", true);
    const players = r.players || {};
    if (!players[O.id]) {
      if (Object.keys(players).length >= 4) return note("That room is full (4 players max).", true);
      await set(ref(db, `rooms/${code}/players/${O.id}`), { name: nm, joined: Date.now() });
    }
    note(""); enterRoom(fb, code);
  } catch (e) { console.error(e); note("Couldn't reach the game server.", true); }
};
function enterRoom(fb, code) {
  const { db, ref, onValue, set, onDisconnect } = fb;
  O.room = { fb, code, ref: ref(db, `rooms/${code}`) };
  const here = ref(db, `rooms/${code}/online/${O.id}`); set(here, true); onDisconnect(here).remove(); O.room.here = here;
  history.replaceState(null, "", "?room=" + code);
  openStage(); S.mode = "online";
  O.unsub = onValue(O.room.ref, (s) => onRoom(s.val()));
}
async function leaveRoom() {
  const R = O.room; if (!R) return; O.room = null;
  O.unsub?.(); try { await R.fb.remove(R.here); } catch {}
  if (O.state?.status === "lobby") try { await R.fb.remove(R.fb.ref(R.fb.db, `rooms/${R.code}/players/${O.id}`)); } catch {}
  O.state = null; O.round = 0; history.replaceState(null, "", location.pathname);
  $("rivals").hidden = true;
}
function onRoom(r) {
  if (!O.room) return;
  if (!r) { quit(); note("That room was closed.", true); return; }
  O.state = r;
  const players = r.players || {}, online = r.online || {};
  // if the host left, the longest-waiting player takes over
  if (!online[r.host] && online[O.id]) {
    const ids = Object.keys(players).filter((id) => online[id]).sort((a, b) => players[a].joined - players[b].joined);
    if (ids[0] === O.id) O.room.fb.update(O.room.ref, { host: O.id });
  }
  if (r.status === "lobby") { renderLobby(r); return; }
  if (r.round !== O.round) {
    O.round = r.round;
    if ((r.order || []).includes(O.id)) newGame("online");
    else card(`<div class="ey">ROOM ${O.room.code}</div><h1 class="wh">MATCH IN PROGRESS</h1><p>You'll be in the next round.</p><div class="cb"><button class="b" id="lv" style="grid-column:span 2">LEAVE</button></div>`), ($("lv").onclick = () => quit());
  }
  renderRivals(r);
  if (S.over) renderOnlineEnd();
}
function liveOf(r) {
  const players = r.players || {}, live = r.live || {}, online = r.online || {};
  return (r.order || []).map((id) => {
    const l = live[id] || {};
    return { id, name: players[id]?.name || "Player", score: l.score || 0, ball: l.ball || 1, done: !!l.done || !online[id], me: id === O.id, left: !online[id] };
  });
}
function renderRivals(r) {
  const rows = liveOf(r).sort((a, b) => b.score - a.score);
  $("rivals").hidden = rows.length < 2;
  $("rivals").innerHTML = rows.filter((x) => !x.me).slice(0, 3).map((x, i) => `<span class="${rows[0].id === x.id ? "lead" : ""}${x.done ? " done" : ""}">${esc(x.name)} ${fmt(x.score)}${x.done ? " ✓" : ` · B${x.ball}`}</span>`).join("");
}
function renderLobby(r) {
  const players = r.players || {}, online = r.online || {};
  const ids = Object.keys(players).filter((id) => online[id] || id === O.id).sort((a, b) => players[a].joined - players[b].joined);
  const host = r.host === O.id;
  S.playing = false; world = world || new World(() => {});
  card(`<div class="ey">HYPERFLIP · SCORE DUEL</div><div class="ey" style="color:var(--m)">ROOM CODE</div><div class="code">${O.room.code}</div>
    <ul class="plist">${ids.map((id) => `<li class="${id === O.id ? "me" : ""}"><span>${esc(players[id].name)}${id === O.id ? " (you)" : ""}</span>${id === r.host ? "<em>HOST</em>" : ""}</li>`).join("")}</ul>
    <p>${ids.length < 2 ? "Send friends the code or invite link. 2 to 4 players." : host ? "Everyone in? Start when ready." : "Waiting for the host to start."}</p>
    <div class="cb">${host ? `<button class="a" id="startBtn" ${ids.length < 2 ? "disabled" : ""}>START</button>` : ""}<button class="b" id="inv" ${host ? "" : 'style="grid-column:span 2"'}>INVITE LINK</button></div>
    <div class="cb"><button class="b" id="lv" style="grid-column:span 2">LEAVE</button></div>`);
  if (host) $("startBtn").onclick = () => hostStart();
  $("lv").onclick = () => quit();
  $("inv").onclick = async () => {
    const url = location.origin + location.pathname + "?room=" + O.room.code;
    try { if (navigator.share) await navigator.share({ title: "HYPERFLIP", text: `Pinball score duel. Room ${O.room.code}`, url }); else { await navigator.clipboard.writeText(url); $("inv").textContent = "LINK COPIED"; } } catch {}
  };
}
function hostStart() {
  const R = O.room, r = O.state; if (!R || !r) return;
  const players = r.players || {}, online = r.online || {};
  const order = Object.keys(players).filter((id) => online[id]).sort((a, b) => players[a].joined - players[b].joined).slice(0, 4);
  if (order.length < 2) return;
  R.fb.update(R.ref, { status: "playing", round: (r.round || 0) + 1, order, live: null });
}
function pub(force) {
  if (S.mode !== "online" || !O.room) return;
  const t = now(); if (!force && t - S.lastPub < 0.4) return; S.lastPub = t;
  const R = O.room;
  R.fb.set(R.fb.ref(R.fb.db, `rooms/${R.code}/live/${O.id}`), { score: S.score, ball: S.ball, done: S.over }).catch(() => {});
}
function renderOnlineEnd() {
  const r = O.state; if (!r) return;
  const rows = liveOf(r).sort((a, b) => b.score - a.score);
  const allDone = rows.every((x) => x.done);
  const host = r.host === O.id;
  const meRank = rows.findIndex((x) => x.me) + 1;
  card(`<div class="ey">${allDone ? "FINAL SCORES" : "YOUR GAME IS OVER"}</div>
    <h1 class="${allDone && meRank === 1 ? "" : "wh"}">${allDone ? (meRank === 1 ? "YOU WIN" : `${esc(rows[0].name)} WINS`) : fmt(S.score)}</h1>
    ${allDone ? "" : "<p>Waiting for the others to finish…</p>"}
    <ul class="plist">${rows.map((x, i) => `<li class="${x.me ? "me" : ""}${i === 0 ? " win" : ""}"><span><b>${i + 1}</b>${esc(x.name)}${x.me ? " (you)" : ""}</span><em>${fmt(x.score)}${x.done ? "" : ` · B${x.ball}`}${x.left ? " · LEFT" : ""}</em></li>`).join("")}</ul>
    <div class="cb">${allDone && host ? '<button class="a" id="rem">REMATCH</button>' : ""}<button class="b" id="lv" ${allDone && host ? "" : 'style="grid-column:span 2"'}>${allDone && !host ? "LEAVE · WAITING FOR HOST" : "LEAVE"}</button></div>`);
  if ($("rem")) $("rem").onclick = () => hostStart();
  $("lv").onclick = () => quit();
}

const qs = new URLSearchParams(location.search);
if (qs.get("room") && onlineReady) { $("joinCode").value = cleanCode(qs.get("room")); $("goJoin").click(); }
if (qs.has("test")) window.__hf = { S, get world() { return world; }, flip, launchNow };
