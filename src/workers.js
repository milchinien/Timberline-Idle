// Worker-Daten: Kandidaten fürs Board, Seltenheit, Werte, Eigenschaften, Lohn, Leveln.
// Werte 1..10: walk (Blau, Laufen), swing (Gelb, Schwung), strength (Rot, Kraft), carry (Grün, Tragen).

export const STAT_KEYS = ['walk', 'swing', 'strength', 'carry'];
export const STAT_INFO = {
  walk: { name: 'Walk', short: 'WLK', color: '#4a90d9' },
  swing: { name: 'Swing', short: 'SWG', color: '#e8c33a' },
  strength: { name: 'Strength', short: 'STR', color: '#d9503c' },
  carry: { name: 'Carry', short: 'CAR', color: '#5aa83c' },
};
export const STAT_MAX = 10;

export const RARITIES = [
  // weight = Grundchance, boost = Zusatzgewicht je Recruiter-Stufe, wageMult = Lohnfaktor
  { id: 'common', name: 'Common', color: '#c9b89a', weight: 60, boost: 0, stats: [1, 4], priceMult: 1, wageMult: 1, traits: [1, 2], good: 0.45 },
  { id: 'rare', name: 'Rare', color: '#4a90d9', weight: 28, boost: 8, stats: [3, 6], priceMult: 2.4, wageMult: 1.6, traits: [1, 2], good: 0.6 },
  { id: 'epic', name: 'Epic', color: '#9a6ad9', weight: 10, boost: 5, stats: [5, 8], priceMult: 5.5, wageMult: 2.4, traits: [2, 3], good: 0.72 },
  { id: 'legendary', name: 'Legendary', color: '#f0a020', weight: 2, boost: 2, stats: [7, 10], priceMult: 14, wageMult: 3.5, traits: [2, 3], good: 0.88 },
];
export const rarityOf = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

export const TASKS = {
  carry: { name: 'Carry', icon: '[[icon:log]]' },
  plant: { name: 'Plant', icon: '[[icon:sapling]]' },
  saw: { name: 'Sawmill', icon: '[[icon:saw]]' },
  chop: { name: 'Chop', icon: '[[icon:axe]]' },
};
export const DEFAULT_PRIORITIES = ['carry', 'plant', 'saw', 'chop'];

// ---------- Charaktereigenschaften ----------
// good: positiv oder negativ, rarity: wie selten die Eigenschaft ist, Stufen 1..3 verstärken den Effekt.
export const TRAITS = {
  strong: { name: 'Strong', icon: '[[icon:bolt]]', good: true, rarity: 1, desc: (l) => `+${l * 15}% damage` },
  quick: { name: 'Quick', icon: '[[icon:bolt]]', good: true, rarity: 1, desc: (l) => `+${l * 10}% walk speed` },
  rhythmic: { name: 'Rhythmic', icon: '[[icon:music]]', good: true, rarity: 1, desc: (l) => `${l * 10}% faster swings` },
  packhorse: { name: 'Packhorse', icon: '[[icon:backpack]]', good: true, rarity: 2, desc: (l) => `+${l === 3 ? 2 : 1} carry` },
  greenThumb: { name: 'Green Thumb', icon: '[[icon:leaves]]', good: true, rarity: 1, desc: (l) => `plants ${[0, 30, 50, 70][l]}% faster` },
  frugal: { name: 'Frugal', icon: '[[icon:coin]]', good: true, rarity: 1, desc: (l) => `-${l * 15}% wage` },
  nightOwl: { name: 'Night Owl', icon: '[[icon:moon]]', good: true, rarity: 2, desc: (l) => `+${l * 25}% speed at night` },
  earlyBird: { name: 'Early Bird', icon: '[[icon:sun]]', good: true, rarity: 2, desc: (l) => `+${l * 20}% speed in the morning` },
  lucky: { name: 'Lucky', icon: '[[icon:leaves]]', good: true, rarity: 3, desc: (l) => `${l * 4}% chance for gold wood when felling` },
  fastLearner: { name: 'Fast Learner', icon: '[[icon:book]]', good: true, rarity: 2, desc: (l) => `+${l * 25}% XP` },
  lazy: { name: 'Lazy', icon: '[[icon:moon]]', good: false, rarity: 1, desc: (l) => `-${l * 10}% speed, naps sometimes` },
  clumsy: { name: 'Clumsy', icon: '[[icon:warning]]', good: false, rarity: 1, desc: (l) => `${l * 8}% chance to drop logs` },
  weak: { name: 'Weak', icon: '[[icon:feather]]', good: false, rarity: 1, desc: (l) => `-${l * 15}% damage` },
  greedy: { name: 'Greedy', icon: '[[icon:coin]]', good: false, rarity: 1, desc: (l) => `+${l * 20}% wage` },
  afraidOfDark: { name: 'Afraid of Dark', icon: '[[icon:moon]]', good: false, rarity: 1, desc: (l) => `-${[0, 30, 50, 70][l]}% speed at night` },
};
export const traitLevel = (worker, id) => worker.traits?.find((t) => t.id === id)?.lvl ?? 0;
export const ROMAN = ['', 'I', 'II', 'III'];

// ---------- Leveln ----------
export const LEVEL_CAP = 10;
export const levelCap = (state) => LEVEL_CAP + (state?.levelCapBonus ?? 0); // Training Camp erhöht
export const XP = { hit: 1, fell: 4, deliver: 1, plant: 5 }; // Erfahrung pro Aktion
export const xpForLevel = (level) => Math.round(20 * 1.5 ** (level - 1)); // nötig für den nächsten Level

// ---------- Lohn ----------
export const PAYDAY_HOUR = 6; // jeden Morgen um 06:00
export const DEBT_GARNISH = 0.25; // im Minus werden 25% jedes Verkaufs gepfändet

const NAMES = [
  'Pip', 'Bo', 'Tuck', 'Mo', 'Fen', 'Rolo', 'Bean', 'Nib', 'Tiko', 'Lumi', 'Oaky', 'Puck', 'Wim', 'Juno',
  'Fig', 'Dot', 'Sprout', 'Chip', 'Mossy', 'Bram', 'Twig', 'Pebble', 'Nutty', 'Birch', 'Clove', 'Tumble',
];

export const REROLL_PRICE = 10;
export const rerollPrice = (state) => Math.max(1, Math.round(REROLL_PRICE * state.rerollPriceMult));

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function weighted(list, weightOf) {
  const total = list.reduce((s, x) => s + weightOf(x), 0);
  let roll = Math.random() * total;
  for (const x of list) {
    roll -= weightOf(x);
    if (roll < 0) return x;
  }
  return list[0];
}

function rollTraits(r) {
  const count = randInt(r.traits[0], r.traits[1]);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const good = Math.random() < r.good;
    const pool = Object.entries(TRAITS).filter(([id, t]) => t.good === good && !picked.some((p) => p.id === id));
    if (!pool.length) continue;
    // seltene Eigenschaften seltener, bessere Worker bekommen höhere Stufen
    const [id] = weighted(pool, ([, t]) => 1 / t.rarity);
    const bonus = RARITIES.indexOf(r) * 0.25;
    const lvl = weighted([1, 2, 3], (l) => (l === 1 ? 1 : l === 2 ? 0.35 + bonus : 0.08 + bonus * 0.6));
    picked.push({ id, lvl });
  }
  return picked;
}

// Fehlende Felder in alten Spielständen ergänzen
export function normalizeWorker(w) {
  w.level ??= 1;
  w.xp ??= 0;
  w.traits ??= [];
  w.priorities ??= [...DEFAULT_PRIORITIES];
  // neue Aufgaben (z. B. Sägewerk) bei alten Spielständen ergänzen: vor 'chop' einsortieren
  for (const t of DEFAULT_PRIORITIES) {
    if (w.priorities.includes(t)) continue;
    const at = w.priorities.indexOf('chop');
    w.priorities.splice(at < 0 ? w.priorities.length : at, 0, t);
  }
  return w;
}

// Preis: Seltenheit × Werte × Eigenschaften, jeder bereits eingestellte Worker macht neue teurer
export function hirePrice(state, cand) {
  const sum = STAT_KEYS.reduce((s, k) => s + cand.stats[k], 0);
  const r = rarityOf(cand.rarity);
  const traitValue = (cand.traits ?? []).reduce((s, t) => s + (TRAITS[t.id].good ? 0.12 : -0.08) * t.lvl, 0);
  const price = 20 * r.priceMult * (1 + sum / 40) * (1 + traitValue) * 1.35 ** state.workers.length;
  return Math.max(5, Math.round(price * state.hireDiscount));
}

// Lohn pro Tag: etwa ein Viertel bis ein Drittel dessen, was der Worker an Holz bringt.
// Besser = teurer, steigt mit dem Level, Eigenschaften Frugal/Greedy, Union Deal senkt ihn.
export function dailyWage(worker, state) {
  const sum = STAT_KEYS.reduce((s, k) => s + worker.stats[k], 0);
  const r = rarityOf(worker.rarity);
  const mult = (1 - traitLevel(worker, 'frugal') * 0.15) * (1 + traitLevel(worker, 'greedy') * 0.2) * (1 + ((worker.level ?? 1) - 1) * 0.06);
  return Math.max(1, Math.round(5 * r.wageMult * (1 + sum / 30) * mult * (state?.wageMult ?? 1)));
}
export const totalWages = (state) => state.workers.reduce((s, w) => s + dailyWage(w, state), 0);

// Warnung vor dem Zahltag: reicht das Geld in den letzten Stunden davor nicht für den Lohn?
// Gibt { hours, wages } zurück (Stunden bis zum Zahltag) oder null, wenn alles gut ist.
export const PAYDAY_WARN_HOURS = 4;
export function paydayShortfall(state) {
  const wages = totalWages(state);
  if (wages <= 0 || state.money >= wages) return null;
  const hours = (PAYDAY_HOUR - state.hour + 24) % 24;
  return hours <= PAYDAY_WARN_HOURS ? { hours, wages } : null;
}

function makeCandidate(state) {
  const boost = state?.rarityBoost ?? 0;
  const r = weighted(RARITIES, (x) => x.weight + x.boost * boost);
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, randInt(r.stats[0], r.stats[1])]));
  return normalizeWorker({
    id: Math.random().toString(36).slice(2, 9),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    rarity: r.id,
    stats,
    traits: rollTraits(r),
  });
}

// Dev-Hilfe: zufälligen Worker direkt einstellen
export function debugWorker() {
  return { ...makeCandidate(), priorities: [...DEFAULT_PRIORITIES], hiredDay: 1 };
}

// Neue Zettel: jeden Ingame-Tag oder per Würfeln
export function refreshBoard(state) {
  state.board = { day: state.day, notes: Array.from({ length: state.boardSize }, () => makeCandidate(state)) };
}

export function ensureBoard(state) {
  if (!state.board || state.board.day !== state.day) refreshBoard(state);
  // Bigger Board: zusätzliche Zettel sofort aufhängen
  while (state.board.notes.length < state.boardSize) state.board.notes.push(makeCandidate(state));
  for (const n of state.board.notes) if (n) normalizeWorker(n);
}

export function hire(state, index) {
  const cand = state.board.notes[index];
  if (!cand || state.workers.length >= state.workerCap) return null;
  const price = hirePrice(state, cand);
  if (state.money < price) return null;
  state.money -= price;
  const worker = normalizeWorker({ ...cand, priorities: [...DEFAULT_PRIORITIES], hiredDay: state.day });
  state.workers.push(worker);
  state.board.notes[index] = null; // Zettel ist weg, bis neue kommen
  return worker;
}

export function fire(state, id) {
  state.workers = state.workers.filter((w) => w.id !== id);
}

// Erfahrung sammeln; gibt die gesteigerten Werte zurück, wenn ein Level-Up passiert ist
export function addXp(worker, amount, state) {
  const cap = levelCap(state);
  if (worker.level >= cap) return null;
  worker.xp += amount * (1 + traitLevel(worker, 'fastLearner') * 0.25) * (state?.xpMult ?? 1);
  let raised = null;
  while (worker.level < cap && worker.xp >= xpForLevel(worker.level)) {
    worker.xp -= xpForLevel(worker.level);
    worker.level += 1;
    // +1 auf einen zufälligen Wert, der noch nicht am Maximum ist (zwei bei jedem 5. Level)
    raised ??= [];
    const points = (worker.level % 5 === 0 ? 2 : 1) + (state?.masterclass ? 1 : 0);
    for (let i = 0; i < points; i++) {
      const open = STAT_KEYS.filter((k) => worker.stats[k] < STAT_MAX);
      if (!open.length) break;
      const k = open[Math.floor(Math.random() * open.length)];
      worker.stats[k] += 1;
      raised.push(k);
    }
  }
  if (worker.level >= cap) worker.xp = 0;
  return raised;
}

// 0 = Tag, 1 = tiefe Nacht (wie das Licht in der Welt)
export function nightAmount(hour) {
  if (hour >= 21 || hour < 5) return 1;
  if (hour >= 19) return (hour - 19) / 2;
  if (hour < 7) return 1 - (hour - 5) / 2;
  return 0;
}

// Aus Werten, Eigenschaften, Tageszeit und Worker-Skills (state) abgeleitete Fähigkeiten
export function workerAbilities(worker, state = {}) {
  const { stats } = worker;
  const hour = state.hour ?? 12;
  const t = (id) => traitLevel(worker, id);
  const night = nightAmount(hour);
  const morning = hour >= 5 && hour < 11 ? 1 : 0;
  // Tageszeit wirkt auf alles Tempo (Laufen und Schwingen); Lanterns heben Nacht-Strafen auf
  const afraid = state.nightProof ? 0 : [0, 0.3, 0.5, 0.7][t('afraidOfDark')];
  const timeOfDay = (1 + night * t('nightOwl') * 0.25)
    * (1 - night * afraid)
    * (1 + night * (state.nightProof ? 0.1 : 0))
    * (1 + morning * t('earlyBird') * 0.2);
  const lazy = 1 - t('lazy') * 0.1;
  const team = state.teamSpirit ? 1 + 0.03 * (state.workers?.length ?? 0) : 1;
  return {
    speed: (1.2 + stats.walk * 0.12) * (1 + t('quick') * 0.1) * lazy * timeOfDay * (state.workerSpeedMult ?? 1) * team, // Welt-Einheiten pro Sekunde
    swingTime: ((1.0 - stats.swing * 0.05) * (1 - t('rhythmic') * 0.1)) / (lazy * timeOfDay * (state.workerSwingMult ?? 1) * team),
    damage: (1.0 + stats.strength * 0.25) * (1 + t('strong') * 0.15) * (1 - t('weak') * 0.15) * (state.workerDamageMult ?? 1) * team,
    capacity: 2 + Math.floor(stats.carry / 3) + (t('packhorse') === 3 ? 2 : t('packhorse') ? 1 : 0) + (state.workerCarryBonus ?? 0),
    digTime: 1.4 * (1 - [0, 0.3, 0.5, 0.7][t('greenThumb')]),
    dropChance: t('clumsy') * 0.08, // pro Sekunde beim Tragen
    napChance: t('lazy') * 0.12, // pro Pause
    luck: t('lucky') * 0.04,
  };
}
