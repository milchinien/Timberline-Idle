// Alle Pixel-Art-Texturen der 3D-Szene werden zur Laufzeit per Canvas erzeugt (keine Bilddateien).
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function px(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Pixelpuffer: erst sammeln, dann auf ein Canvas schreiben
function pixelBuffer(W, H) {
  const col = new Array(W * H).fill(null);
  const kind = new Array(W * H).fill(null);
  return {
    W, H, col, kind,
    get: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : col[y * W + x]),
    kindAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : kind[y * W + x]),
    set(x, y, c, k = 'x') {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      col[y * W + x] = c;
      kind[y * W + x] = k;
    },
    toCanvas() {
      const [c, ctx] = makeCanvas(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (col[y * W + x]) px(ctx, col[y * W + x], x, y);
      return c;
    },
  };
}

// Außenkontur um alle gefüllten Pixel (outlineFor bestimmt die Farbe je Pixelart)
function addOutline(buf, outlineFor) {
  const add = [];
  for (let y = 0; y < buf.H; y++) {
    for (let x = 0; x < buf.W; x++) {
      if (buf.get(x, y)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const k = buf.kindAt(x + dx, y + dy);
        if (k) {
          add.push([x, y, outlineFor(k)]);
          break;
        }
      }
    }
  }
  for (const [x, y, c] of add) buf.set(x, y, c, 'outline');
}

// ---------- Blätterbüschel ----------
export const LEAF_PALETTES = [
  { outline: '#173a1c', dark: '#24592b', mid: '#347a34', light: '#4f9e3f', hi: '#79c457', top: '#a6e070' },
  { outline: '#1d3a15', dark: '#2f6127', mid: '#468a2f', light: '#67ad3d', hi: '#93cc55', top: '#c4e67e' },
  { outline: '#12301f', dark: '#1e4d30', mid: '#2c6c3e', light: '#3f8a4d', hi: '#5fab60', top: '#8acb7a' },
];
const BARK = { outline: '#2a1508', dark: '#4e2c12', mid: '#6e4220', light: '#8f5c2e', hi: '#a8743c' };
// Birke: weiße Rinde mit schwarzen Strichen (dark = Striche), Kiefer: rötliche Rinde
const BIRCH_BARK = { outline: '#2a2620', dark: '#2f2a24', mid: '#d8d0c0', light: '#ece6d8', hi: '#ffffff' };
const PINE_BARK = { outline: '#2a1205', dark: '#4e220e', mid: '#7a3a1c', light: '#9a4f2a', hi: '#b8643a' };
const BIRCH_LEAVES = [
  { outline: '#2a3a12', dark: '#5a7a22', mid: '#7fa832', light: '#a8cf52', hi: '#c8e270', top: '#e6f49a' },
  { outline: '#3a3010', dark: '#7a7a1e', mid: '#a0a02c', light: '#c4c04a', hi: '#dcd868', top: '#f2ee9a' },
];
const PINE_LEAVES = [
  { outline: '#0c2416', dark: '#14402a', mid: '#1f5a38', light: '#2e7a48', hi: '#45995c', top: '#6abf7a' },
  { outline: '#0c2020', dark: '#163a3a', mid: '#215454', light: '#2e7068', hi: '#448c80', top: '#62ad9c' },
];
const barkFor = (style) => (style === 'birch' ? BIRCH_BARK : style === 'pine' ? PINE_BARK : BARK);

// Malt mehrere Büschel (hinten zuerst). Jedes Büschel ist einzeln schattiert, dunkle Fugen trennen sie.
function paintClusters(buf, clusters, pal, rand) {
  const order = new Array(buf.W * buf.H).fill(-1);
  clusters.sort((a, b) => a[1] - b[1]);
  clusters.forEach(([cx, cy, r], idx) => {
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = Math.atan2(dy, dx);
        const rr = r * (1 + 0.11 * Math.sin(a * 5 + p1) + 0.06 * Math.sin(a * 9 + p2));
        if (d > rr) continue;
        let v = (-dx * 0.45 - dy * 0.9) / rr;
        v += (x + y) % 2 ? 0.05 : -0.05; // Dithering an Bandgrenzen
        if (rand() < 0.1) v += rand() < 0.5 ? 0.25 : -0.25; // Blatt-Sprenkel
        const c = v > 0.62 ? pal.top : v > 0.35 ? pal.hi : v > 0.05 ? pal.light : v > -0.38 ? pal.mid : pal.dark;
        buf.set(x, y, c, 'leaf');
        if (x >= 0 && y >= 0 && x < buf.W && y < buf.H) order[y * buf.W + x] = idx;
      }
    }
  });
  // Schatten der vorderen Büschel auf den hinteren
  const shadow = [];
  for (let y = 0; y < buf.H; y++) {
    for (let x = 0; x < buf.W; x++) {
      const o = order[y * buf.W + x];
      if (o < 0) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= buf.W || ny >= buf.H) continue;
        if (order[ny * buf.W + nx] > o) {
          shadow.push([x, y]);
          break;
        }
      }
    }
  }
  for (const [x, y] of shadow) buf.set(x, y, buf.get(x, y) === pal.dark ? pal.outline : pal.dark, 'leaf');
}

function paintTrunk(buf, cx, top, bottom, w, rand, BARK = barkFor('oak')) {
  for (let y = top; y <= bottom; y++) {
    const flare = y > bottom - 4 ? (y - (bottom - 4)) * 0.7 : 0;
    const hw = w / 2 + flare;
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw) - 1;
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      let c = u < 0.18 ? BARK.hi : u < 0.4 ? BARK.light : u < 0.75 ? BARK.mid : BARK.dark;
      if (rand() < 0.16) c = BARK.dark;
      buf.set(x, y, c, 'bark');
    }
  }
  // Rindenfurchen
  for (let i = 0; i < w; i++) {
    const x = Math.round(cx - w / 2 + 1 + rand() * (w - 2));
    const y0 = top + Math.floor(rand() * (bottom - top - 4));
    for (let k = 0; k < 3 + rand() * 4; k++) buf.set(x, y0 + k, BARK.dark, 'bark');
  }
}

function paintBranch(buf, x0, y0, x1, y1, BARK = barkFor('oak')) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    buf.set(x, y, BARK.mid, 'bark');
    buf.set(x, y + 1, BARK.dark, 'bark');
  }
}

export const TREE_W = 48;
export const TREE_H = 64;

// stage: mature | young | sapling | stump; variant: 0..2 (Blattfarbe, Form, Äpfel)
// Nadelbaum-Krone: übereinander gestapelte Dreiecke (unten breit, oben schmal), links hell, rechts dunkel
function paintPineTiers(buf, tiers, pal, rand) {
  for (const [baseY, halfW, h] of tiers) {
    for (let y = Math.floor(baseY - h); y <= baseY; y++) {
      const t = (y - (baseY - h)) / h;
      const hw = Math.max(0.6, halfW * t);
      for (let x = Math.floor(24 - hw); x <= Math.ceil(24 + hw); x++) {
        const dx = (x + 0.5 - 24) / Math.max(1, hw);
        if (Math.abs(dx) > 1) continue;
        let v = -dx * 0.8 + (1 - t) * 0.6 + (rand() - 0.5) * 0.35;
        if (y >= baseY - 1) v -= 0.6; // dunkle Unterkante jeder Etage
        const c = v > 0.75 ? pal.top : v > 0.35 ? pal.hi : v > -0.05 ? pal.light : v > -0.5 ? pal.mid : pal.dark;
        buf.set(x, y, c, 'leaf');
      }
    }
  }
}

export function treeCanvas(stage, variant = 0, style = 'oak') {
  const buf = pixelBuffer(TREE_W, TREE_H);
  const rand = rng(100 + variant * 7919 + stage.length * 31 + style.length * 977);
  const bark = barkFor(style);
  const cx = 24;
  const j = () => (rand() - 0.5) * 3;

  if (style === 'pine' && stage !== 'stump') {
    const pal = PINE_LEAVES[variant % PINE_LEAVES.length];
    if (stage === 'mature') {
      paintTrunk(buf, cx, 46, 62, 5, rand, bark);
      paintPineTiers(buf, [[52, 15, 12], [43, 13, 11], [34, 11, 10], [25, 9, 9], [16, 6, 8], [9, 3.5, 6]], pal, rand);
    } else if (stage === 'young') {
      paintTrunk(buf, cx, 52, 62, 3, rand, bark);
      paintPineTiers(buf, [[55, 9, 8], [48, 7, 7], [41, 5, 6], [35, 3, 5]], pal, rand);
    } else {
      for (let y = 56; y <= 62; y++) buf.set(cx, y, bark.light, 'bark');
      paintPineTiers(buf, [[57, 4.5, 5], [52, 3, 4], [48, 1.5, 3]], pal, rand);
    }
    addOutline(buf, (k) => (k === 'leaf' ? pal.outline : bark.outline));
    return buf.toCanvas();
  }

  if (style === 'birch' && stage !== 'stump') {
    const pal = BIRCH_LEAVES[variant % BIRCH_LEAVES.length];
    if (stage === 'mature') {
      paintTrunk(buf, cx, 26, 62, 5, rand, bark);
      paintBranch(buf, cx - 1, 34, cx - 8, 26, bark);
      paintBranch(buf, cx + 1, 30, cx + 8, 22, bark);
      paintClusters(buf, [
        [24 + j(), 17 + j(), 9], [15 + j(), 24 + j(), 7], [33 + j(), 23 + j(), 7],
        [19 + j(), 11 + j(), 6], [29 + j(), 10 + j(), 6], [24, 28 + j(), 5.5], [24, 6.5, 4.5],
      ], pal, rand);
    } else if (stage === 'young') {
      paintTrunk(buf, cx, 40, 62, 3, rand, bark);
      paintClusters(buf, [[24 + j(), 34, 6.5], [18, 39, 4.5], [30, 38, 4.5], [24, 28, 4.5]], pal, rand);
    } else {
      for (let y = 50; y <= 62; y++) {
        buf.set(cx, y, bark.light, 'bark');
        buf.set(cx + 1, y, bark.mid, 'bark');
      }
      paintClusters(buf, [[20, 52, 3], [29, 50, 3], [24.5, 46.5, 3]], pal, rand);
    }
    addOutline(buf, (k) => (k === 'leaf' ? pal.outline : bark.outline));
    return buf.toCanvas();
  }

  const pal = LEAF_PALETTES[variant % LEAF_PALETTES.length];
  if (stage === 'mature') {
    paintTrunk(buf, cx, 32, 62, 7, rand);
    paintBranch(buf, cx - 1, 40, cx - 10, 29);
    paintBranch(buf, cx + 1, 38, cx + 11, 27);
    const clusters = [
      [24 + j(), 21 + j(), 12.5],
      [13.5 + j(), 27 + j(), 8.5],
      [34.5 + j(), 27 + j(), 8.5],
      [17 + j(), 14.5 + j(), 8.5],
      [31 + j(), 13.5 + j(), 8.5],
      [24 + j(), 9.5, 6],
      [19 + j(), 33 + j(), 7],
      [30 + j(), 34 + j(), 6.5],
    ];
    if (variant === 2) clusters.push([9, 20, 5.5], [39, 19, 5.5]);
    paintClusters(buf, clusters, pal, rand);
    if (variant === 1) {
      // Äpfel
      for (let i = 0; i < 6; i++) {
        const ax = 10 + Math.floor(rand() * 28);
        const ay = 10 + Math.floor(rand() * 24);
        if (buf.kindAt(ax, ay) !== 'leaf' || buf.kindAt(ax + 1, ay + 1) !== 'leaf') continue;
        buf.set(ax, ay, '#d8402e', 'leaf');
        buf.set(ax + 1, ay, '#d8402e', 'leaf');
        buf.set(ax, ay + 1, '#a8261a', 'leaf');
        buf.set(ax + 1, ay + 1, '#a8261a', 'leaf');
        buf.set(ax, ay, '#ff9a7a', 'leaf');
      }
    }
  } else if (stage === 'young') {
    paintTrunk(buf, cx, 44, 62, 4, rand);
    paintBranch(buf, cx, 48, cx - 6, 42);
    paintClusters(buf, [
      [24 + j(), 36, 8],
      [17, 42 + j(), 5.5],
      [31, 42 + j(), 5.5],
      [24, 30, 5.5],
    ], pal, rand);
  } else if (stage === 'sapling') {
    for (let y = 50; y <= 62; y++) {
      buf.set(cx, y, BARK.light, 'bark');
      buf.set(cx + 1, y, BARK.dark, 'bark');
    }
    paintClusters(buf, [[20, 52, 3.5], [29, 50, 3.5], [24.5, 46.5, 3.5]], pal, rand);
  } else {
    // Stumpf mit Jahresringen oben (Rinde je nach Art)
    paintTrunk(buf, cx, 54, 62, 10, rand, bark);
    for (let y = 51; y <= 55; y++) {
      for (let x = 18; x <= 29; x++) {
        const dx = (x + 0.5 - 24) / 6;
        const dy = (y + 0.5 - 53.2) / 2.4;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        const ring = Math.floor(d * 4);
        buf.set(x, y, d > 0.85 ? bark.light : ring % 2 ? '#c4924f' : '#e2b878', 'bark');
      }
    }
    buf.set(24, 53, '#8a5a2b', 'bark');
  }

  addOutline(buf, (k) => (k === 'leaf' ? pal.outline : bark.outline));
  return buf.toCanvas();
}

// Weiße Silhouette (für den Treffer-Blitz)
export function silhouetteCanvas(src) {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function canvasTexture(c) {
  return toTexture(c);
}

// ---------- Deko ----------
export function bushCanvas(variant = 0) {
  const buf = pixelBuffer(22, 16);
  const rand = rng(500 + variant * 13);
  const pal = LEAF_PALETTES[variant % LEAF_PALETTES.length];
  paintClusters(buf, [[11, 9, 6.5], [6, 11, 4.5], [16, 11, 4.5]], pal, rand);
  if (variant === 0) {
    for (const [x, y] of [[8, 8], [13, 6], [15, 10], [6, 11]]) {
      if (buf.kindAt(x, y) === 'leaf') buf.set(x, y, '#e84a7a', 'leaf');
    }
  }
  addOutline(buf, () => pal.outline);
  return buf.toCanvas();
}

export function rockCanvas(variant = 0) {
  const buf = pixelBuffer(14, 10);
  const rand = rng(900 + variant * 17);
  const rx = variant ? 5 : 6;
  const ry = variant ? 3.5 : 4;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 14; x++) {
      const dx = (x + 0.5 - 7) / rx;
      const dy = (y + 0.5 - 6) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const v = -dx * 0.5 - dy * 0.9 + (rand() - 0.5) * 0.3;
      buf.set(x, y, v > 0.5 ? '#c8c6bc' : v > 0 ? '#a19f96' : v > -0.6 ? '#82807a' : '#66645f', 'rock');
    }
  }
  addOutline(buf, () => '#34322e');
  return buf.toCanvas();
}

export function tuftCanvas(variant = 0) {
  const [c, ctx] = makeCanvas(9, 7);
  const greens = [['#3f8a2c', '#6cbf48'], ['#4a9632', '#8fd45e'], ['#2f7426', '#5aa83c']][variant % 3];
  const blades = [[1, 3], [3, 1], [4, 0], [5, 2], [7, 3]];
  blades.forEach(([x, top], i) => {
    for (let y = top; y < 7; y++) px(ctx, y < top + 2 ? greens[1] : greens[0], x, y);
    if (i % 2) px(ctx, greens[0], x + 1, 5, 1, 2);
  });
  return c;
}

export function flowerCanvas(color) {
  const [c, ctx] = makeCanvas(7, 8);
  px(ctx, '#3f8a2c', 3, 4, 1, 4);
  px(ctx, '#5aa83c', 4, 5);
  px(ctx, color, 2, 1, 3, 3);
  px(ctx, color, 3, 0);
  px(ctx, color, 1, 2);
  px(ctx, color, 5, 2);
  px(ctx, '#f6e05a', 3, 2);
  return c;
}

export function mushroomCanvas() {
  const [c, ctx] = makeCanvas(8, 7);
  px(ctx, '#3a1508', 1, 0, 6, 1);
  px(ctx, '#3a1508', 0, 1, 8, 3);
  px(ctx, '#d8402e', 1, 1, 6, 2);
  px(ctx, '#a8261a', 1, 3, 6, 1);
  px(ctx, '#ffffff', 2, 1);
  px(ctx, '#ffffff', 5, 2);
  px(ctx, '#3a1508', 2, 4, 4, 3);
  px(ctx, '#efe0c0', 3, 4, 2, 3);
  return c;
}

// ---------- Wiese ----------
// Gemähter Rasen im Schachbrettmuster, 16 px pro Kachel, mit Kante und dezenten Plot-Linien.
// tilesW x tilesH Felder ab Feld (minI, minJ). Jede Kachel hat ihr eigenes Zufallsmuster (aus ihrer Position),
// damit sich der Rasen nicht verändert, wenn das Land wächst.
export function meadowTexture(tilesW, tilesH, plotSize, minI = 0, minJ = 0) {
  const w = tilesW * 16;
  const h = tilesH * 16;
  const [c, ctx] = makeCanvas(w, h);
  const tones = [
    ['#62b243', '#5aaa3d', '#68b848'],
    ['#58a53b', '#519d36', '#5eab40'],
  ];
  const flowers = ['#f4e04d', '#ffffff', '#f08fb0', '#9ad0ff'];
  for (let ty = 0; ty < tilesH; ty++) {
    for (let tx = 0; tx < tilesW; tx++) {
      const i = tx + minI;
      const j = ty + minJ;
      const rand = rng(1234 + (i + 64) * 7919 + (j + 64) * 104729);
      const pal = tones[(((i + j) % 2) + 2) % 2];
      const ox = tx * 16;
      const oy = ty * 16;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) px(ctx, pal[Math.floor(rand() * pal.length)], ox + x, oy + y);
      }
      // Grashalme
      for (let k = 0; k < 7; k++) {
        const x = ox + Math.floor(rand() * 16);
        const y = oy + Math.floor(rand() * 15);
        px(ctx, '#3f8a2c', x, y + 1);
        px(ctx, '#86cc5a', x, y);
      }
      if (rand() < 0.7) px(ctx, flowers[Math.floor(rand() * flowers.length)], ox + Math.floor(rand() * 16), oy + Math.floor(rand() * 16));
    }
  }
  // Plot-Grenzen (Land beginnt immer an einer Plot-Grenze)
  ctx.fillStyle = 'rgba(30, 80, 20, 0.28)';
  for (let k = 1; k < tilesW / plotSize; k++) {
    const p = k * plotSize * 16;
    for (let i = 0; i < h; i += 4) ctx.fillRect(p, i, 1, 2);
  }
  for (let k = 1; k < tilesH / plotSize; k++) {
    const p = k * plotSize * 16;
    for (let i = 0; i < w; i += 4) ctx.fillRect(i, p, 2, 1);
  }
  // Kante des eigenen Landes
  ctx.fillStyle = '#3c7a28';
  ctx.fillRect(0, 0, w, 1);
  ctx.fillRect(0, h - 1, w, 1);
  ctx.fillRect(0, 0, 1, h);
  ctx.fillRect(w - 1, 0, 1, h);
  ctx.fillStyle = '#7cc454';
  ctx.fillRect(1, 1, w - 2, 1);
  ctx.fillRect(1, 1, 1, h - 2);
  return toTexture(c);
}

// Wilde Wiese außerhalb des eigenen Landes (kachelbar)
export function wildGrassTexture() {
  const [c, ctx] = makeCanvas(32, 32);
  const rand = rng(77);
  const greens = ['#4a8f33', '#45882f', '#4f9637', '#428430'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) px(ctx, greens[Math.floor(rand() * greens.length)], x, y);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * 32);
    const y = Math.floor(rand() * 30);
    px(ctx, '#356f25', x, y + 1, 1, 2);
    px(ctx, '#6aaa45', x, y);
  }
  return toTexture(c, { repeat: true });
}

// ---------- Baumbeet (16x16, ein Feld): runder Erdfleck mit Steinrand – nur hier wachsen Bäume ----------
export function bedCanvas() {
  const [c, ctx] = makeCanvas(16, 16);
  const rand = rng(57);
  const earth = ['#5a3518', '#4e2e14', '#63391b', '#56321a'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, (y + 0.5 - 8) * 1.08);
      if (d > 7.6) continue;
      if (d > 6.3) {
        // Steinrand: helle und dunkle Kiesel im Wechsel, kleine Lücken
        const a = Math.atan2(y - 8, x - 8);
        const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 18);
        if (k % 6 === 5) continue;
        px(ctx, k % 2 ? '#b8ad98' : '#8f8676', x, y);
      } else {
        px(ctx, earth[Math.floor(rand() * earth.length)], x, y);
      }
    }
  }
  // Krümel und ein paar Halme am Rand
  for (let i = 0; i < 9; i++) px(ctx, '#7a4f2a', 4 + Math.floor(rand() * 8), 4 + Math.floor(rand() * 8));
  for (const [x, y] of [[4, 4], [12, 11]]) {
    px(ctx, '#67ad3d', x, y);
    px(ctx, '#93cc55', x, y - 1);
  }
  return c;
}

// ---------- Böden (16x16, ein Feld) ----------
export function soilCanvas() {
  const [c, ctx] = makeCanvas(16, 16);
  const rand = rng(31);
  const browns = ['#4a2c16', '#432713', '#52321a', '#3e2412'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(ctx, browns[Math.floor(rand() * browns.length)], x, y);
  // Furchen
  for (let y = 3; y < 16; y += 4) {
    px(ctx, '#2e1a0b', 1, y, 14, 1);
    px(ctx, '#6b4423', 1, y - 1, 14, 1);
  }
  // Krümel und kleine Keimlinge
  for (let i = 0; i < 10; i++) px(ctx, '#7a5030', 1 + Math.floor(rand() * 14), 1 + Math.floor(rand() * 14));
  for (const [x, y] of [[3, 5], [10, 9], [6, 13], [12, 4]]) {
    px(ctx, '#67ad3d', x, y);
    px(ctx, '#93cc55', x, y - 1);
  }
  // Rand
  ctx.fillStyle = '#2a1508';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  ctx.clearRect(0, 0, 1, 1);
  ctx.clearRect(15, 0, 1, 1);
  ctx.clearRect(0, 15, 1, 1);
  ctx.clearRect(15, 15, 1, 1);
  return c;
}

// Gitterlinien über der Wiese (nur im Platzier-Modus sichtbar)
export function gridOverlayTexture(tilesW, tilesH = tilesW) {
  const w = tilesW * 16;
  const h = tilesH * 16;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let k = 0; k <= tilesW; k++) {
    const p = Math.min(w - 1, k * 16);
    for (let i = 0; i < h; i += 2) ctx.fillRect(p, i, 1, 1);
  }
  for (let k = 0; k <= tilesH; k++) {
    const p = Math.min(h - 1, k * 16);
    for (let i = 0; i < w; i += 2) ctx.fillRect(i, p, 1, 1);
  }
  return toTexture(c);
}

// Rahmen um das Feld unter dem Mauszeiger (wird grün/rot eingefärbt)
export function cellFrameTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(1, 1, 14, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  // Eckwinkel
  for (const [x, y] of [[1, 1], [11, 1], [1, 11], [11, 11]]) {
    ctx.fillRect(x, y, 4, 1);
    ctx.fillRect(x, y, 1, 4);
  }
  return toTexture(c);
}

// ---------- Nebel ----------
// Abstand eines Punkts zum Rand eines Rechtecks (Halbmaße hx, hz) mit abgerundeten Ecken:
// < 0 innen, > 0 außen. Die Ecken sind "abgerundet-quadratisch" (Potenz 3).
export function roundedRectDist(x, z, hx, hz, r = 3) {
  const qx = Math.max(0, Math.abs(x) - (hx - r));
  const qz = Math.max(0, Math.abs(z) - (hz - r));
  return Math.cbrt(qx ** 3 + qz ** 3) - r;
}

// Nebel um ein rechteckiges Land: innen frei, ab fogIn (Abstand zum Rand) dichter, ab fogOut ganz dicht.
// Die Textur deckt das Land plus margin an jeder Seite ab.
export function fogRectTexture(hx, hz, margin, fogIn, fogOut, ppu = 6) {
  const w = Math.ceil((hx + margin) * 2 * ppu);
  const h = Math.ceil((hz + margin) * 2 * ppu);
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const rand = rng(99);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = (x + 0.5) / ppu - (hx + margin);
      const wz = (y + 0.5) / ppu - (hz + margin);
      const d = roundedRectDist(wx, wz, hx, hz) + (rand() - 0.5) * 0.08;
      const t = Math.min(1, Math.max(0, (d - fogIn) / (fogOut - fogIn)));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function softPuffTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function shadowTexture() {
  const [c, ctx] = makeCanvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Truhe (24x20) ----------
export function chestTexture(open) {
  const [c, ctx] = makeCanvas(24, 20);
  const dark = '#3d2008';
  const mid = '#8a5a2b';
  const light = '#b07a3c';
  const band = '#c9ccd2';
  const gold = '#f0c84a';

  px(ctx, dark, 2, 10, 20, 9);
  px(ctx, mid, 3, 11, 18, 7);
  px(ctx, light, 3, 11, 18, 1);
  px(ctx, '#6b4220', 3, 14, 18, 1);
  px(ctx, '#6b4220', 3, 17, 18, 1);
  px(ctx, band, 5, 10, 2, 9);
  px(ctx, band, 17, 10, 2, 9);
  px(ctx, '#8d9099', 6, 10, 1, 9);
  px(ctx, '#8d9099', 18, 10, 1, 9);

  if (!open) {
    px(ctx, dark, 2, 4, 20, 7);
    px(ctx, dark, 3, 3, 18, 1);
    px(ctx, light, 3, 4, 18, 6);
    px(ctx, mid, 3, 8, 18, 2);
    px(ctx, '#cf9a55', 3, 4, 18, 1);
    px(ctx, band, 5, 3, 2, 8);
    px(ctx, band, 17, 3, 2, 8);
    px(ctx, dark, 10, 8, 4, 5);
    px(ctx, gold, 11, 9, 2, 3);
    px(ctx, '#fff3b0', 11, 9);
  } else {
    px(ctx, dark, 3, 0, 18, 5);
    px(ctx, mid, 4, 1, 16, 3);
    px(ctx, light, 4, 1, 16, 1);
    px(ctx, band, 5, 0, 2, 5);
    px(ctx, band, 17, 0, 2, 5);
    px(ctx, dark, 3, 5, 18, 6);
    px(ctx, '#2a1604', 4, 6, 16, 4);
    // Holzstapel und goldener Schimmer im Inneren
    px(ctx, '#8a5a2b', 5, 7, 14, 3);
    px(ctx, '#d8aa6a', 6, 7, 2, 2);
    px(ctx, '#d8aa6a', 10, 7, 2, 2);
    px(ctx, '#d8aa6a', 14, 7, 2, 2);
    px(ctx, '#fff3b0', 8, 6, 6, 1);
    px(ctx, gold, 11, 10, 2, 2);
  }
  return toTexture(c);
}

// ---------- Holzscheit-Item (16x10) ----------
export function logCanvas() {
  const [c, ctx] = makeCanvas(16, 10);
  const o = '#2a1508';
  px(ctx, o, 1, 1, 12, 8);
  px(ctx, o, 0, 2, 1, 6);
  px(ctx, '#8f5c2e', 1, 2, 11, 6);
  px(ctx, '#a8743c', 1, 2, 11, 1);
  px(ctx, '#6e4220', 1, 6, 11, 1);
  px(ctx, '#4e2c12', 1, 7, 11, 1);
  px(ctx, '#4e2c12', 4, 4, 3, 1);
  px(ctx, '#4e2c12', 8, 3, 2, 1);
  // Schnittfläche mit Ringen
  px(ctx, o, 11, 1, 4, 1);
  px(ctx, o, 11, 8, 4, 1);
  px(ctx, o, 15, 2, 1, 6);
  px(ctx, '#e2b878', 11, 2, 4, 6);
  px(ctx, '#c4924f', 12, 3, 2, 4);
  px(ctx, '#e2b878', 12, 4, 2, 2);
  px(ctx, '#8a5a2b', 13, 4);
  return c;
}

// Goldener Scheit: gleiche Form, Brauntöne werden nach Helligkeit auf Goldtöne umgefärbt
export function goldLogCanvas() {
  const c = logCanvas();
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const gold = [[40, [74, 44, 4]], [80, [168, 118, 26]], [120, [217, 168, 42]], [170, [246, 210, 90]], [999, [255, 243, 176]]];
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    const [, rgb] = gold.find(([t]) => lum < t);
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Setzling als Item (Erdballen mit zwei Blättern)
export function saplingItemCanvas() {
  const [c, ctx] = makeCanvas(12, 12);
  const o = '#1d3a15';
  px(ctx, '#2a1508', 2, 8, 8, 4);
  px(ctx, '#2a1508', 1, 9, 10, 2);
  px(ctx, '#7a4a22', 2, 9, 8, 2);
  px(ctx, '#9a6232', 3, 9, 3, 1);
  px(ctx, o, 5, 3, 2, 6);
  px(ctx, '#4f9e3f', 5, 4, 1, 5);
  px(ctx, o, 0, 2, 5, 4);
  px(ctx, '#67ad3d', 1, 3, 3, 2);
  px(ctx, '#93cc55', 1, 3, 2, 1);
  px(ctx, o, 7, 0, 5, 4);
  px(ctx, '#67ad3d', 8, 1, 3, 2);
  px(ctx, '#93cc55', 8, 1, 2, 1);
  return c;
}

// Markierung für einen gesetzten Setzling: Erdhügel mit kleinem weißen Fähnchen (Worker pflanzt dann)
export function seedMarkerCanvas() {
  const [c, ctx] = makeCanvas(14, 12);
  px(ctx, '#2a1508', 2, 8, 10, 4);
  px(ctx, '#2a1508', 1, 9, 12, 2);
  px(ctx, '#7a4a22', 2, 9, 10, 2);
  px(ctx, '#9a6232', 3, 9, 4, 1);
  px(ctx, '#3a2010', 5, 10, 4, 1);
  // Fähnchen
  px(ctx, '#5e3a18', 10, 1, 1, 9);
  px(ctx, '#2a1508', 11, 1, 3, 4);
  px(ctx, '#ffffff', 11, 2, 2, 2);
  px(ctx, '#67ad3d', 12, 2, 1, 1);
  return c;
}

// ---------- Partikel ----------
export function squareTexture() {
  const [c, ctx] = makeCanvas(2, 2);
  px(ctx, '#ffffff', 0, 0, 2, 2);
  return toTexture(c);
}

export function sparkleTexture() {
  const [c, ctx] = makeCanvas(7, 7);
  px(ctx, '#ffffff', 3, 0, 1, 7);
  px(ctx, '#ffffff', 0, 3, 7, 1);
  px(ctx, '#ffffff', 2, 2, 3, 3);
  return toTexture(c);
}

export function butterflyTexture(open, color) {
  const [c, ctx] = makeCanvas(7, 5);
  px(ctx, '#2a1a10', 3, 1, 1, 3);
  if (open) {
    px(ctx, color, 0, 0, 3, 2);
    px(ctx, color, 4, 0, 3, 2);
    px(ctx, color, 1, 2, 2, 2);
    px(ctx, color, 4, 2, 2, 2);
  } else {
    px(ctx, color, 2, 0, 1, 3);
    px(ctx, color, 4, 0, 1, 3);
  }
  return toTexture(c);
}

// ---------- Axt (Cursor + Hieb-Animation) ----------
// Die Axt wird in einem „Stiel-Koordinatensystem“ beschrieben (u = entlang des Stiels Richtung Kopf,
// v = quer dazu, die Klinge liegt bei negativem v) und dann diagonal ins Pixelraster gerechnet.
// Ergebnis: Kopf oben links, Schneide zeigt nach links unten, Griff unten rechts.
const AXE_N = 26;
const AXE_C = [14, 12]; // Pixelposition des Ursprungs (u = 0, v = 0)
const AXE_U = [-Math.SQRT1_2, -Math.SQRT1_2];
const AXE_V = [Math.SQRT1_2, -Math.SQRT1_2];
const axePoint = (u, v) => [AXE_C[0] + u * AXE_U[0] + v * AXE_V[0], AXE_C[1] + u * AXE_U[1] + v * AXE_V[1]];

const AXE_COL = {
  edge: '#f6fafd', light: '#c9d1db', mid: '#929ba7', dark: '#626b77', deep: '#454c56',
  rivet: '#e8b850', rivetDark: '#9a6a20',
  woodLight: '#d6a062', wood: '#a66c32', woodDark: '#6e4522',
  grip: '#a8321f', gripDark: '#6b1c12', pommel: '#4a2a12',
  outline: '#1a1210',
};

let axeCache = null;

// Liefert { canvas, edge: [x, y], grip: [x, y] } in Art-Pixeln
export function axeArt() {
  if (axeCache) return axeCache;
  const buf = pixelBuffer(AXE_N, AXE_N);
  const edgeV = (u) => -7.5 + ((u - 5.5) ** 2) / 14; // gebogene Schneide
  for (let y = 0; y < AXE_N; y++) {
    for (let x = 0; x < AXE_N; x++) {
      const dx = x + 0.5 - AXE_C[0];
      const dy = y + 0.5 - AXE_C[1];
      const u = dx * AXE_U[0] + dy * AXE_U[1];
      const v = dx * AXE_V[0] + dy * AXE_V[1];
      const flare = Math.max(0, -v);
      const top = 8.5 + flare * 0.35;
      const bottom = 2.5 - flare * 0.45;
      const inBlade = v <= 1.5 && u >= bottom && u <= top && v >= edgeV(u);
      const inPoll = v > 1.5 && v <= 3.6 && u >= 3.6 && u <= 7.4;
      const inHandle = Math.abs(v) <= 1.25 && u >= -11.5 && u <= 8;
      const inPommel = u >= -12.6 && u < -11.5 && Math.abs(v) <= 1.7;
      let c = null;
      if (inBlade || inPoll) {
        const fromEdge = v - edgeV(u);
        if (inPoll) c = u > 6.6 ? AXE_COL.mid : AXE_COL.deep;
        else if (fromEdge < 1.1) c = AXE_COL.edge; // geschliffene Schneide
        else if (fromEdge < 2.3) c = AXE_COL.light;
        else if (top - u < 1) c = AXE_COL.light; // Lichtkante oben
        else if (u - bottom < 1) c = AXE_COL.deep; // Schattenkante unten
        else c = v > -1.6 ? AXE_COL.dark : AXE_COL.mid;
        if (Math.abs(u - 5.5) < 0.8 && Math.abs(v - 0.1) < 0.8) c = AXE_COL.rivet; // Niete am Stielauge
        else if (Math.abs(u - 4.8) < 0.6 && Math.abs(v - 0.7) < 0.6) c = AXE_COL.rivetDark;
      } else if (inPommel) {
        c = AXE_COL.pommel;
      } else if (inHandle) {
        if (u < -6.8) {
          // Ledergriff mit Wicklung
          c = Math.floor((u + 12) / 1.5) % 2 ? AXE_COL.grip : AXE_COL.gripDark;
          if (v < -0.5 && c === AXE_COL.grip) c = '#d0503a';
        } else {
          c = v < -0.45 ? AXE_COL.woodLight : v > 0.45 ? AXE_COL.woodDark : AXE_COL.wood;
          if (Math.abs(v) <= 0.45 && Math.floor(u * 1.7) % 5 === 0) c = AXE_COL.woodDark; // Maserung
        }
      }
      if (c) buf.set(x, y, c, 'axe');
    }
  }
  addOutline(buf, () => AXE_COL.outline);
  axeCache = { canvas: buf.toCanvas(), edge: axePoint(5.5, -7.5), grip: axePoint(-11, 0) };
  return axeCache;
}

// Axt-Bild in größerer Pixelgröße
export function axeCanvas(scale = 1) {
  const src = axeArt().canvas;
  const [c, ctx] = makeCanvas(src.width * scale, src.height * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Wischspur des Hiebs: Bogen um den Griff vom Ausholwinkel bis zum Einschlag (heller zum Ende hin)
export function swooshCanvas(scale, sweepDeg) {
  const { edge, grip } = axeArt();
  const R = Math.hypot(edge[0] - grip[0], edge[1] - grip[1]);
  const a0 = Math.atan2(edge[1] - grip[1], edge[0] - grip[0]);
  const size = Math.ceil((R + 3) * 2);
  const [c, ctx] = makeCanvas(size * scale, size * scale);
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cx;
      const r = Math.hypot(dx, dy);
      if (r < R - 3.2 || r > R + 0.6) continue;
      let a = Math.atan2(dy, dx) - a0;
      while (a < 0) a += Math.PI * 2;
      const t = a / ((sweepDeg * Math.PI) / 180); // 0 = Einschlag, 1 = ausgeholt
      if (t > 1) continue;
      const alpha = (1 - t) * (r > R - 1.2 ? 0.9 : 0.45);
      if (alpha < 0.08) continue;
      ctx.fillStyle = `rgba(255, 250, 230, ${alpha.toFixed(2)})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return { canvas: c, size: size * scale };
}
