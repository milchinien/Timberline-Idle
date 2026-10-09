import { renderIcons, setIconText } from './icons.js';
// Einstiegs-Tutorial + kurze Hinweise bei bestimmten Ereignissen.
// Alles außer dem aktuellen Ziel wird abgedunkelt; Texte sind kurz und arbeiten mit Symbolen.
import { on } from './events.js';
import { handImageUrl } from './cursors.js';
import * as sfx from './sfx.js';
import { ITEM_DEFS } from './state.js';
import { REP_UNLOCKS } from './progress.js';
import { SIDES, rowsBought, rowPrice } from './land.js';
import { paydayShortfall } from './workers.js';

const STEPS = ['chop', 'collect', 'openChest', 'sell', 'upgrade'];
const STEP_INFO = {
  chop: { icons: '[[icon:axe]] [[icon:oak]]', text: 'Chop the tree!' },
  collect: { icons: '[[icon:hand]] [[icon:log]] [[icon:right]] [[icon:chest]]', text: 'Collect the wood' },
  openChest: { icons: '[[icon:chest]]', text: 'Open your chest' },
  sell: { icons: '[[icon:log]] [[icon:right]] [[icon:coin]]', text: 'Sell everything' },
  upgrade: { icons: '[[icon:coin]] [[icon:right]] [[icon:up]]', text: 'Buy your first upgrade' },
};

// Kleines Quadrat in der Mitte eines Bereichs (für Hinweise, die auf die ganze Welt zeigen)
const centerRect = (r, s = 40) => {
  if (!r) return null;
  const x = (r.left + r.right) / 2;
  const y = (r.top + r.bottom) / 2;
  return { left: x - s, right: x + s, top: y - s, bottom: y + s, width: s * 2, height: s * 2 };
};

// Hinweise im freien Spiel (je einmal)
const HINTS = {
  workers: { tab: 'board', icons: '[[icon:scroll]] [[icon:worker]]', text: 'New: Board & Team!' },
  build: { tab: 'buildings', icons: '[[icon:hut]] [[icon:planks]]', text: 'New: Build tab!' },
  sapling: { tab: 'chest', icons: '[[icon:sapling]] [[icon:right]] [[icon:soil]]', text: 'Plant saplings from the chest' },
  full: { tab: 'chest', icons: '[[icon:chest]] [[icon:close]] [[icon:right]] [[icon:coin]]', text: 'Chest full · sell!' },
  firstWorker: { tab: 'management', icons: '[[icon:worker]] [[icon:right]] [[icon:axe]] [[icon:log]] [[icon:sapling]]', text: 'Workers work on their own!' },
  replant: { rect: (ui, world) => world.stumpRect(), icons: '[[icon:sapling]] [[icon:right]] [[icon:log]] [[icon:hand]]', text: 'Click the stump to replant' },
  noSapling: { tab: 'chest', icons: '[[icon:sapling]] [[icon:close]] [[icon:right]] [[icon:chest]] [[icon:coin]]', text: 'Buy saplings in the chest' },
  workersTree: { rect: (ui) => ui.treeTabRect('worker'), icons: '[[icon:worker]] [[icon:hut]]', text: 'Get help: Workers tree' },
  payday: { rect: (ui) => ui.elRect('#hud-money'), icons: '[[icon:sun]] [[icon:coin]] [[icon:right]] [[icon:worker]]', text: 'Payday! Wages paid' },
  debt: { rect: (ui) => ui.elRect('#hud-money'), icons: '[[icon:warning]] [[icon:coin]]', text: `In debt: sales −25%` },
  levelUp: { tab: 'management', icons: '[[icon:star]] [[icon:worker]] [[icon:up]]', text: 'Level up! Stats +1' },
  seeds: { tab: 'chest', icons: '[[icon:sapling]] [[icon:right]] [[icon:flag]] [[icon:right]] [[icon:worker]]', text: 'Mark a tile · workers plant' },
  orders: { tab: 'orders', icons: '[[icon:orders]] [[icon:log]] [[icon:right]] [[icon:coin]] [[icon:star]]', text: 'New: Orders! Pay extra' },
  sawmill: { tab: 'buildings', icons: '[[icon:log]] [[icon:right]] [[icon:saw]] [[icon:right]] [[icon:planks]]', text: 'Click the sawmill · [[icon:worker]] help' },
  irrigation: { tab: 'buildings', icons: '[[icon:water]] [[icon:right]] [[icon:sapling]] [[icon:right]]', text: 'Watered tiles grow faster' },
  land: { rect: (ui) => ui.tabRect('plots'), icons: '[[icon:map]] [[icon:coin]] [[icon:right]] [[icon:oak]] +', text: 'Buy land: a new tree bed' },
  landBought: { rect: (ui) => centerRect(ui.elRect('#viewport')), icons: '[[icon:mouse]] [[icon:hand]] [[icon:right]]', text: 'Drag the ground to look around' },
  customerPerk: { tab: 'orders', icons: '[[icon:heart]] [[icon:heart]] [[icon:heart]] [[icon:right]] [[icon:gift]]', text: 'Loyal customer: bonus unlocked!' },
  rushOrder: { tab: 'orders', icons: '[[icon:bolt]] [[icon:orders]] [[icon:clock]]', text: 'Rush order: little time, big pay' },
  // Zufallsereignisse (zeigen aufs Ereignis-Schild oben rechts)
  ev_merchant: { rect: (ui) => ui.elRect('#event-banner'), icons: '[[icon:backpack]] [[icon:right]] [[icon:mouse]]', text: 'Click the merchant for deals' },
  ev_golden: { rect: (ui) => ui.elRect('#event-banner'), icons: '[[icon:star]] [[icon:axe]] [[icon:right]] [[icon:coin]]', text: 'Chop the golden tree!' },
  ev_storm: { rect: (ui) => ui.elRect('#event-banner'), icons: '[[icon:bolt]] [[icon:oak]] [[icon:right]] [[icon:log]]', text: 'Lightning fells trees · collect the logs' },
  wagesLow: { rect: (ui) => ui.elRect('#hud-money'), icons: '[[icon:sun]] [[icon:coin]] [[icon:warning]]', text: 'Not enough coins for payday!' },
  // Ruf-Stufen: was neu freigeschaltet wurde
  ...Object.fromEntries(Object.entries(REP_UNLOCKS).map(([lvl, u]) => [
    `rep${lvl}`, { tab: 'orders', icons: `[[icon:star]] ${lvl} [[icon:right]] ${u.icon}`, text: u.text },
  ])),
};

export function createTutorial(state, world, ui) {
  // ---- DOM ----
  const root = document.createElement('div');
  root.id = 'tutorial';
  root.innerHTML = renderIcons(`
    <div class="tut-hole" hidden></div>
    <div class="tut-bubble" hidden>
      <div class="tut-icons"></div>
      <div class="tut-text"></div>
      <div class="tut-dots"></div>
    </div>
    <div class="tut-hand" hidden></div>`);
  document.body.appendChild(root);
  const hole = root.querySelector('.tut-hole');
  const bubble = root.querySelector('.tut-bubble');
  const iconsEl = root.querySelector('.tut-icons');
  const textEl = root.querySelector('.tut-text');
  const dotsEl = root.querySelector('.tut-dots');
  const hand = root.querySelector('.tut-hand');
  hand.style.backgroundImage = `url("${handImageUrl(3)}")`;

  let hint = null; // { key, until, tab }
  let finaleUntil = 0;

  const active = () => state.tutorial !== 'done';

  // ---- Sperre: im Tutorial ist nur das aktuelle Ziel klickbar ----
  ui.setGate((action, id) => {
    if (!active() || action === 'settings') return true; // Ton usw. geht immer
    const step = state.tutorial;
    if (action === 'tab') return step === 'openChest' && id === 'chest';
    if (action === 'sell') return step === 'sell';
    if (action === 'skill') return step === 'upgrade' && id === 'haul';
    return false; // Skill-Tree wechseln, Pflanzen usw. erst danach
  });

  function setStep(step) {
    state.tutorial = step;
    if (step === 'upgrade') ui.showTree('click');
    if (step !== 'done') sfx.knock(1.4, 0.12);
    renderBubble();
  }

  function renderBubble(info = STEP_INFO[state.tutorial], showDots = true) {
    if (!info) return;
    setIconText(iconsEl, info.icons);
    setIconText(textEl, info.text);
    const idx = STEPS.indexOf(state.tutorial);
    dotsEl.innerHTML = renderIcons(showDots ? STEPS.map((_, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}"></span>`).join('') : '');
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  }

  function finish() {
    state.tutorial = 'done';
    finaleUntil = performance.now() + 2800;
    renderBubble({ icons: '[[icon:star]] [[icon:oak]] [[icon:axe]] [[icon:coin]]', text: 'Have fun!' }, false);
    sfx.buy();
  }

  // ---- Fortschritt über Spiel-Ereignisse ----
  on('treeFelled', () => state.tutorial === 'chop' && setStep('collect'));
  on('itemDeposited', ({ kind }) => {
    if (state.tutorial === 'collect') setStep('openChest');
    if (ITEM_DEFS[kind]?.type === 'sapling') showHint('sapling');
  });
  on('windowOpened', ({ id }) => state.tutorial === 'openChest' && id === 'chest' && setStep('sell'));
  on('sold', () => state.tutorial === 'sell' && setStep('upgrade'));
  on('skillBought', ({ id }) => state.tutorial === 'upgrade' && id === 'haul' && finish());
  on('tabUnlocked', ({ id }) => {
    if (id === 'board') showHint('workers');
    if (id === 'buildings') showHint('build');
    if (id === 'orders') showHint('orders');
  });
  on('repLevel', ({ level }) => showHint(`rep${level}`));
  on('buildingPlaced', ({ type }) => showHint(type === 'sawmill' ? 'sawmill' : 'irrigation'));
  on('chestFull', () => showHint('full'));
  on('treeFelled', () => showHint('replant'));
  on('noSapling', () => showHint('noSapling'));
  on('workerHired', () => showHint('firstWorker'));
  on('seedMarked', () => showHint('seeds'));
  on('payday', () => showHint('payday'));
  on('debt', () => showHint('debt'));
  on('workerLevelUp', () => showHint('levelUp'));
  on('landExpanded', () => showHint('landBought'));
  on('customerLove', ({ perkUp }) => perkUp && showHint('customerPerk'));
  on('orderNew', ({ order }) => order.kind === 'rush' && showHint('rushOrder'));
  on('randomEvent', ({ id }) => HINTS[`ev_${id}`] && showHint(`ev_${id}`));

  // ---- Hinweise im freien Spiel ----
  function showHint(key) {
    if (active() || state.hints[key]) return;
    state.hints[key] = true;
    hint = { key, until: performance.now() + 6500, ...HINTS[key] };
    renderBubble(HINTS[key], false);
    sfx.knock(1.5, 0.1);
  }
  window.addEventListener('pointerdown', () => {
    if (hint && performance.now() > hint.until - 6000) hint = null; // nach kurzer Zeit per Klick schließbar
  });

  // ---- Positionen jeden Frame ----
  function targetRect() {
    switch (state.tutorial) {
      case 'chop': return world.treeRect(0);
      case 'collect': return world.itemRect();
      case 'openChest': return ui.tabRect('chest');
      case 'sell': return ui.elRect('#chest-sell-all');
      case 'upgrade': {
        // Preisschild unter dem Knoten mit hervorheben
        const r = ui.nodeRect('haul');
        return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom + 16 };
      }
      default: return null;
    }
  }

  function placeBubble(rect) {
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left;
    let top;
    if (!rect) {
      left = window.innerWidth / 2 - bw / 2;
      top = window.innerHeight * 0.3;
    } else if (rect.left < 200) {
      // Ziel links am Rand: Blase rechts daneben
      left = rect.right + 24;
      top = (rect.top + rect.bottom) / 2 - bh / 2;
    } else if (rect.top > bh + 40) {
      left = (rect.left + rect.right) / 2 - bw / 2;
      top = rect.top - bh - 26;
    } else {
      left = (rect.left + rect.right) / 2 - bw / 2;
      top = rect.bottom + 70;
    }
    bubble.style.left = Math.max(8, Math.min(window.innerWidth - bw - 8, left)) + 'px';
    bubble.style.top = Math.max(8, Math.min(window.innerHeight - bh - 8, top)) + 'px';
  }

  function update() {
    if (!active() && !state.hints.workersTree && !(state.skills.hut > 0) && state.money >= 50) showHint('workersTree');
    // Erstes Land leistbar (erst nach der Hütte, damit sich die Hinweise nicht drängeln)
    if (!active() && !state.hints.land && state.skills.hut > 0 && rowsBought(state) === 0
      && state.money >= Math.min(...SIDES.map((s) => rowPrice(state, s)))) showHint('land');
    if (!active() && !state.hints.wagesLow && paydayShortfall(state)) showHint('wagesLow');
    // Fenster im Verkaufs-Schritt geschlossen? Dann wieder zur Truhe führen
    if (state.tutorial === 'sell' && !ui.isWindowOpen('chest')) setStep('openChest');
    if (state.tutorial === 'upgrade' && ui.activeTree() !== 'click') ui.showTree('click');

    const now = performance.now();
    if (active()) {
      const r = targetRect();
      root.classList.add('dim');
      bubble.hidden = false;
      if (r) {
        const pad = 10;
        hole.hidden = false;
        Object.assign(hole.style, {
          left: r.left - pad + 'px',
          top: r.top - pad + 'px',
          width: r.right - r.left + pad * 2 + 'px',
          height: r.bottom - r.top + pad * 2 + 'px',
        });
        hand.hidden = false;
        hand.style.left = (r.left + r.right) / 2 - 10 + 'px';
        hand.style.top = r.bottom + 4 + 'px';
      } else {
        // Ziel gerade nicht sichtbar (z. B. Holz fliegt noch): alles abdunkeln
        hole.hidden = true;
        hand.hidden = true;
      }
      placeBubble(r);
      return;
    }

    root.classList.remove('dim');
    hole.hidden = true;
    if (now < finaleUntil) {
      bubble.hidden = false;
      hand.hidden = true;
      placeBubble(null);
      return;
    }
    if (hint && now < hint.until) {
      const r = hint.rect ? hint.rect(ui, world) : ui.tabRect(hint.tab);
      bubble.hidden = !r;
      hand.hidden = true;
      if (r) {
        placeBubble(r);
        hole.hidden = false;
        hole.classList.add('glow-only');
        Object.assign(hole.style, { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
      }
      return;
    }
    hint = null;
    hole.classList.remove('glow-only');
    bubble.hidden = true;
    hand.hidden = true;
  }

  if (active()) renderBubble();
  return { update };
}
