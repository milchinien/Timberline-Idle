// Aufträge: Stammkunden bestellen Waren mit Zeitlimit. Bezahlung deutlich über Marktpreis, dazu Trinkgeld
// für schnelle Lieferung, Ruf-Punkte und Treue beim Kunden (Herzen -> dauerhafte Boni, siehe customers.js).
// Bestellt wird nur, was der Spieler herstellen kann (freigeschaltete Holzarten, Bretter erst mit Sägewerk).
import { ITEM_DEFS, itemPrice, earn, recomputeStats } from './state.js';
import { repLevelFor } from './progress.js';
import { SPECIES_ORDER, speciesOf, isSpeciesUnlocked } from './species.js';
import { CUSTOMERS, customerByName, love, hearts, heartsFor, perkTier } from './customers.js';
import { emit } from './events.js';

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Auftragsarten: Eilauftrag (wenig Zeit, mehr Geld), Großauftrag (viel Ware, viel Ruf und Treue)
export const ORDER_KINDS = {
  normal: { name: 'Order', icon: '[[icon:orders]]', time: 1, qty: 1, reward: 1, rep: 1, love: 1 },
  rush: { name: 'Rush', icon: '[[icon:bolt]]', time: 0.45, qty: 0.8, reward: 1.4, rep: 1, love: 1 },
  bulk: { name: 'Big contract', icon: '[[icon:scroll]]', time: 1.7, qty: 2.2, reward: 1.25, rep: 2, love: 2 },
};
export const TIP_MAX = 0.3; // Trinkgeld bei sofortiger Lieferung (sinkt mit der Zeit auf 0)
export const HEART_BONUS = 0.05; // jedes Herz des Kunden: +5 % Bezahlung
export const LOVE_LOST_ON_EXPIRE = 1; // abgelaufen: Kunde ist enttäuscht

export const orderSlots = (state) => 3 + (state.repLevel >= 4 ? 1 : 0);
// Aufschlag gegenüber dem Marktpreis: steigt mit dem Ruf
export const rewardMult = (state) => 1.8 + 0.06 * state.repLevel + (state.repLevel >= 5 ? 0.25 : 0) + (state.repLevel >= 6 ? 0.25 : 0);

export function ensureOrders(state) {
  state.orders ??= { list: [], nextIn: 3, seq: 1 };
  // alte Aufträge: Kunde nur mit Name/Icon gespeichert, ohne Art
  for (const o of state.orders.list) {
    if (!o.customerId) o.customerId = customerByName(o.customer?.name)?.id ?? CUSTOMERS[0].id;
    o.kind ??= 'normal';
  }
}

// Was der Spieler gerade herstellen kann
export function producibleItems(state, hasSawmill) {
  const keys = [];
  for (const id of SPECIES_ORDER) {
    if (!isSpeciesUnlocked(state, id)) continue;
    const sp = speciesOf(id);
    keys.push(sp.log);
    if (hasSawmill) keys.push(sp.plank, sp.plank); // Bretter doppelt gewichtet
  }
  return keys;
}

function rollKind(state) {
  const r = Math.random();
  if (state.repLevel >= 1 && r < 0.14) return 'bulk';
  if (r < 0.4) return 'rush';
  return 'normal';
}

function makeOrder(state, hasSawmill) {
  // jeder Kunde hat höchstens einen offenen Auftrag
  const busy = new Set(state.orders.list.map((o) => o.customerId));
  const free = CUSTOMERS.filter((c) => !busy.has(c.id));
  if (!free.length) return null;
  const customer = pick(free);
  const kind = rollKind(state);
  const k = ORDER_KINDS[kind];
  const pool = producibleItems(state, hasSawmill);
  const kinds = pool.length > 1 && Math.random() < 0.45 ? 2 : 1;
  const keys = [];
  while (keys.length < kinds) {
    const key = pick(pool);
    if (!keys.includes(key)) keys.push(key);
  }
  const items = keys.map((key) => {
    const base = (4 + state.repLevel * 2 + randInt(0, 6)) * k.qty;
    const n = Math.max(2, Math.round(ITEM_DEFS[key].type === 'plank' ? base * 0.6 : base));
    return { key, n };
  });
  const units = items.reduce((s, it) => s + it.n, 0);
  const value = items.reduce((s, it) => s + it.n * itemPrice(state, it.key), 0);
  const hasPlanks = items.some((it) => ITEM_DEFS[it.key].type === 'plank');
  const time = Math.round((180 + units * 8) * k.time); // Spielsekunden
  const heartMult = 1 + HEART_BONUS * hearts(state, customer.id);
  return {
    id: state.orders.seq++,
    customerId: customer.id,
    kind,
    items,
    reward: Math.max(5, Math.round(value * rewardMult(state) * k.reward * heartMult)),
    rep: (1 + Math.floor(units / 10) + (hasPlanks ? 1 : 0)) * k.rep,
    time,
    total: time,
  };
}

// Trinkgeld, wenn jetzt geliefert wird: voll bei frischem Auftrag, sinkt bis zum Ablauf auf 0
export const tipNow = (order) => Math.round(order.reward * TIP_MAX * Math.max(0, order.time / order.total));

// pro Frame (Spielzeit): Zeit läuft ab, neue Kunden kommen
export function tickOrders(state, gameDt, hasSawmill) {
  if (!(state.skills.orders > 0)) return;
  ensureOrders(state);
  const o = state.orders;
  for (const order of o.list) order.time -= gameDt;
  for (const order of o.list.filter((x) => x.time <= 0)) {
    // abgelaufen: der Kunde ist enttäuscht und geht
    const l = love(state, order.customerId);
    const before = heartsFor(l.pts);
    l.pts = Math.max(0, l.pts - LOVE_LOST_ON_EXPIRE);
    if (perkTier(heartsFor(l.pts)) !== perkTier(before)) recomputeStats(state);
    emit('orderExpired', { order });
  }
  o.list = o.list.filter((order) => order.time > 0);
  if (o.list.length < orderSlots(state)) {
    o.nextIn -= gameDt;
    if (o.nextIn <= 0) addOrder(state, hasSawmill);
  }
}

function addOrder(state, hasSawmill) {
  const order = makeOrder(state, hasSawmill);
  state.orders.nextIn = 25 + Math.random() * 20;
  if (!order) return null;
  state.orders.list.push(order);
  emit('orderNew', { order });
  return order;
}

// Freie Plätze sofort füllen (nach dem Offline-Fortschritt: "während du weg warst, kamen Kunden")
export function fillOrders(state, hasSawmill) {
  if (!(state.skills.orders > 0)) return 0;
  ensureOrders(state);
  let n = 0;
  while (state.orders.list.length < orderSlots(state) && addOrder(state, hasSawmill)) n++;
  return n;
}

export const canDeliver = (state, order) => order.items.every(({ key, n }) => (state.inventory[key] ?? 0) >= n);

export function deliverOrder(state, id) {
  ensureOrders(state);
  const order = state.orders.list.find((x) => x.id === id);
  if (!order || !canDeliver(state, order)) return null;
  for (const { key, n } of order.items) state.inventory[key] -= n;
  order.tip = tipNow(order);
  order.paid = earn(state, order.reward + order.tip); // im Minus wird wie beim Verkauf gepfändet
  const before = state.repLevel;
  state.reputation = (state.reputation ?? 0) + order.rep;
  state.repLevel = repLevelFor(state.reputation);
  // Treue: Herzen beim Kunden, neue Bonus-Stufe wirkt sofort
  const l = love(state, order.customerId);
  const heartsBefore = heartsFor(l.pts);
  l.pts += ORDER_KINDS[order.kind]?.love ?? 1;
  l.orders += 1;
  const heartsAfter = heartsFor(l.pts);
  state.orders.list = state.orders.list.filter((x) => x.id !== id);
  state.orders.nextIn = Math.min(state.orders.nextIn, 8);
  if (state.repLevel > before || perkTier(heartsAfter) !== perkTier(heartsBefore)) recomputeStats(state);
  emit('orderDone', { order });
  if (heartsAfter > heartsBefore) emit('customerLove', { id: order.customerId, hearts: heartsAfter, perkUp: perkTier(heartsAfter) > perkTier(heartsBefore) });
  if (state.repLevel > before) emit('repLevel', { level: state.repLevel });
  return order;
}

export function declineOrder(state, id) {
  ensureOrders(state);
  const order = state.orders.list.find((x) => x.id === id);
  state.orders.list = state.orders.list.filter((x) => x.id !== id);
  state.orders.nextIn = Math.min(state.orders.nextIn, 12);
  if (order) emit('orderDeclined', { order });
}
