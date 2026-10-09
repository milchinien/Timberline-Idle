// Kunden in der Welt: Zu jedem offenen Auftrag kommt der Kunde über den Weg vorne am Wiesenrand,
// wartet dort mit einer Sprechblase (was er will) und wird ungeduldig, wenn die Zeit knapp wird.
// Bei Lieferung fliegt die Ware aus der Truhe zu ihm, er jubelt und zahlt; abgelaufen: Gewitterwolke und weg.
import * as THREE from 'three';
import { drawFella, mirror, emoteCanvas, POSES, FW, FH } from './fellas.js';
import { customerOf } from './customers.js';
import { formatNumber } from './state.js';
import { on } from './events.js';

const SCALE = 1.35;
const WALK_SPEED = 1.5;
const ANIMS = {
  idle: { frames: ['stand', 'breathe'], dur: 0.55 },
  tap: { frames: ['stand', 'breathe'], dur: 0.16 }, // ungeduldig
  walk: { frames: ['w0', 'w1', 'w2', 'w3'], dur: 0.11 },
  cheer: { frames: ['ch0', 'ch1'], dur: 0.12 },
  wave: { frames: ['wa', 'wb'], dur: 0.16 },
};
const BUBBLE_BORDER = { normal: '#3a2a1a', rush: '#d9503c', bulk: '#c0941f' };

const rand = Math.random;
const randRange = (a, b) => a + rand() * (b - a);

// ctx: Schnittstelle zur Welt (siehe world.js)
export function createVisitors(ctx) {
  const { state, PX, SCREEN_RIGHT, CHEST_TOP } = ctx;
  const HEAD = (FH - 3) * PX * SCALE; // Höhe über dem Boden, wo Blasen sitzen

  // ---- Texturen (je Kunde und Pose, beide Blickrichtungen) ----
  const texCache = new Map();
  function texFor(look, pose, facing) {
    const key = `${look.shirt}${look.hat}${look.hatStyle}:${pose}`;
    if (!texCache.has(key)) {
      const right = drawFella(POSES[pose], look);
      texCache.set(key, { r: ctx.canvasTexture(right), l: ctx.canvasTexture(mirror(right)) });
    }
    return texCache.get(key)[facing];
  }
  const emoteTex = Object.fromEntries(['heart', 'angry', 'coin', '!'].map((s) => [s, ctx.canvasTexture(emoteCanvas(s))]));

  // Sprechblase mit dem gewünschten Item; Rahmenfarbe zeigt die Auftragsart
  const bubbleCache = new Map();
  function bubbleTex(itemKey, kind) {
    const key = `${itemKey}:${kind}`;
    if (!bubbleCache.has(key)) {
      const icon = ctx.itemCanvas(itemKey);
      const w = Math.max(icon.width + 6, 16);
      const h = icon.height + 9;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      const border = BUBBLE_BORDER[kind] ?? BUBBLE_BORDER.normal;
      g.fillStyle = border;
      g.fillRect(1, 0, w - 2, h - 4);
      g.fillRect(0, 1, w, h - 6);
      g.fillStyle = '#fffaf0';
      g.fillRect(1, 1, w - 2, h - 6);
      // Spitze unten
      g.fillStyle = border;
      g.fillRect(Math.floor(w / 2) - 2, h - 4, 4, 1);
      g.fillRect(Math.floor(w / 2) - 1, h - 3, 2, 2);
      g.fillStyle = '#fffaf0';
      g.fillRect(Math.floor(w / 2) - 1, h - 5, 2, 1);
      g.drawImage(icon, Math.floor((w - icon.width) / 2), 2);
      bubbleCache.set(key, { tex: ctx.canvasTexture(c), w, h });
    }
    return bubbleCache.get(key);
  }

  // ---- Weg und Warteplätze: vorne links am Wiesenrand ----
  const MAX_SLOTS = 4;
  const roadZ = () => ctx.landBox().maxZ + 0.6;
  const slotX = (k) => {
    const b = ctx.landBox();
    return THREE.MathUtils.clamp((k - (MAX_SLOTS - 1) / 2) * 1.5, b.minX + 0.8, b.maxX - 0.8);
  };
  const startX = () => ctx.landBox().minX - 3;
  const endX = () => ctx.landBox().maxX + 3;

  const visitors = new Map(); // order-id -> Visitor
  const flights = []; // Ware, die gerade von der Truhe zum Kunden fliegt

  function freeSlot() {
    const used = new Set([...visitors.values()].filter((v) => v.phase !== 'leave').map((v) => v.slot));
    for (let k = 0; k < MAX_SLOTS; k++) if (!used.has(k)) return k;
    return MAX_SLOTS - 1;
  }

  // special = { look, slot } für Figuren ohne Auftrag (Wanderhändler)
  function spawn(order, walkIn, special = null) {
    const c = special ? { id: order.id, look: special.look } : customerOf(order.customerId);
    const slot = special ? special.slot : freeSlot();
    // kommen mehrere gleichzeitig, laufen sie hintereinander
    const queue = [...visitors.values()].filter((x) => x.phase === 'arrive').length;
    const pos = new THREE.Vector3(walkIn ? startX() - queue * 1.3 : slotX(slot), 0, roadZ());
    const sprite = ctx.makeSprite(texFor(c.look, 'stand', 'r'), FW, FH, { scale: SCALE });
    const shadow = ctx.makeShadow(pos.x, pos.z, 0.55);
    const bubble = ctx.makeSprite(bubbleTex(order.items[0].key, order.kind).tex, 16, 14, { center: [0.5, 0], scale: 1 });
    const emote = ctx.makeSprite(emoteTex.heart, 9, 11, { center: [0.5, 0], scale: 1.1 });
    emote.visible = false;
    // im Nebel ein-/ausblenden (Deckkraft je nach Abstand zum Landrand)
    for (const s of [sprite, bubble, emote]) {
      s.material.transparent = true;
      s.material.alphaTest = 0.02;
      s.material.depthWrite = false;
      s.material.needsUpdate = true;
    }
    sprite.renderOrder = 5;
    const v = {
      order, c, slot, pos, sprite, shadow, bubble, emote,
      phase: walkIn ? 'arrive' : 'wait', facing: 'r', anim: walkIn ? 'walk' : 'idle', animT: rand(), t: 0,
      bubbleT: 0, emoteT: 0, hop: 0, item: 0, pending: 0, speed: WALK_SPEED, special: !!special,
    };
    visitors.set(order.id, v);
    return v;
  }

  // ---- Wanderhändler (Zufallsereignis): eigener Platz rechts neben den Kunden, Blase mit Goldholz ----
  const MERCHANT_LOOK = { shirt: '#7a4ab0', hat: '#2a1a40', hatStyle: 'tophat' };
  const MERCHANT_ORDER = { id: 'merchant', kind: 'bulk', items: [{ key: 'goldwood', n: 1 }], time: 1, total: 1 };
  function spawnMerchant() {
    if (visitors.has('merchant')) return;
    spawn(MERCHANT_ORDER, true, { look: MERCHANT_LOOK, slot: MAX_SLOTS });
    ctx.floater('A traveling merchant!', new THREE.Vector3(startX() + 2, 1.6, roadZ()), 'floater-gold');
  }
  function dismissMerchant() {
    const v = visitors.get('merchant');
    if (v && v.phase !== 'leave') {
      emote(v, 'coin', 1.4);
      leave(v, 'happy');
    }
  }

  function despawn(v) {
    for (const s of [v.sprite, v.bubble, v.emote]) ctx.removeSprite(s);
    ctx.removeShadow(v.shadow);
    visitors.delete(v.order.id);
  }

  function emote(v, name, dur = 1.6) {
    v.emote.material.map = emoteTex[name];
    v.emote.visible = true;
    v.emoteT = dur;
  }

  function leave(v, mood) {
    v.phase = 'leave';
    v.bubble.visible = false;
    v.speed = mood === 'angry' ? WALK_SPEED * 0.7 : WALK_SPEED;
    v.anim = mood === 'happy' ? 'wave' : 'walk';
    v.waveT = mood === 'happy' ? 0.9 : 0;
  }

  // ---- Ereignisse aus den Aufträgen ----
  on('orderNew', ({ order }) => {
    if (visitors.has(order.id)) return;
    spawn(order, true);
    ctx.sfx.bell();
  });

  on('orderDone', ({ order }) => {
    const v = visitors.get(order.id);
    if (!v) return;
    v.phase = 'happy';
    v.t = 0;
    v.bubble.visible = false;
    // Ware fliegt aus der Truhe zum Kunden (höchstens 8 Stück sichtbar)
    const keys = order.items.flatMap((it) => Array(it.n).fill(it.key));
    const shown = Math.min(8, keys.length);
    v.pending = shown;
    ctx.chestPop();
    for (let i = 0; i < shown; i++) {
      const key = keys[Math.floor((i / shown) * keys.length)];
      const sprite = ctx.makeSprite(ctx.itemTexture(key), 16, 10, { center: [0.5, 0.5], scale: 1.1 });
      sprite.position.copy(CHEST_TOP);
      flights.push({ sprite, v, t: -i * 0.07, from: CHEST_TOP.clone(), spin: randRange(-10, 10) });
    }
  });

  on('orderExpired', ({ order }) => {
    const v = visitors.get(order.id);
    if (!v) return;
    emote(v, 'angry', 2.2);
    ctx.floater('Too late!', v.pos.clone().setY(HEAD + 0.6), 'floater-warn');
    leave(v, 'angry');
  });

  on('orderDeclined', ({ order }) => {
    const v = visitors.get(order.id);
    if (!v) return;
    ctx.floater('Oh well…', v.pos.clone().setY(HEAD + 0.6), 'floater-dmg');
    leave(v, 'sad');
  });

  on('customerLove', ({ id, hearts: h, perkUp }) => {
    const v = [...visitors.values()].find((x) => x.c.id === id && x.phase === 'happy');
    if (!v) return;
    setTimeout(() => {
      ctx.floater(`${'[[icon:heart]]'.repeat(h)}${perkUp ? ' Bonus!' : ''}`, v.pos.clone().setY(HEAD + 1.1), 'floater-level');
      ctx.sparkles(v.pos.clone().setY(HEAD), 14, '#ff8aa8', 1.8);
    }, 700);
  });

  // ---- Bewegung und Animation ----
  function setAnimFrame(v, dt) {
    const a = ANIMS[v.anim] ?? ANIMS.idle;
    v.animT += dt;
    const frame = a.frames[Math.max(0, Math.floor(v.animT / a.dur)) % a.frames.length];
    const tex = texFor(v.c.look, frame, v.facing);
    if (v.sprite.material.map !== tex) {
      v.sprite.material.map = tex;
      v.sprite.material.needsUpdate = true;
    }
  }

  function walkTo(v, tx, tz, dt) {
    const dx = tx - v.pos.x;
    const dz = tz - v.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, v.speed * dt);
    v.pos.x += (dx / d) * step;
    v.pos.z += (dz / d) * step;
    v.facing = dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z >= 0 ? 'r' : 'l';
    v.stepT = (v.stepT ?? 0) - dt;
    if (v.stepT <= 0) {
      v.stepT = 0.25;
      ctx.stepDust(v.pos);
    }
    return false;
  }

  function updateVisitor(v, dt) {
    const z = roadZ();
    switch (v.phase) {
      case 'arrive':
        v.anim = 'walk';
        v.bubble.visible = false;
        if (walkTo(v, slotX(v.slot), z, dt)) {
          v.phase = 'wait';
          v.facing = 'l'; // schaut zur Truhe
          v.hop = 1;
          emote(v, '!', 1.2);
        }
        break;
      case 'wait': {
        walkTo(v, slotX(v.slot), z, dt); // falls das Land gewachsen ist
        const urgent = v.order.time / v.order.total < 0.25;
        v.anim = urgent ? 'tap' : 'idle';
        v.facing = 'l';
        v.bubble.visible = true;
        // bei zwei Sorten abwechselnd zeigen
        v.bubbleT += dt;
        if (v.bubbleT > 1.6) {
          v.bubbleT = 0;
          v.item = (v.item + 1) % v.order.items.length;
          const b = bubbleTex(v.order.items[v.item].key, v.order.kind);
          v.bubble.material.map = b.tex;
          v.bubble.material.needsUpdate = true;
        }
        const b = bubbleTex(v.order.items[v.item].key, v.order.kind);
        const pulse = urgent ? 1 + Math.sin(performance.now() / 90) * 0.08 : 1;
        v.bubble.scale.set(b.w * PX * pulse, b.h * PX * pulse, 1);
        v.bubble.position.set(v.pos.x, HEAD + 0.15 + Math.sin(performance.now() / 400 + v.slot) * 0.03, v.pos.z);
        if (urgent) v.bubble.position.addScaledVector(SCREEN_RIGHT, Math.sin(performance.now() / 45) * 0.02);
        break;
      }
      case 'happy':
        v.t += dt;
        v.anim = v.pending > 0 ? 'idle' : 'cheer';
        if (v.pending <= 0 && !v.paid) {
          v.paid = true;
          v.t = 0;
          v.hop = 1;
          emote(v, 'heart', 1.8);
          const o = v.order;
          const tip = o.tip > 0 ? ` +${formatNumber(o.tip)} tip` : '';
          ctx.floater(`+${formatNumber(o.reward)} [[icon:coin]]${tip}`, v.pos.clone().setY(HEAD + 0.7), 'floater-gold');
          ctx.sparkles(v.pos.clone().setY(HEAD * 0.7), 12, '#ffe27a', 2);
          ctx.sfx.coin();
        }
        if (v.paid && v.t > 1.3) leave(v, 'happy');
        break;
      case 'leave':
        if (v.waveT > 0) {
          v.waveT -= dt;
          v.anim = 'wave';
          v.facing = 'r';
          break;
        }
        v.anim = 'walk';
        if (walkTo(v, endX(), z, dt)) despawn(v);
        break;
    }
    // Hüpfer beim Ankommen / Jubeln
    v.hop = Math.max(0, v.hop - dt * 2.5);
    const hopY = v.phase === 'happy' && v.paid ? Math.abs(Math.sin(v.t * 9)) * 0.12 : Math.sin(v.hop * Math.PI) * 0.15;
    v.sprite.position.set(v.pos.x, hopY, v.pos.z);
    v.shadow.position.set(v.pos.x, 0.01, v.pos.z);
    const alpha = 1 - Math.max(0, ctx.fogAt(v.pos.x, v.pos.z) - 0.25) / 0.75; // am Wartplatz voll sichtbar
    v.sprite.material.opacity = alpha;
    v.bubble.material.opacity = alpha;
    v.emote.material.opacity = alpha;
    v.shadow.visible = alpha > 0.3;
    setAnimFrame(v, dt);
    if (v.emoteT > 0) {
      v.emoteT -= dt;
      v.emote.visible = v.emoteT > 0;
      v.emote.position.set(v.pos.x, HEAD + 0.25 + (1.6 - Math.min(1.6, v.emoteT)) * 0.12, v.pos.z);
    }
  }

  function updateFlights(dt) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt / 0.6;
      if (f.t < 0) continue;
      const e = Math.min(1, f.t);
      const to = f.v.pos.clone().setY(HEAD * 0.6);
      const mid = f.from.clone().lerp(to, 0.5).setY(Math.max(f.from.y, to.y) + 1.6);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      f.sprite.position.set(a * f.from.x + b * mid.x + c * to.x, a * f.from.y + b * mid.y + c * to.y, a * f.from.z + b * mid.z + c * to.z);
      f.sprite.material.rotation += f.spin * dt;
      if (e >= 1) {
        ctx.removeSprite(f.sprite);
        flights.splice(i, 1);
        f.v.pending -= 1;
        f.v.hop = 1;
        ctx.sparkles(to, 4, '#fff3b0', 1.2);
        ctx.sfx.pop(0.6);
      }
    }
  }

  // Aufträge und Kunden abgleichen (z. B. nach dem Laden oder Offline-Fortschritt)
  function sync() {
    const list = state.orders?.list ?? [];
    const ids = new Set(list.map((o) => o.id));
    for (const o of list) {
      const v = visitors.get(o.id);
      if (!v) spawn(o, initialized);
      else v.order = o; // Objekt kann nach dem Laden neu sein
    }
    for (const v of visitors.values()) {
      if (!v.special && !ids.has(v.order.id) && (v.phase === 'wait' || v.phase === 'arrive')) leave(v, 'sad');
    }
  }
  let initialized = false;

  function update(dt) {
    sync();
    initialized = true;
    updateFlights(dt);
    for (const v of [...visitors.values()]) updateVisitor(v, dt);
  }

  // Kunde unter dem Mauszeiger (Bildschirm-Koordinaten im Canvas)
  function pickAt(x, y, toScreen, radius) {
    for (const v of visitors.values()) {
      if (v.phase !== 'wait') continue;
      const p = toScreen(v.pos.clone().setY(HEAD * 0.5));
      if (Math.hypot(p.x - x, p.y - y) < radius) return v;
    }
    return null;
  }

  return { update, pickAt, spawnMerchant, dismissMerchant, merchantLook: MERCHANT_LOOK };
}
