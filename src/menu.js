import { renderIcons, setIconText } from './icons.js';
// Hauptmenü: Titelschild, Knöpfe (Play, Settings, Achievements, Credits) und dahinter eine lebendige
// Demo-Wiese (Worker hacken, Kunden kommen). "Play" zeigt die 3 Speicherstände als Holzpaneele.
// Ein Slot wird über bootSlot() gestartet: die Seite lädt neu und startet direkt das Spiel (main.js).
import { createState, recomputeStats, advanceTime, formatNumber } from './state.js';
import { createWorld } from './world.js';
import { debugWorker } from './workers.js';
import { tickOrders, fillOrders, deliverOrder } from './orders.js';
import {
  SLOT_COUNT, slotInfo, bootSlot, clearSave, clearAllSaves, loadSettings, saveSettings,
} from './save.js';
import { ACHIEVEMENTS, loadAchievements, clearAchievements } from './achievements.js';
import { repLevelFor } from './progress.js';
import { itemIconUrl } from './itemArt.js';
import * as sfx from './sfx.js';

const VERSION = 'v0.4';

export function startMenu() {
  document.body.classList.add('mode-menu');
  const root = document.getElementById('menu');
  root.innerHTML = renderIcons(`
    <div id="menu-world"></div>
    <div id="menu-floaters"></div>
    <div class="menu-shade"></div>
    <div class="menu-side">
      <div class="menu-title">
        <div class="menu-title-axe">[[icon:axe]]</div>
        <h1>Timberline<span>Idle</span></h1>
        <p>A cozy little forest that grows while you are away</p>
      </div>
      <nav class="menu-buttons">
        <button class="menu-btn" data-panel="play"><i>[[icon:pine]]</i>Play</button>
        <button class="menu-btn" data-panel="settings"><i>[[icon:settings]]</i>Settings</button>
        <button class="menu-btn" data-panel="achievements"><i>[[icon:trophy]]</i>Achievements</button>
        <button class="menu-btn" data-panel="credits"><i>[[icon:scroll]]</i>Credits</button>
      </nav>
    </div>
    <div class="menu-stage"></div>
    <div class="menu-foot">${VERSION} · made with Three.js</div>`);

  const settings = loadSettings();
  sfx.setVolume(settings.volume, settings.muted);
  const demo = startDemoWorld(root.querySelector('#menu-world'), root.querySelector('#menu-floaters'));

  // ---- Panels ----
  const stage = root.querySelector('.menu-stage');
  const buttons = [...root.querySelectorAll('.menu-btn')];
  let current = null;
  const PANELS = { play: buildPlay, settings: buildSettings, achievements: buildAchievements, credits: buildCredits };

  function show(id) {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.panel === id));
    stage.replaceChildren();
    current = id;
    if (!id) return;
    PANELS[id](stage);
  }
  buttons.forEach((b) => b.addEventListener('click', () => {
    sfx.knock(current === b.dataset.panel ? 0.8 : 1.1, 0.2);
    show(current === b.dataset.panel ? null : b.dataset.panel);
  }));

  // Holzbrett mit Seilen, schwingt herunter
  function board(title, cls = '', delay = 0) {
    const el = document.createElement('section');
    el.className = `menu-board ${cls}`;
    el.style.animationDelay = `${delay}s`;
    el.innerHTML = renderIcons(`<header class="window-head"><h2>${title}</h2></header><div class="menu-board-body"></div>`);
    return el;
  }

  // Spiel starten: kurz abblenden, dann lädt main.js den Slot
  function launch(slot, newGame) {
    sfx.buy();
    root.classList.add('leaving');
    setTimeout(() => bootSlot(slot, newGame), 380);
  }

  // ---- Play: 3 Speicherstände ----
  function buildPlay(host) {
    const row = document.createElement('div');
    row.className = 'slot-row';
    host.appendChild(row);
    for (let n = 1; n <= SLOT_COUNT; n++) row.appendChild(slotBoard(n, (n - 1) * 0.08));
  }

  function slotBoard(n, delay) {
    const info = slotInfo(n);
    const el = board(`Slot ${n}`, info ? 'slot filled' : 'slot empty', delay);
    const body = el.querySelector('.menu-board-body');
    if (info) {
      const lvl = repLevelFor(info.reputation);
      const cols = 3 + info.land.w + info.land.e;
      const rows = 3 + info.land.n + info.land.s;
      body.innerHTML = renderIcons(`
        <div class="slot-day">Day ${info.day}</div>
        <ul class="slot-stats">
          <li><span>[[icon:coin]]</span>${formatNumber(Math.floor(info.money))} coins</li>
          <li><span>[[icon:worker]]</span>${info.workers} worker${info.workers === 1 ? '' : 's'}</li>
          <li><span>[[icon:star]]</span>Reputation ${lvl}</li>
          <li><span>[[icon:map]]</span>${cols}×${rows} plots</li>
          <li><span>[[icon:oak]]</span>${info.skills} skills</li>
          <li><span>[[icon:clock]]</span>${playTime(info.playTime)} played</li>
        </ul>
        ${info.tutorial ? '<div class="slot-note">[[icon:book]] Tutorial in progress</div>' : ''}
        <div class="slot-when">Last played ${ago(info.savedAt)}</div>
        <div class="slot-actions">
          <button class="wood-btn slot-go">[[icon:right]] Continue</button>
          <button class="small-btn danger slot-del">[[icon:trash]] Delete</button>
        </div>`);
      body.querySelector('.slot-go').addEventListener('click', () => launch(n));
      // Löschen: zweimal klicken
      const del = body.querySelector('.slot-del');
      let sure = 0;
      del.addEventListener('click', () => {
        if (performance.now() > sure) {
          sure = performance.now() + 3000;
          setIconText(del, '[[icon:warning]] Sure? Click again');
          del.classList.add('confirm');
          sfx.knock(0.8, 0.2);
          setTimeout(() => {
            if (performance.now() > sure && del.isConnected) {
              setIconText(del, '[[icon:trash]] Delete');
              del.classList.remove('confirm');
            }
          }, 3100);
          return;
        }
        clearSave(n);
        sfx.deny();
        el.replaceWith(slotBoard(n, 0));
      });
    } else {
      body.innerHTML = renderIcons(`
        <img class="slot-sprout" src="${itemIconUrl('sapling')}" alt="">
        <div class="slot-empty-text">Empty slot</div>
        <label class="wood-check"><input type="checkbox" class="slot-tut" checked><span></span>Tutorial</label>
        <div class="slot-actions">
          <button class="wood-btn slot-new">[[icon:sapling]] New game</button>
        </div>`);
      const tut = body.querySelector('.slot-tut');
      tut.addEventListener('change', () => sfx.knock(tut.checked ? 1.4 : 0.9, 0.15));
      body.querySelector('.slot-new').addEventListener('click', () => launch(n, { tutorial: tut.checked }));
    }
    return el;
  }

  // ---- Settings ----
  function buildSettings(host) {
    const el = board('[[icon:settings]] Settings', 'wide');
    host.appendChild(el);
    const body = el.querySelector('.menu-board-body');
    body.innerHTML = renderIcons(`
      <h3 class="shop-title">[[icon:sound]] Sound</h3>
      <div class="settings-row">
        <button class="small-btn mute-btn"></button>
        <input type="range" class="vol-range" min="0" max="100" step="5">
      </div>
      <h3 class="shop-title">[[icon:save]] Data</h3>
      <p class="hint">Save slots and achievements live in this browser. Use [[icon:export]] Export in the in-game settings to keep a copy.</p>
      <div class="settings-row"><button class="small-btn danger wipe-btn">[[icon:trash]] Delete all saves & achievements</button></div>`);
    const mute = body.querySelector('.mute-btn');
    const range = body.querySelector('.vol-range');
    const apply = () => {
      sfx.setVolume(settings.volume, settings.muted);
      saveSettings(settings);
      setIconText(mute, settings.muted ? '[[icon:muted]] Sound off' : '[[icon:sound]] Sound on');
    };
    range.value = Math.round(settings.volume * 100);
    apply();
    mute.addEventListener('click', () => {
      settings.muted = !settings.muted;
      apply();
      sfx.knock(1.2);
    });
    range.addEventListener('input', () => {
      settings.volume = Number(range.value) / 100;
      settings.muted = false;
      apply();
    });
    range.addEventListener('change', () => sfx.knock(1.2));
    const wipe = body.querySelector('.wipe-btn');
    let sure = 0;
    wipe.addEventListener('click', () => {
      if (performance.now() > sure) {
        sure = performance.now() + 3000;
        setIconText(wipe, '[[icon:warning]] Everything will be gone! Click again');
        return;
      }
      clearAllSaves();
      clearAchievements();
      sfx.deny();
      setIconText(wipe, '[[icon:check]] All data deleted');
      wipe.disabled = true;
    });
  }

  // ---- Achievements ----
  function buildAchievements(host) {
    const { unlocked } = loadAchievements();
    const got = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
    const el = board('[[icon:trophy]] Achievements', 'wide');
    host.appendChild(el);
    el.querySelector('.menu-board-body').innerHTML = renderIcons(`
      <div class="ach-progress"><b>${got} / ${ACHIEVEMENTS.length}</b> unlocked
        <div class="fill-bar"><div class="fill-bar-in" style="width:${(got / ACHIEVEMENTS.length) * 100}%"></div></div>
      </div>
      <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
        const at = unlocked[a.id];
        return `<div class="ach-card ${at ? 'got' : 'locked'}" title="${at ? `Unlocked ${new Date(at).toLocaleDateString()}` : 'Locked'}">
          <span class="ach-icon">${a.icon}</span>
          <div><b>${a.name}</b><span>${a.desc}</span></div>
        </div>`;
      }).join('')}</div>`);
  }

  // ---- Credits ----
  function buildCredits(host) {
    const el = board('[[icon:scroll]] Credits', 'narrow');
    host.appendChild(el);
    el.querySelector('.menu-board-body').innerHTML = renderIcons(`
      <div class="credits">
        <p class="credits-big">[[icon:axe]] Timberline Idle</p>
        <p>Game design, pixel art & code<br><b>The Timberline Idle team</b></p>
        <p>Built with <b>Three.js</b> & <b>Vite</b><br>All art and sounds are generated in code</p>
        <p>Thanks for playing! [[icon:pine]]</p>
      </div>`);
  }

  return { show, demo };
}

// ---- Demo-Wiese hinter dem Menü (kein Speichern, keine Hinweise) ----
function startDemoWorld(container, floaters) {
  const state = createState();
  state.tutorial = 'done';
  state.skills = { haul: 1, hut: 1, bunk: 1, orders: 1, chest: 4, autosell: 1, fertilizer: 2, plot_tree: 5 };
  state.reputation = 16;
  recomputeStats(state);
  state.workers = [debugWorker(), debugWorker()];
  state.workerCap = 2;
  state.inventory.sapling = 30;
  state.hour = 9.5;
  const world = createWorld(container, floaters, state, null);
  for (const [sp, i, j, g] of [['oak', 1, 1, 0.97], ['birch', 6, 2, 0.6], ['oak', 2, 6, 0.99], ['pine', 7, 6, 0.4], ['birch', 5, 7, 0.85], ['oak', 1, 4, 0.5], ['pine', 7, 1, 0.9]]) {
    world.debug.plantAt(sp, i, j, g);
  }
  // Wiese rechts neben dem Menü zeigen
  world.lookAt(-2.4, 2.4);
  sfx.setDuck(0.5); // im Menü alles etwas leiser (Hacken im Hintergrund)
  fillOrders(state, false);

  // Ab und zu wird ein Kunde beliefert (damit die Kunden jubeln)
  let deliverT = 12;
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    advanceTime(state, dt, { quiet: true });
    world.update(dt, dt);
    tickOrders(state, dt, false);
    deliverT -= dt;
    if (deliverT <= 0) {
      deliverT = 14 + Math.random() * 10;
      const o = state.orders?.list.find((x) => x.time < x.total - 8);
      if (o) {
        for (const { key, n } of o.items) state.inventory[key] = (state.inventory[key] ?? 0) + n;
        deliverOrder(state, o.id);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { state, world };
}

// ---- Formatierung ----
function playTime(sec) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
function ago(ts) {
  if (!ts) return 'a while ago';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
