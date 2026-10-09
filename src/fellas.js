import { iconCanvas } from './icons.js';
// Worker („Fellas“): kleine, rein weiße Figuren ohne Kleidung, inspiriert von Tiny Terraces.
// Jeder Worker ist ein kleiner Aufgaben-Agent: Er sucht sich nach seinen Prioritäten eine freie Aufgabe
// (Carry / Plant / Chop), reserviert sie, läuft hin und führt sie aus. Viele kleine Animationen.
import * as THREE from 'three';
import { workerAbilities, addXp, XP } from './workers.js';

// ---------- Pixel-Figur ----------
export const FW = 20; // Canvas-Breite (Art-Pixel)
export const FH = 22; // Canvas-Höhe, Füße stehen unten
const OX = 2; // Rand für Werkzeug und hochgestreckte Arme
const OY = 2;
const C = {
  W: '#ffffff', S: '#e6e1d7', D: '#c9c1b2',
  handle: '#8a5a2b', steel: '#b8c0ca', steelDark: '#7c848e', edge: '#f4f8fb',
};

// Posen (Blickrichtung rechts). Koordinaten ohne Rand; Füße bei y = 19.
// bob = Körper sinkt ein, crouch = hockt, Hände/Füße frei positionierbar, tool = kleine Axt.
export const POSES = {
  stand: { handL: [5, 14], handR: [11, 14], footL: [7, 19], footR: [9, 19] },
  breathe: { bob: 1, handL: [5, 15], handR: [11, 15], footL: [7, 19], footR: [9, 19] },
  w0: { handL: [6, 13], handR: [11, 14], footL: [5, 19], footR: [11, 19] },
  w1: { bob: 1, handL: [5, 15], handR: [11, 15], footL: [7, 19], footR: [9, 19] },
  w2: { handL: [5, 14], handR: [10, 13], footL: [11, 19], footR: [5, 19] },
  w3: { bob: 1, handL: [5, 15], handR: [11, 15], footL: [7, 19], footR: [9, 19] },
  // Tragen: Arme hoch über dem Kopf
  cw0: { handL: [5, 0], handR: [11, 0], footL: [5, 19], footR: [11, 19] },
  cw1: { bob: 1, handL: [5, 1], handR: [11, 1], footL: [7, 19], footR: [9, 19] },
  cw2: { handL: [5, 0], handR: [11, 0], footL: [11, 19], footR: [5, 19] },
  cw3: { bob: 1, handL: [5, 1], handR: [11, 1], footL: [7, 19], footR: [9, 19] },
  carry: { handL: [5, 0], handR: [11, 0], footL: [7, 19], footR: [9, 19] },
  carryB: { bob: 1, handL: [5, 1], handR: [11, 1], footL: [7, 19], footR: [9, 19] },
  // Hacken: ausholen – zuschlagen – zurückfedern
  chop0: { handL: [6, -1], handR: [5, -1], footL: [6, 19], footR: [10, 19], tool: 'axe', toolDir: [-1, 0.55] },
  chop1: { bob: 1, handL: [12, 12], handR: [13, 11], footL: [6, 19], footR: [11, 19], tool: 'axe', toolDir: [1, 0.8] },
  chop2: { handL: [12, 9], handR: [12, 8], footL: [6, 19], footR: [10, 19], tool: 'axe', toolDir: [1, -0.2] },
  // Graben / Aufheben
  d0: { crouch: 3, handL: [12, 19], handR: [13, 18], footL: [6, 19], footR: [10, 19] },
  d1: { crouch: 2, handL: [12, 15], handR: [13, 14], footL: [6, 19], footR: [10, 19] },
  pick: { crouch: 3, handL: [11, 19], handR: [12, 19], footL: [6, 19], footR: [10, 19] },
  // Jubeln / Winken
  ch0: { handL: [3, 3], handR: [13, 3], footL: [6, 19], footR: [10, 19] },
  ch1: { bob: -1, handL: [4, 0], handR: [12, 0], footL: [7, 19], footR: [9, 19] },
  wa: { handL: [5, 14], handR: [14, 4], footL: [7, 19], footR: [9, 19] },
  // Nickerchen (faule Worker): zusammengesunken, atmet langsam
  nap: { crouch: 4, handL: [6, 19], handR: [10, 19], footL: [5, 19], footR: [11, 19] },
  napB: { crouch: 5, handL: [6, 19], handR: [10, 19], footL: [5, 19], footR: [11, 19] },
  wb: { handL: [5, 14], handR: [12, 1], footL: [7, 19], footR: [9, 19] },
};

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// outfit (für Kunden): { shirt, hat, hatStyle } – Hemd über dem Rumpf und ein Hut (cap, tophat, beanie, straw, chef, bandana)
export function drawFella(p, outfit = null) {
  const pix = new Map();
  const set = (x, y, col) => {
    const px = Math.round(x) + OX;
    const py = Math.round(y) + OY;
    if (px < 0 || py < 0 || px >= FW || py >= FH) return;
    pix.set(py * FW + px, col);
  };
  const line = (x0, y0, x1, y1, col) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
  };
  const bob = p.bob ?? 0;
  const cr = p.crouch ?? 0;
  const headY = 5 + bob + cr;
  const torsoTop = 9 + bob + cr;
  const hipY = 14 + Math.round(cr * 0.7);

  // hinterer Arm und hinteres Bein etwas schattiert (Tiefe)
  line(6, torsoTop + 1, p.handL[0], p.handL[1], C.S);
  line(7, hipY, p.footL[0], p.footL[1], C.S);
  line(8, hipY, p.footR[0], p.footR[1], C.W);
  // Rumpf
  for (let y = torsoTop; y <= hipY; y++) {
    for (let x = 6; x <= 9; x++) {
      if (y === torsoTop && (x === 6 || x === 9)) continue; // runde Schultern
      set(x, y, x === 9 || y === hipY ? C.S : C.W);
    }
  }
  // Kopf: großer runder Ball, unten rechts leicht schattiert
  for (let y = headY - 4; y <= headY + 4; y++) {
    for (let x = 4; x <= 12; x++) {
      const dx = x + 0.5 - 8.5;
      const dy = y + 0.5 - (headY + 0.5);
      if (dx * dx + dy * dy > 3.9 * 3.9) continue;
      set(x, y, dx * 0.6 + dy > 2.4 ? C.S : C.W);
    }
  }
  if (outfit) drawOutfit(set, outfit, headY, torsoTop, hipY);
  // vorderer Arm
  line(9, torsoTop + 1, p.handR[0], p.handR[1], C.W);
  // Füße
  set(p.footL[0], p.footL[1], C.D);
  set(p.footR[0], p.footR[1], C.D);
  // kleine Axt in der vorderen Hand
  if (p.tool === 'axe') {
    const [hx, hy] = p.handR;
    const len = Math.hypot(...p.toolDir);
    const dx = p.toolDir[0] / len;
    const dy = p.toolDir[1] / len;
    for (let k = 1; k <= 4; k++) set(hx + dx * k, hy + dy * k, C.handle);
    const ex = hx + dx * 4;
    const ey = hy + dy * 4;
    const nx = -dy;
    const ny = dx;
    set(ex, ey, C.steelDark);
    set(ex + nx, ey + ny, C.steel);
    set(ex + nx * 2, ey + ny * 2, C.edge);
    set(ex + nx + dx, ey + ny + dy, C.steel);
    set(ex - nx, ey - ny, C.steelDark);
  }

  const c = newCanvas(FW, FH);
  const ctx = c.getContext('2d');
  for (const [k, col] of pix) {
    ctx.fillStyle = col;
    ctx.fillRect(k % FW, Math.floor(k / FW), 1, 1);
  }
  return c;
}

// Farbe dunkler machen (für Schattenseiten von Hemd und Hut)
function shade(hex, f = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// Hemd und Hut für Kunden (Blickrichtung rechts, Krempe/Schirm zeigt nach rechts)
function drawOutfit(set, o, headY, torsoTop, hipY) {
  const shirt = o.shirt;
  const dark = shade(shirt);
  for (let y = torsoTop; y <= hipY - 1; y++) {
    for (let x = 6; x <= 9; x++) {
      if (y === torsoTop && (x === 6 || x === 9)) continue;
      set(x, y, x === 9 || y === hipY - 1 ? dark : shirt);
    }
  }
  const h = o.hat;
  const hd = shade(h);
  const top = headY - 4; // oberste Kopfzeile
  const row = (y, x0, x1, col) => { for (let x = x0; x <= x1; x++) set(x, y, col); };
  switch (o.hatStyle) {
    case 'cap':
      row(top, 6, 11, h);
      row(top + 1, 5, 12, h);
      row(top + 2, 10, 14, hd); // Schirm
      break;
    case 'tophat': // (Canvas oben begrenzt: höchstens 2 Zeilen über dem Kopf)
      row(top + 1, 4, 13, hd); // Krempe
      for (let y = top - 2; y <= top; y++) row(y, 6, 11, h);
      row(top, 6, 11, '#d9503c'); // Band
      break;
    case 'beanie':
      row(top - 1, 6, 11, h);
      row(top, 5, 12, h);
      row(top + 1, 5, 12, hd);
      set(8, top - 2, '#ffffff'); // Bommel
      set(9, top - 2, '#ffffff');
      break;
    case 'straw':
      row(top + 1, 3, 14, hd); // breite Krempe
      row(top, 6, 11, h);
      row(top - 1, 7, 10, h);
      break;
    case 'chef':
      for (let y = top - 2; y <= top + 1; y++) row(y, y < top ? 5 : 6, y < top ? 12 : 11, y === top + 1 ? '#d8d0c0' : '#fffaf0');
      break;
    case 'bandana':
      row(top, 5, 12, h);
      row(top + 1, 4, 12, hd);
      set(3, top + 2, h); // Zipfel hinten
      set(3, top + 3, hd);
      break;
  }
}

export function mirror(src) {
  const c = newCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// Sprechblase mit „!“ über dem Kopf, wenn eine Aufgabe übernommen wird
export function emoteCanvas(symbol) {
  return iconCanvas(({ heart: 'heart', angry: 'bolt', coin: 'coin', '!': 'warning', zzz: 'moon' })[symbol], 32);
}

// Porträt fürs Board / Team (stehende Figur, größer)
export function fellaPortraitUrl(scale = 3) {
  const src = drawFella(POSES.stand);
  const c = newCanvas(FW * scale, FH * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// Kunden-Porträt (mit Hemd und Hut)
export function customerPortraitUrl(look, scale = 2) {
  const src = drawFella(POSES.stand, look);
  const c = newCanvas(FW * scale, FH * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// Alle Posen als Bilder (für Debug-Ansichten)
export function fellaPoseUrls(scale = 4) {
  return Object.fromEntries(Object.entries(POSES).map(([name, pose]) => {
    const src = drawFella(pose);
    const c = newCanvas(FW * scale, FH * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return [name, c.toDataURL()];
  }));
}

const ANIMS = {
  idle: { frames: ['stand', 'breathe'], dur: 0.55 },
  walk: { frames: ['w0', 'w1', 'w2', 'w3'], dur: 0.11 },
  carryWalk: { frames: ['cw0', 'cw1', 'cw2', 'cw3'], dur: 0.12 },
  carryIdle: { frames: ['carry', 'carryB'], dur: 0.4 },
  pickup: { frames: ['pick'], dur: 1 },
  dig: { frames: ['d0', 'd1'], dur: 0.17 },
  cheer: { frames: ['ch0', 'ch1'], dur: 0.12 },
  wave: { frames: ['wa', 'wb'], dur: 0.16 },
  chop: { frames: ['chop0'], dur: 1 }, // Frames werden beim Hacken direkt gesetzt
  nap: { frames: ['nap', 'napB'], dur: 0.9 },
};

const rand = Math.random;
const randRange = (a, b) => a + rand() * (b - a);

// ctx: Schnittstelle zur Welt (Sprites, Bäume, Items, Effekte), siehe world.js
export function createFellas(ctx) {
  const { state, SCREEN_RIGHT, TO_CAMERA, landBox } = ctx;
  const SCALE = 1.35;
  const PX = ctx.PX;
  const HEAD_TOP = (FH - OY - 1) * PX * SCALE; // Höhe über dem Boden, wo getragene Dinge sitzen

  // Texturen je Pose und Blickrichtung
  const tex = {};
  for (const [name, pose] of Object.entries(POSES)) {
    const right = drawFella(pose);
    tex[name] = { r: ctx.canvasTexture(right), l: ctx.canvasTexture(mirror(right)) };
  }
  const emoteTex = {
    '!': ctx.canvasTexture(emoteCanvas('!')),
    heart: ctx.canvasTexture(emoteCanvas('heart')),
    zzz: ctx.canvasTexture(emoteCanvas('zzz')),
  };

  const fellas = new Map(); // Worker-id -> Fella
  let initialized = false;

  const chestSpot = (from) => {
    const d = new THREE.Vector3(from.x, 0, from.z);
    if (d.lengthSq() < 0.01) d.set(1, 0, 1);
    return d.normalize().multiplyScalar(0.75);
  };
  const clampToMeadow = (v) => {
    const b = landBox();
    v.x = THREE.MathUtils.clamp(v.x, b.minX + 0.3, b.maxX - 0.3);
    v.z = THREE.MathUtils.clamp(v.z, b.minZ + 0.3, b.maxZ - 0.3);
    return v;
  };
  const nearChest = () => clampToMeadow(new THREE.Vector3(randRange(-1.6, 1.6), 0, randRange(-1.6, 1.6)));
  // Punkt im Nebel hinter der Wiese (zum Kommen und Gehen)
  const edgePoint = () => {
    const b = landBox();
    const a = randRange(Math.PI * 0.75, Math.PI * 1.75); // eher hinten/seitlich
    const c = Math.cos(a);
    const s = Math.sin(a);
    // vom Land-Mittelpunkt bis knapp hinter den Rand in dieser Richtung
    const reach = Math.min(Math.abs(c) > 1e-3 ? b.hx / Math.abs(c) : Infinity, Math.abs(s) > 1e-3 ? b.hz / Math.abs(s) : Infinity);
    return new THREE.Vector3(b.cx + c * (reach + 1.6), 0, b.cz + s * (reach + 1.6));
  };

  function spawn(data, walkIn) {
    const sprite = ctx.makeSprite(tex.stand.r, FW, FH, { scale: SCALE });
    const shadow = ctx.makeShadow(0, 0, 0.55);
    const emote = ctx.makeSprite(emoteTex['!'], 9, 11, { center: [0.5, 0], scale: 1 });
    emote.visible = false;
    const f = {
      id: data.id, data, sprite, shadow, emote,
      ab: workerAbilities(data, state),
      pos: walkIn ? edgePoint() : nearChest(),
      target: null, facing: 'r',
      anim: 'idle', animT: 0, frame: 0, poseOverride: null,
      phase: walkIn ? 'arrive' : 'idle',
      task: null, timer: 0, think: rand() * 0.4, wander: randRange(1, 3),
      carried: [], prop: null, cargo: [],
      hop: 0, hopV: 0, squash: 0, stepAcc: 0, emoteT: 0,
      swingT: 0, swung: false, depositT: 0,
      status: 'Idle',
    };
    if (walkIn) f.target = nearChest();
    fellas.set(data.id, f);
    return f;
  }

  function despawn(f) {
    ctx.removeSprite(f.sprite);
    ctx.removeSprite(f.emote);
    ctx.removeShadow(f.shadow);
    if (f.prop) ctx.removeSprite(f.prop);
    fellas.delete(f.id);
  }

  // ---------- Hilfen ----------
  function setAnim(f, name) {
    if (f.anim === name) return;
    f.anim = name;
    f.animT = 0;
    f.frame = 0;
  }
  function showEmote(f, kind) {
    f.emote.material.map = emoteTex[kind];
    f.emote.visible = true;
    f.emoteT = 0.9;
  }
  function hopUp(f, v = 2.6) {
    if (f.hop <= 0.001) f.hopV = v;
  }
  function faceTowards(f, x, z) {
    const d = (x - f.pos.x) * SCREEN_RIGHT.x + (z - f.pos.z) * SCREEN_RIGHT.z;
    if (Math.abs(d) > 0.02) f.facing = d > 0 ? 'r' : 'l';
  }
  // Schritt Richtung Ziel; true = angekommen
  function moveTo(f, target, dt, speedMult = 1) {
    const dx = target.x - f.pos.x;
    const dz = target.z - f.pos.z;
    const dist = Math.hypot(dx, dz);
    const step = f.ab.speed * speedMult * dt;
    faceTowards(f, target.x, target.z);
    if (dist <= step) {
      f.pos.x = target.x;
      f.pos.z = target.z;
      return true;
    }
    f.pos.x += (dx / dist) * step;
    f.pos.z += (dz / dist) * step;
    // Staubwölkchen bei jedem zweiten Schritt
    f.stepAcc += step;
    if (f.stepAcc > 0.55) {
      f.stepAcc = 0;
      ctx.stepDust(f.pos);
    }
    return false;
  }
  const nearest = (f, list, posOf) => {
    let best = null;
    let bestD = Infinity;
    for (const o of list) {
      const p = posOf(o);
      const d = (p.x - f.pos.x) ** 2 + (p.z - f.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  };

  // ---------- Aufgaben ----------
  function findTask(f) {
    for (const type of f.data.priorities) {
      if (type === 'carry' && ctx.hasRoom()) {
        const item = nearest(f, ctx.items.filter((i) => i.state === 'rest' && !i.reservedBy), (i) => i.sprite.position);
        if (item) return { type, item };
      }
      if (type === 'plant') {
        const seed = nearest(f, [...ctx.seeds.values()].filter((s) => !s.reservedBy), (s) => s.pos);
        if (seed) return { type, seed };
        // Stümpfe neu bepflanzen, solange freie Setzlinge in der Truhe liegen
        if (ctx.availableSaplings() > 0) {
          const stump = nearest(f, ctx.trees.filter((t) => t.phase === 'stump' && !t.autoRegrow && !t.reservedBy), (t) => t);
          if (stump) return { type, seed: { pos: new THREE.Vector3(stump.x, 0, stump.z), stump } };
        }
      }
      if (type === 'chop') {
        const tree = nearest(f, ctx.trees.filter((t) => t.phase === 'grown' && !t.reservedBy), (t) => t);
        if (tree) return { type, tree };
      }
      if (type === 'saw') {
        // Sägewerk: fertige Bretter abholen oder Stämme aus der Truhe bringen
        const mills = ctx.sawmills().filter((b) => !b.reservedBy);
        const collect = mills.find((b) => b.output.length > 0 && ctx.hasRoom());
        if (collect) return { type, mill: collect, mode: 'collect' };
        const supply = mills.find((b) => ctx.sawmillNeedsInput(b));
        if (supply) return { type, mill: supply, mode: 'supply' };
      }
    }
    return null;
  }

  // Ladung des Sägewerk-Jobs (Stämme oder Bretter) als Sprites über dem Kopf
  function addCargo(f, keys) {
    for (const key of keys) {
      f.cargo.push({ key, sprite: ctx.makeSprite(ctx.itemTexture(key), 16, 10, { center: [0.5, 0.5], scale: 1 }) });
    }
  }
  function clearCargo(f) {
    for (const c of f.cargo) ctx.removeSprite(c.sprite);
    f.cargo = [];
  }

  function startTask(f, task) {
    f.task = task;
    showEmote(f, '!');
    hopUp(f, 1.6);
    if (task.type === 'carry') {
      task.item.reservedBy = f.id;
      ctx.reserveSlot(1);
      f.phase = 'toItem';
      f.target = task.item.sprite.position.clone();
    } else if (task.type === 'plant') {
      if (task.seed.stump) {
        task.seed.stump.reservedBy = f.id;
        ctx.reserveSapling(1); // Setzling in der Truhe vormerken
      } else {
        task.seed.reservedBy = f.id;
      }
      f.phase = 'toChestFetch';
      f.target = chestSpot(f.pos);
    } else if (task.type === 'saw') {
      task.mill.reservedBy = f.id;
      if (task.mode === 'supply') {
        f.phase = 'sawToChest';
        f.target = chestSpot(f.pos);
      } else {
        f.phase = 'toMill';
        f.target = clampToMeadow(ctx.sawmillSpot(task.mill));
      }
    } else if (task.type === 'chop') {
      const t = task.tree;
      t.reservedBy = f.id;
      const side = (f.pos.x - t.x) * SCREEN_RIGHT.x + (f.pos.z - t.z) * SCREEN_RIGHT.z >= 0 ? 1 : -1;
      task.side = side;
      f.target = clampToMeadow(new THREE.Vector3(t.x, 0, t.z).addScaledVector(SCREEN_RIGHT, side * 0.55).addScaledVector(TO_CAMERA, 0.18));
      f.phase = 'toTree';
    }
  }

  // Aufgabe abbrechen: Reservierungen lösen, Getragenes fallen lassen
  function dropTask(f) {
    const task = f.task;
    if (task?.type === 'carry' && task.item && task.item.reservedBy === f.id && task.item.state !== 'carried') {
      task.item.reservedBy = null;
      ctx.reserveSlot(-1);
    }
    if (task?.type === 'plant' && task.seed) {
      const stump = task.seed.stump;
      if (stump) {
        if (stump.reservedBy === f.id) stump.reservedBy = null;
        if (!task.saplingTaken) ctx.reserveSapling(-1);
        else if (!task.planted) ctx.returnSapling(task.species); // Setzling zurück in die Truhe
      } else {
        task.seed.reservedBy = null;
      }
    }
    if (task?.type === 'chop' && task.tree?.reservedBy === f.id) task.tree.reservedBy = null;
    if (task?.type === 'saw') {
      if (task.mill.reservedBy === f.id) task.mill.reservedBy = null;
      // Ladung zurück in die Truhe (Bretter hatten schon reservierte Plätze)
      for (const c of f.cargo) {
        state.inventory[c.key] = (state.inventory[c.key] ?? 0) + 1;
        if (task.mode === 'collect') ctx.reserveSlot(-1);
      }
    }
    clearCargo(f);
    for (const it of f.carried) {
      it.state = 'air';
      it.reservedBy = null;
      it.shadow.visible = true;
      it.vel.set(randRange(-0.8, 0.8), 2.5, randRange(-0.8, 0.8));
      ctx.reserveSlot(-1);
    }
    f.carried = [];
    if (f.prop) {
      ctx.removeSprite(f.prop);
      f.prop = null;
    }
    f.task = null;
  }

  function finishTask(f, happy = true) {
    f.task = null;
    f.think = 0.25;
    if (rand() < f.ab.napChance) {
      f.phase = 'nap';
      f.timer = randRange(3, 6);
      showEmote(f, 'zzz');
      return;
    }
    if (happy && rand() < 0.6) {
      f.phase = 'cheer';
      f.timer = 0.75;
      hopUp(f, 3);
      if (rand() < 0.35) showEmote(f, 'heart');
    } else {
      f.phase = 'idle';
    }
  }

  // Erfahrung sammeln; bei Level-Up großer Effekt in der Welt
  function gainXp(f, amount) {
    const raised = addXp(f.data, amount, state);
    if (!raised) return;
    ctx.levelUp(f, raised);
    showEmote(f, 'heart');
    hopUp(f, 3.6);
  }

  // Ungeschickte Worker lassen beim Tragen manchmal einen Scheit fallen
  function dropOne(f) {
    const it = f.carried.pop();
    if (!it) return;
    it.state = 'air';
    it.reservedBy = null;
    it.shadow.visible = true;
    it.vel.set(randRange(-1, 1), 2.4, randRange(-1, 1));
    ctx.reserveSlot(-1);
    ctx.floater('Oops!', f.pos.clone().setY(1.2), 'floater-warn');
    showEmote(f, '!');
    f.squash = 1;
  }

  function pickUp(f, item) {
    item.state = 'carried';
    item.shadow.visible = false;
    item.sprite.material.rotation = 0;
    f.carried.push(item);
    f.squash = 0.8;
    ctx.sfx.pop(0.5);
  }

  // ---------- Pro Worker ----------
  function updateFella(f, dt) {
    const carrying = f.carried.length > 0 || !!f.prop || f.cargo.length > 0;
    f.think -= dt;
    f.ab = workerAbilities(f.data, state); // Tageszeit und Worker-Skills
    if (f.carried.length && (f.phase === 'toItem' || f.phase === 'toChest') && rand() < f.ab.dropChance * dt) dropOne(f);

    switch (f.phase) {
      case 'arrive': {
        f.status = 'Arriving';
        setAnim(f, 'walk');
        if (moveTo(f, f.target, dt)) {
          ctx.floater('Hi!', f.pos.clone().setY(1.1), 'floater-sapling');
          showEmote(f, 'heart');
          f.phase = 'cheer';
          f.timer = 0.9;
          hopUp(f, 3.2);
        }
        break;
      }
      case 'leave': {
        f.status = 'Leaving';
        if (f.timer > 0) {
          f.timer -= dt;
          setAnim(f, 'wave');
          break;
        }
        setAnim(f, 'walk');
        if (moveTo(f, f.target, dt)) {
          despawn(f);
          return;
        }
        break;
      }
      case 'nap': {
        f.status = 'Napping [[icon:moon]]';
        setAnim(f, 'nap');
        f.timer -= dt;
        if (f.emoteT <= 0 && f.timer > 1) showEmote(f, 'zzz');
        if (f.timer <= 0) {
          f.phase = 'idle';
          hopUp(f, 1.8); // aufwachen
        }
        break;
      }
      case 'cheer': {
        setAnim(f, 'cheer');
        f.timer -= dt;
        if (f.timer <= 0) f.phase = 'idle';
        break;
      }
      case 'idle':
      case 'wander': {
        f.status = 'Idle';
        if (f.think <= 0) {
          f.think = 0.35;
          const task = findTask(f);
          if (task) {
            startTask(f, task);
            break;
          }
        }
        if (f.phase === 'wander') {
          setAnim(f, 'walk');
          if (moveTo(f, f.target, dt, 0.55)) {
            f.phase = 'idle';
            f.wander = randRange(1.5, 4);
          }
        } else {
          setAnim(f, 'idle');
          f.wander -= dt;
          if (f.wander <= 0) {
            if (rand() < 0.25) {
              // kleiner Freudenhüpfer zwischendurch
              f.phase = 'cheer';
              f.timer = 0.5;
              hopUp(f, 2.2);
            } else {
              f.phase = 'wander';
              f.target = clampToMeadow(f.pos.clone().add(new THREE.Vector3(randRange(-1.2, 1.2), 0, randRange(-1.2, 1.2))));
            }
          }
        }
        break;
      }

      // ----- Carry -----
      case 'toItem': {
        const item = f.task.item;
        f.status = `Carrying [[icon:log]] ${f.carried.length}/${f.ab.capacity}`;
        if (item.state !== 'rest' || item.reservedBy !== f.id) {
          // der Spieler (oder ein anderer Worker) war schneller: Reservierung freigeben
          ctx.reserveSlot(-1);
          if (item.reservedBy === f.id) item.reservedBy = null;
          f.task.item = null;
          if (f.carried.length) {
            f.phase = 'toChest';
            f.target = chestSpot(f.pos);
          } else {
            f.task = null;
            f.phase = 'idle';
          }
          break;
        }
        setAnim(f, carrying ? 'carryWalk' : 'walk');
        if (moveTo(f, item.sprite.position, dt, carrying ? 0.85 : 1)) {
          f.phase = 'pickup';
          f.timer = 0.28;
        }
        break;
      }
      case 'pickup': {
        setAnim(f, 'pickup');
        f.timer -= dt;
        if (f.timer > 0) break;
        pickUp(f, f.task.item);
        f.task.item = null;
        // Noch Platz in den Armen? Dann den nächsten Scheit in der Nähe mitnehmen
        if (f.carried.length < f.ab.capacity && ctx.hasRoom()) {
          const next = nearest(
            f,
            ctx.items.filter((i) => i.state === 'rest' && !i.reservedBy && i.sprite.position.distanceTo(f.pos) < 2.6),
            (i) => i.sprite.position,
          );
          if (next) {
            next.reservedBy = f.id;
            ctx.reserveSlot(1);
            f.task.item = next;
            f.phase = 'toItem';
            break;
          }
        }
        f.phase = 'toChest';
        f.target = chestSpot(f.pos);
        break;
      }
      case 'toChest': {
        f.status = `Carrying [[icon:log]] ${f.carried.length}/${f.ab.capacity}`;
        setAnim(f, 'carryWalk');
        if (moveTo(f, f.target, dt, 0.85)) {
          faceTowards(f, 0, 0);
          f.phase = 'deposit';
          f.depositT = 0;
        }
        break;
      }
      case 'deposit': {
        setAnim(f, 'carryIdle');
        f.depositT -= dt;
        if (f.depositT <= 0 && f.carried.length) {
          // oberster Scheit fliegt in die Truhe
          const it = f.carried.pop();
          it.reservedBy = null;
          ctx.reserveSlot(-1);
          ctx.launchItem(it);
          gainXp(f, XP.deliver);
          f.squash = 0.6;
          f.depositT = 0.16;
        }
        if (!f.carried.length && f.depositT <= 0) finishTask(f);
        break;
      }

      // ----- Plant -----
      case 'toChestFetch': {
        f.status = 'Planting [[icon:sapling]]';
        setAnim(f, 'walk');
        if (moveTo(f, f.target, dt)) {
          faceTowards(f, 0, 0);
          f.phase = 'fetch';
          f.timer = 0.35;
        }
        break;
      }
      case 'fetch': {
        setAnim(f, 'pickup');
        f.timer -= dt;
        if (f.timer > 0) break;
        if (f.task.seed.stump) {
          // Setzling für den Stumpf aus der Truhe nehmen (könnte inzwischen verkauft sein)
          const species = ctx.takeSapling(f.task.seed.stump.species);
          if (!species) {
            f.task.seed.stump.reservedBy = null;
            f.task = null;
            f.phase = 'idle';
            break;
          }
          f.task.saplingTaken = true;
          f.task.species = species;
        } else {
          f.task.species = f.task.seed.species;
        }
        f.prop = ctx.makeSprite(ctx.saplingTexOf(f.task.species), 12, 12, { center: [0.5, 0.5], scale: 1.15 });
        f.squash = 0.8;
        ctx.sfx.pop(0.5);
        const s = f.task.seed;
        f.target = clampToMeadow(s.pos.clone().addScaledVector(SCREEN_RIGHT, -0.42).addScaledVector(TO_CAMERA, 0.15));
        f.phase = 'toSeed';
        break;
      }
      case 'toSeed': {
        f.status = 'Planting [[icon:sapling]]';
        const stump = f.task.seed.stump;
        if (stump && stump.phase !== 'stump') {
          // jemand war schneller: Setzling zurück in die Truhe
          dropTask(f);
          f.phase = 'idle';
          break;
        }
        setAnim(f, 'carryWalk');
        if (moveTo(f, f.target, dt, 0.9)) {
          faceTowards(f, f.task.seed.pos.x, f.task.seed.pos.z);
          ctx.removeSprite(f.prop);
          f.prop = null;
          f.phase = 'dig';
          f.timer = f.ab.digTime;
          f.digPuff = 0;
        }
        break;
      }
      case 'dig': {
        setAnim(f, 'dig');
        f.timer -= dt;
        f.digPuff -= dt;
        if (f.digPuff <= 0) {
          f.digPuff = 0.34;
          ctx.digDust(f.task.seed.pos);
        }
        if (f.timer <= 0) {
          const stump = f.task.seed.stump;
          if (stump) {
            if (stump.phase === 'stump') {
              ctx.plantOnStump(stump, f.task.species);
              f.task.planted = true;
            } else {
              ctx.returnSapling(f.task.species);
            }
            stump.reservedBy = null;
          } else {
            ctx.plantSeed(f.task.seed);
          }
          gainXp(f, XP.plant);
          finishTask(f);
        }
        break;
      }

      // ----- Sägewerk -----
      case 'sawToChest': {
        f.status = 'Sawmill [[icon:saw]] fetching logs';
        setAnim(f, 'walk');
        if (moveTo(f, f.target, dt)) {
          faceTowards(f, 0, 0);
          f.phase = 'sawFetch';
          f.timer = 0.35;
        }
        break;
      }
      case 'sawFetch': {
        setAnim(f, 'pickup');
        f.timer -= dt;
        if (f.timer > 0) break;
        const keys = ctx.takeLogsFor(f.task.mill, f.ab.capacity);
        if (!keys.length) {
          dropTask(f);
          f.phase = 'idle';
          break;
        }
        addCargo(f, keys);
        f.squash = 0.8;
        ctx.sfx.pop(0.5);
        f.phase = 'toMill';
        f.target = clampToMeadow(ctx.sawmillSpot(f.task.mill));
        break;
      }
      case 'toMill': {
        f.status = f.cargo.length ? `Sawmill [[icon:saw]] ${f.cargo.length} logs` : 'Sawmill [[icon:saw]] collecting';
        if (!ctx.sawmills().includes(f.task.mill)) {
          dropTask(f);
          f.phase = 'idle';
          break;
        }
        setAnim(f, f.cargo.length ? 'carryWalk' : 'walk');
        if (moveTo(f, f.target, dt, f.cargo.length ? 0.85 : 1)) {
          faceTowards(f, f.task.mill.center.x, f.task.mill.center.z);
          f.phase = 'millWork';
          f.timer = 0.2;
        }
        break;
      }
      case 'millWork': {
        setAnim(f, f.cargo.length ? 'carryIdle' : 'pickup');
        f.timer -= dt;
        if (f.timer > 0) break;
        const mill = f.task.mill;
        if (f.cargo.length) {
          // Stämme einzeln abladen
          const c = f.cargo.pop();
          ctx.removeSprite(c.sprite);
          ctx.deliverLogs(mill, [c.key]);
          mill.bounce = 0.6;
          gainXp(f, XP.deliver);
          f.squash = 0.5;
          f.timer = 0.16;
          break;
        }
        // fertige Bretter gleich mitnehmen
        const planks = ctx.takePlanks(mill, f.ab.capacity);
        if (planks.length) {
          ctx.reserveSlot(planks.length);
          f.task.mode = 'collect';
          addCargo(f, planks);
          f.squash = 0.8;
          ctx.sfx.pop(0.5);
          f.phase = 'sawToChestDeliver';
          f.target = chestSpot(f.pos);
          break;
        }
        mill.reservedBy = null;
        finishTask(f);
        break;
      }
      case 'sawToChestDeliver': {
        f.status = `Sawmill [[icon:saw]] ${f.cargo.length} planks`;
        setAnim(f, 'carryWalk');
        if (moveTo(f, f.target, dt, 0.85)) {
          faceTowards(f, 0, 0);
          if (f.task.mill.reservedBy === f.id) f.task.mill.reservedBy = null;
          f.phase = 'sawDeposit';
          f.timer = 0;
        }
        break;
      }
      case 'sawDeposit': {
        setAnim(f, 'carryIdle');
        f.timer -= dt;
        if (f.timer > 0) break;
        const c = f.cargo.pop();
        if (c) {
          ctx.removeSprite(c.sprite);
          ctx.reserveSlot(-1);
          ctx.depositToChest([c.key]);
          gainXp(f, XP.deliver);
          f.squash = 0.6;
          f.timer = 0.16;
        }
        if (!f.cargo.length) finishTask(f);
        break;
      }

      // ----- Chop -----
      case 'toTree': {
        f.status = 'Chopping [[icon:axe]]';
        const t = f.task.tree;
        if (t.phase !== 'grown') {
          t.reservedBy = null;
          f.task = null;
          f.phase = 'idle';
          break;
        }
        setAnim(f, 'walk');
        if (moveTo(f, f.target, dt)) {
          faceTowards(f, t.x, t.z);
          f.phase = 'chop';
          f.swingT = 0;
          f.swung = false;
        }
        break;
      }
      case 'chop': {
        f.status = 'Chopping [[icon:axe]]';
        const t = f.task.tree;
        if (t.phase !== 'grown') {
          // Baum ist gefallen: freuen und als Nächstes wahrscheinlich die Scheite tragen
          t.reservedBy = null;
          if (t.lastHitBy === f.data) gainXp(f, XP.fell);
          finishTask(f, true);
          break;
        }
        setAnim(f, 'chop');
        faceTowards(f, t.x, t.z);
        f.swingT += dt / f.ab.swingTime;
        if (f.swingT < 0.5) f.poseOverride = 'chop0'; // ausholen
        else if (f.swingT < 0.72) {
          f.poseOverride = 'chop1'; // zuschlagen
          if (!f.swung) {
            f.swung = true;
            f.squash = 0.9;
            ctx.workerHit(t, f.ab.damage, f.task.side, f.data);
            gainXp(f, XP.hit);
          }
        } else f.poseOverride = 'chop2'; // zurückfedern
        if (f.swingT >= 1) {
          f.swingT = 0;
          f.swung = false;
        }
        break;
      }
      default:
        f.phase = 'idle';
    }

    // ---- Animation, Hüpfen, Stauchen ----
    const a = ANIMS[f.anim];
    const speedFactor = f.anim === 'walk' || f.anim === 'carryWalk' ? f.ab.speed / 1.2 : 1;
    f.animT += dt * speedFactor;
    if (f.animT >= a.dur) {
      f.animT = 0;
      f.frame = (f.frame + 1) % a.frames.length;
    }
    const pose = f.anim === 'chop' ? f.poseOverride ?? 'chop0' : a.frames[f.frame];

    if (f.hop > 0 || f.hopV > 0) {
      f.hopV -= 14 * dt;
      f.hop += f.hopV * dt;
      if (f.hop <= 0) {
        f.hop = 0;
        f.hopV = 0;
        f.squash = 1; // Landung
      }
    }
    f.squash = Math.max(0, f.squash - dt * 5);

    f.sprite.material.map = tex[pose][f.facing];
    const sq = f.squash * 0.18;
    const baseW = FW * PX * SCALE;
    const baseH = FH * PX * SCALE;
    f.sprite.scale.set(baseW * (1 + sq), baseH * (1 - sq), 1);
    f.sprite.position.set(f.pos.x, f.hop, f.pos.z);
    f.shadow.position.set(f.pos.x, 0.012, f.pos.z);
    const sh = Math.max(0.4, 1 - f.hop * 0.6);
    f.shadow.scale.set(0.5 * sh, 0.3 * sh, 1);

    // Getragenes über dem Kopf (stapelt sich), wippt mit den Schritten
    const poseBob = POSES[pose].bob ?? 0;
    const headTop = HEAD_TOP - poseBob * PX * SCALE + f.hop - f.squash * 0.05;
    const front = TO_CAMERA.clone().multiplyScalar(0.03);
    f.carried.forEach((it, i) => {
      it.sprite.position.set(f.pos.x + front.x, headTop + 0.1 + i * 0.17, f.pos.z + front.z);
      it.sprite.material.rotation = Math.sin(performance.now() / 180 + i) * 0.05;
    });
    if (f.prop) f.prop.position.set(f.pos.x + front.x, headTop + 0.15, f.pos.z + front.z);
    f.cargo.forEach((c, i) => {
      c.sprite.position.set(f.pos.x + front.x, headTop + 0.1 + i * 0.17, f.pos.z + front.z);
      c.sprite.material.rotation = Math.sin(performance.now() / 180 + i) * 0.05;
    });

    // Emote-Blase
    if (f.emoteT > 0) {
      f.emoteT -= dt;
      const pop = Math.min(1, (0.9 - f.emoteT) * 8);
      f.emote.visible = f.emoteT > 0;
      f.emote.scale.set(10 * PX * pop, 10 * PX * pop, 1);
      f.emote.position.set(f.pos.x + front.x * 2, headTop + 0.12 + (f.carried.length + f.cargo.length) * 0.17 + (1 - pop) * 0.1, f.pos.z + front.z * 2);
    }
  }

  // ---------- Abgleich mit state.workers ----------
  function sync() {
    for (const data of state.workers) {
      if (!fellas.has(data.id)) spawn(data, initialized);
    }
    for (const f of fellas.values()) {
      const data = state.workers.find((w) => w.id === f.id);
      if (!data && f.phase !== 'leave') {
        // gefeuert: winken und im Nebel verschwinden
        dropTask(f);
        f.phase = 'leave';
        f.timer = 0.9;
        f.target = edgePoint();
        showEmote(f, 'heart');
      } else if (data) {
        f.data = data;
        f.ab = workerAbilities(data, state);
      }
    }
    initialized = true;
  }

  function update(dt) {
    sync();
    for (const f of [...fellas.values()]) updateFella(f, dt);
  }

  // Worker aus dem Spielstand stehen sofort auf der Wiese; später eingestellte laufen aus dem Nebel herein
  sync();

  return {
    update,
    // alle Worker zeigen kurz eine Blase (z. B. am Zahltag)
    emoteAll: (kind) => fellas.forEach((f) => f.phase !== 'leave' && showEmote(f, kind)),
    status: (id) => fellas.get(id)?.status ?? 'Arriving',
    list: () => [...fellas.values()],
  };
}
