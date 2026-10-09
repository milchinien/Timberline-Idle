// Stammkunden: feste Figuren mit Aussehen, Treue (Herzen) und einem dauerhaften Bonus.
// Jeder erfüllte Auftrag bringt Treue-Punkte; ab 3 Herzen wirkt der Bonus, ab 5 Herzen doppelt.
// Reine Daten und Regeln, keine Grafik (die Figuren in der Welt: visitors.js).

// look: Hemdfarbe und Hut (Stile siehe fellas.js, drawFella)
// perk.apply(state, tier) wirkt in recomputeStats auf die abgeleiteten Werte; tier 1 = [[icon:heart]]3, tier 2 = [[icon:heart]]5
export const CUSTOMERS = [
  {
    id: 'hugo', name: 'Carpenter Hugo', icon: '[[icon:saw]]',
    look: { shirt: '#c8783a', hat: '#6b4423', hatStyle: 'cap' },
    perk: { icon: '[[icon:saw]]', text: (t) => `Sawmills work ${[15, 15, 30][t]}% faster`, apply: (s, t) => { s.sawSpeedMult *= 1 + [0, 0.15, 0.3][t]; } },
  },
  {
    id: 'mia', name: 'Baker Mia', icon: '[[icon:bread]]',
    look: { shirt: '#f0e0b0', hat: '#ffffff', hatStyle: 'chef' },
    perk: { icon: '[[icon:bread]]', text: (t) => `Fresh bread: workers walk ${[8, 8, 15][t]}% faster`, apply: (s, t) => { s.workerSpeedMult *= 1 + [0, 0.08, 0.15][t]; } },
  },
  {
    id: 'ole', name: 'Shipwright Ole', icon: '[[icon:boat]]',
    look: { shirt: '#3a6ea8', hat: '#1f3a5a', hatStyle: 'beanie' },
    perk: { icon: '[[icon:planks]]', text: (t) => `Planks sell for ${[15, 15, 30][t]}% more`, apply: (s, t) => { s.plankPriceMult *= 1 + [0, 0.15, 0.3][t]; } },
  },
  {
    id: 'greta', name: 'Mayor Greta', icon: '[[icon:hut]]',
    look: { shirt: '#7a3a8a', hat: '#2a2030', hatStyle: 'tophat' },
    perk: { icon: '[[icon:map]]', text: (t) => `Land rows cost ${[10, 10, 20][t]}% less`, apply: (s, t) => { s.landPriceMult *= 1 - [0, 0.1, 0.2][t]; } },
  },
  {
    id: 'lou', name: 'Toymaker Lou', icon: '[[icon:bear]]',
    look: { shirt: '#e8805f', hat: '#f0c84a', hatStyle: 'beanie' },
    perk: { icon: '[[icon:star]]', text: (t) => `+${[2, 2, 4][t]}% chance for gold wood`, apply: (s, t) => { s.goldenChance += [0, 0.02, 0.04][t]; } },
  },
  {
    id: 'bob', name: 'Builder Bob', icon: '[[icon:hut]]',
    look: { shirt: '#e0a82a', hat: '#f0c84a', hatStyle: 'cap' },
    perk: { icon: '[[icon:hut]]', text: (t) => `Buildings & soils ${[15, 15, 30][t]}% cheaper`, apply: (s, t) => { const m = 1 - [0, 0.15, 0.3][t]; s.buildPriceMult *= m; s.soilPriceMult *= m; } },
  },
  {
    id: 'finn', name: 'Fisher Finn', icon: '[[icon:fish]]',
    look: { shirt: '#5aa8a0', hat: '#e8d8a0', hatStyle: 'straw' },
    perk: { icon: '[[icon:fish]]', text: (t) => `Pays your workers in fish: wages −${[8, 8, 15][t]}%`, apply: (s, t) => { s.wageMult *= 1 - [0, 0.08, 0.15][t]; } },
  },
  {
    id: 'ida', name: 'Blacksmith Ida', icon: '[[icon:tools]]',
    look: { shirt: '#5a5a62', hat: '#d9503c', hatStyle: 'bandana' },
    perk: { icon: '[[icon:axe]]', text: (t) => `Sharper axes: +${[1, 1, 2][t]} click damage, workers +${[15, 15, 30][t]}% damage`, apply: (s, t) => { s.clickPower += t; s.workerDamageMult *= 1 + [0, 0.15, 0.3][t]; } },
  },
  {
    id: 'rosa', name: 'Innkeeper Rosa', icon: '[[icon:soup]]',
    look: { shirt: '#a83a3a', hat: '#5a2a1a', hatStyle: 'bandana' },
    perk: { icon: '[[icon:soup]]', text: (t) => `Hearty meals: workers gain ${[25, 25, 50][t]}% more XP`, apply: (s, t) => { s.xpMult *= 1 + [0, 0.25, 0.5][t]; } },
  },
];
export const customerOf = (id) => CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];
// alte Spielstände speichern den Kunden als { name, icon }
export const customerByName = (name) => CUSTOMERS.find((c) => c.name === name) ?? null;

// ---- Treue ----
export const LOVE_LEVELS = [0, 1, 3, 6, 10, 15]; // Punkte für 0..5 Herzen
export const MAX_HEARTS = LOVE_LEVELS.length - 1;
export const PERK_HEARTS = [3, 5]; // ab hier wirkt der Bonus (Stufe 1 / Stufe 2)

export function love(state, id) {
  state.customers ??= {};
  return (state.customers[id] ??= { pts: 0, orders: 0 });
}
export function heartsFor(pts) {
  let h = 0;
  LOVE_LEVELS.forEach((need, i) => {
    if (pts >= need) h = i;
  });
  return h;
}
export const hearts = (state, id) => heartsFor(state.customers?.[id]?.pts ?? 0);
export const perkTier = (h) => (h >= PERK_HEARTS[1] ? 2 : h >= PERK_HEARTS[0] ? 1 : 0);

// Boni aller Kunden anwenden (aus recomputeStats)
export function applyCustomerPerks(state) {
  for (const c of CUSTOMERS) {
    const tier = perkTier(hearts(state, c.id));
    if (tier > 0) c.perk.apply(state, tier);
  }
}
