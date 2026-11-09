import { Car, cpuPlan, QUARTER, IDLE, LAUNCH_WIN, SHIFT_WIN, NOS_TIME } from "./physics.js";
import { carSVG, WRAPS, wrapById } from "./car.js";
import * as A from "./audio.js";
import { onlineReady } from "../../js/net.js";
import { createRoom, joinRoom, cleanCode, myName, saveName } from "../../js/duo.js";

const GAME = "launch-control";
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clock = () => performance.now() / 1000;
const other = (p) => (p === "x" ? "o" : "x");
const fmt = (n, d = 3) => (n == null ? "—" : n.toFixed(d));

/* ================= menu ================= */
let myWrap = "matrix";
try { myWrap = localStorage.getItem("lc-wrap") || "matrix"; } catch {}
let level = "medium";
function renderWraps() {
  $("wraps").innerHTML = WRAPS.map((w) => `<button class="${w.id === myWrap ? "on" : ""}" data-w="${w.id}" aria-label="${w.name}" style="background:linear-gradient(160deg,${w.body[0]},${w.body[1]} 55%,${w.body[2]});${w.id === "matrix" ? "box-shadow:inset 0 0 0 3px #39ff14" : ""}"></button>`).join("");
  $("preview").innerHTML = carSVG(myWrap, "pv");
  $("wrapName").textContent = wrapById(myWrap).name.toUpperCase();
}
$("wraps").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  myWrap = b.dataset.w; try { localStorage.setItem("lc-wrap", myWrap); } catch {}
  renderWraps();
};
renderWraps();
$("level").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  level = b.dataset.l; [...$("level").children].forEach((x) => x.classList.toggle("on", x === b));
};

/* ================= race state ================= */
const S = {
  mode: null, active: false, wins: { me: 0, them: 0 }, n: 1, me: new Car(), them: new Car(), plan: null,
  tree: null, rt: { me: null, them: null }, res: { me: null, them: null }, holdL: false, toast: null,
  names: { me: "YOU", them: "CPU" }, wraps: { me: "matrix", them: "black" }, cardUntil: 0, beeped: {}, roundOver: false,
  seed: "", live: null, engines: null, smoke: { me: -9, them: -9 }, pops: { me: -9, them: -9 }, flashAt: -9, decided: null,
};
let room = null, R = null, offset = 0, me = "x";

/* ================= cabinet setup ================= */
function fit() {
  const s = Math.min(innerWidth / 360, innerHeight / 640);
  $("cab").style.transform = `scale(${s})`;
}
addEventListener("resize", fit);
for (let i = 0; i < 9; i++) { const p = document.createElement("div"); p.className = "pole"; $("poles").appendChild(p); }
const poles = [...$("poles").children];
const boards = [[18.29, "60 FT"], [100.58, "330 FT"], [201.17, "660 FT"], [304.8, "1000 FT"]].map(([m, l]) => {
  const b = document.createElement("div"); b.className = "board"; b.textContent = l; $("world").appendChild(b); return [m, b];
});
const sline = document.createElement("div"); sline.className = "sline"; $("world").appendChild(sline);
const fline = document.createElement("div"); fline.className = "fline"; $("world").appendChild(fline);
const beams = [172, 248].map((top) => { const b = document.createElement("div"); b.className = "beam"; b.style.top = top + "px"; $("world").appendChild(b); return b; });
const tree = document.createElement("div"); tree.className = "tree";
tree.innerHTML = '<div class="lb"><span>RIVAL</span><span>YOU</span></div><i class="sm"></i><i class="sm"></i><i class="sm"></i><i class="sm"></i>' + "<i></i><i></i>".repeat(5);
$("world").appendChild(tree);
const tl = [...tree.querySelectorAll("i")];
for (let i = 0; i < 8; i++) $("leds").appendChild(document.createElement("i"));
const leds = [...$("leds").children];
for (let i = 0; i < 6; i++) { const s = document.createElement("div"); s.className = "speed"; $("speeds").appendChild(s); }
const speeds = [...$("speeds").children];
const arc = (a0, a1) => {
  const p = (a) => { const r = ((180 - (a / 9000) * 180) * Math.PI) / 180; return [120 + 96 * Math.cos(r), 120 - 96 * Math.sin(r)]; };
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A96 96 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
$("ticks").innerHTML = [0, 2, 4, 6, 8, 9].map((k) => { const r = ((180 - ((k * 1000) / 9000) * 180) * Math.PI) / 180; return `<text x="${(120 + 112 * Math.cos(r)).toFixed(0)}" y="${(124 - 110 * Math.sin(r)).toFixed(0)}">${k}</text>`; }).join("");
let wheels = { me: [], them: [] };
function paintCars() {
  $("carY").innerHTML = carSVG(S.wraps.me, "cy");
  $("carR").innerHTML = carSVG(S.wraps.them, "cr");
  wheels = { me: [...$("carY").querySelectorAll(".wR,.wF")], them: [...$("carR").querySelectorAll(".wR,.wF")] };
}

/* ================= input ================= */
function leftDown() {
  if (!S.active) return;
  A.unlock();
  S.holdL = true; $("padL").classList.add("down");
  if (S.me.phase === "run" && S.me.nitro()) { A.nitro(); toast("NITRO!", `${NOS_TIME}s BOOST`, "nos"); }
}
function leftUp() { S.holdL = false; $("padL").classList.remove("down"); }
function rightTap() {
  if (!S.active) return;
  A.unlock();
  $("padR").classList.add("down"); setTimeout(() => $("padR").classList.remove("down"), 110);
  const now = clock(), c = S.me;
  if (c.phase === "staged") {
    if (!S.tree || now < S.cardUntil) return;
    if (now < S.tree.green) { foulMe(); return; }
    S.rt.me = now - S.tree.green;
    const g = c.launch(); S.smoke.me = now; A.chirp(0.4);
    toast(g, `RT ${S.rt.me.toFixed(3)} · ${Math.round(c.launchRpm).toLocaleString("en-US")} RPM`, g === "PERFECT LAUNCH" ? "" : "warn");
    pubNow();
  } else if (c.phase === "run") {
    const g = c.shift();
    if (g) { S.pops.me = now; A.crack(0.5); toast(g === "PERFECT" ? "PERFECT SHIFT" : g + " SHIFT", `${c.g} → ${c.g + 1}`, g === "PERFECT" ? "" : "warn"); }
  }
}
function foulMe() {
  S.me.phase = "foul"; S.rt.me = -1;
  S.res.me = { foul: true }; A.beep(220, 0.5, 0.3);
  toast("RED LIGHT", "YOU LEFT BEFORE GREEN", "bad");
  sendResult();
}
const padL = $("padL"), padR = $("padR");
padL.addEventListener("pointerdown", (e) => { e.preventDefault(); padL.setPointerCapture?.(e.pointerId); leftDown(); });
["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => padL.addEventListener(ev, leftUp));
padR.addEventListener("pointerdown", (e) => { e.preventDefault(); rightTap(); });
addEventListener("keydown", (e) => {
  if ($("stage").hidden) return;
  const k = e.key.toLowerCase();
  if (k === "s") { e.preventDefault(); if (!e.repeat) leftDown(); }
  else if (k === " " || k === "enter" || k === "arrowup" || k === "k") { e.preventDefault(); if (!e.repeat) rightTap(); }
});
addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "s") leftUp(); });
addEventListener("blur", leftUp);
$("mute").onclick = () => { A.setMuted(!A.isMuted()); $("mute").textContent = A.isMuted() ? "🔇" : "🔊"; };
$("mute").textContent = A.isMuted() ? "🔇" : "🔊";
$("quit").onclick = () => quit();

/* ================= rounds ================= */
function toast(a, b = "", cls = "") { S.toast = { a, b, cls, t0: clock() }; }
function seededRand(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return ((h >>> 0) % 10000) / 10000;
}
function openStage() {
  $("stage").hidden = false; document.body.style.overflow = "hidden"; fit();
  A.unlock();
  if (!S.engines) S.engines = { me: new A.Engine(1, -0.15), them: new A.Engine(0.5, 0.35) };
}
function closeStage() {
  $("stage").hidden = true; document.body.style.overflow = "";
  S.engines?.me.stop(); S.engines?.them.stop(); S.engines = null;
}
function startRound(t0, seed) {
  S.active = true; S.roundOver = false; S.decided = null; S.seed = seed;
  S.me = new Car(); S.them = new Car();
  S.rt = { me: null, them: null }; S.res = { me: null, them: null };
  S.beeped = {}; S.toast = null; S.smoke = { me: -9, them: -9 }; S.pops = { me: -9, them: -9 };
  const delay = 0.5 + seededRand(seed) * 1.3;            // ambers start at an unpredictable moment
  S.tree = { pre: t0, stage: t0 + 0.6, a1: t0 + 1.4 + delay };
  S.tree.green = S.tree.a1 + 1.2;
  S.cardUntil = t0 - 0.15;
  if (S.mode === "cpu") { S.plan = cpuPlan(level); S.plan.revAt = t0 + 0.9 + Math.random() * 0.6; }
  S.live = null;
  showIntroCard();
  paintCars();
}
function showIntroCard() {
  const first = S.n === 1 && S.wins.me + S.wins.them === 0;
  card(`<div class="ey">ROUND ${S.n} · BEST OF 3</div>
    <h1 class="wh">${S.wins.me} – ${S.wins.them}</h1>
    <div class="by">${esc(S.names.me)} VS ${esc(S.names.them)}</div>
    ${first ? `<div class="howto"><b>HOLD REV</b>: keep the needle in the green<br><b>LAUNCH</b> on green · early = red light<br><b>SHIFT</b> in the green band<br><b>NITRO</b>: one shot per race${matchMedia("(pointer:fine)").matches ? "<br>Keys: hold <b>S</b> · tap <b>SPACE</b>" : ""}</div>` : ""}
    <p>Get ready…</p>`);
}
function card(html) { $("cardIn").innerHTML = html; $("card").hidden = false; }
function hideCard() { $("card").hidden = true; }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function update(now, dt) {
  if (!S.active) return;
  const T = S.tree;
  if (!$("card").hidden && now >= S.cardUntil && !S.roundOver) hideCard();
  // tree sounds
  const once = (k, t, fn) => { if (now >= t && !S.beeped[k]) { S.beeped[k] = 1; fn(); } };
  once("pre", T.pre, () => A.beep(1400, 0.05, 0.12));
  once("stage", T.stage, () => A.beep(1400, 0.05, 0.14));
  [0, 1, 2].forEach((k) => once("a" + k, T.a1 + k * 0.4, () => A.beep(880, 0.12, 0.2)));
  once("green", T.green, () => A.beep(1760, 0.22, 0.25));
  // me
  const m = S.me;
  if (m.phase === "staged") {
    m.rev(dt, S.holdL && now >= S.cardUntil, now);
    if (now > T.green + 4) { S.rt.me = 4; m.launch(); toast("TOO SLOW", "AUTO LAUNCH", "warn"); }
  }
  // CPU rival
  if (S.mode === "cpu") {
    const c = S.them, p = S.plan;
    if (c.phase === "staged") {
      const target = now >= p.revAt ? p.launchRpm : IDLE;
      c.rpm += (target - c.rpm) * (1 - Math.exp(-3 * dt)) + Math.sin(now * 8.3) * 30 * (target > IDLE);
      if (now >= T.green + p.rt) {
        if (p.rt < 0) { c.phase = "foul"; S.rt.them = -1; S.res.them = { foul: true }; toast("RIVAL RED-LIT", "THEY JUMPED THE TREE", "warn"); }
        else { c.rpm = p.launchRpm; c.launch(); S.rt.them = p.rt; S.smoke.them = now; A.chirp(0.2); }
      }
    } else if (c.phase === "run") {
      if (c.g < 5 && c.t > 0.45 && c.rpm >= p.shiftAt[c.g] && c.cut <= 0) { c.shift(); S.pops.them = now; A.crack(0.2); }
      if (!c.nosUsed && c.t >= p.nosAt) c.nitro();
    }
  }
  // physics
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
  for (let i = 0; i < steps; i++) { m.step(h); if (S.mode === "cpu") S.them.step(h); }
  if (S.mode === "online") followRival(now);
  // results
  if (m.phase === "done" && !S.res.me) {
    S.res.me = { foul: false, rt: S.rt.me, et: m.et, trap: m.trap, d60: m.d60 };
    S.flashAt = now; sendResult();
  }
  if (S.mode === "cpu" && S.them.phase === "done" && !S.res.them) S.res.them = { foul: false, rt: S.rt.them, et: S.them.et, trap: S.them.trap, d60: S.them.d60 };
  if (S.res.me && S.res.them && !S.roundOver) finishRound(now);
  pubLive(now);
}

function decide(a, b) {
  if (a.foul && b.foul) return "rerun";
  if (a.foul) return "them";
  if (b.foul) return "me";
  return a.rt + a.et <= b.rt + b.et ? "me" : "them";
}
function finishRound(now) {
  S.roundOver = true;
  const w = decide(S.res.me, S.res.them);
  S.decided = w;
  if (w !== "rerun") S.wins[w]++;
  if (S.mode === "online" && me === "x") hostResolve(w);
  setTimeout(() => showResult(w), 1300);
}
function slip(name, r, win) {
  if (!r) return `<div class="slip"><b>${esc(name)}</b><span>Waiting…</span></div>`;
  if (r.foul) return `<div class="slip"><b>${esc(name)}</b><span>REACTION</span><em class="bad">RED</em><br><span>RESULT</span><em class="bad">FOUL</em></div>`;
  return `<div class="slip${win ? " w" : ""}"><b>${esc(name)}</b><span>REACTION</span><em>${fmt(r.rt)}</em><br><span>60 FT</span><em>${fmt(r.d60, 2)}</em><br><span>1/4 MILE</span><em>${fmt(r.et)}</em><br><span>MPH</span><em>${fmt(r.trap * 2.237, 1)}</em></div>`;
}
function showResult(w) {
  if (!S.active && S.mode !== "online") return;
  const a = S.res.me, b = S.res.them;
  const total = (r) => (r && !r.foul ? r.rt + r.et : null);
  const margin = total(a) != null && total(b) != null ? Math.abs(total(a) - total(b)) : null;
  const wins = S.mode === "online" ? onlineWins() : S.wins;
  const over = wins.me >= 2 || wins.them >= 2;
  const head = w === "rerun" ? `<h1 class="bad">BOTH RED-LIT</h1><div class="by">RE-RUNNING THE ROUND</div>`
    : w === "me" ? `<h1>${over ? "MATCH WON" : "YOU WIN"}</h1><div class="by">${a.foul ? "" : margin != null ? `BY ${margin.toFixed(3)}s` : "THEY RED-LIT"}</div>`
    : `<h1 class="bad">${over ? "MATCH LOST" : a.foul ? "RED LIGHT" : "YOU LOSE"}</h1><div class="by">${a.foul ? "YOU LEFT BEFORE GREEN" : margin != null ? `BY ${margin.toFixed(3)}s` : ""}</div>`;
  let btns = "";
  if (S.mode === "cpu") btns = over ? `<div class="cbtns"><button class="a" id="cNext">REMATCH</button><button class="b" id="cMenu">MENU</button></div>`
    : `<div class="cbtns"><button class="a" id="cNext">${w === "rerun" ? "RE-RUN" : "NEXT ROUND"}</button><button class="b" id="cMenu">MENU</button></div>`;
  else {
    const rm = R?.rematch || {};
    btns = over ? `<div class="cbtns"><button class="a" id="cNext" ${rm[me] ? "disabled" : ""}>${rm[me] ? "WAITING…" : rm[other(me)] ? "REMATCH ▶" : "REMATCH"}</button><button class="b" id="cMenu">LEAVE</button></div>`
      : `<p>Next round starts automatically…</p><div class="cbtns"><button class="b" id="cMenu" style="grid-column:span 2">LEAVE</button></div>`;
  }
  card(`<div class="ey">ROUND ${S.n} · ${wins.me} – ${wins.them}</div>${head}
    <div class="slips">${slip(S.names.me, a, w === "me")}${slip(S.names.them, b, w === "them")}</div>${btns}`);
  if (w !== "rerun") A.sting(w === "me");
  $("cMenu").onclick = () => quit();
  const nx = $("cNext");
  if (nx) nx.onclick = () => {
    if (S.mode === "cpu") {
      if (over) { S.wins = { me: 0, them: 0 }; S.n = 1; } else if (w !== "rerun") S.n++;
      startRound(clock() + 2.2, String(Math.random()));
    } else { room.set(`rematch/${me}`, true); nx.disabled = true; nx.textContent = "WAITING…"; }
  };
}

/* ================= render ================= */
const PXM = 24, CARX = 34, LANE_Y = 258, LANE_R = 184;
const pulse = (t, t0, d) => (t >= t0 && t < t0 + d ? 1 - (t - t0) / d : 0);
let last = clock();
function frame() {
  const now = clock(), dt = Math.min(0.05, now - last); last = now;
  if (!$("stage").hidden) { update(now, dt); render(now); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function render(now) {
  const y = S.me, r = S.them, T = S.tree || { pre: 1e9, stage: 1e9, a1: 1e9, green: 1e9 };
  const cam = y.d, gap = r.d - y.d;
  const rx = CARX + 8 + 150 * Math.tanh(gap / 3.2);
  const vy = y.v > 1 ? Math.sin(now * 90) * 0.6 : Math.sin(now * 50) * 0.25;
  const vr = r.v > 1 ? Math.sin(now * 83 + 1) * 0.6 : Math.sin(now * 47) * 0.25;
  const squat = (t0) => (now >= t0 ? -2.4 * Math.exp(-(now - t0) * 3) * Math.sin(Math.min(1, (now - t0) * 6) * Math.PI / 2) : 0);
  $("carY").style.cssText = `left:${CARX}px;top:${LANE_Y - 75 + vy}px;transform:rotate(${squat(S.smoke.me)}deg)`;
  $("carR").style.cssText = `left:${rx}px;top:${LANE_R - 68 + vr}px;transform:rotate(${squat(S.smoke.them)}deg)`;
  const rot = (d) => `rotate(${((d / 0.68) * 57.3) % 360})`;
  if (wheels.me.length) {
    wheels.me[0].setAttribute("transform", "translate(100 101) " + rot(y.d)); wheels.me[1].setAttribute("transform", "translate(340 101) " + rot(y.d));
    wheels.them[0].setAttribute("transform", "translate(100 101) " + rot(r.d)); wheels.them[1].setAttribute("transform", "translate(340 101) " + rot(r.d));
  }
  const wx = (m) => CARX + 250 * 0.965 + (m - cam) * PXM;
  sline.style.left = wx(0) + "px"; fline.style.left = wx(QUARTER) + "px";
  beams.forEach((b) => (b.style.left = wx(0) - 13 + "px"));
  boards.forEach(([m, b]) => (b.style.left = wx(m) - 20 + "px"));
  tree.style.left = wx(0) + 18 + "px";
  poles.forEach((p, i) => (p.style.left = ((((i * 46 - cam * PXM * 0.45) % 414) + 414) % 414) - 30 + "px"));
  $("stand").style.backgroundPosition = -cam * PXM * 0.3 + "px 0";
  const dl = 18 + Math.min(60, y.v * 1.1);
  $("dash").style.background = `repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 ${dl}px,transparent ${dl}px 70px)`;
  $("dash").style.backgroundPosition = -cam * PXM + "px 0";
  speeds.forEach((s, i) => {
    const sp = y.v, o = clamp((sp - 12) / 30, 0, 1), len = 60 + sp * 2.4;
    s.style.opacity = o; s.style.width = len + "px"; s.style.top = [120, 140, 196, 214, 232, 246][i] + "px";
    s.style.left = ((((i * 137 - now * sp * 14) % (334 + len)) + 334 + len) % (334 + len)) - len + "px";
  });
  // tree
  tl.forEach((l) => (l.className = l.classList.contains("sm") ? "sm" : ""));
  const on = (i, c) => tl[i].classList.add(c);
  if (now >= T.pre) { on(0, "st"); on(1, "st"); }
  if (now >= T.stage) { on(2, "st"); on(3, "st"); }
  [0, 1, 2].forEach((k) => { const a = T.a1 + k * 0.4; if (now >= a && now < T.green) { on(4 + k * 2, "am"); on(5 + k * 2, "am"); } });
  if (now >= T.green) { if (r.phase !== "foul") on(10, "gr"); if (y.phase !== "foul") on(11, "gr"); }
  if (y.phase === "foul") on(13, "rd");
  if (r.phase === "foul") on(12, "rd");
  // smoke, flame, pops
  [["smkY", S.smoke.me, CARX + 10, LANE_Y - 22], ["smkR", S.smoke.them, rx + 8, LANE_R - 20]].forEach(([id, t0, x, yy]) => {
    const e = $(id), k = now - t0;
    if (k < 0 || k > 1.4) { e.style.opacity = 0; return; }
    const s = 40 + k * 160;
    e.style.cssText = `width:${s}px;height:${s * 0.55}px;left:${x - s * 0.7 - k * 80}px;top:${yy - s * 0.3}px;opacity:${(1 - k / 1.4) * 0.9}`;
  });
  const fl = $("flame");
  fl.style.cssText = `left:${CARX - 34}px;top:${LANE_Y - 32}px;opacity:${y.nos > 0 ? 0.75 + 0.25 * Math.sin(now * 80) : 0};transform:scaleX(${1 + 0.3 * Math.sin(now * 61)})`;
  $("popY").style.cssText = `left:${CARX - 16}px;top:${LANE_Y - 31}px;opacity:${pulse(now, S.pops.me, 0.16)}`;
  $("popR").style.cssText = `left:${rx - 14}px;top:${LANE_R - 29}px;opacity:${pulse(now, S.pops.them, 0.16) * 0.8}`;
  // toast
  const te = $("toast"), ts = S.toast;
  if (ts && now - ts.t0 < 1.1) {
    const x = (now - ts.t0) / 1.1;
    te.className = "toast " + ts.cls;
    te.innerHTML = `${ts.a}${ts.b ? `<small>${ts.b}</small>` : ""}`;
    te.style.opacity = x < 0.12 ? x / 0.12 : x > 0.75 ? (1 - x) / 0.25 : 1;
  } else te.style.opacity = 0;
  $("flash").style.opacity = pulse(now, S.flashAt, 0.4) * 0.28;
  // header + progress
  $("pY").style.left = clamp(y.d / QUARTER, 0, 1) * 100 + "%";
  $("pR").style.left = clamp(r.d / QUARTER, 0, 1) * 100 + "%";
  $("subY").textContent = S.rt.me != null ? (S.rt.me < 0 ? "RED LIGHT" : "RT " + S.rt.me.toFixed(3).replace(/^0/, "")) : "LANE 2";
  $("subR").textContent = S.rt.them != null ? (S.rt.them < 0 ? "RED LIGHT" : "RT " + S.rt.them.toFixed(3).replace(/^0/, "")) : S.mode === "cpu" ? `CPU · ${level.toUpperCase()}` : "LANE 1";
  const wins = S.mode === "online" ? onlineWins() : S.wins;
  $("roundBox").textContent = `ROUND ${S.n} · ${wins.me}–${wins.them}`;
  // tach
  const racing = y.phase === "run" || y.phase === "done";
  const rpm = y.rpm, ang = ((180 - (clamp(rpm, 0, 9000) / 9000) * 180) * Math.PI) / 180;
  $("needle").setAttribute("x2", (120 + 86 * Math.cos(ang)).toFixed(1));
  $("needle").setAttribute("y2", (120 - 86 * Math.sin(ang)).toFixed(1));
  $("trail").setAttribute("d", rpm > 60 ? arc(0, rpm) : "");
  $("zone").setAttribute("d", racing ? arc(SHIFT_WIN[0], SHIFT_WIN[1]) : arc(LAUNCH_WIN[0], LAUNCH_WIN[1]));
  $("redz").setAttribute("d", racing ? arc(SHIFT_WIN[1], 9000) : arc(7800, 9000));
  const lit = clamp(Math.floor(((rpm - 5000) / 2600) * 8), 0, 8), cls = ["g", "g", "g", "a", "a", "a", "r", "r"];
  const blink = y.phase === "run" && rpm >= SHIFT_WIN[0] + 200 && y.g < 5 && Math.floor(now * 14) % 2;
  leds.forEach((l, i) => (l.className = blink ? "r" : i < lit ? cls[i] : ""));
  $("gear").lastChild.textContent = racing ? String(y.g + 1) : "N";
  $("mphL").textContent = racing ? "MPH" : "RPM";
  $("mph").lastChild.textContent = racing ? Math.round(y.v * 2.237) : Math.round(rpm).toLocaleString("en-US");
  // pads
  const pl = $("padL");
  pl.classList.toggle("nos", racing); pl.classList.toggle("used", racing && y.nosUsed && y.nos <= 0);
  $("padLt").textContent = racing ? "NITRO" : "REV";
  $("padLs").textContent = racing ? (y.nosUsed ? (y.nos > 0 ? "BOOSTING" : "USED") : "ONE SHOT") : "HOLD · KEEP IT GREEN";
  $("padRt").textContent = racing ? "SHIFT" : "LAUNCH";
  $("padRs").textContent = racing ? (y.g >= 5 ? "TOP GEAR" : "IN THE GREEN BAND") : "TAP ON GREEN";
  // engine audio
  if (S.engines) {
    const loadY = y.phase === "run" ? 1 : y.phase === "done" ? 0.08 : clamp((y.rpm - 1200) / 4500, 0, 1) * 0.8;
    const loadR = r.phase === "run" ? 1 : r.phase === "done" ? 0.08 : clamp((r.rpm - 1200) / 4500, 0, 1) * 0.7;
    S.engines.me.set(y.rpm, loadY, y.cut > 0);
    S.engines.them.set(r.rpm * 1.03, loadR, r.cut > 0);
  }
}

/* ================= modes ================= */
function startCpu() {
  S.mode = "cpu"; S.wins = { me: 0, them: 0 }; S.n = 1;
  S.names = { me: myName() || "YOU", them: `CPU · ${level.toUpperCase()}` };
  const pool = WRAPS.filter((w) => w.id !== myWrap);
  S.wraps = { me: myWrap, them: pool[Math.floor(Math.random() * pool.length)].id };
  openStage();
  startRound(clock() + 3.4, String(Math.random()));
}
$("goCpu").onclick = () => { A.unlock(); startCpu(); };
async function quit() {
  S.active = false; leftUp(); closeStage();
  if (room) { const h = room; room = null; R = null; await h.close(false); }
  S.mode = null; show("menu");
}
function show(id) { ["menu", "wait"].forEach((k) => ($(k).hidden = k !== id)); }

/* ================= online ================= */
const note = (t, err) => { $("onlineNote").textContent = t; $("onlineNote").className = "note" + (err ? " err" : ""); };
$("name").value = myName();
if (!onlineReady) { ["goCreate", "goJoin", "joinCode"].forEach((k) => ($(k).disabled = true)); note("Online rooms are coming soon."); }
$("joinCode").addEventListener("input", (e) => { e.target.value = cleanCode(e.target.value); note(""); });
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("goJoin").click(); });
$("goCreate").onclick = async () => {
  A.unlock(); saveName($("name").value); note("Creating room…");
  try { enter(await createRoom(GAME, { paint: { x: myWrap }, wins: { x: 0, o: 0 }, match: 1 })); note(""); }
  catch (e) { console.error(e); note("Couldn't create a room. Check your connection and try again.", true); }
};
$("goJoin").onclick = async () => {
  A.unlock(); saveName($("name").value); note("Joining…");
  try { const h = await joinRoom(GAME, $("joinCode").value); await h.set(`paint/${h.seat}`, myWrap); enter(h); note(""); }
  catch (e) { console.error(e); note(e.message || "Couldn't reach the game server.", true); }
};
$("share").onclick = async () => {
  const r = await room.share("Launch Control", `Race me in Launch Control. Room ${room.code}`);
  if (r === "copied") $("shareNote").textContent = "Link copied. Send it to your friend.";
};
$("cancelWait").onclick = async () => { const h = room; room = null; await h?.close(true); show("menu"); };

const serverNow = () => Date.now() + offset;
// both phones work out every round result themselves, so the series score never waits on the network
function onlineWins() { return S.wins; }
async function enter(h) {
  room = h; me = h.seat; S.mode = "online";
  $("waitCode").textContent = h.code;
  offset = await h.clockOffset();
  h.listen((r) => {
    if (!r) { quit(); note("That room was closed.", true); return; }
    R = r;
    const them = other(me), nm = r.names || {};
    S.names = { me: myName() || "YOU", them: nm[them] || "RIVAL" };
    S.wraps = { me: myWrap, them: r.paint?.[them] || (myWrap === "black" ? "silver" : "black") };
    const on = r.online || {};
    if (!r.players?.o) { show("wait"); return; }
    if ($("stage").hidden) openStage();
    $("rbanner").hidden = !!on[them];
    $("rbanner").textContent = "Your rival dropped off. Waiting for them to come back…";
    // host kicks off round 1
    if (me === "x" && !r.round && on.o) h.update({ round: { n: 1, seed: Math.random().toString(36).slice(2), startAt: serverNow() + 4500 } });
    // rematch
    if (me === "x" && r.rematch?.x && r.rematch?.o)
      h.update({ rematch: null, wins: { x: 0, o: 0 }, res: null, live: null, match: (r.match || 1) + 1, round: { n: 1, seed: Math.random().toString(36).slice(2), startAt: serverNow() + 4500 } });
    if ((r.match || 1) !== S.matchId) { S.matchId = r.match || 1; S.wins = { me: 0, them: 0 }; }
    // a new round
    if (r.round && r.round.seed !== S.seed) {
      S.n = r.round.n;
      const t0 = clock() + (r.round.startAt - serverNow()) / 1000;
      startRound(t0, r.round.seed);
    }
    // rival live data + result
    const lv = r.live?.[them];
    if (lv && lv.seed === S.seed) S.live = { ...lv, at: clock() };
    const rr = r.res?.[S.seed]?.[them];
    if (rr && !S.res.them) { S.res.them = rr; S.rt.them = rr.foul ? -1 : rr.rt; if (rr.foul) S.them.phase = "foul"; }
    if (!$("card").hidden && S.roundOver) {
      const nx = $("cNext");
      if (nx) { const rm = r.rematch || {}; nx.disabled = !!rm[me]; nx.textContent = rm[me] ? "WAITING…" : rm[them] ? "REMATCH ▶" : "REMATCH"; }
    }
  });
}
// draw the rival from their latest live update, extrapolating between updates
function followRival(now) {
  const c = S.them, L = S.live;
  if (!L) return;
  if (L.ph === "foul") { c.phase = "foul"; return; }
  if (L.ph === "staged") { c.rpm += ((L.rpm || IDLE) - c.rpm) * 0.2; return; }
  if (c.phase === "staged" && (L.ph === "run" || L.ph === "done")) { c.phase = "run"; S.smoke.them = now; S.rt.them = L.rt; A.chirp(0.2); }
  const age = Math.min(0.5, now - L.at);
  const target = L.d + (L.ph === "run" ? L.v * age : 0);
  c.d += (target - c.d) * 0.35;
  c.v = L.v; c.rpm = L.rpm; if (c.g !== L.g && L.g > c.g) { S.pops.them = now; A.crack(0.2); } c.g = L.g; c.nos = L.nos ? 1 : 0; c.cut = 0;
  if (L.ph === "done") c.phase = "done";
}
let lastPub = 0;
function pubLive(now) {
  if (S.mode !== "online" || !room || now - lastPub < 0.08) return;
  lastPub = now;
  const m = S.me;
  room.set(`live/${me}`, { seed: S.seed, ph: m.phase, d: +m.d.toFixed(2), v: +m.v.toFixed(2), rpm: Math.round(m.rpm), g: m.g, nos: m.nos > 0, rt: S.rt.me }).catch(() => {});
}
function pubNow() { lastPub = 0; }
function sendResult() {
  if (S.mode !== "online" || !room) return;
  room.set(`res/${S.seed}/${me}`, S.res.me).catch(() => {});
}
const resolved = new Set();
function hostResolve(w) {
  if (resolved.has(S.seed)) return; resolved.add(S.seed);
  const seed = S.seed;
  const up = {};
  up.wins = { [me]: S.wins.me, [other(me)]: S.wins.them };
  const winsAfter = { [me]: S.wins.me, [other(me)]: S.wins.them };
  room.update(up).then(() => {
    if ((winsAfter.x || 0) >= 2 || (winsAfter.o || 0) >= 2) return;
    setTimeout(() => {
      if (!room || S.seed !== seed) return;
      room.update({ round: { n: (R.round?.n || 1) + (w === "rerun" ? 0 : 1), seed: Math.random().toString(36).slice(2), startAt: serverNow() + 5000 } });
    }, 3500);
  }).catch((e) => console.error(e));
}

const qs = new URLSearchParams(location.search);
if (qs.get("room") && onlineReady) { $("joinCode").value = cleanCode(qs.get("room")); $("goJoin").click(); }
else if (qs.get("mode") === "cpu") startCpu();
if (qs.has("test")) window.__lc = { S, rightTap, leftDown, leftUp, clock };
