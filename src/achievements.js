import { renderIcons } from './icons.js';
// Achievements: gelten für alle Spielstände (eigener Speicher), werden im Spiel freigeschaltet
// und im Hauptmenü angezeigt. Zähler (z. B. gefällte Bäume) laufen über alle Spielstände weiter.
import { on } from './events.js';
import { rowsBought, MAX_ROWS_PER_SIDE, SIDES } from './land.js';
import * as sfx from './sfx.js';

const KEY = 'lumberjack-idle-achievements';

// check(state, stats) -> true, sobald erreicht. Reihenfolge = Reihenfolge in der Liste.
export const ACHIEVEMENTS = [
  { id: 'first_chop', icon: '[[icon:axe]]', name: 'First Chop', desc: 'Fell your first tree', check: (s, st) => st.trees >= 1 },
  { id: 'lumberjack', icon: '[[icon:pine]]', name: 'Lumberjack', desc: 'Fell 100 trees', check: (s, st) => st.trees >= 100 },
  { id: 'timber_tycoon', icon: '[[icon:mountain]]', name: 'Timber Tycoon', desc: 'Fell 1,000 trees', check: (s, st) => st.trees >= 1000 },
  { id: 'first_sale', icon: '[[icon:coin]]', name: 'First Coin', desc: 'Sell something at the market', check: (s, st) => st.sales >= 1 },
  { id: 'moneybags', icon: '[[icon:coin]]', name: 'Moneybags', desc: 'Have 1,000 coins at once', check: (s) => s.money >= 1000 },
  { id: 'oak_baron', icon: '[[icon:coin]]', name: 'Oak Baron', desc: 'Have 100,000 coins at once', check: (s) => s.money >= 100000 },
  { id: 'hired_help', icon: '[[icon:worker]]', name: 'Hired Help', desc: 'Hire your first worker', check: (s) => s.workers.length >= 1 },
  { id: 'full_crew', icon: '[[icon:hut]]', name: 'Full Crew', desc: 'Have 6 workers at once', check: (s) => s.workers.length >= 6 },
  { id: 'veteran', icon: '[[icon:star]]', name: 'Veteran', desc: 'Get a worker to level 10', check: (s) => s.workers.some((w) => w.level >= 10) },
  { id: 'grove', icon: '[[icon:sapling]]', name: 'Little Grove', desc: 'Have 5 tree beds', check: (s) => s.treeCap >= 5 },
  { id: 'woodland', icon: '[[icon:oak]]', name: 'Woodland', desc: 'Have 10 tree beds', check: (s) => s.treeCap >= 10 },
  { id: 'old_forest', icon: '[[icon:pine]]', name: 'Old Forest', desc: 'Have 15 tree beds', check: (s) => s.treeCap >= 15 },
  { id: 'land_ho', icon: '[[icon:map]]', name: 'Land Ho!', desc: 'Buy your first row of land', check: (s) => rowsBought(s) >= 1 },
  { id: 'wide_open', icon: '[[icon:map]]', name: 'Wide Open', desc: 'Buy every row of land', check: (s) => rowsBought(s) >= SIDES.length * MAX_ROWS_PER_SIDE },
  { id: 'first_order', icon: '[[icon:orders]]', name: 'Happy Customer', desc: 'Deliver your first order', check: (s, st) => st.orders >= 1 },
  { id: 'regular', icon: '[[icon:handshake]]', name: 'Regular Business', desc: 'Deliver 50 orders', check: (s, st) => st.orders >= 50 },
  { id: 'best_friends', icon: '[[icon:heart]]', name: 'Best Friends', desc: 'Get a customer to 5 hearts', check: (s, st) => st.maxHearts >= 5 },
  { id: 'famous', icon: '[[icon:crown]]', name: 'Famous', desc: 'Reach reputation level 6', check: (s) => (s.repLevel ?? 0) >= 6 },
  { id: 'sawdust', icon: '[[icon:saw]]', name: 'Sawdust', desc: 'Build a sawmill', check: (s, st) => st.sawmills >= 1 },
  { id: 'golden_touch', icon: '[[icon:star]]', name: 'Golden Touch', desc: 'Find gold wood', check: (s, st) => st.gold >= 1 },
  { id: 'skillful', icon: '[[icon:oak]]', name: 'Well Rounded', desc: 'Own 30 skills', check: (s) => Object.keys(s.skills).length >= 30 },
  { id: 'ten_days', icon: '[[icon:clock]]', name: 'Settled In', desc: 'Reach day 10', check: (s) => s.day >= 10 },
  { id: 'in_the_red', icon: '[[icon:warning]]', name: 'In the Red', desc: 'Go into debt (it happens!)', check: (s, st) => st.debt >= 1 },
  { id: 'welcome_back', icon: '[[icon:sun]]', name: 'Welcome Back', desc: 'Return after your team worked without you', check: (s, st) => st.returns >= 1 },
  { id: 'gold_rush', icon: '[[icon:star]]', name: 'Gold Rush', desc: 'Chop down a golden tree', check: (s, st) => st.goldenTrees >= 1 },
  { id: 'good_deal', icon: '[[icon:backpack]]', name: 'Good Deal', desc: 'Trade with the traveling merchant', check: (s, st) => st.merchantDeals >= 1 },
  { id: 'storm_chaser', icon: '[[icon:bolt]]', name: 'Storm Chaser', desc: 'Weather 3 thunderstorms', check: (s, st) => st.storms >= 3 },
];

// ---- Speicher (für alle Spielstände gemeinsam) ----
export function loadAchievements() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { unlocked: d.unlocked ?? {}, stats: d.stats ?? {} };
  } catch {
    return { unlocked: {}, stats: {} };
  }
}
function store(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // egal
  }
}
export function clearAchievements() {
  localStorage.removeItem(KEY);
}

// ---- Im Spiel: Zähler über Ereignisse, Prüfung jede Sekunde, Einblendung bei Freischaltung ----
export function startAchievements(state) {
  const data = loadAchievements();
  const st = data.stats;
  const add = (k, n = 1) => {
    st[k] = (st[k] ?? 0) + n;
  };
  on('treeFelled', () => add('trees'));
  on('sold', ({ earned }) => earned > 0 && add('sales'));
  on('orderDone', () => add('orders'));
  on('customerLove', ({ hearts }) => {
    st.maxHearts = Math.max(st.maxHearts ?? 0, hearts);
  });
  on('buildingPlaced', ({ type }) => type === 'sawmill' && add('sawmills'));
  on('itemDeposited', ({ kind }) => kind === 'goldwood' && add('gold'));
  on('debt', () => add('debt'));
  on('welcomeBack', () => add('returns'));
  on('goldenTreeFelled', () => add('goldenTrees'));
  on('merchantDeal', () => add('merchantDeals'));
  on('randomEventEnd', ({ id }) => id === 'storm' && add('storms'));

  const toasts = createToasts();
  function check() {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (data.unlocked[a.id] || !a.check(state, st)) continue;
      data.unlocked[a.id] = Date.now();
      toasts.show(a);
      changed = true;
    }
    store(data);
    return changed;
  }
  setInterval(check, 1000);
  window.addEventListener('beforeunload', () => store(data));
  return { check };
}

// Holzschild oben in der Mitte, das kurz herunterschwingt
function createToasts() {
  const root = document.createElement('div');
  root.id = 'achievement-toasts';
  document.body.appendChild(root);
  return {
    show(a) {
      const el = document.createElement('div');
      el.className = 'ach-toast';
      el.innerHTML = renderIcons(`<span class="ach-toast-icon">${a.icon}</span><div><small>[[icon:trophy]] Achievement unlocked</small><b>${a.name}</b><span>${a.desc}</span></div>`);
      root.appendChild(el);
      sfx.fanfare();
      setTimeout(() => el.classList.add('out'), 4200);
      setTimeout(() => el.remove(), 4700);
    },
  };
}
