// Pixel-Grafiken für Items (je Holzart) und Gebäude. Liefert Canvas-Objekte (für Welt-Texturen und UI-Icons).
import { ITEM_DEFS } from './state.js';
import { goldLogCanvas } from './textures.js';
import { iconCanvas } from './icons.js';

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

// ---------- Stämme ----------
const LOG_COLORS = {
  oak: { o: '#2a1508', bark: '#8f5c2e', hi: '#a8743c', lo: '#6e4220', dark: '#4e2c12', end: '#e2b878', ring: '#c4924f', core: '#8a5a2b' },
  birch: { o: '#2a2620', bark: '#ece6d8', hi: '#ffffff', lo: '#cfc6b4', dark: '#2f2a24', end: '#f2dfae', ring: '#d9bf86', core: '#b89a5e' },
  pine: { o: '#2a1205', bark: '#9a4f2a', hi: '#b8643a', lo: '#7a3a1c', dark: '#4e220e', end: '#efc27a', ring: '#d39a50', core: '#a86a30' },
};

export function logArt(species = 'oak') {
  const k = LOG_COLORS[species] ?? LOG_COLORS.oak;
  const { c, px } = canvas(16, 10);
  px(k.o, 1, 1, 12, 8);
  px(k.o, 0, 2, 1, 6);
  px(k.bark, 1, 2, 11, 6);
  px(k.hi, 1, 2, 11, 1);
  px(k.lo, 1, 6, 11, 1);
  px(k.dark, 1, 7, 11, 1);
  if (species === 'birch') {
    // typische dunkle Birken-Striche
    for (const [x, y, w] of [[2, 3, 2], [6, 5, 3], [9, 3, 1], [4, 6, 1]]) px(k.dark, x, y, w, 1);
  } else {
    px(k.dark, 4, 4, 3, 1);
    px(k.dark, 8, 3, 2, 1);
  }
  // Schnittfläche mit Ringen
  px(k.o, 11, 1, 4, 1);
  px(k.o, 11, 8, 4, 1);
  px(k.o, 15, 2, 1, 6);
  px(k.end, 11, 2, 4, 6);
  px(k.ring, 12, 3, 2, 4);
  px(k.end, 12, 4, 2, 2);
  px(k.core, 13, 4);
  return c;
}

// ---------- Bretter ----------
const PLANK_COLORS = {
  oak: ['#c8944f', '#a8743c', '#e2b878'],
  birch: ['#ead9b0', '#cdb98a', '#fbf0d0'],
  pine: ['#d99a5a', '#b8763a', '#f2c27e'],
};

export function plankArt(species = 'oak') {
  const [base, dark, light] = PLANK_COLORS[species] ?? PLANK_COLORS.oak;
  const o = '#2a1508';
  const { c, px } = canvas(16, 10);
  // zwei gestapelte Bretter, leicht versetzt
  px(o, 0, 1, 14, 5);
  px(base, 1, 2, 12, 3);
  px(light, 1, 2, 12, 1);
  px(dark, 4, 3, 4, 1);
  px(o, 2, 5, 14, 5);
  px(base, 3, 6, 12, 3);
  px(light, 3, 6, 12, 1);
  px(dark, 9, 7, 4, 1);
  px(dark, 5, 8, 2, 1);
  return c;
}

// ---------- Setzlinge ----------
const SAPLING_LEAVES = {
  oak: ['#1d3a15', '#67ad3d', '#93cc55'],
  birch: ['#2a3a12', '#a8cf52', '#d6ec8a'],
  pine: ['#10301c', '#2e7a44', '#4fa060'],
};

export function saplingArt(species = 'oak') {
  const [o, mid, light] = SAPLING_LEAVES[species] ?? SAPLING_LEAVES.oak;
  const { c, px } = canvas(12, 12);
  px('#2a1508', 2, 8, 8, 4);
  px('#2a1508', 1, 9, 10, 2);
  px('#7a4a22', 2, 9, 8, 2);
  px('#9a6232', 3, 9, 3, 1);
  if (species === 'pine') {
    // kleiner Nadelbaum-Kegel
    px(o, 5, 0, 2, 1);
    px(o, 4, 1, 4, 2);
    px(o, 3, 3, 6, 2);
    px(o, 2, 5, 8, 3);
    px(mid, 5, 1, 2, 2);
    px(mid, 4, 3, 4, 2);
    px(mid, 3, 5, 6, 2);
    px(light, 4, 3, 1, 1);
    px(light, 3, 5, 1, 1);
    return c;
  }
  px(o, 5, 3, 2, 6);
  px(species === 'birch' ? '#e8e2d2' : '#4f9e3f', 5, 4, 1, 5);
  px(o, 0, 2, 5, 4);
  px(mid, 1, 3, 3, 2);
  px(light, 1, 3, 2, 1);
  px(o, 7, 0, 5, 4);
  px(mid, 8, 1, 3, 2);
  px(light, 8, 1, 2, 1);
  return c;
}

// Canvas für jeden Item-Key (Welt und UI)
const cache = new Map();
export function itemCanvas(key) {
  if (cache.has(key)) return cache.get(key);
  const def = ITEM_DEFS[key];
  let c;
  if (key === 'goldwood') c = goldLogCanvas();
  else if (def?.type === 'plank') c = plankArt(def.species);
  else if (def?.type === 'sapling') c = saplingArt(def.species);
  else c = logArt(def?.species);
  cache.set(key, c);
  return c;
}
const itemSymbol = (key) => ITEM_DEFS[key]?.type === 'sapling' ? 'sapling' : ITEM_DEFS[key]?.type === 'plank' ? 'planks' : 'log';
const iconCache = new Map();
function itemUiArt(key) {
  if (iconCache.has(key)) return iconCache.get(key);
  const canvas = iconCanvas(itemSymbol(key), 64);
  const ctx = canvas.getContext('2d');
  // Small generated species badges keep different inventory items distinguishable.
  const species = ITEM_DEFS[key]?.species;
  const badge = key === 'goldwood' ? 'coin' : species === 'birch' ? 'leaves' : species === 'pine' ? 'pine' : null;
  if (badge) {
    if (key === 'goldwood') {
      ctx.clearRect(0, 0, 64, 64);
      ctx.filter = 'sepia(1) saturate(2.4) brightness(1.35)';
      ctx.drawImage(iconCanvas('log', 64), 0, 0);
      ctx.filter = 'none';
    }
    ctx.drawImage(iconCanvas(badge, 28), 36, 36);
  }
  iconCache.set(key, canvas);
  return canvas;
}
const urlCache = new Map();
export function itemIconUrl(key) {
  if (!urlCache.has(key)) urlCache.set(key, itemUiArt(key).toDataURL());
  return urlCache.get(key);
}
const uiCache = new Map();
export function itemUiCanvas(key) {
  if (!uiCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    c.getContext('2d').drawImage(itemUiArt(key), 0, 0, 24, 24);
    uiCache.set(key, c);
  }
  return uiCache.get(key);
}

// ---------- Sägewerk (52x48), frame 0/1 = Sägeblatt gedreht ----------
export function sawmillArt(frame = 0, working = false) {
  const { c, ctx, px } = canvas(52, 48);
  const o = '#2a1508';
  // Rückwand aus senkrechten Brettern
  px(o, 5, 15, 42, 29);
  for (let x = 6; x < 46; x += 4) {
    px(x % 8 === 6 ? '#8f5c2e' : '#9e6834', x, 16, 4, 27);
    px('#6e4220', x + 3, 16, 1, 27);
  }
  px('#b07a42', 6, 16, 40, 1);
  // Dach mit Schindeln
  for (let y = 4; y < 17; y++) {
    const inset = Math.max(0, 16 - y) * 0.9;
    const x0 = Math.round(2 + inset);
    const x1 = Math.round(50 - inset);
    px(o, x0, y, x1 - x0, 1);
    if (y > 4 && y < 16) px(y % 3 === 0 ? '#7a2e1c' : '#9a3e26', x0 + 1, y, x1 - x0 - 2, 1);
  }
  px('#c4583a', 12, 6, 28, 1);
  // offene Front
  px(o, 13, 22, 26, 22);
  px('#2a1a10', 14, 23, 24, 20);
  // Sägeblatt mit Zähnen (dreht sich in zwei Frames)
  const cx = 26;
  const cy = 34;
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const r = Math.hypot(x, y);
      if (r > 7.2) continue;
      const a = Math.atan2(y, x) + frame * (Math.PI / 8);
      const tooth = r > 5.8 && Math.floor((a / (Math.PI * 2)) * 16 + 16) % 2 === 0;
      if (r > 5.8 && !tooth) continue;
      px(r < 1.6 ? '#4a4d54' : r < 4 ? '#c9cfd8' : '#9aa1ab', cx + x, cy + y);
    }
  }
  px('#ffffff', cx - 3, cy - 4, 2, 1);
  // Werkbank
  px(o, 13, 39, 26, 5);
  px('#b07a42', 14, 40, 24, 3);
  px('#d6a062', 14, 40, 24, 1);
  if (working) {
    // Sägespäne
    for (let i = 0; i < 6; i++) px('#f2dca0', 30 + ((i * 7 + frame * 3) % 9), 30 + ((i * 5 + frame * 2) % 8));
  }
  return c;
}

// ---------- Bewässerung ----------
// Kopf der Anlage als Sprite (16x20)
export function irrigationArt(type) {
  const { c, px } = canvas(16, 20);
  const o = '#1e1a16';
  if (type === 'spout') {
    // Holzfass mit Auslauf
    px(o, 3, 6, 10, 13);
    px('#8f5c2e', 4, 7, 8, 11);
    px('#a8743c', 4, 7, 2, 11);
    px('#6b6f78', 4, 9, 8, 1);
    px('#6b6f78', 4, 15, 8, 1);
    px('#5ab0e8', 5, 7, 6, 1);
    px(o, 12, 11, 4, 3);
    px('#8f5c2e', 12, 12, 3, 1);
  } else if (type === 'splitter') {
    // Bambusrohre
    px(o, 6, 4, 4, 15);
    px('#7fb04a', 7, 5, 2, 13);
    px('#a8d46a', 7, 5, 1, 13);
    px(o, 0, 10, 16, 4);
    px('#7fb04a', 1, 11, 14, 2);
    px('#a8d46a', 1, 11, 14, 1);
    px('#4a7a2a', 7, 9, 2, 1);
    px('#4a7a2a', 4, 11, 1, 2);
    px('#4a7a2a', 11, 11, 1, 2);
  } else if (type === 'sprinkler') {
    // Kupferpfosten mit rundem Kopf
    px(o, 6, 7, 4, 12);
    px('#b8693a', 7, 8, 2, 11);
    px('#e09a5a', 7, 8, 1, 11);
    px(o, 3, 2, 10, 6);
    px('#c87a42', 4, 3, 8, 4);
    px('#f0b070', 4, 3, 8, 1);
    px('#2a5a8a', 5, 6, 1, 1);
    px('#2a5a8a', 10, 6, 1, 1);
  } else {
    // Messingbrunnen mit Becken
    px(o, 1, 12, 14, 7);
    px('#d9a82a', 2, 13, 12, 5);
    px('#f6d25a', 2, 13, 12, 1);
    px('#5ab0e8', 3, 14, 10, 2);
    px('#9ad8ff', 4, 14, 3, 1);
    px(o, 6, 4, 4, 9);
    px('#d9a82a', 7, 5, 2, 8);
    px('#5ab0e8', 7, 1, 2, 3);
    px('#9ad8ff', 7, 1, 1, 2);
  }
  return c;
}

// Wasserrinnen am Boden (16x16, oben = Norden): vom Zentrum zu jedem Anschluss
export function irrigationDecal(dirs) {
  const { c, px } = canvas(16, 16);
  const wet = '#4a3a2a';
  const water = '#5ab0e8';
  for (const d of dirs) {
    if (d === 0) { px(wet, 6, 0, 4, 8); px(water, 7, 0, 2, 8); }
    if (d === 1) { px(wet, 8, 6, 8, 4); px(water, 8, 7, 8, 2); }
    if (d === 2) { px(wet, 6, 8, 4, 8); px(water, 7, 8, 2, 8); }
    if (d === 3) { px(wet, 0, 6, 8, 4); px(water, 0, 7, 8, 2); }
  }
  px(wet, 4, 4, 8, 8);
  px(water, 5, 5, 6, 6);
  px('#9ad8ff', 6, 6, 2, 1);
  return c;
}

// Nasses Feld: bläulich-dunkler Schimmer mit Tropfen
export function wetTileArt() {
  const { c, px } = canvas(16, 16);
  c.getContext('2d').fillStyle = 'rgba(40, 90, 160, 0.22)';
  c.getContext('2d').fillRect(0, 0, 16, 16);
  for (const [x, y] of [[3, 4], [11, 3], [7, 9], [13, 12], [2, 13], [9, 14]]) {
    px('rgba(120, 190, 255, 0.75)', x, y);
    px('rgba(30, 70, 130, 0.5)', x, y + 1);
  }
  return c;
}
