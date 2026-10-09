import { setIconText, renderIcons, plainIconText, iconUrl } from './icons.js';
// HUD, linke Tabs, Fenster und Skill Tree.
import {
  SPEEDS, ITEM_DEFS, SOIL_DEFS, formatNumber, formatClock, isDay, recomputeStats,
  chestUsed, itemPrice, inventoryValue, sellItem, sellAll, isTabUnlocked, soilPrice, autoSellRule, orderReserve,
} from './state.js';
import { emit } from './events.js';
import {
  STAT_KEYS, STAT_INFO, TASKS, TRAITS, ROMAN, PAYDAY_HOUR, DEBT_GARNISH, rerollPrice, levelCap,
  rarityOf, ensureBoard, refreshBoard, hire, hirePrice, fire, dailyWage, totalWages, xpForLevel, paydayShortfall,
} from './workers.js';
import { fellaPortraitUrl, customerPortraitUrl } from './fellas.js';
import {
  CUSTOMERS, customerOf, hearts, heartsFor, perkTier, LOVE_LEVELS, MAX_HEARTS, PERK_HEARTS,
} from './customers.js';
import { saplingBuyPrice, speciesOf, isSpeciesUnlocked, SPECIES_ORDER } from './species.js';
import { BUILDING_DEFS, BUILDING_ORDER, sawmillLevel } from './buildings.js';
import { ensureOrders, canDeliver, deliverOrder, declineOrder, orderSlots, ORDER_KINDS, tipNow } from './orders.js';
import { REP_LEVELS, REP_UNLOCKS, REP_PRICE_BONUS, nextRepLevelPoints } from './progress.js';
import { itemIconUrl } from './itemArt.js';
import { bedCanvas } from './textures.js';
import { SKILL_TREES } from './skilltrees.js';
import {
  PLOT_SIZE, SIDES, SIDE_INFO, TREE_SLOTS_PER_ROW, landOf, landPlots, canExpand, rowPlots, rowPrice,
} from './land.js';
import { ICONS } from './icons.js';
import {
  exportSave, importSave, resetGame, loadSettings, saveSettings, backToMenu, getActiveSlot,
} from './save.js';
import { SLICE_TONES, gemUrl } from './woodtex.js';
import * as sfx from './sfx.js';
import { knock } from './sfx.js';

const $ = (id) => document.getElementById(id);

function setText(el, text) {
  setIconText(el, text);
}

// CSS-Animation neu starten (Klasse entfernen, Reflow erzwingen, wieder setzen)
function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---------- Klick-Effekte ----------
const fxLayer = document.createElement('div');
fxLayer.id = 'fx-layer';
document.body.appendChild(fxLayer);

// Pixelige Holzsplitter, die vom Klickpunkt wegfliegen
function spawnChips(x, y, accent) {
  const colors = ['#f0c070', '#c98a4a', '#8a4f24', accent];
  for (let i = 0; i < 12; i++) {
    const d = document.createElement('div');
    d.className = 'chip';
    const size = Math.random() < 0.5 ? 3 : 6;
    d.style.width = d.style.height = size + 'px';
    d.style.background = colors[i % colors.length];
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    fxLayer.appendChild(d);
    const ang = Math.random() * Math.PI * 2;
    const v = 28 + Math.random() * 38;
    const dx = Math.cos(ang) * v;
    const dy = Math.sin(ang) * v - 24;
    d.animate(
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dx}px, ${dy + 46}px)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 220, easing: 'ease-out' },
    ).onfinish = () => d.remove();
    setTimeout(() => d.remove(), 1200); // Fallback
  }
}

// Knopf eindrücken, Medaillon aufblitzen lassen, Splitter + Klopfgeräusch
function pressFx(btn, ev, accent) {
  knock(btn.classList.contains('active') ? 0.8 : 1);
  restartAnim(btn, 'bump');
  const r = btn.getBoundingClientRect();
  const fromPointer = ev && ev.detail > 0;
  spawnChips(fromPointer ? ev.clientX : r.left + r.width / 2, fromPointer ? ev.clientY : r.top + r.height / 2, accent);
}

function makeTabButton({ icon, label, accent }, onClick) {
  const b = document.createElement('button');
  b.className = 'tab-btn';
  b.style.setProperty('--accent', accent);
  b.style.setProperty('--gem', gemUrl(accent));
  b.innerHTML = renderIcons(`<span class="tab-gem">${ICONS[icon]}</span><span class="tab-label">${label}</span>`);
  b.addEventListener('click', (ev) => {
    pressFx(b, ev, accent);
    onClick();
  });
  return b;
}

export function createUi(state, world) {
  // ---------- HUD ----------
  const moneyEl = $('money-value');
  const moneyBox = $('hud-money');
  const woodEl = $('wood-value');
  const timeEl = $('time-value');
  const timeIcon = $('time-icon');
  const workerEl = $('worker-value');
  const treesBox = $('hud-trees');
  const treesEl = $('trees-value');
  const treesBadge = $('trees-badge');
  // Klick auf "Trees": ein offenes Beet setzen
  treesBox.addEventListener('click', () => {
    if (!world.treeSlots().pending) return;
    knock(1.3);
    closeWindow();
    world.beginBedPlacement();
  });

  const speedGroup = $('speed-group');
  const speedButtons = SPEEDS.map((s) => {
    const b = document.createElement('button');
    b.className = 'speed-btn';
    setIconText(b, 'x' + s);
    b.addEventListener('click', () => {
      state.speed = s;
    });
    speedGroup.appendChild(b);
    return b;
  });

  // ---------- Fenster ----------
  const windowEl = $('window');
  const windowTitle = $('window-title');
  const windowBody = $('window-body');
  let activeWindow = null; // { id, refresh }

  const WINDOWS = {
    board: { icon: 'note', label: 'Board', accent: '#d9503c', title: 'Notice Board', build: buildBoard },
    management: { icon: 'person', label: 'Team', accent: '#4a90d9', title: 'Team', build: buildManagement },
    plots: { icon: 'plots', label: 'Plots', accent: '#5aa83c', title: 'Plots & Map', build: buildPlots },
    chest: { icon: 'chest', label: 'Chest', accent: '#e0a82a', title: 'Chest & Market', build: buildChest },
    orders: { icon: 'orders', label: 'Orders', accent: '#3aa8a0', title: 'Orders & Reputation', build: buildOrders },
    buildings: { icon: 'house', label: 'Build', accent: '#9a6ad9', title: 'Buildings & Soils', build: buildBuildings },
  };

  // Sperre fürs Tutorial: gate(action, id) entscheidet, ob eine Aktion gerade erlaubt ist
  let gate = () => true;
  const denyFx = (el) => {
    sfx.deny();
    if (el) restartAnim(el, 'denied');
  };

  const sideTabs = $('side-tabs');
  const tabButtons = {};
  for (const [id, w] of Object.entries(WINDOWS)) {
    const b = makeTabButton(w, () => {
      if (!gate('tab', id)) return denyFx(b);
      if (activeWindow?.id === id) closeWindow();
      else openWindow(id);
    });
    b.hidden = !isTabUnlocked(state, id);
    b.addEventListener('animationend', () => b.classList.remove('tab-reveal', 'denied'));
    sideTabs.appendChild(b);
    tabButtons[id] = b;
  }

  // Neu freigeschaltete Tabs erscheinen mit Animation
  function refreshTabs() {
    for (const [id, b] of Object.entries(tabButtons)) {
      const unlocked = isTabUnlocked(state, id);
      if (unlocked && b.hidden) {
        b.hidden = false;
        restartAnim(b, 'tab-reveal');
        emit('tabUnlocked', { id });
      } else if (!unlocked) b.hidden = true;
    }
  }

  const PANELS = {
    building: { title: 'Building', build: (body) => buildBuildingPanel(body) },
    settings: { title: '[[icon:settings]] Settings', build: (body) => buildSettings(body) },
    offline: { title: '[[icon:sun]] Welcome back!', build: (body) => buildOffline(body) },
    merchant: { title: '[[icon:backpack]] Traveling Merchant', build: (body) => buildMerchant(body) },
    newBed: { title: '[[icon:oak]] A new tree bed!', build: (body) => buildNewBed(body) },
  };

  // ---------- Einstellungen: Ton, Spielstand exportieren/importieren, neu anfangen ----------
  const settings = loadSettings();
  sfx.setVolume(settings.volume, settings.muted);
  const settingsBtn = $('settings-btn');
  settingsBtn.addEventListener('click', (ev) => {
    if (!gate('settings')) return denyFx(settingsBtn);
    pressFx(settingsBtn, ev, '#c9b89a');
    if (activeWindow?.id === 'settings') closeWindow();
    else openWindow('settings');
  });

  function buildSettings(body) {
    body.innerHTML = renderIcons(`
      <div class="settings-group">
        <h3 class="shop-title">[[icon:mouse]] Game · Slot ${getActiveSlot()}</h3>
        <div class="settings-row">
          <button class="small-btn menu-back-btn">[[icon:hut]] Save & main menu</button>
        </div>
      </div>
      <div class="settings-group">
        <h3 class="shop-title">[[icon:sound]] Sound</h3>
        <div class="settings-row">
          <button class="small-btn mute-btn"></button>
          <input type="range" class="vol-range" min="0" max="100" step="5">
        </div>
      </div>
      <div class="settings-group">
        <h3 class="shop-title">[[icon:save]] Save</h3>
        <p class="hint">The game saves itself every few seconds. Export a copy to move it to another browser.</p>
        <div class="settings-row">
          <button class="small-btn export-btn">[[icon:export]] Export</button>
          <button class="small-btn import-btn">[[icon:import]] Import</button>
        </div>
        <textarea class="save-text" placeholder="Export puts your save here · paste a save and press Import" spellcheck="false"></textarea>
        <div class="settings-row">
          <button class="small-btn danger reset-btn">[[icon:trash]] Start over</button>
        </div>
      </div>`);
    body.querySelector('.menu-back-btn').addEventListener('click', () => {
      knock(1.1);
      backToMenu(state, world);
    });
    const muteBtn = body.querySelector('.mute-btn');
    const range = body.querySelector('.vol-range');
    const text = body.querySelector('.save-text');
    const resetBtn = body.querySelector('.reset-btn');
    const apply = () => {
      sfx.setVolume(settings.volume, settings.muted);
      saveSettings(settings);
      setText(muteBtn, settings.muted ? '[[icon:muted]] Sound off' : '[[icon:sound]] Sound on');
    };
    range.value = Math.round(settings.volume * 100);
    apply();
    muteBtn.addEventListener('click', () => {
      settings.muted = !settings.muted;
      apply();
      knock(1.2);
    });
    range.addEventListener('input', () => {
      settings.volume = Number(range.value) / 100;
      settings.muted = false;
      apply();
    });
    range.addEventListener('change', () => knock(1.2));
    body.querySelector('.export-btn').addEventListener('click', (ev) => {
      text.value = exportSave(state, world);
      text.select();
      navigator.clipboard?.writeText(text.value).catch(() => {});
      pressFx(ev.currentTarget, ev, '#7fc95e');
    });
    const importBtn = body.querySelector('.import-btn');
    importBtn.addEventListener('click', () => {
      if (!text.value.trim() || !importSave(text.value)) {
        denyFx(importBtn);
        text.placeholder = plainIconText('[[icon:close]] That is not a valid save');
        text.value = '';
      }
    });
    // Neu anfangen: zweimal klicken (wie beim Feuern)
    let confirmUntil = 0;
    resetBtn.addEventListener('click', () => {
      if (performance.now() > confirmUntil) {
        confirmUntil = performance.now() + 3000;
        setText(resetBtn, '[[icon:warning]] Sure? Everything is lost!');
        resetBtn.classList.add('confirm');
        return;
      }
      resetGame();
    });
    return () => {
      if (confirmUntil && performance.now() > confirmUntil) {
        confirmUntil = 0;
        setText(resetBtn, '[[icon:trash]] Start over');
        resetBtn.classList.remove('confirm');
      }
    };
  }

  function openWindow(id) {
    const def = WINDOWS[id] ?? PANELS[id];
    windowBody.replaceChildren();
    setIconText(windowTitle, def.title);
    activeWindow = { id, refresh: def.build(windowBody) };
    windowEl.hidden = false;
    windowEl.classList.remove('lift');
    restartAnim(windowEl, 'drop'); // Schild schwingt herunter
    for (const [k, b] of Object.entries(tabButtons)) b.classList.toggle('active', k === id);
    emit('windowOpened', { id });
  }

  function closeWindow() {
    activeWindow = null;
    for (const b of Object.values(tabButtons)) b.classList.remove('active');
    windowEl.classList.remove('drop');
    windowEl.classList.add('lift'); // wird nach der Animation versteckt
    setTimeout(finishLift, 260); // Fallback, falls die Animation nicht läuft (z. B. Tab im Hintergrund)
  }
  function finishLift() {
    if (!windowEl.classList.contains('lift')) return;
    windowEl.hidden = true;
    windowEl.classList.remove('lift');
  }
  windowEl.addEventListener('animationend', (ev) => {
    if (ev.target === windowEl) finishLift();
  });
  $('window-close').addEventListener('click', () => {
    knock(1.25, 0.16);
    closeWindow();
  });

  // ---------- Worker: Board (einstellen) und Team (verwalten) ----------
  const PORTRAIT = fellaPortraitUrl(3);

  // Werte als farbige Pixel-Balken (10 Kästchen)
  const statBars = (stats, small = false) => STAT_KEYS.map((k) => `
    <div class="stat-row${small ? ' small' : ''}" title="${STAT_INFO[k].name}">
      <span class="stat-name" style="color:${STAT_INFO[k].color}">${small ? STAT_INFO[k].short : STAT_INFO[k].name}</span>
      <span class="pips">${Array.from({ length: 10 }, (_, i) => `<i style="${i < stats[k] ? `background:${STAT_INFO[k].color}` : ''}"></i>`).join('')}</span>
    </div>`).join('');

  // Eigenschaften als kleine Schilder (grün = gut, rot = schlecht), Details beim Drüberfahren
  const traitChips = (w) => (w.traits ?? []).map((t) => {
    const def = TRAITS[t.id];
    return `<span class="trait ${def.good ? 'good' : 'bad'}" title="${def.name} ${ROMAN[t.lvl]}: ${def.desc(t.lvl)}">${def.icon} ${def.name} ${ROMAN[t.lvl]}</span>`;
  }).join('');

  function buildBoard(body) {
    ensureBoard(state);
    let shownDay = -1;
    let shownKey = '';

    function render() {
      shownDay = state.board.day;
      shownKey = state.board.notes.map((n) => n?.id ?? '-').join();
      const notes = state.board.notes.map((c, idx) => {
        if (!c) return '<div class="note cand taken"><span class="taken-mark">[[icon:check]]</span><b>Hired!</b><span class="taken-sub">New notes tomorrow</span></div>';
        const r = rarityOf(c.rarity);
        return `
          <div class="note cand" style="--rar:${r.color}" data-idx="${idx}">
            <div class="note-rarity">${r.name}</div>
            <img class="note-portrait" src="${PORTRAIT}" alt="">
            <b class="note-name">${c.name}</b>
            <div class="note-stats">${statBars(c.stats)}</div>
            <div class="trait-list">${traitChips(c) || '<span class="trait none">No traits</span>'}</div>
            <div class="note-wage">Wage [[icon:coin]] ${dailyWage(c, state)} / day</div>
            <button class="small-btn hire-btn"></button>
          </div>`;
      }).join('');
      body.innerHTML = renderIcons(`
        <p class="hint">[[icon:worker]] Hire a worker · <b class="slots"></b> · [[icon:clock]] new notes every day</p>
        <div class="notes">${notes}</div>
        <button class="wood-btn reroll-btn">[[icon:dice]] New notes · [[icon:coin]] ${rerollPrice(state)}</button>`);
      body.querySelectorAll('.note.cand[data-idx]').forEach((note) => {
        const idx = Number(note.dataset.idx);
        const btn = note.querySelector('.hire-btn');
        btn.addEventListener('click', (ev) => {
          if (!gate('hire')) return denyFx(btn);
          const worker = hire(state, idx);
          if (!worker) return denyFx(btn);
          sfx.buy();
          spawnChips(ev.clientX, ev.clientY, rarityOf(worker.rarity).color);
          spawnChips(ev.clientX, ev.clientY, '#ffe27a');
          emit('workerHired', { id: worker.id });
          render();
        });
      });
      const reroll = body.querySelector('.reroll-btn');
      reroll.addEventListener('click', (ev) => {
        if (state.money < rerollPrice(state)) return denyFx(reroll);
        state.money -= rerollPrice(state);
        refreshBoard(state);
        knock(1.1);
        spawnChips(ev.clientX, ev.clientY, '#c9b89a');
        render();
      });
    }
    render();

    return () => {
      ensureBoard(state);
      const key = state.board.notes.map((n) => n?.id ?? '-').join();
      if (state.board.day !== shownDay || key !== shownKey) render();
      const free = state.workerCap - state.workers.length;
      setText(body.querySelector('.slots'), `slots ${state.workers.length} / ${state.workerCap}`);
      body.querySelectorAll('.note.cand[data-idx]').forEach((note) => {
        const c = state.board.notes[Number(note.dataset.idx)];
        if (!c) return;
        const price = hirePrice(state, c);
        const btn = note.querySelector('.hire-btn');
        setText(btn, free > 0 ? `[[icon:coin]] ${formatNumber(price)} · Hire` : 'No free slot');
        btn.disabled = free <= 0 || state.money < price;
      });
      body.querySelector('.reroll-btn').disabled = state.money < rerollPrice(state);
    };
  }

  function buildManagement(body) {
    let shownKey = '';
    let confirmFire = null;

    const workersKey = () => state.workers.map((w) => w.id + w.priorities.join() + w.level).join('|');
    function render() {
      shownKey = workersKey();
      if (!state.workers.length) {
        body.innerHTML = renderIcons('<p class="hint">[[icon:worker]] No workers yet · hire them on the [[icon:scroll]] Board</p>');
        return;
      }
      body.innerHTML = renderIcons(`
        <p class="hint">[[icon:worker]] Workers pick tasks on their own · click a task to make it their top priority</p>
        <div class="wage-sum">[[icon:coin]] Daily wages <b class="wage-total"></b> · [[icon:sun]] payday ${String(PAYDAY_HOUR).padStart(2, '0')}:00</div>
        <div class="worker-list">${state.workers.map((w) => {
          const r = rarityOf(w.rarity);
          const prios = w.priorities.map((t, i) => `<button class="prio-chip${i === 0 ? ' top' : ''}" data-task="${t}"><span class="prio-n">${i + 1}</span>${TASKS[t].icon} ${TASKS[t].name}</button>`).join('');
          return `
            <div class="worker-row" data-id="${w.id}" style="--rar:${r.color}">
              <img class="worker-portrait" src="${PORTRAIT}" alt="">
              <div class="worker-main">
                <div class="worker-head"><b>${w.name}</b><span class="lvl-tag">Lv ${w.level}</span><span class="rar-tag">${r.name}</span><span class="wage-tag">[[icon:coin]] ${dailyWage(w, state)}/day</span></div>
                <div class="xp-bar" title="XP"><i></i></div>
                <div class="worker-status"></div>
                <div class="trait-list">${traitChips(w)}</div>
                <div class="worker-prios">${prios}</div>
              </div>
              <div class="worker-stats">${statBars(w.stats, true)}</div>
              <button class="small-btn fire-btn">Fire</button>
            </div>`;
        }).join('')}</div>`);

      body.querySelectorAll('.worker-row').forEach((row) => {
        const w = state.workers.find((x) => x.id === row.dataset.id);
        row.querySelectorAll('.prio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            // angeklickte Aufgabe nach vorne
            w.priorities = [chip.dataset.task, ...w.priorities.filter((t) => t !== chip.dataset.task)];
            knock(1.3, 0.14);
            render();
          });
        });
        const fireBtn = row.querySelector('.fire-btn');
        fireBtn.addEventListener('click', () => {
          if (confirmFire !== w.id) {
            confirmFire = w.id; // erst nachfragen
            setIconText(fireBtn, 'Sure?');
            fireBtn.classList.add('confirm');
            setTimeout(() => {
              if (confirmFire === w.id) {
                confirmFire = null;
                if (fireBtn.isConnected) {
                  setIconText(fireBtn, 'Fire');
                  fireBtn.classList.remove('confirm');
                }
              }
            }, 2500);
            return;
          }
          confirmFire = null;
          fire(state, w.id);
          knock(0.8);
          render();
        });
      });
    }
    render();

    return () => {
      if (workersKey() !== shownKey) render();
      const total = body.querySelector('.wage-total');
      if (total) setText(total, `[[icon:coin]] ${formatNumber(totalWages(state))}`);
      body.querySelectorAll('.worker-row').forEach((row) => {
        const w = state.workers.find((x) => x.id === row.dataset.id);
        setText(row.querySelector('.worker-status'), world.fellaStatus(row.dataset.id));
        const pct = w.level >= levelCap(state) ? 100 : Math.min(100, (w.xp / xpForLevel(w.level)) * 100);
        row.querySelector('.xp-bar i').style.width = pct + '%';
      });
    };
  }

  // Land: Karte (gedreht wie die Welt) + Kauf einer ganzen Plot-Reihe je Seite
  function buildPlots(body) {
    let shownKey = '';
    let btnEls = [];
    const landKey = () => SIDES.map((s) => landOf(state)[s]).join();

    function render() {
      shownKey = landKey();
      const l = landOf(state);
      const { cols, rows } = landPlots(state);
      // Karte: Land + Rand mit kaufbaren Reihen; 45° gedreht, damit die Richtungen zum Bildschirm passen
      const W = cols + 2;
      const H = rows + 2;
      const cell = Math.floor(Math.min(24, 300 / (W + H)));
      const chestX = 1 + l.w + 1;
      const chestY = 1 + l.n + 1;
      const cells = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const inX = x >= 1 && x <= cols;
          const inY = y >= 1 && y <= rows;
          const side = inX && y === 0 ? 'n' : inX && y === H - 1 ? 's' : inY && x === 0 ? 'w' : inY && x === W - 1 ? 'e' : null;
          if (inX && inY) cells.push(`<div class="plot-cell owned">${x === chestX && y === chestY ? '<span>[[icon:chest]]</span>' : ''}</div>`);
          else if (side && canExpand(state, side)) cells.push(`<div class="plot-cell buyable" data-side="${side}"><span>+</span></div>`);
          else cells.push('<div class="plot-cell void"></div>');
        }
      }
      const box = ((W + H) * cell) / Math.SQRT2; // Größe der gedrehten Karte
      // Knöpfe in Pfeil-Reihenfolge: [[icon:north-west]] [[icon:north-east]] [[icon:south-west]] [[icon:south-east]]
      const buttons = ['w', 'n', 's', 'e'].map((s) => `<button class="small-btn land-btn" data-side="${s}"></button>`).join('');
      body.innerHTML = renderIcons(`
        <p class="hint">[[icon:map]] Buy a whole row of plots on one side · [[icon:oak]] +${TREE_SLOTS_PER_ROW} tree bed per row · [[icon:mouse]] drag the ground to look around</p>
        <div class="land-info">Land <b>${cols}×${rows}</b> plots · ${cols * PLOT_SIZE}×${rows * PLOT_SIZE} tiles · [[icon:oak]] Tree beds <b class="land-trees"></b></div>
        <div class="land-layout">
          <div class="plot-map" style="width:${box}px;height:${box}px">
            <div class="plot-grid" style="--cols:${W};--cell:${cell}px">${cells.join('')}</div>
          </div>
          <div class="land-buttons">${buttons}</div>
        </div>`);

      const map = body.querySelector('.plot-map');
      const hover = (side) => {
        if (side) map.dataset.hover = side;
        else delete map.dataset.hover;
      };
      const buy = (side, el, ev) => {
        if (!gate('land')) return denyFx(el);
        if (!world.expandLand(side)) return denyFx(el);
        spawnChips(ev.clientX, ev.clientY, '#7fc95e');
        spawnChips(ev.clientX, ev.clientY, '#ffe27a');
      };
      body.querySelectorAll('.plot-cell.buyable').forEach((c) => {
        c.addEventListener('mouseenter', () => hover(c.dataset.side));
        c.addEventListener('mouseleave', () => hover(null));
        c.addEventListener('click', (ev) => buy(c.dataset.side, c, ev));
      });
      btnEls = [...body.querySelectorAll('.land-btn')].map((btn) => {
        const side = btn.dataset.side;
        btn.addEventListener('mouseenter', () => hover(side));
        btn.addEventListener('mouseleave', () => hover(null));
        btn.addEventListener('click', (ev) => buy(side, btn, ev));
        return { side, btn };
      });
    }
    render();

    return () => {
      if (landKey() !== shownKey) render();
      const slots = world.treeSlots();
      setText(body.querySelector('.land-trees'), `${slots.used} / ${slots.cap}`);
      for (const { side, btn } of btnEls) {
        const { arrow, name } = SIDE_INFO[side];
        if (!canExpand(state, side)) {
          setText(btn, `${arrow} ${name} · max`);
          btn.disabled = true;
          continue;
        }
        const price = rowPrice(state, side);
        setText(btn, `${arrow} ${name} · ${rowPlots(state, side)} plots · [[icon:coin]] ${formatNumber(price)}`);
        btn.disabled = state.money < price;
        body.querySelectorAll(`.plot-cell.buyable[data-side="${side}"]`).forEach((c) => c.classList.toggle('poor', btn.disabled));
      }
    };
  }

  // Pixel-Icons der Items (aus denselben Grafiken wie in der Welt)
  const ITEM_ICONS = Object.fromEntries(Object.keys(ITEM_DEFS).map((k) => [k, itemIconUrl(k)]));
  // Zeile in der Truhe zeigen? Freigeschaltete Holzarten, Bretter erst mit Sägewerk, sonst nur wenn vorhanden
  const itemVisible = (key) => {
    const def = ITEM_DEFS[key];
    if ((state.inventory[key] ?? 0) > 0 || !def.species) return true;
    if (!isSpeciesUnlocked(state, def.species)) return false;
    return def.type !== 'plank' || world.hasSawmill();
  };
  const SOIL_ICON = iconUrl('soil');

  function sellFx(ev, earned) {
    if (earned <= 0) return;
    emit('sold', { earned });
    sfx.coin();
    spawnChips(ev.clientX, ev.clientY, '#f0c84a');
    spawnChips(ev.clientX, ev.clientY, '#ffe27a');
  }

  // Truhe: alle Items mit Icon, Anzahl, Wert und eigenem Verkaufsknopf; oben Gesamtwert + Alles verkaufen
  function buildChest(body) {
    const rows = Object.entries(ITEM_DEFS).map(([key, def]) => `
      <div class="item-row" data-key="${key}">
        <img class="item-icon" src="${ITEM_ICONS[key]}" alt="">
        <div class="item-info"><b>${def.name}</b><span class="item-unit"></span>
          <div class="auto-ctl" hidden>
            <button class="auto-toggle" title="Auto-Sell this item when the chest is full"></button>
            <span class="keep-label">keep</span>
            <button class="keep-btn keep-dec" title="−1 · Shift: −10">−</button>
            <b class="keep-n"></b>
            <button class="keep-btn keep-inc" title="+1 · Shift: +10">+</button>
          </div>
        </div>
        <div class="item-count"></div>
        <div class="item-value"></div>
        <div class="item-actions">
          ${def.plantable ? '<button class="small-btn buy-sapling-btn"></button><button class="small-btn plant-btn">Plant</button>' : ''}
          <button class="small-btn sell-btn">Sell</button>
        </div>
      </div>`).join('');
    body.innerHTML = renderIcons(`
      <div class="chest-summary">
        <div class="chest-total"><span>Total value</span><b id="chest-total"></b></div>
        <button class="wood-btn" id="chest-sell-all">Sell all</button>
      </div>
      <div class="chest-fill"><span id="chest-used"></span><div class="fill-bar"><div class="fill-bar-in" id="chest-bar"></div></div></div>
      <div class="chest-trees">[[icon:oak]] Tree beds <b id="chest-trees"></b> · trees only grow in beds · click a free bed or stump to plant</div>
      <div class="auto-info" id="auto-info" hidden>[[icon:repeat]] Auto-Sell: chest full [[icon:right]] sells <b>[[icon:check]]</b> items · keeps the set amount and what [[icon:orders]] orders need</div>
      <div class="item-list">${rows}</div>`);

    const totalE = body.querySelector('#chest-total');
    const usedE = body.querySelector('#chest-used');
    const barE = body.querySelector('#chest-bar');
    const sellAllBtn = body.querySelector('#chest-sell-all');
    sellAllBtn.addEventListener('click', (ev) => {
      if (!gate('sell', 'all')) return denyFx(sellAllBtn);
      sellFx(ev, sellAll(state));
    });

    const rowEls = [...body.querySelectorAll('.item-row')].map((row) => {
      const key = row.dataset.key;
      const sellBtn = row.querySelector('.sell-btn');
      sellBtn.addEventListener('click', (ev) => {
        if (!gate('sell', key)) return denyFx(sellBtn);
        sellFx(ev, sellItem(state, key));
      });
      // Setzling kaufen: wird teurer, je mehr Baumplätze belegt sind
      const buyBtn = row.querySelector('.buy-sapling-btn');
      const species = ITEM_DEFS[key].species;
      buyBtn?.addEventListener('click', (ev) => {
        const price = saplingBuyPrice(world.treeSlots().used, state.saplingPriceMult, species);
        if (!gate('buy') || state.money < price || chestUsed(state) >= state.woodCap) return denyFx(buyBtn);
        state.money -= price;
        state.inventory[key] += 1;
        sfx.coin();
        spawnChips(ev.clientX, ev.clientY, '#7fc95e');
      });
      row.querySelector('.plant-btn')?.addEventListener('click', () => {
        if (!gate('plant')) return denyFx();
        knock(1.2);
        closeWindow();
        world.beginPlanting(species);
      });
      // Auto-Verkauf: an/aus und wie viele bleiben sollen
      const rule = autoSellRule(state, key);
      const toggle = row.querySelector('.auto-toggle');
      toggle.addEventListener('click', () => {
        rule.on = !rule.on;
        knock(rule.on ? 1.3 : 0.9, 0.15);
      });
      for (const [sel, dir] of [['.keep-dec', -1], ['.keep-inc', 1]]) {
        row.querySelector(sel).addEventListener('click', (ev) => {
          rule.keep = Math.max(0, rule.keep + dir * (ev.shiftKey ? 10 : 1));
          knock(1.4, 0.1);
        });
      }
      return {
        key, row, rule, toggle,
        auto: row.querySelector('.auto-ctl'),
        keep: row.querySelector('.keep-n'),
        unit: row.querySelector('.item-unit'),
        count: row.querySelector('.item-count'),
        value: row.querySelector('.item-value'),
        sell: row.querySelector('.sell-btn'),
        plant: row.querySelector('.plant-btn'),
        buy: buyBtn,
      };
    });

    return () => {
      const used = chestUsed(state);
      setText(totalE, `[[icon:coin]] ${formatNumber(inventoryValue(state))}`);
      setText(usedE, `Used: ${used} / ${state.woodCap} slots`);
      barE.style.width = Math.min(100, (used / state.woodCap) * 100) + '%';
      barE.classList.toggle('full', used >= state.woodCap);
      const slots = world.treeSlots();
      setText(body.querySelector('#chest-trees'), `${slots.used} / ${slots.cap}`);
      sellAllBtn.disabled = used === 0;
      body.querySelector('#auto-info').hidden = !state.autoSell;
      for (const r of rowEls) {
        r.auto.hidden = !state.autoSell;
        if (state.autoSell) {
          setText(r.toggle, r.rule.on ? '[[icon:repeat]] Auto [[icon:check]]' : '[[icon:repeat]] Auto [[icon:close]]');
          r.toggle.classList.toggle('on', r.rule.on);
          // offene Aufträge halten zusätzlich Ware zurück
          const reserved = orderReserve(state, r.key);
          setText(r.keep, reserved > r.rule.keep ? `${r.rule.keep} · [[icon:orders]] ${reserved}` : String(r.rule.keep));
          r.keep.title = plainIconText(reserved > 0 ? `${reserved} kept for open orders` : '');
          r.auto.classList.toggle('off', !r.rule.on);
        }
        const n = state.inventory[r.key];
        const price = itemPrice(state, r.key);
        setText(r.unit, `[[icon:coin]] ${formatNumber(price)} each`);
        setText(r.count, `×${n}`);
        setText(r.value, `[[icon:coin]] ${formatNumber(n * price)}`);
        r.row.hidden = !itemVisible(r.key);
        r.row.classList.toggle('empty', n === 0);
        r.sell.disabled = n === 0;
        if (r.plant) r.plant.disabled = n === 0;
        if (r.buy) {
          const bp = saplingBuyPrice(world.treeSlots().used, state.saplingPriceMult, ITEM_DEFS[r.key].species);
          setText(r.buy, `[[icon:coin]] ${formatNumber(bp)} · Buy`);
          r.buy.disabled = state.money < bp || used >= state.woodCap;
        }
      }
    };
  }

  // Gebäude & Böden: Böden sind kaufbar, Gebäude vorerst Platzhalter
  function buildBuildings(body) {
    const soilCards = Object.entries(SOIL_DEFS).map(([key, def]) => `
      <div class="shop-card" data-soil="${key}">
        <img class="shop-icon" src="${SOIL_ICON}" alt="">
        <div class="shop-info">
          <b>${def.name}</b>
          <span>${def.desc}</span>
          <span class="shop-meta">1 tile · <span class="soil-count"></span></span>
        </div>
        <button class="small-btn buy-btn"></button>
      </div>`).join('');
    const buildingCards = BUILDING_ORDER.map((type) => {
      const def = BUILDING_DEFS[type];
      const meta = def.kind === 'irrigation' ? `1 tile · [[icon:water]]×${def.outlets.length} · R: rotate` : `${def.size}×${def.size} tiles`;
      return `
      <div class="shop-card" data-building="${type}">
        <img class="shop-icon" src="${BUILDING_ICONS[type]}" alt="">
        <div class="shop-info">
          <b>${def.icon} ${def.name}</b>
          <span>${def.desc}</span>
          <span class="shop-meta">${meta} · <span class="b-count"></span></span>
        </div>
        <button class="small-btn buy-btn"></button>
      </div>`;
    }).join('');
    body.innerHTML = renderIcons(`
      <p class="hint">[[icon:soil]] Everything sits on the tile grid · 1 tile = 1 tree · [[icon:mouse]] left: place · right / ESC: done</p>
      <h3 class="shop-title">Soils</h3>
      <div class="shop-list">${soilCards}</div>
      <h3 class="shop-title">Buildings</h3>
      <div class="shop-list">${buildingCards}</div>`);

    const bCards = [...body.querySelectorAll('[data-building]')].map((card) => {
      const type = card.dataset.building;
      const btn = card.querySelector('.buy-btn');
      btn.addEventListener('click', (ev) => {
        const def = BUILDING_DEFS[type];
        if ((state.repLevel ?? 0) < def.unlockRep || state.money < world.buildPrice(type)) return denyFx(btn);
        pressFx(btn, ev, '#8a5a2b');
        closeWindow();
        world.beginBuilding(type);
      });
      return { type, card, btn, count: card.querySelector('.b-count') };
    });

    const cards = [...body.querySelectorAll('[data-soil]')].map((card) => {
      const key = card.dataset.soil;
      const btn = card.querySelector('.buy-btn');
      btn.addEventListener('click', (ev) => {
        if (state.money < soilPriceOf(key)) {
          sfx.deny();
          return;
        }
        pressFx(btn, ev, '#8a5a2b');
        closeWindow();
        world.beginSoil(key);
      });
      return { key, btn, count: card.querySelector('.soil-count') };
    });

    return () => {
      for (const c of bCards) {
        const def = BUILDING_DEFS[c.type];
        const locked = (state.repLevel ?? 0) < def.unlockRep;
        const price = world.buildPrice(c.type);
        c.card.classList.toggle('locked', locked);
        setText(c.btn, locked ? `[[icon:lock]] [[icon:star]] Rep ${def.unlockRep}` : `[[icon:coin]] ${formatNumber(price)} · Place`);
        c.btn.disabled = locked || state.money < price;
        setText(c.count, `placed: ${world.countOf(c.type)}`);
      }
      for (const c of cards) {
        const price = soilPriceOf(c.key);
        setText(c.btn, `[[icon:coin]] ${formatNumber(price)} · Place`);
        c.btn.disabled = state.money < price;
        setText(c.count, `placed: ${Object.values(state.soils).filter((t) => t === c.key).length}`);
      }
    };
  }

  const soilPriceOf = (key) => soilPrice(state, key);

  const BUILDING_ICONS = Object.fromEntries(BUILDING_ORDER.map((type) => [
    type, iconUrl({ sawmill: 'saw', spout: 'water', splitter: 'leaves', sprinkler: 'sprinkler', fountain: 'fountain' }[type]),
  ]));

  // Spielsekunden -> m:ss (bei x1)
  const clock = (sec) => {
    const t = Math.max(0, Math.ceil(sec));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  // ---------- Aufträge ----------
  const PORTRAITS = Object.fromEntries(CUSTOMERS.map((c) => [c.id, customerPortraitUrl(c.look, 2)]));
  const heartRow = (h) => `<span class="hearts">${'[[icon:heart]]'.repeat(h)}<i>${'[[icon:heart-empty]]'.repeat(MAX_HEARTS - h)}</i></span>`;
  let highlightOrder = null; // Kunde in der Welt angeklickt: dessen Karte kurz hervorheben

  function buildOrders(body) {
    ensureOrders(state);
    body.innerHTML = renderIcons(`
      <div class="rep-box">
        <div class="rep-head"><b>[[icon:star]] Reputation <span id="rep-level"></span></b><span id="rep-points"></span></div>
        <div class="fill-bar rep-bar"><div class="fill-bar-in" id="rep-bar"></div></div>
        <div class="rep-next"><span id="rep-next"></span><span id="rep-bonus" class="rep-bonus"></span></div>
      </div>
      <p class="hint">[[icon:orders]] Customers pay far more than the market · [[icon:bolt]] deliver fast for a tip · [[icon:heart]] loyal customers give lasting bonuses</p>
      <div class="order-list" id="order-list"></div>
      <h3 class="shop-title">[[icon:heart]] Regular customers</h3>
      <div class="customer-list" id="customer-list"></div>`);
    const listEl = body.querySelector('#order-list');
    const custEl = body.querySelector('#customer-list');
    let listKey = null;
    let custKey = null;
    let cardEls = [];

    // Stammkunden: Herzen, Fortschritt zum nächsten Herz, Bonus (gesperrt / aktiv / doppelt)
    function renderCustomers() {
      custEl.innerHTML = renderIcons(CUSTOMERS.map((c) => {
        const l = state.customers?.[c.id] ?? { pts: 0, orders: 0 };
        const h = heartsFor(l.pts);
        const tier = perkTier(h);
        const next = LOVE_LEVELS[h + 1];
        const prog = next ? ((l.pts - LOVE_LEVELS[h]) / (next - LOVE_LEVELS[h])) * 100 : 100;
        const status = tier === 2 ? '<b class="perk-max">MAX</b>' : tier === 1 ? `<span class="perk-next">×2 at [[icon:heart]]${PERK_HEARTS[1]}</span>` : `<span class="perk-lock">[[icon:lock]] [[icon:heart]]${PERK_HEARTS[0]}</span>`;
        return `
          <div class="customer-card tier${tier}" title="${l.orders} orders delivered">
            <img class="cust-portrait" src="${PORTRAITS[c.id]}" alt="">
            <div class="cust-main">
              <div class="cust-head"><b>${c.icon} ${c.name}</b>${heartRow(h)}</div>
              <div class="fill-bar love-bar"><div class="fill-bar-in" style="width:${prog}%"></div></div>
              <div class="cust-perk">${c.perk.icon} ${c.perk.text(tier)} ${status}</div>
            </div>
          </div>`;
      }).join(''));
    }

    function renderList() {
      const list = state.orders.list;
      if (!list.length) {
        listEl.innerHTML = renderIcons(`<div class="order-empty">[[icon:clock]] Waiting for customers… <span id="order-next"></span></div>`);
        cardEls = [];
        highlightOrder = null;
        return;
      }
      listEl.innerHTML = renderIcons(list.map((o) => {
        const c = customerOf(o.customerId);
        const kind = ORDER_KINDS[o.kind] ?? ORDER_KINDS.normal;
        const tag = o.kind === 'normal' ? '' : `<span class="order-kind kind-${o.kind}">${kind.icon} ${kind.name}</span>`;
        return `
        <div class="order-card kind-${o.kind}" data-id="${o.id}">
          <div class="order-who">
            <img class="order-portrait" src="${PORTRAITS[c.id]}" alt="">
            <div><b>${c.name}</b> ${tag}<div>${heartRow(hearts(state, c.id))}</div></div>
          </div>
          <div class="order-items">${o.items.map((it) => `
            <span class="order-chip" data-key="${it.key}" title="${ITEM_DEFS[it.key].name}">
              <img src="${ITEM_ICONS[it.key]}" alt=""><span class="oc-n"></span>
            </span>`).join('')}</div>
          <div class="order-reward">[[icon:coin]] ${formatNumber(o.reward)} <span class="order-tip"></span><span class="order-rep">[[icon:star]] +${o.rep} · <span class="hearts">[[icon:heart]]</span> +${kind.love}</span></div>
          <div class="order-time"><div class="fill-bar"><div class="fill-bar-in"></div></div><span class="ot-text"></span></div>
          <div class="order-actions">
            <button class="small-btn sell-btn deliver-btn">Deliver</button>
            <button class="small-btn decline-btn" title="Decline">[[icon:close]]</button>
          </div>
        </div>`;
      }).join(''));
      cardEls = [...listEl.querySelectorAll('.order-card')].map((card) => {
        const id = Number(card.dataset.id);
        const deliver = card.querySelector('.deliver-btn');
        deliver.addEventListener('click', (ev) => {
          const done = deliverOrder(state, id);
          if (!done) return denyFx(deliver);
          sfx.coin();
          sfx.buy();
          spawnChips(ev.clientX, ev.clientY, '#f0c84a');
          spawnChips(ev.clientX, ev.clientY, '#3aa8a0');
        });
        card.querySelector('.decline-btn').addEventListener('click', () => {
          knock(0.8);
          declineOrder(state, id);
        });
        if (highlightOrder === id) {
          restartAnim(card, 'highlight');
          card.scrollIntoView({ block: 'nearest' });
        }
        return {
          id, card, deliver,
          chips: [...card.querySelectorAll('.order-chip')],
          bar: card.querySelector('.order-time .fill-bar-in'),
          time: card.querySelector('.ot-text'),
          tip: card.querySelector('.order-tip'),
        };
      });
      highlightOrder = null;
    }

    return () => {
      ensureOrders(state);
      const lvl = state.repLevel ?? 0;
      const next = nextRepLevelPoints(lvl);
      const from = REP_LEVELS[lvl];
      setText(body.querySelector('#rep-level'), `Lv ${lvl}`);
      setText(body.querySelector('#rep-points'), next ? `${state.reputation} / ${next}` : `${state.reputation} · max`);
      body.querySelector('#rep-bar').style.width = (next ? ((state.reputation - from) / (next - from)) * 100 : 100) + '%';
      const unlock = REP_UNLOCKS[lvl + 1];
      setText(body.querySelector('#rep-next'), unlock ? `Next: ${unlock.icon} ${unlock.text}` : '[[icon:crown]] Fully renowned!');
      setText(body.querySelector('#rep-bonus'), lvl > 0 ? `[[icon:market]] Market +${Math.round(lvl * REP_PRICE_BONUS * 100)}%` : '');

      const key = state.orders.list.map((o) => o.id).join(',');
      if (key !== listKey || highlightOrder) {
        listKey = key;
        renderList();
      }
      const ck = CUSTOMERS.map((c) => state.customers?.[c.id]?.pts ?? 0).join();
      if (ck !== custKey) {
        custKey = ck;
        renderCustomers();
      }
      const nextEl = listEl.querySelector('#order-next');
      if (nextEl) setText(nextEl, state.orders.list.length < orderSlots(state) ? `next in ~${clock(state.orders.nextIn)}` : '');
      for (const c of cardEls) {
        const o = state.orders.list.find((x) => x.id === c.id);
        if (!o) continue;
        o.items.forEach((it, i) => {
          const have = state.inventory[it.key] ?? 0;
          const chip = c.chips[i];
          setText(chip.querySelector('.oc-n'), `${Math.min(have, it.n)}/${it.n}`);
          chip.classList.toggle('ok', have >= it.n);
        });
        const ratio = o.time / o.total;
        c.bar.style.width = ratio * 100 + '%';
        c.bar.classList.toggle('full', ratio < 0.25);
        setText(c.time, `[[icon:clock]] ${clock(o.time)}`);
        const tip = tipNow(o);
        setText(c.tip, tip > 0 ? `+${formatNumber(tip)} tip` : '');
        c.deliver.disabled = !canDeliver(state, o);
      }
    };
  }

  // ---------- Angeklicktes Gebäude ----------
  let panelBuilding = null;
  function openBuilding(b) {
    panelBuilding = b;
    openWindow('building');
    setIconText(windowTitle, `${BUILDING_DEFS[b.type].icon} ${BUILDING_DEFS[b.type].name}`);
  }
  world.setBuildingClickHandler((b) => {
    if (!gate('building')) return;
    openBuilding(b);
  });
  // Kunde in der Welt angeklickt: Aufträge öffnen und seine Karte hervorheben
  world.setVisitorClickHandler((order) => {
    if (order.id === 'merchant') return openMerchant();
    if (!gate('tab', 'orders') || !isTabUnlocked(state, 'orders')) return;
    highlightOrder = order.id;
    if (activeWindow?.id !== 'orders') openWindow('orders');
  });

  // ---------- Willkommen zurück (Offline-Fortschritt) ----------
  let offlineReport = null;
  const duration = (sec) => {
    const m = Math.floor(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.max(1, m)}m`;
  };
  // ---------- Neues Baumbeet: ein besonderer Moment ----------
  const BED_ART = bedCanvas().toDataURL();
  let bedGain = 1;
  function celebrateBed(n) {
    bedGain = n;
    state.inventory.sapling = (state.inventory.sapling ?? 0) + n; // Geschenk des Waldes
    openWindow('newBed');
    sfx.fanfare();
    const r = treesBox.getBoundingClientRect();
    spawnChips(r.left + r.width / 2, r.top + r.height / 2, '#b8ff8a');
    spawnChips(r.left + r.width / 2, r.top + r.height / 2, '#ffe27a');
    emit('treeBedGained', { total: state.treeCap });
  }
  function buildNewBed(body) {
    body.innerHTML = renderIcons(`
      <div class="newbed">
        <div class="newbed-art"><img src="${BED_ART}" alt=""><img class="newbed-sapling" src="${ITEM_ICONS.sapling}" alt=""></div>
        <p class="newbed-big">Your forest grows!</p>
        <p>Trees only grow in <b>tree beds</b>. You now have room for <b>${state.treeCap}</b> trees.</p>
        <p class="newbed-gift">[[icon:gift]] The forest gives you ${bedGain === 1 ? 'a sapling' : `${bedGain} saplings`} for your new bed${bedGain === 1 ? '' : 's'}.</p>
        <button class="wood-btn newbed-go">[[icon:hand]] Choose a spot</button>
        <button class="small-btn newbed-later">Later (click [[icon:oak]] Trees at the top)</button>
      </div>`);
    body.querySelector('.newbed-go').addEventListener('click', () => {
      knock(1.3);
      closeWindow();
      world.beginBedPlacement();
    });
    body.querySelector('.newbed-later').addEventListener('click', () => {
      knock(0.9);
      closeWindow();
    });
  }

  // ---------- Wanderhändler (Zufallsereignis) ----------
  let randomEvents = null;
  const MERCHANT_PORTRAIT = customerPortraitUrl({ shirt: '#7a4ab0', hat: '#2a1a40', hatStyle: 'tophat' }, 3);
  function openMerchant() {
    if (!gate('merchant') || randomEvents?.current()?.id !== 'merchant') return;
    knock(1.2);
    if (activeWindow?.id !== 'merchant') openWindow('merchant');
  }
  function buildMerchant(body) {
    const offers = randomEvents.offers();
    body.innerHTML = renderIcons(`
      <div class="merchant-head">
        <img src="${MERCHANT_PORTRAIT}" alt="">
        <p><b>"Fine wares from far away!"</b><br>A traveling merchant stops by your meadow. Every deal works once – he leaves soon.</p>
      </div>
      <div class="offer-list">${offers.map((o) => `
        <div class="offer-card" data-id="${o.id}">
          <span class="offer-icon">${o.icon}</span>
          <div><b>${o.name}</b><span>${o.desc}</span></div>
          <button class="small-btn sell-btn offer-btn"></button>
        </div>`).join('')}</div>
      <div class="merchant-timer"></div>`);
    const cards = [...body.querySelectorAll('.offer-card')].map((card) => {
      const o = offers.find((x) => x.id === card.dataset.id);
      const btn = card.querySelector('.offer-btn');
      btn.addEventListener('click', (ev) => {
        const done = randomEvents.buyOffer(o.id);
        if (!done) return denyFx(btn);
        sfx.coin();
        sfx.buy();
        spawnChips(ev.clientX, ev.clientY, '#c98ae0');
        spawnChips(ev.clientX, ev.clientY, '#ffe27a');
      });
      return { o, card, btn };
    });
    const timer = body.querySelector('.merchant-timer');
    return () => {
      const ev = randomEvents.current();
      if (ev?.id !== 'merchant') {
        closeWindow(); // Händler ist weitergezogen
        return;
      }
      setText(timer, `[[icon:clock]] He leaves in ${clock(ev.t)}`);
      for (const { o, card, btn } of cards) {
        card.classList.toggle('bought', !!o.bought);
        if (o.bought) {
          setText(btn, o.result ? `[[icon:check]] +${formatNumber(o.result)}` : '[[icon:check]] Done');
          btn.disabled = true;
          continue;
        }
        setText(btn, o.price > 0 ? `[[icon:coin]] ${formatNumber(o.price)} · Buy` : 'Deal!');
        btn.disabled = state.money < o.price;
      }
    };
  }

  function showOfflineReport(report) {
    offlineReport = report;
    openWindow('offline');
    sfx.fanfare();
  }
  function buildOffline(body) {
    const r = offlineReport;
    const gained = Object.entries(r.gained).filter(([, n]) => n !== 0);
    const chips = gained.map(([k, n]) => `
      <span class="order-chip ${n > 0 ? 'ok' : ''}" title="${ITEM_DEFS[k].name}"><img src="${ITEM_ICONS[k]}" alt="">${n > 0 ? '+' : ''}${formatNumber(n)}</span>`).join('');
    const line = (icon, text, cls = '') => `<div class="away-line ${cls}"><span>${icon}</span>${text}</div>`;
    const lines = [
      r.sold > 0 ? line('[[icon:repeat]]', `Auto-Sell: <b>+${formatNumber(r.sold)} [[icon:coin]]</b>`) : '',
      r.wages > 0 ? line('[[icon:sun]]', `Wages for ${r.paydays} payday${r.paydays === 1 ? '' : 's'}: <b>−${formatNumber(r.wages)} [[icon:coin]]</b>`, 'bad') : '',
      r.grown > 0 ? line('[[icon:oak]]', `${r.grown} tree${r.grown === 1 ? '' : 's'} grew up`) : '',
      r.customers > 0 ? line('[[icon:orders]]', `${r.customers} customer${r.customers === 1 ? ' is' : 's are'} waiting for you`) : '',
      r.lost > 0 ? line('[[icon:chest]]', `Chest was full: ${formatNumber(r.lost)} items had no room`, 'bad') : '',
      r.debt ? line('[[icon:warning]]', 'Wages pushed you into debt!', 'bad') : '',
    ].join('');
    const tip = !r.hasWorkers
      ? '[[icon:lantern]] Hire workers – they keep chopping while you are away!'
      : r.capped ? `[[icon:lantern]] Your team works up to ${state.offlineHours}h while you are away · [[icon:moon]] Night Shift (Workers tree) adds more` : '';
    body.innerHTML = renderIcons(`
      <div class="away-head">You were away <b>${duration(r.away)}</b>${r.capped ? ` · your team worked <b>${duration(r.time)}</b>` : ''}</div>
      ${chips ? `<div class="away-items">${chips}</div>` : '<p class="hint">Nothing new in the chest.</p>'}
      <div class="away-lines">${lines}</div>
      <div class="away-net ${r.net < 0 ? 'bad' : ''}">Coins ${r.net >= 0 ? '+' : '−'}${formatNumber(Math.abs(r.net))} [[icon:coin]]</div>
      ${tip ? `<p class="hint">${tip}</p>` : ''}
      <button class="wood-btn away-ok">Let's go!</button>`);
    const ok = body.querySelector('.away-ok');
    ok.addEventListener('click', (ev) => {
      spawnChips(ev.clientX, ev.clientY, '#ffe27a');
      sfx.coin();
      closeWindow();
    });
  }

  function buildBuildingPanel(body) {
    const b = panelBuilding;
    const def = BUILDING_DEFS[b.type];
    if (def.kind === 'irrigation') {
      body.innerHTML = renderIcons(`
        <div class="bld-head">
          <img class="shop-icon" src="${BUILDING_ICONS[b.type]}" alt="">
          <div class="shop-info"><b>${def.name}</b><span>${def.desc}</span>
          <span class="shop-meta">[[icon:water]] ${def.outlets.length} outlet${def.outlets.length > 1 ? 's' : ''} · [[icon:sapling]] +${Math.round(def.growth * 100)}% growth on watered tiles</span></div>
        </div>
        <p class="hint">[[icon:water]] Watered tiles glow blue · best water source counts · stacks with [[icon:planks]] soil</p>`);
      return () => {};
    }
    const accepts = ['all', ...SPECIES_ORDER];
    body.innerHTML = renderIcons(`
      <div class="bld-head">
        <img class="shop-icon" src="${BUILDING_ICONS.sawmill}" alt="">
        <div class="shop-info"><b>Sawmill <span id="saw-lvl"></span></b><span id="saw-status"></span>
          <div class="fill-bar"><div class="fill-bar-in" id="saw-progress"></div></div></div>
      </div>
      <div class="saw-flow">
        <div class="saw-box"><span>[[icon:log]] Logs in</span><b id="saw-in"></b><button class="small-btn" id="saw-load">Load from chest</button></div>
        <div class="saw-arrow">[[icon:right]] [[icon:saw]] [[icon:right]]</div>
        <div class="saw-box"><span>[[icon:planks]] Planks out</span><b id="saw-out"></b><button class="small-btn sell-btn" id="saw-take">To chest</button></div>
      </div>
      <h3 class="shop-title">Accepts</h3>
      <div class="saw-accept">${accepts.map((a) => `<button class="small-btn accept-btn" data-accept="${a}">${a === 'all' ? '[[icon:star]] All' : `${speciesOf(a).icon} ${speciesOf(a).name}`}</button>`).join('')}</div>
      <p class="hint">[[icon:worker]] Workers with the [[icon:saw]] Sawmill task bring logs & fetch planks</p>
      <button class="wood-btn" id="saw-upgrade"></button>`);
    const q = (sel) => body.querySelector(sel);
    q('#saw-load').addEventListener('click', (ev) => {
      if (!world.buildingApi.loadLogs(b)) return denyFx(q('#saw-load'));
      pressFx(q('#saw-load'), ev, '#c98a4a');
    });
    q('#saw-take').addEventListener('click', (ev) => {
      if (!world.buildingApi.takePlanks(b)) return denyFx(q('#saw-take'));
      spawnChips(ev.clientX, ev.clientY, '#e2b878');
    });
    const acceptBtns = [...body.querySelectorAll('.accept-btn')];
    for (const btn of acceptBtns) {
      btn.addEventListener('click', () => {
        knock(1.1);
        world.buildingApi.setAccept(b, btn.dataset.accept);
      });
    }
    q('#saw-upgrade').addEventListener('click', (ev) => {
      if (!world.buildingApi.upgrade(b)) return denyFx(q('#saw-upgrade'));
      spawnChips(ev.clientX, ev.clientY, '#ffe27a');
    });

    return () => {
      if (!world.buildings.includes(b)) return closeWindow();
      const lvl = sawmillLevel(b);
      const next = def.levels[b.level + 1];
      setText(q('#saw-lvl'), `Lv ${b.level + 1}`);
      const working = b.input.length > 0 && b.output.length < lvl.outCap;
      setText(q('#saw-status'), b.output.length >= lvl.outCap ? '[[icon:warning]] Planks full — collect them!' : working ? `[[icon:saw]] Sawing… ${lvl.time}s per plank` : '[[icon:moon]] Waiting for logs');
      q('#saw-progress').style.width = (working ? b.progress * 100 : 0) + '%';
      setText(q('#saw-in'), `${b.input.length} / ${lvl.inCap}`);
      setText(q('#saw-out'), `${b.output.length} / ${lvl.outCap}`);
      q('#saw-take').disabled = b.output.length === 0;
      for (const btn of acceptBtns) {
        const a = btn.dataset.accept;
        btn.hidden = a !== 'all' && !isSpeciesUnlocked(state, a);
        btn.classList.toggle('active', b.accept === a);
      }
      const up = q('#saw-upgrade');
      up.hidden = !next;
      if (next) {
        setText(up, `[[icon:up]] Upgrade: ${next.time}s/plank · ${next.inCap} slots · [[icon:coin]] ${formatNumber(next.cost)}`);
        up.disabled = state.money < next.cost;
      }
    };
  }


  // ---------- Skill Tree ----------
  // Alle Maße Vielfache von 3 (= ein Art-Pixel), damit die Pixel-Äste sauber sitzen
  const COL = 114;
  const ROW = 81;
  const PAD_X = 48;
  const PAD_Y = 15;
  const NODE = 60;

  const treeTabs = $('tree-tabs');
  const treeCanvas = $('tree-canvas');
  const treeScroll = $('tree-scroll');
  let activeTree = 'click';
  const treeTabButtons = {};
  const nodeEls = new Map(); // id -> { node, el, levelEl, costEl, outLines, inLines, visible }

  for (const tree of SKILL_TREES) {
    const b = makeTabButton({ icon: tree.icon, label: tree.name, accent: tree.accent }, () => {
      if (activeTree === tree.id) return;
      if (!gate('tree', tree.id)) return denyFx(b);
      showTree(tree.id);
    });
    treeTabs.appendChild(b);
    treeTabButtons[tree.id] = b;
  }

  function showTree(id) {
    activeTree = id;
    for (const [k, b] of Object.entries(treeTabButtons)) b.classList.toggle('active', k === id);
    hideTip();
    renderTree();
    treeScroll.scrollLeft = 0;
  }

  function nodePos(col, row) {
    return { x: PAD_X + col * COL, y: PAD_Y + row * ROW };
  }

  const ALL_NODES = SKILL_TREES.flatMap((t) => t.nodes);
  const level = (n) => state.skills[n.id] ?? 0;
  // Ein Knoten ist sichtbar (und kaufbar), sobald alle Vorgänger gekauft sind
  const isAvailable = (n) => (n.requires ?? []).every((r) => (state.skills[r] ?? 0) > 0);
  const isMaxed = (n) => level(n) >= n.max;
  const nextCost = (n) => n.cost(level(n));

  function renderTree() {
    const tree = SKILL_TREES.find((t) => t.id === activeTree);
    const nodes = tree.nodes;
    nodeEls.clear();
    treeCanvas.replaceChildren();

    const maxCol = Math.max(...nodes.map((n) => n.col));
    const fullWidth = PAD_X * 2 + maxCol * COL + NODE;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'tree-lines');
    svg.setAttribute('width', fullWidth);
    svg.setAttribute('height', PAD_Y * 2 + ROW * 2 + NODE + 18);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const outLines = new Map(); // Vorgänger-id -> Äste (leuchten golden, sobald der Vorgänger gekauft ist)
    const inLines = new Map(); // Knoten-id -> Äste, die zu ihm führen (sichtbar mit dem Knoten)
    for (const n of nodes) {
      for (const reqId of n.requires ?? []) {
        const from = byId.get(reqId);
        if (!from) continue;
        const a = nodePos(from.col, from.row);
        const b = nodePos(n.col, n.row);
        const x1 = a.x + NODE;
        const y1 = a.y + NODE / 2;
        const x2 = b.x;
        const y2 = b.y + NODE / 2;
        // Eckige Verbindung (waagerecht – senkrecht – waagerecht) passt zum Pixel-Stil
        const mx = Math.round((x1 + x2) / 6) * 3;
        const d = `M${x1},${y1} H${mx} V${y2} H${x2}`;
        const g = document.createElementNS(svgNS, 'g');
        for (const cls of ['line-outline', 'line-branch', 'line-highlight']) {
          const p = document.createElementNS(svgNS, 'path');
          p.setAttribute('d', d);
          p.setAttribute('class', cls);
          p.setAttribute('pathLength', '1');
          g.appendChild(p);
        }
        svg.appendChild(g);
        if (!outLines.has(reqId)) outLines.set(reqId, []);
        outLines.get(reqId).push(g);
        if (!inLines.has(n.id)) inLines.set(n.id, []);
        inLines.get(n.id).push(g);
      }
    }
    treeCanvas.appendChild(svg);

    for (const n of nodes) {
      const { x, y } = nodePos(n.col, n.row);
      const el = document.createElement('button');
      el.className = 'skill-node pop-in';
      el.setAttribute('aria-label', n.name);
      el.style.setProperty('--delay', `${n.col * 28 + n.row * 10}ms`); // Knoten wachsen von links nach rechts ein
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.zIndex = 3 - n.row; // Preisschilder oberer Reihen liegen über den Ringen darunter
      // Jede Scheibe in einer anderen Holzart
      el.style.setProperty('--slice', `var(--tex-slice-${(n.col * 3 + n.row) % SLICE_TONES.length})`);
      el.innerHTML = renderIcons(`<span class="node-icon">${n.icon}</span><span class="node-level"></span><span class="node-cost"></span>`);
      el.addEventListener('click', () => buySkill(n));
      el.addEventListener('animationend', () => el.classList.remove('pop-in', 'bought', 'reveal', 'denied'));
      el.addEventListener('mouseenter', () => showTip(n, el));
      el.addEventListener('mouseleave', hideTip);
      treeCanvas.appendChild(el);
      nodeEls.set(n.id, {
        node: n, el,
        levelEl: el.querySelector('.node-level'),
        costEl: el.querySelector('.node-cost'),
        outLines: outLines.get(n.id) ?? [],
        inLines: inLines.get(n.id) ?? [],
        visible: null, // wird in refreshTree gesetzt
      });
    }
    refreshTree();
  }

  function buySkill(n) {
    const entry = nodeEls.get(n.id);
    if (isMaxed(n)) return;
    if (!gate('skill', n.id) || state.money < nextCost(n)) {
      sfx.deny();
      restartAnim(entry.el, 'denied');
      return;
    }
    state.money -= nextCost(n);
    state.skills[n.id] = level(n) + 1;
    recomputeStats(state);

    // Kauf-Effekt: Scheibe ploppt, Funken, Klang. Neue Knoten wachsen in refreshTree heraus.
    sfx.buy();
    restartAnim(entry.el, 'bought');
    const r = entry.el.getBoundingClientRect();
    spawnChips(r.left + r.width / 2, r.top + r.height / 2, '#ffe27a');
    spawnChips(r.left + r.width / 2, r.top + r.height / 2, '#f0c84a');
    refreshTree();
    showTip(n, entry.el);
    emit('skillBought', { id: n.id });
  }

  // Neu sichtbarer Knoten: Ast wächst heraus, danach ploppt der Knoten mit Funken auf
  function revealNode(entry) {
    for (const g of entry.inLines) restartAnim(g, 'grow');
    restartAnim(entry.el, 'reveal');
    setTimeout(() => {
      const r = entry.el.getBoundingClientRect();
      spawnChips(r.left + r.width / 2, r.top + r.height / 2, '#b8ff8a');
      knock(1.5, 0.1);
    }, 380);
  }

  function refreshTree() {
    let maxVisibleCol = 0;
    for (const entry of nodeEls.values()) {
      const { node, el, levelEl, costEl, outLines, inLines } = entry;
      const visible = isAvailable(node) || level(node) > 0;
      if (visible !== entry.visible) {
        el.hidden = !visible;
        for (const g of inLines) g.style.display = visible ? '' : 'none';
        if (visible && entry.visible === false) revealNode(entry);
        entry.visible = visible;
      }
      if (!visible) continue;
      maxVisibleCol = Math.max(maxVisibleCol, node.col);
      const lvl = level(node);
      const maxed = isMaxed(node);
      const affordable = !maxed && state.money >= nextCost(node);
      el.classList.toggle('owned', lvl > 0);
      el.classList.toggle('maxed', maxed);
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('expensive', !maxed && !affordable);
      setText(levelEl, node.max > 1 ? `${lvl}/${node.max}` : lvl ? '[[icon:check]]' : '');
      levelEl.hidden = node.max === 1 && !lvl;
      setText(costEl, maxed ? (node.max > 1 ? 'MAX' : 'Owned') : `[[icon:coin]] ${formatNumber(nextCost(node))}`);
      for (const g of outLines) g.classList.toggle('lit', lvl > 0);
    }
    // Breite nur bis zur letzten sichtbaren Spalte, damit der Rest geheim bleibt
    treeCanvas.style.width = PAD_X * 2 + maxVisibleCol * COL + NODE + 'px';
    if (tipNode) fillTip(tipNode);
  }

  // ---------- Tooltip ----------
  const tip = document.createElement('div');
  tip.id = 'skill-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let tipNode = null;
  let tipHtml = '';

  function fillTip(n) {
    const lvl = level(n);
    const maxed = isMaxed(n);
    const available = isAvailable(n);
    const cost = maxed ? 0 : nextCost(n);
    const missing = (n.requires ?? [])
      .filter((r) => !(state.skills[r] > 0))
      .map((r) => ALL_NODES.find((o) => o.id === r)?.name ?? r);
    let valueLine = '';
    if (n.value) {
      valueLine = maxed
        ? `<div class="tip-value">${n.value(lvl)}</div>`
        : `<div class="tip-value">${n.value(lvl)} <span class="tip-arrow">[[icon:right]]</span> <b>${n.value(lvl + 1)}</b></div>`;
    }
    let footer;
    if (maxed) footer = '<div class="tip-max">Maxed out</div>';
    else if (!available) footer = `<div class="tip-locked">[[icon:lock]] Requires: ${missing.join(', ')}</div>`;
    else footer = `<div class="tip-cost ${state.money >= cost ? 'ok' : 'no'}">Cost: [[icon:coin]] ${formatNumber(cost)}</div>`;
    const levelText = n.max > 1 ? `Level ${lvl}/${n.max}` : lvl ? 'Owned' : 'One-time';
    const html = `
      <div class="tip-head"><span class="tip-icon">${n.icon}</span><span class="tip-name">${n.name}</span><span class="tip-level">${levelText}</span></div>
      <div class="tip-desc">${n.desc}</div>${valueLine}${footer}`;
    // Nur neu schreiben, wenn sich etwas geändert hat (läuft jeden Frame)
    if (html !== tipHtml) {
      tip.innerHTML = renderIcons(html);
      tipHtml = html;
    }
  }

  function showTip(n, el) {
    tipNode = n;
    fillTip(n);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, r.top - th - 12) + 'px';
  }

  function hideTip() {
    tipNode = null;
    tip.hidden = true;
  }

  // Horizontal scrollen: Mausrad und Ziehen
  treeScroll.addEventListener('scroll', hideTip);
  treeScroll.addEventListener('wheel', (ev) => {
    if (ev.deltaY !== 0) {
      ev.preventDefault();
      treeScroll.scrollLeft += ev.deltaY;
    }
  }, { passive: false });

  let drag = null;
  treeScroll.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.skill-node')) return;
    drag = { x: ev.clientX, left: treeScroll.scrollLeft };
    treeScroll.setPointerCapture(ev.pointerId);
    treeScroll.classList.add('dragging');
  });
  treeScroll.addEventListener('pointermove', (ev) => {
    if (drag) treeScroll.scrollLeft = drag.left - (ev.clientX - drag.x);
  });
  const endDrag = () => {
    drag = null;
    treeScroll.classList.remove('dragging');
  };
  treeScroll.addEventListener('pointerup', endDrag);
  treeScroll.addEventListener('pointercancel', endDrag);

  showTree(activeTree);

  // ---------- Update pro Frame ----------
  function update() {
    const moneyText = formatNumber(state.money);
    if (moneyEl.textContent !== moneyText) restartAnim(moneyEl, 'bump');
    setText(moneyEl, moneyText);
    moneyEl.classList.toggle('negative', state.money < 0);
    const short = paydayShortfall(state);
    moneyBox.classList.toggle('warn', !!short);
    moneyBox.title = plainIconText(short
      ? `Payday in ${Math.max(1, Math.ceil(short.hours))}h: wages [[icon:coin]] ${formatNumber(short.wages)} · not enough coins!`
      : state.money < 0 ? `In debt: ${Math.round(DEBT_GARNISH * 100)}% of every sale and order is garnished` : '');
    const woodText = `${chestUsed(state)} / ${state.woodCap}`;
    if (woodEl.textContent !== woodText) restartAnim(woodEl, 'bump');
    setText(woodEl, woodText);
    setText(timeEl, `Day ${state.day} · ${formatClock(state.hour)}`);
    setText(timeIcon, isDay(state.hour) ? '[[icon:sun]]' : '[[icon:moon]]');
    setText(workerEl, `${state.workers.length} / ${state.workerCap}`);
    // Baumbeete: belegt / vorhanden, offene Beete blinken
    const slots = world.treeSlots();
    setText(treesEl, `${slots.used} / ${slots.cap}`);
    treesBox.classList.toggle('pending', slots.pending > 0);
    treesBox.classList.toggle('full', !slots.free && !slots.pending);
    treesBadge.hidden = !slots.pending;
    setText(treesBadge, `+${slots.pending}`);
    treesBox.title = slots.pending
      ? 'A new tree bed! Click to choose where it goes'
      : `${slots.used} of ${slots.cap} tree beds used · trees only grow in tree beds · more beds: Forest Space (Economy) and land`;
    // Neuer Baumplatz: kleines Fest (einmal je neuem Beet)
    state.treeCapSeen ??= state.treeCap;
    if (state.treeCap > state.treeCapSeen && state.tutorial === 'done') {
      const gained = state.treeCap - state.treeCapSeen;
      state.treeCapSeen = state.treeCap;
      celebrateBed(gained);
    }
    speedButtons.forEach((b, i) => b.classList.toggle('active', SPEEDS[i] === state.speed));
    activeWindow?.refresh?.();
    refreshTree();
    refreshTabs();
  }

  const rectOf = (el) => (el && !el.hidden && el.offsetParent !== null ? el.getBoundingClientRect() : null);

  return {
    update,
    setGate: (fn) => { gate = fn; },
    showTree,
    closeWindow,
    isWindowOpen: (id) => activeWindow?.id === id,
    tabRect: (id) => rectOf(tabButtons[id]),
    treeTabRect: (id) => rectOf(treeTabButtons[id]),
    elRect: (selector) => rectOf(document.querySelector(selector)),
    nodeRect: (id) => rectOf(nodeEls.get(id)?.el),
    activeTree: () => activeTree,
    openBuilding,
    showOfflineReport,
    openMerchant,
    setRandomEvents: (ev) => { randomEvents = ev; },
  };
}
