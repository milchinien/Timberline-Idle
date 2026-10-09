// Zentraler Spielzustand. Alle Zahlen hier sind Platzhalter und noch nicht balanciert.
import { SKILL_TREES } from './skilltrees.js';
import { totalWages, normalizeWorker, PAYDAY_HOUR, DEBT_GARNISH } from './workers.js';
import { emit } from './events.js';
import { repLevelFor } from './progress.js';
import { defaultLand, rowsBought, TREE_SLOTS_PER_ROW } from './land.js';
import { applyCustomerPerks } from './customers.js';
import { REP_PRICE_BONUS } from './progress.js';

export const DAY_SECONDS = 300; // Ein Ingame-Tag = 5 Minuten bei x1
export const SPEEDS = [1, 2, 4];

// Alles, was in der Truhe liegen kann. Jedes Stück belegt einen Truhen-Platz.
// baseValue = Verkaufswert pro Stück, wird mit state.woodPrice (Händler-Skills) multipliziert.
// type: 'log' (Stamm), 'plank' (Brett aus dem Sägewerk), 'sapling' (pflanzbar), 'special'.
// Reihenfolge = Reihenfolge in der Truhe. Alte Keys ('wood', 'sapling') bleiben für Spielstände.
export const ITEM_DEFS = {
  wood: { name: 'Oak Log', type: 'log', species: 'oak', baseValue: 1 },
  birch_log: { name: 'Birch Log', type: 'log', species: 'birch', baseValue: 1 },
  pine_log: { name: 'Pine Log', type: 'log', species: 'pine', baseValue: 1.5 },
  oak_plank: { name: 'Oak Plank', type: 'plank', species: 'oak', baseValue: 3 },
  birch_plank: { name: 'Birch Plank', type: 'plank', species: 'birch', baseValue: 2.5 },
  pine_plank: { name: 'Pine Plank', type: 'plank', species: 'pine', baseValue: 4 },
  goldwood: { name: 'Gold Wood', type: 'special', baseValue: 10 },
  sapling: { name: 'Oak Sapling', type: 'sapling', species: 'oak', baseValue: 1, plantable: true },
  birch_sapling: { name: 'Birch Sapling', type: 'sapling', species: 'birch', baseValue: 1, plantable: true },
  pine_sapling: { name: 'Pine Sapling', type: 'sapling', species: 'pine', baseValue: 1.5, plantable: true },
};

// Böden, die man im Gebäude-Tab kauft und auf ein Feld legt
export const SOIL_DEFS = {
  rich: {
    name: 'Rich Soil',
    desc: 'A tree on this tile regrows 50% faster.',
    growthMult: 1.5,
    price: (placed) => Math.round(40 * 1.35 ** placed),
  },
};

// Grundwerte ohne Skills. Skills verändern nur abgeleitete Werte (siehe recomputeStats).
export const BASE_STATS = {
  // --- Klicken ---
  clickPower: 1, // Schaden pro Klick
  clickPowerMult: 1, // Titan Axe
  critChance: 0, // 0..1
  critMult: 3,
  combo: false, // Holzfäller-Rhythmus
  comboMax: 10, // Combo-Stufen (je +10 % Schaden)
  frenzy: false, // jede Combo-Stufe +1,5 % Krit-Chance
  splinterChance: 0, // Chance pro Treffer auf einen Bonus-Stamm
  woodpecker: 0, // Specht-Stufe (pickt von selbst)
  woodPerTree: 2,
  pickupRadius: 0, // Welt-Einheiten: weitere Scheite im Umkreis mit einsammeln
  goldenChance: 0, // Chance pro Scheit auf Goldholz
  magnet: false, // liegende Scheite fliegen von selbst in die Truhe
  magnetDelay: 5, // Sekunden bis der Magnet zieht
  woodCap: 20, // Truhen-Plätze (alle Items zusammen)
  woodPrice: 1, // Preis-Multiplikator beim Verkauf
  goldValueMult: 1, // Gold Appraiser
  growthMult: 1, // Wachstumsgeschwindigkeit der Bäume
  treeCap: 3, // Baum-Obergrenze: Bäume + Stümpfe + markierte Felder
  saplingBonus: 0, // zusätzliche Chance auf einen zweiten Setzling beim Fällen
  autoReplant: false, // Stump Grinder: Stümpfe bepflanzen sich selbst
  headStart: 0, // neue Setzlinge starten schon teilweise gewachsen (0..1)
  saplingPriceMult: 1, // Nursery
  soilBonus: 0, // zusätzliches Wachstum auf Rich Soil
  soilPriceMult: 1,
  autoSell: false,
  plankPriceMult: 1, // Shipwright Ole
  landPriceMult: 1, // Mayor Greta
  buildPriceMult: 1, // Builder Bob
  sawSpeedMult: 1, // Carpenter Hugo
  offlineHours: 2, // so lange arbeitet das Team weiter, während man weg ist
  // --- Worker ---
  workerCap: 0, // Worker-Plätze (erster Platz über den Worker-Tree)
  workerSpeedMult: 1,
  workerSwingMult: 1,
  workerDamageMult: 1,
  workerCarryBonus: 0,
  boardSize: 3, // Zettel am Board
  rarityBoost: 0, // bessere Seltenheit auf dem Board
  rerollPriceMult: 1,
  xpMult: 1,
  levelCapBonus: 0,
  wageMult: 1,
  nightProof: false, // Lanterns
  hireDiscount: 1,
  masterclass: false,
  teamSpirit: false,
};

export function createState() {
  const state = {
    money: 0,
    inventory: Object.fromEntries(Object.keys(ITEM_DEFS).map((k) => [k, 0])),
    soils: {}, // 'i,j' -> Bodenart
    workers: [], // eingestellte Worker (siehe workers.js)
    board: null, // Zettel am Board: { day, notes }
    day: 1,
    hour: 8, // 0..24
    speed: 1,
    skills: {}, // id -> Stufe
    tutorial: 'chop', // Schritt des Einstiegs-Tutorials, 'done' = freies Spiel
    hints: {}, // bereits gezeigte Hinweise
    reputation: 0, // Ruf-Punkte aus Aufträgen
    orders: null, // { list, nextIn, seq } siehe orders.js
    autoSellRules: {}, // Item -> { on, keep }: was der Auto-Verkauf verkauft und wie viel bleibt
    land: defaultLand(), // gekaufte Plot-Reihen je Seite (siehe land.js)
    customers: {}, // Kunden-id -> { pts, orders }: Treue (siehe customers.js)
    idle: null, // gemessene Produktion ohne Klicks, für den Offline-Fortschritt (siehe offline.js)
    playTime: 0, // gespielte Zeit in Sekunden (fürs Hauptmenü)
    beds: [], // Baumbeete 'i,j': nur hier wachsen Bäume (Anzahl = treeCap, siehe world.js)
    treeCapSeen: null, // höchster bisher gefeierter Baumplatz-Stand (neues Beet = kleines Fest)
  };
  recomputeStats(state);
  return state;
}

// Abgeleitete Werte aus Grundwerten + gekauften Skill-Stufen neu berechnen
export function recomputeStats(state) {
  Object.assign(state, BASE_STATS);
  state.repLevel = repLevelFor(state.reputation ?? 0);
  for (const tree of SKILL_TREES) {
    for (const node of tree.nodes) {
      const lvl = state.skills[node.id] ?? 0;
      if (lvl > 0) node.apply(state, lvl);
    }
  }
  state.treeCap += rowsBought(state) * TREE_SLOTS_PER_ROW; // gekauftes Land gibt Baumplätze
  state.woodPrice *= 1 + REP_PRICE_BONUS * state.repLevel; // bekannter Name: Markt zahlt mehr
  applyCustomerPerks(state); // Boni treuer Stammkunden
}

// Tabs links: Plots und Truhe gibt es immer, der Rest wird über Skills freigeschaltet
export function isTabUnlocked(state, tab) {
  if (tab === 'board' || tab === 'management') return (state.skills.hut ?? 0) > 0;
  if (tab === 'buildings') return (state.skills.construction ?? 0) > 0;
  if (tab === 'orders') return (state.skills.orders ?? 0) > 0;
  return true;
}

// ---- Truhe ----
export function chestUsed(state) {
  return Object.values(state.inventory).reduce((a, b) => a + b, 0);
}

export function itemPrice(state, key) {
  const def = ITEM_DEFS[key];
  const special = key === 'goldwood' ? state.goldValueMult : def.type === 'plank' ? state.plankPriceMult : 1;
  return def.baseValue * state.woodPrice * special * (state.eventPriceMult ?? 1); // Markttag (Zufallsereignis)
}

// Preis für das nächste Feld einer Bodenart (steigt mit jedem gelegten Feld, Soil Science macht günstiger)
export function soilPrice(state, type) {
  const placed = Object.values(state.soils).filter((t) => t === type).length;
  return Math.round(SOIL_DEFS[type].price(placed) * state.soilPriceMult);
}

export function inventoryValue(state) {
  return Object.keys(ITEM_DEFS).reduce((sum, k) => sum + state.inventory[k] * itemPrice(state, k), 0);
}

// Einnahme gutschreiben: solange man im Minus ist, wird ein Teil gepfändet. Gibt den echten Betrag zurück.
export function earn(state, amount) {
  const earned = state.money < 0 ? amount * (1 - DEBT_GARNISH) : amount;
  state.money += earned;
  return earned;
}

// Verkauft n Stück (Standard: alle) einer Sorte, gibt den Erlös zurück
export function sellItem(state, key, n = state.inventory[key]) {
  const count = Math.min(n, state.inventory[key]);
  if (count <= 0) return 0;
  state.inventory[key] -= count;
  return earn(state, count * itemPrice(state, key));
}

// Verkauft alles; onlyTypes beschränkt auf bestimmte Item-Typen (Auto-Verkauf: nur Stämme und Goldholz)
export function sellAll(state, { onlyTypes = null } = {}) {
  let earned = 0;
  for (const key of Object.keys(ITEM_DEFS)) {
    if (onlyTypes && !onlyTypes.includes(ITEM_DEFS[key].type)) continue;
    earned += sellItem(state, key);
  }
  return earned;
}

// ---- Auto-Verkauf ----
// Standard: Stämme und Goldholz werden verkauft; Bretter (für Aufträge) und Setzlinge bleiben
const AUTO_SELL_DEFAULT_TYPES = ['log', 'special'];
export function autoSellRule(state, key) {
  state.autoSellRules ??= {};
  state.autoSellRules[key] ??= { on: AUTO_SELL_DEFAULT_TYPES.includes(ITEM_DEFS[key].type), keep: 0 };
  return state.autoSellRules[key];
}
// Was offene Aufträge von einer Sorte brauchen: das verkauft der Auto-Verkauf nicht
export function orderReserve(state, key) {
  return (state.orders?.list ?? []).reduce((s, o) => s + o.items.reduce((t, it) => t + (it.key === key ? it.n : 0), 0), 0);
}

// Verkauft alles, was eine aktive Regel hat, bis auf die "keep"-Menge und was Aufträge brauchen
// Bringt das nichts (Truhe voll mit Ware für Aufträge), wird die Reservierung ignoriert –
// sonst bliebe die Truhe für immer voll und das Team stünde still.
export function autoSellNow(state, ignoreOrders = false) {
  let earned = 0;
  for (const key of Object.keys(ITEM_DEFS)) {
    const rule = autoSellRule(state, key);
    if (!rule.on) continue;
    const n = (state.inventory[key] ?? 0) - Math.max(rule.keep, ignoreOrders ? 0 : orderReserve(state, key));
    if (n > 0) earned += sellItem(state, key, n);
  }
  if (earned <= 0 && !ignoreOrders) return autoSellNow(state, true);
  return earned;
}

// Zeit vorspulen; gibt die Anzahl der Zahltage zurück. quiet: ohne Effekte (Offline-Fortschritt)
export function advanceTime(state, gameSeconds, { quiet = false } = {}) {
  const before = state.day * 24 + state.hour;
  state.hour += (gameSeconds * 24) / DAY_SECONDS;
  while (state.hour >= 24) {
    state.hour -= 24;
    state.day += 1;
  }
  // Zahltag jeden Morgen: alle Worker bekommen ihren Tageslohn (man darf ins Minus rutschen)
  const after = state.day * 24 + state.hour;
  const paydays = Math.floor((after - PAYDAY_HOUR) / 24) - Math.floor((before - PAYDAY_HOUR) / 24);
  for (let i = 0; i < paydays; i++) payWages(state, quiet);
  return paydays;
}

export function payWages(state, quiet = false) {
  const total = totalWages(state);
  if (total <= 0) return;
  const wasPositive = state.money >= 0;
  state.money -= total;
  if (quiet) return;
  emit('payday', { total });
  if (wasPositive && state.money < 0) emit('debt');
}

export function isDay(hour) {
  return hour >= 6 && hour < 20;
}

export function formatNumber(n) {
  if (n < 0) return '-' + formatNumber(-n); // Schulden: gleiche Kürzung, Rundung zur Null hin
  if (n < 1000) return Number.isInteger(n) || n >= 100 ? String(Math.floor(n)) : n.toFixed(1).replace(/\.0$/, '');
  const units = ['k', 'M', 'B', 'T'];
  let i = -1;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + units[i];
}

// Gespeicherte Werte aus einem Spielstand übernehmen (nur bekannte Felder)
export const SAVED_FIELDS = ['money', 'inventory', 'soils', 'workers', 'board', 'day', 'hour', 'speed', 'skills', 'tutorial', 'hints', 'reputation', 'orders', 'autoSellRules', 'land', 'customers', 'idle', 'playTime', 'beds', 'treeCapSeen'];

export function applySave(state, saved) {
  for (const key of SAVED_FIELDS) {
    if (saved[key] === undefined) continue;
    if (key === 'inventory' || key === 'land') Object.assign(state[key], saved[key]);
    else if (key === 'workers') state.workers = (Array.isArray(saved.workers) ? saved.workers : []).map(normalizeWorker);
    else state[key] = saved[key];
  }
  recomputeStats(state);
}

export function formatClock(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
