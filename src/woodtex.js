// Pixel-Art-Holztexturen: werden in kleiner Auflösung per Canvas gezeichnet und mit PIXEL
// hochskaliert (image-rendering: pixelated). Ergebnis landet als CSS-Variablen auf :root.

export const PIXEL = 3; // CSS-Pixel pro Art-Pixel

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// amt > 0 aufhellen, amt < 0 abdunkeln (mit leichtem Warmton beim Abdunkeln)
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c, t) => Math.round(c + (t - c) * Math.abs(amt));
  const out = amt >= 0
    ? [mix(r, 255), mix(g, 236), mix(b, 200)]
    : [mix(r, 30), mix(g, 10), mix(b, 0)];
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const px = (color, x, y, pw = 1, ph = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pw, ph);
  };
  return { c, ctx, px };
}

const OUTLINE = '#240c00';

// ---------- Planken ----------
function plankTexture({ colors, heights = [11, 9, 12, 10], w = 160, seed = 1, knots = 0.25, nails = false }) {
  const rand = rng(seed * 7919);
  const h = heights.reduce((a, b) => a + b, 0);
  const { c, px } = canvas(w, h);
  let y = 0;
  let prev = -1;
  for (const ph of heights) {
    let ci;
    do ci = Math.floor(rand() * colors.length); while (ci === prev && colors.length > 1);
    prev = ci;
    const base = colors[ci];
    const hi = shade(base, 0.22);
    const lt = shade(base, 0.09);
    const dk = shade(base, -0.13);
    const dk2 = shade(base, -0.28);
    const seam = shade(base, -0.62);

    px(base, 0, y, w, ph);
    // Kurze Maserungsstriche (nahtlos über die Kachelbreite)
    const streaks = Math.floor((w * ph) / 14);
    for (let i = 0; i < streaks; i++) {
      const sx = Math.floor(rand() * w);
      const sy = y + 1 + Math.floor(rand() * (ph - 3));
      const len = 2 + Math.floor(rand() * 10);
      const col = rand() < 0.68 ? dk : lt;
      for (let k = 0; k < len; k++) px(col, (sx + k) % w, sy);
    }
    // Eine durchgehende, leicht wellige Maserlinie
    const gy = y + 2 + Math.floor(rand() * (ph - 5));
    const phase = rand() * Math.PI * 2;
    for (let x = 0; x < w; x++) {
      if (rand() < 0.12) continue;
      const off = Math.round(Math.sin(phase + (x / w) * Math.PI * 4));
      px(dk2, x, Math.min(y + ph - 3, Math.max(y + 1, gy + off)));
    }
    // Astloch
    if (rand() < knots && ph >= 9) {
      const kx = 6 + Math.floor(rand() * (w - 12));
      const ky = y + Math.floor(ph / 2) - 1;
      for (let k = -4; k <= 4; k++) {
        px(dk, (kx + k + w) % w, ky - 2);
        px(dk, (kx + k + w) % w, ky + 2);
      }
      for (let k = -3; k <= 3; k++) {
        px(dk2, (kx + k + w) % w, ky - 1);
        px(dk2, (kx + k + w) % w, ky + 1);
      }
      for (let k = -2; k <= 2; k++) px(seam, (kx + k + w) % w, ky);
      px(dk2, kx - 3, ky);
      px(dk2, kx + 3, ky);
    }
    // Stoßfuge
    const jx = 16 + Math.floor(rand() * (w - 32));
    for (let k = 0; k < ph - 1; k++) {
      px(dk, jx - 1, y + k);
      px(seam, jx, y + k);
      px(lt, jx + 1, y + k);
    }
    if (nails) {
      const ny = y + Math.floor(ph / 2) - 1;
      for (const nx of [jx - 4, jx + 3]) {
        px('#2d2a28', nx, ny, 2, 2);
        px('#a9a39a', nx, ny);
        px('#14100e', nx + 1, ny + 1);
      }
    }
    // Kanten: oben Lichtkante, unten Schatten + Fuge
    px(hi, 0, y, w, 1);
    px(dk2, 0, y + ph - 2, w, 1);
    px(seam, 0, y + ph - 1, w, 1);
    y += ph;
  }
  return c;
}

// ---------- Kantholz-Balken ----------
// Zeichnet waagerecht; vertical=true dreht das Ergebnis um 90°.
function beamTexture({ thick = 8, len = 64, base = '#8a4f24', seed = 3, bolts = true, vertical = false }) {
  const rand = rng(seed * 104729);
  const { c, px } = canvas(len, thick);
  const hi = shade(base, 0.3);
  const lt = shade(base, 0.12);
  const dk = shade(base, -0.18);
  const dk2 = shade(base, -0.36);

  // Querschnitt-Schattierung: Licht von oben
  const rows = [];
  for (let r = 0; r < thick; r++) {
    if (r === 0 || r === thick - 1) rows.push(OUTLINE);
    else if (r === 1) rows.push(hi);
    else if (r === 2) rows.push(lt);
    else if (r === thick - 2) rows.push(dk2);
    else if (r === thick - 3) rows.push(dk);
    else rows.push(base);
  }
  rows.forEach((col, r) => px(col, 0, r, len, 1));

  // Maserung
  for (let i = 0; i < len / 3; i++) {
    const sy = 2 + Math.floor(rand() * (thick - 4));
    const sx = Math.floor(rand() * len);
    const l = 3 + Math.floor(rand() * 9);
    const col = rand() < 0.7 ? dk : lt;
    for (let k = 0; k < l; k++) px(col, (sx + k) % len, sy);
  }
  // Kleiner Riss / Astansatz
  const kx = 10 + Math.floor(rand() * (len - 30));
  const ky = Math.floor(thick / 2);
  px(dk2, kx - 2, ky, 5, 1);
  px(OUTLINE, kx - 1, ky, 3, 1);
  px(lt, kx - 1, ky - 1, 3, 1);

  // Eisenbolzen
  if (bolts) {
    const bx = len - 10;
    const by = Math.floor(thick / 2) - 1;
    px('#1c1c20', bx - 1, by - 1, 4, 4);
    px('#6f727a', bx, by, 2, 2);
    px('#c9ccd2', bx, by);
    px('#3a3c42', bx + 1, by + 1);
  }

  if (!vertical) return c;
  const out = canvas(thick, len);
  out.ctx.translate(thick, 0);
  out.ctx.rotate(Math.PI / 2);
  out.ctx.drawImage(c, 0, 0);
  // Nach dem Drehen liegt das Licht rechts; spiegeln, damit es von links kommt.
  const flip = canvas(thick, len);
  flip.ctx.translate(thick, 0);
  flip.ctx.scale(-1, 1);
  flip.ctx.drawImage(out.c, 0, 0);
  return flip.c;
}

// ---------- Eisenbeschlag für Balkenkreuzungen ----------
function plateTexture(size = 12) {
  const { c, px } = canvas(size, size);
  px('#1c1c20', 0, 0, size, size);
  px('#5d5f66', 1, 1, size - 2, size - 2);
  px('#8d9099', 1, 1, size - 2, 1);
  px('#8d9099', 1, 1, 1, size - 2);
  px('#3a3c42', 1, size - 2, size - 2, 1);
  px('#3a3c42', size - 2, 1, 1, size - 2);
  for (const [x, y] of [[2, 2], [size - 4, 2], [2, size - 4], [size - 4, size - 4]]) {
    px('#14141a', x, y, 2, 2);
    px('#d6d9de', x, y);
  }
  // Ecken abschneiden für eine weichere Pixel-Silhouette
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
    c.getContext('2d').clearRect(x, y, 1, 1);
  }
  return c;
}

// ---------- Baumscheibe für Skill-Knoten ----------
function sliceTexture(ring1, ring2, seed) {
  const size = 20;
  const rand = rng(seed * 31);
  const { c, px } = canvas(size, size);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const barkCols = ['#5a3518', '#4a2a12', '#6b4220'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 9.9) continue;
      let col;
      if (r > 9) col = OUTLINE;
      else if (r > 7.6) col = barkCols[Math.floor(rand() * barkCols.length)];
      else if (r > 6.8) col = '#ecd09a';
      else if (r < 1.1) col = '#5a3216';
      else {
        const ring = Math.floor(r * 0.95 + (rand() - 0.5) * 0.4);
        col = ring % 2 ? ring2 : ring1;
        // Licht von oben links
        const light = (-dx - dy) / (r * 1.4);
        if (light > 0.45) col = shade(col, 0.12);
        else if (light < -0.5) col = shade(col, -0.1);
      }
      px(col, x, y);
    }
  }
  return c;
}

// ---------- Holzschild-Knopf ----------
// state: 'normal' | 'hover' | 'active'
function buttonTexture({ w = 36, h = 28, state = 'normal', seed = 21 }) {
  const rand = rng(seed);
  const { c, ctx, px } = canvas(w, h);
  const bases = {
    normal: ['#dca15a', '#d19450'],
    hover: ['#e8b26a', '#dea55e'],
    active: ['#f0bf72', '#e6b062'],
  }[state];
  const seamY = Math.floor((h - 3) / 2);

  // Zwei Bretter
  for (let y = 1; y < h - 1; y++) px(y <= seamY ? bases[0] : bases[1], 1, y, w - 2, 1);
  for (const [b, y0, y1] of [[bases[0], 1, seamY], [bases[1], seamY + 1, h - 3]]) {
    const dk = shade(b, -0.14);
    const lt = shade(b, 0.12);
    for (let i = 0; i < (w * (y1 - y0)) / 10; i++) {
      const sx = 2 + Math.floor(rand() * (w - 6));
      const sy = y0 + 1 + Math.floor(rand() * Math.max(1, y1 - y0 - 1));
      const len = 2 + Math.floor(rand() * 6);
      px(rand() < 0.7 ? dk : lt, sx, sy, Math.min(len, w - 2 - sx), 1);
    }
  }
  px(shade(bases[0], -0.55), 1, seamY, w - 2, 1); // Fuge
  px(shade(bases[1], 0.2), 1, seamY + 1, w - 2, 1);

  // Fase: Licht oben/links, Schatten unten/rechts, dicke Unterkante für Tiefe
  px(shade(bases[0], 0.32), 1, 1, w - 2, 1);
  px(shade(bases[0], 0.22), 1, 1, 1, h - 3);
  px(shade(bases[1], -0.3), w - 2, 2, 1, h - 4);
  px(shade(bases[1], -0.35), 1, h - 3, w - 2, 1);
  px(shade(bases[1], -0.55), 1, h - 2, w - 2, 1);

  // Rahmen
  const frame = state === 'active' ? '#f6d25a' : null;
  px(OUTLINE, 1, 0, w - 2, 1);
  px(OUTLINE, 1, h - 1, w - 2, 1);
  px(OUTLINE, 0, 1, 1, h - 2);
  px(OUTLINE, w - 1, 1, 1, h - 2);
  if (frame) {
    px(frame, 1, 1, w - 2, 1);
    px(frame, 1, 1, 1, h - 3);
    px(frame, w - 2, 1, 1, h - 3);
    px('#b8901f', 1, h - 3, w - 2, 1);
  }
  // Nägel in den Ecken
  for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 6], [w - 5, h - 6]]) {
    px('#2d2a28', x, y, 2, 2);
    px('#c9c4ba', x, y);
    px('#14100e', x + 1, y + 1);
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.clearRect(w - 1, 0, 1, 1);
  ctx.clearRect(0, h - 1, 1, 1);
  ctx.clearRect(w - 1, h - 1, 1, 1);
  return c;
}

// ---------- Pixel-Edelstein (Medaillon) ----------
function gemTexture(hex, size = 12) {
  const { c, px } = canvas(size, size);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const R = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > R - 0.1) continue;
      if (r > R - 1.2) {
        px(OUTLINE, x, y);
        continue;
      }
      const light = (-dx - dy) / (R * 1.3);
      let col = hex;
      if (light > 0.45) col = shade(hex, 0.35);
      else if (light > 0.1) col = shade(hex, 0.12);
      else if (light < -0.45) col = shade(hex, -0.35);
      else if (light < -0.1) col = shade(hex, -0.15);
      px(col, x, y);
    }
  }
  px('#ffffff', Math.round(cx - R * 0.45), Math.round(cy - R * 0.45));
  return c;
}

const gemCache = new Map();
export function gemUrl(hex) {
  if (!gemCache.has(hex)) gemCache.set(hex, `url("${gemTexture(hex).toDataURL('image/png')}")`);
  return gemCache.get(hex);
}

export const SLICE_TONES = [
  ['#e0b070', '#c08442'], // Kiefer
  ['#c98e4c', '#a0642f'], // Eiche
  ['#eed4a2', '#cfaa6e'], // Birke
  ['#c07a50', '#985634'], // Kirsche
  ['#ad6d3d', '#844c28'], // Walnuss
];

export function installWoodTextures() {
  const root = document.documentElement.style;
  const set = (name, cnv) => {
    root.setProperty(name, `url("${cnv.toDataURL('image/png')}")`);
    root.setProperty(name + '-w', cnv.width * PIXEL + 'px');
    root.setProperty(name + '-h', cnv.height * PIXEL + 'px');
  };
  root.setProperty('--px', PIXEL + 'px');

  // Planken in verschiedenen Holzarten
  set('--tex-oak', plankTexture({ colors: ['#9a5a28', '#a6642e', '#90521f'], seed: 2 }));
  set('--tex-pine', plankTexture({ colors: ['#cf9450', '#c58944', '#d79e5c'], seed: 5 }));
  set('--tex-walnut', plankTexture({ colors: ['#55301a', '#5f3720', '#4c2a16'], seed: 8, heights: [8, 7, 9, 8], knots: 0.15 }));
  set('--tex-tree', plankTexture({ colors: ['#7c4620', '#73401c', '#854d24'], seed: 4, heights: [13, 11, 14, 12], nails: true }));
  set('--tex-tab', plankTexture({ colors: ['#d9a35f', '#cf9853'], seed: 9, heights: [7, 6, 7], w: 80, knots: 0 }));

  // Balken
  set('--tex-beam-h', beamTexture({ thick: 8, len: 64, seed: 3 }));
  set('--tex-beam-v', beamTexture({ thick: 8, len: 64, seed: 6, vertical: true }));
  set('--tex-beam-head', beamTexture({ thick: 14, len: 96, seed: 7, base: '#7a4420', bolts: false }));
  set('--tex-plate', plateTexture(12));

  // Knöpfe (groß für die Fenster-Tabs, flacher für die Skill-Tree-Tabs)
  for (const state of ['normal', 'hover', 'active']) {
    set(`--tex-btn-${state}`, buttonTexture({ state }));
    set(`--tex-btn-s-${state}`, buttonTexture({ state, h: 23, seed: 34 }));
  }

  SLICE_TONES.forEach(([a, b], i) => set(`--tex-slice-${i}`, sliceTexture(a, b, i + 1)));
}
