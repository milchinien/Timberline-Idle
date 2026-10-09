// Offline-Fortschritt: Während man spielt, misst das Spiel, was ohne Klicks in die Truhe kommt
// (Holz von Bäumen, die Worker oder der Specht gefällt haben, Bretter vom Sägewerk). Daraus wird ein
// gleitender Durchschnitt pro Item gebildet. Beim nächsten Start wird die Abwesenheit damit hochgerechnet,
// begrenzt auf state.offlineHours (Skill "Night Shift"). Auto-Verkauf, Truhen-Platz und Lohn laufen mit.
import { ITEM_DEFS, chestUsed, autoSellNow, advanceTime } from './state.js';
import { totalWages } from './workers.js';

const WINDOW = 600; // Spielsekunden: so schnell "vergisst" der Durchschnitt alte Werte
export const MIN_AWAY = 60; // kürzere Pausen zählen nicht

const idleOf = (state) => (state.idle ??= { w: 0, s: {} });

// Item kam ohne Zutun des Spielers in die Truhe (n < 0: vom Team herausgenommen, z. B. Stämme fürs Sägewerk)
export function trackIdle(state, key, n = 1) {
  const idle = idleOf(state);
  idle.s[key] = (idle.s[key] ?? 0) + n;
}

// pro Frame: alte Werte verblassen, gemessene Zeit wächst
export function decayIdle(state, gameDt) {
  if (gameDt <= 0) return;
  const idle = idleOf(state);
  const f = Math.exp(-gameDt / WINDOW);
  idle.w = idle.w * f + gameDt;
  for (const k of Object.keys(idle.s)) idle.s[k] *= f;
}

// Items pro Spielsekunde (erst nach einer Minute Messung verlässlich)
export function idleRates(state) {
  const idle = idleOf(state);
  if (idle.w < 60) return {};
  return Object.fromEntries(Object.entries(idle.s).filter(([k, v]) => ITEM_DEFS[k] && Math.abs(v) > 1e-6).map(([k, v]) => [k, v / idle.w]));
}

// Rechnet die Abwesenheit hoch und verändert den Spielstand. Gibt einen Bericht fürs "Willkommen zurück"-Fenster.
export function applyOffline(state, awaySec, world) {
  const cap = state.offlineHours * 3600;
  const t = Math.min(awaySec, cap);
  const report = { away: awaySec, time: t, capped: awaySec > cap, gained: {}, sold: 0, wages: 0, days: 0, grown: 0, lost: 0 };
  const moneyBefore = state.money;

  // 1. Produktion in die Truhe
  const usedBefore = chestUsed(state);
  for (const [key, rate] of Object.entries(idleRates(state))) {
    const n = rate > 0 ? Math.floor(rate * t) : -Math.min(state.inventory[key] ?? 0, Math.ceil(-rate * t));
    if (!n) continue;
    state.inventory[key] = (state.inventory[key] ?? 0) + n;
    report.gained[key] = n;
  }

  // 2. Auto-Verkauf, sobald die Truhe voll wäre (nach den Regeln aus dem Truhen-Fenster)
  if (state.autoSell && chestUsed(state) > state.woodCap) report.sold = autoSellNow(state);

  // 3. Was nicht mehr in die Truhe passt, wurde gar nicht erst produziert (Team pausiert bei voller Truhe)
  // (nur Neues wird gekürzt, und nur so viel, wie davon noch in der Truhe liegt)
  const cut = (k, n) => {
    const c = Math.max(0, Math.min(n, state.inventory[k], report.gained[k]));
    state.inventory[k] -= c;
    report.gained[k] -= c;
    report.lost += c;
    return c;
  };
  const overNow = () => chestUsed(state) - Math.max(state.woodCap, usedBefore);
  const positive = Object.keys(report.gained).filter((k) => report.gained[k] > 0);
  let over = overNow();
  const totalPos = positive.reduce((s, k) => s + Math.min(report.gained[k], state.inventory[k]), 0);
  if (over > 0 && totalPos > 0) {
    // erst anteilig, dann den Rest der Reihe nach
    for (const k of positive) cut(k, Math.floor((Math.min(report.gained[k], state.inventory[k]) / totalPos) * over));
    for (const k of positive) {
      over = overNow();
      if (over <= 0) break;
      cut(k, over);
    }
  }

  // 4. Zeit vergeht: Tage und Lohn (Zahltage ohne einzelne Effekte)
  const dayBefore = state.day;
  const moneyBeforeWages = state.money;
  const paydays = advanceTime(state, t, { quiet: true });
  report.days = state.day - dayBefore;
  report.wages = paydays * totalWages(state);
  report.paydays = paydays;
  if (moneyBeforeWages >= 0 && state.money < 0) report.debt = true;

  // 5. Bäume wachsen weiter
  report.grown = world.fastForward(t);

  report.net = state.money - moneyBefore;
  report.hasWorkers = state.workers.length > 0;
  return report;
}
