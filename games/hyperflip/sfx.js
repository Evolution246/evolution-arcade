// Synthesized pinball sounds (Web Audio, no files).
let ctx = null, out = null, muted = false;
try { muted = localStorage.getItem("hf-muted") === "1"; } catch {}
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); out = ctx.createGain(); out.gain.value = muted ? 0 : 0.7;
    const c = ctx.createDynamicsCompressor(); c.threshold.value = -12; out.connect(c).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; try { localStorage.setItem("hf-muted", m ? "1" : "0"); } catch {} if (out) out.gain.value = m ? 0 : 0.7; }
let nb = null;
function noise(t, dur, f, q, vol, type = "bandpass") {
  if (!nb) { nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, f0, f1, dur, vol, type = "square") {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
const T = () => ctx.currentTime;
const ok = () => !!ctx && !muted;
export const sfx = {
  flipper() { if (!ok()) return; const t = T(); noise(t, 0.06, 600, 1, 0.35, "lowpass"); tone(t, 140, 70, 0.07, 0.25, "triangle"); },
  bumper() { if (!ok()) return; const t = T(); tone(t, 1200, 180, 0.16, 0.18); noise(t, 0.05, 3000, 2, 0.2); },
  sling() { if (!ok()) return; const t = T(); tone(t, 520, 260, 0.08, 0.16, "sawtooth"); noise(t, 0.04, 2000, 1, 0.25); },
  target() { if (!ok()) return; const t = T(); tone(t, 1320, 1320, 0.18, 0.14, "sine"); tone(t + 0.05, 1980, 1980, 0.15, 0.08, "sine"); },
  lane() { if (!ok()) return; const t = T(); [1046, 1568].forEach((f, i) => tone(t + i * 0.06, f, f, 0.18, 0.1, "triangle")); },
  wall() { if (!ok()) return; noise(T(), 0.03, 900, 1, 0.12, "lowpass"); },
  core() { if (!ok()) return; const t = T(); tone(t, 220, 880, 0.25, 0.14, "sawtooth"); tone(t, 330, 1320, 0.25, 0.08, "square"); },
  launch(p = 1) { if (!ok()) return; const t = T(); noise(t, 0.4, 900 + 900 * p, 0.8, 0.3); tone(t, 90, 45, 0.25, 0.3, "sine"); },
  charge(p) { if (!ok()) return; tone(T(), 200 + p * 500, 200 + p * 500, 0.04, 0.04, "square"); },
  drain() { if (!ok()) return; const t = T(); tone(t, 440, 110, 0.7, 0.18, "sawtooth"); },
  save() { if (!ok()) return; const t = T(); [784, 988, 1175].forEach((f, i) => tone(t + i * 0.08, f, f, 0.15, 0.1, "triangle")); },
  fanfare(big = false) {
    if (!ok()) return; const t = T();
    const n = big ? [523, 659, 784, 1046, 784, 1046, 1318] : [523, 659, 784, 1046];
    n.forEach((f, i) => tone(t + i * 0.09, f, f, 0.22, 0.12, "square"));
  },
  over() { if (!ok()) return; const t = T(); [523, 392, 330, 262].forEach((f, i) => tone(t + i * 0.18, f, f, 0.3, 0.12, "triangle")); },
};
