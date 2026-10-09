// Kleine synthetische Soundeffekte (Web Audio), keine Audiodateien nötig.
// Alle Töne laufen über einen Master-Regler (Lautstärke/Stumm aus den Einstellungen).
let ctx = null;
let master = null;
let volume = 1; // 0..1
let muted = false;
let duck = 1; // zusätzlich leiser (Hauptmenü)
const gainValue = () => (muted ? 0 : volume * duck);

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = gainValue();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v, mute = muted) {
  volume = Math.min(1, Math.max(0, v));
  muted = mute;
  if (master) master.gain.value = gainValue();
}
export function setDuck(f) {
  duck = f;
  if (master) master.gain.value = gainValue();
}
export const getVolume = () => ({ volume, muted });

// Kurzer Ton mit fallender/steigender Frequenz und schneller Hüllkurve
function tone(a, t, { type = 'triangle', from, to, dur, vol }) {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Gefiltertes Rauschen (Anschlag, Rascheln, Krachen)
function noise(a, t, { dur, freq, q = 1, vol, type = 'bandpass' }) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function play(fn) {
  if (muted || volume <= 0) return;
  try {
    const a = audio();
    fn(a, a.currentTime);
  } catch {
    // Audio nicht verfügbar – still weiter
  }
}

// Dumpfes Klopfen auf Holz (UI-Knöpfe). pitch > 1 = heller.
export function knock(pitch = 1, volume = 0.22) {
  play((a, t) => {
    tone(a, t, { from: 240 * pitch, to: 95 * pitch, dur: 0.14, vol: volume });
    noise(a, t, { dur: 0.035, freq: 1600 * pitch, q: 1.2, vol: volume * 0.7 });
  });
}

// Axt trifft Stamm
export function chop(volume = 1) {
  const p = 0.9 + Math.random() * 0.2;
  play((a, t) => {
    tone(a, t, { from: 180 * p, to: 70 * p, dur: 0.12, vol: 0.28 * volume });
    noise(a, t, { dur: 0.06, freq: 2400 * p, q: 0.8, vol: 0.32 * volume });
    noise(a, t + 0.01, { dur: 0.12, freq: 600, q: 0.7, vol: 0.12 * volume });
  });
}

// Baum schlägt auf
export function crash() {
  play((a, t) => {
    noise(a, t, { dur: 0.25, freq: 3000, q: 0.5, vol: 0.12 }); // Blätter rascheln
    tone(a, t + 0.05, { type: 'sine', from: 110, to: 38, dur: 0.4, vol: 0.4 });
    noise(a, t + 0.05, { dur: 0.45, freq: 500, vol: 0.3, type: 'lowpass' });
  });
}

// Holzscheit hüpft auf den Boden
export function thud(volume = 0.12) {
  play((a, t) => {
    tone(a, t, { from: 160 + Math.random() * 40, to: 80, dur: 0.08, vol: volume });
  });
}

// Item aufheben
export function pop(volume = 1) {
  play((a, t) => {
    tone(a, t, { type: 'square', from: 420, to: 900, dur: 0.09, vol: 0.06 * volume });
    tone(a, t, { type: 'sine', from: 600, to: 1300, dur: 0.1, vol: 0.12 * volume });
  });
}

// Holz landet in der Truhe
export function deposit() {
  play((a, t) => {
    tone(a, t, { from: 200, to: 110, dur: 0.1, vol: 0.2 });
    noise(a, t, { dur: 0.04, freq: 1400, vol: 0.15 });
    tone(a, t + 0.05, { type: 'sine', from: 1180, to: 1200, dur: 0.12, vol: 0.06 });
    tone(a, t + 0.1, { type: 'sine', from: 1580, to: 1600, dur: 0.16, vol: 0.05 });
  });
}

// Abgelehnt (Truhe voll)
export function deny() {
  play((a, t) => {
    tone(a, t, { type: 'square', from: 180, to: 120, dur: 0.14, vol: 0.06 });
  });
}

// Skill gekauft: kleine aufsteigende Melodie
export function buy() {
  play((a, t) => {
    [784, 988, 1318].forEach((f, i) => tone(a, t + i * 0.06, { type: 'square', from: f, to: f, dur: 0.1, vol: 0.05 }));
    tone(a, t, { from: 220, to: 120, dur: 0.12, vol: 0.15 });
  });
}

// Münzen (Verkauf)
export function coin() {
  play((a, t) => {
    tone(a, t, { type: 'square', from: 988, to: 988, dur: 0.07, vol: 0.05 });
    tone(a, t + 0.07, { type: 'square', from: 1318, to: 1318, dur: 0.16, vol: 0.05 });
  });
}

// Regen setzt ein: weiches Rauschen, das an- und abschwillt
export function rain() {
  play((a, t) => {
    for (let k = 0; k < 6; k++) noise(a, t + k * 0.25, { dur: 0.9, freq: 3200 + k * 200, q: 0.4, vol: 0.05, type: 'highpass' });
  });
}

// Donner: tiefes Grollen nach dem Blitz
export function thunder(volume = 1) {
  play((a, t) => {
    noise(a, t, { dur: 0.25, freq: 900, q: 0.6, vol: 0.4 * volume });
    noise(a, t + 0.08, { dur: 1.6, freq: 140, q: 0.7, vol: 0.55 * volume, type: 'lowpass' });
    tone(a, t + 0.05, { type: 'sine', from: 70, to: 38, dur: 1.2, vol: 0.25 * volume });
  });
}

// Kundenglocke: ein neuer Kunde kommt
export function bell() {
  play((a, t) => {
    tone(a, t, { type: 'sine', from: 1568, to: 1560, dur: 0.35, vol: 0.09 });
    tone(a, t + 0.12, { type: 'sine', from: 1175, to: 1170, dur: 0.5, vol: 0.08 });
  });
}

// Willkommen zurück: kleine Fanfare
export function fanfare() {
  play((a, t) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(a, t + i * 0.09, { type: 'square', from: f, to: f, dur: i === 3 ? 0.3 : 0.1, vol: 0.05 }));
  });
}

// Kritischer Treffer
export function crit() {
  play((a, t) => {
    tone(a, t, { from: 260, to: 60, dur: 0.18, vol: 0.32 });
    noise(a, t, { dur: 0.1, freq: 3200, q: 0.7, vol: 0.35 });
    tone(a, t + 0.02, { type: 'square', from: 1200, to: 1800, dur: 0.12, vol: 0.05 });
  });
}

// Sägewerk: kurzes, raues Sägegeräusch
export function saw(volume = 0.06) {
  play((a, t) => {
    for (let k = 0; k < 3; k++) noise(a, t + k * 0.07, { dur: 0.06, freq: 2600 + k * 300, q: 3, vol: volume });
    tone(a, t, { type: 'sawtooth', from: 520, to: 430, dur: 0.2, vol: volume * 0.25 });
  });
}
