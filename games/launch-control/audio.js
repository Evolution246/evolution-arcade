// Real-time engine + effects with Web Audio. Nothing to download: every sound is synthesized.
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem("lc-muted") === "1"; } catch {}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m; try { localStorage.setItem("lc-muted", m ? "1" : "0"); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
function shaper(amount) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = Math.tanh(x * amount); }
  const w = ctx.createWaveShaper(); w.curve = c; return w;
}

// One V8-style engine voice: firing note + sub rumble, driven through saturation and a load-dependent filter
export class Engine {
  constructor(vol = 1, pan = 0) {
    if (!ctx) { this.dead = true; return; }
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; this.out.connect(p).connect(master); } else this.out.connect(master);
    this.vol = vol;
    this.filt = ctx.createBiquadFilter(); this.filt.type = "lowpass"; this.filt.Q.value = 1.2; this.filt.frequency.value = 600;
    const sat = shaper(2.6);
    this.mix = ctx.createGain(); this.mix.gain.value = 0.32;
    this.mix.connect(sat).connect(this.filt).connect(this.out);
    this.o1 = ctx.createOscillator(); this.o1.type = "sawtooth";
    this.o2 = ctx.createOscillator(); this.o2.type = "square";
    this.o3 = ctx.createOscillator(); this.o3.type = "sawtooth";
    const g2 = ctx.createGain(); g2.gain.value = 0.55; const g3 = ctx.createGain(); g3.gain.value = 0.25;
    this.o1.connect(this.mix); this.o2.connect(g2).connect(this.mix); this.o3.connect(g3).connect(this.mix);
    // a slow wobble on the sub voice gives the idle its lopey burble
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 7; this.lfoG = ctx.createGain(); this.lfoG.gain.value = 3;
    this.lfo.connect(this.lfoG).connect(this.o2.frequency);
    this.n = noise(); this.nf = ctx.createBiquadFilter(); this.nf.type = "bandpass"; this.nf.frequency.value = 1800; this.nf.Q.value = 0.7;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.n.connect(this.nf).connect(this.ng).connect(this.out);
    [this.o1, this.o2, this.o3, this.lfo, this.n].forEach((o) => o.start());
    this.out.gain.setTargetAtTime(0.5 * vol, ctx.currentTime, 0.2);
  }
  set(rpm, load, cut) {
    if (this.dead) return;
    const t = ctx.currentTime, f = (rpm / 60) * 4;
    this.o1.frequency.setTargetAtTime(f, t, 0.015);
    this.o2.frequency.setTargetAtTime(f / 2, t, 0.015);
    this.o3.frequency.setTargetAtTime(f * 1.5, t, 0.015);
    this.lfoG.gain.setTargetAtTime(rpm < 1600 ? 6 : 0.5, t, 0.1);
    this.filt.frequency.setTargetAtTime(500 + load * 2600 + rpm * 0.25, t, 0.03);
    const lvl = (0.32 + 0.68 * load) * (0.6 + 0.4 * Math.min(1, rpm / 8000)) * (cut ? 0.35 : 1);
    this.out.gain.setTargetAtTime(lvl * 0.6 * this.vol, t, 0.025);
    this.ng.gain.setTargetAtTime(load * 0.12 * Math.min(1, rpm / 8000), t, 0.05);
  }
  stop() {
    if (this.dead) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => { try { [this.o1, this.o2, this.o3, this.lfo, this.n].forEach((o) => o.stop()); this.out.disconnect(); } catch {} }, 900);
    this.dead = true;
  }
}

function env(node, t0, a, d, peak) {
  node.gain.setValueAtTime(0, t0); node.gain.linearRampToValueAtTime(peak, t0 + a); node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
export function beep(freq = 880, dur = 0.12, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = freq; o.connect(g).connect(master); env(g, t, 0.004, dur, vol); o.start(t); o.stop(t + dur + 0.1);
}
export function crack(vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime, n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = "highpass"; f.frequency.value = 900; n.connect(f).connect(g).connect(master);
  env(g, t, 0.001, 0.05, vol); n.start(t); n.stop(t + 0.15);
  const o = ctx.createOscillator(), g2 = ctx.createGain(); o.frequency.value = 70; o.connect(g2).connect(master); env(g2, t + 0.05, 0.004, 0.09, vol * 0.8); o.start(t); o.stop(t + 0.3);
}
export function chirp(vol = 0.35) {
  if (!ctx) return;
  const t = ctx.currentTime, n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 6; n.connect(f).connect(g).connect(master);
  env(g, t, 0.01, 0.35, vol); n.start(t); n.stop(t + 0.6);
}
export function nitro() {
  if (!ctx) return;
  const t = ctx.currentTime, n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = "bandpass"; f.frequency.setValueAtTime(2500, t); f.frequency.linearRampToValueAtTime(7000, t + 2.4);
  n.connect(f).connect(g).connect(master);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.08); g.gain.setValueAtTime(0.35, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 2.6);
  n.start(t); n.stop(t + 2.7);
  const o = ctx.createOscillator(), g2 = ctx.createGain(); o.frequency.value = 42; o.connect(g2).connect(master); env(g2, t, 0.005, 0.3, 0.6); o.start(t); o.stop(t + 0.5);
}
export function sting(win = true) {
  if (!ctx) return;
  const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 311.13, 261.63];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.09, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f; o.connect(g).connect(master); env(g, t, 0.01, 0.45, 0.16); o.start(t); o.stop(t + 0.8);
  });
}
