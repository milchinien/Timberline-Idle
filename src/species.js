// Baumarten. Neue Holzarten = neuer Eintrag hier + passende Items in ITEM_DEFS (state.js) + Grafik (itemArt.js / textures.js).
// Jede Art hat eigenes Stamm-, Setzling- und Brett-Item. Verarbeitungsstätten filtern über ITEM_DEFS[key].type und .species.
export const SPECIES = {
  oak: {
    id: 'oak',
    name: 'Oak',
    icon: '[[icon:oak]]',
    style: 'oak', // Grafik-Stil der Krone
    log: 'wood', // Item-Key des Stamms (alter Key, bleibt für Spielstände)
    sapling: 'sapling',
    plank: 'oak_plank',
    growTime: 12, // Spielsekunden vom Setzling bis zum fertigen Baum
    hp: 6, // Schaden bis zum Fällen
    logBonus: 0, // zusätzliche Stämme zu state.woodPerTree
    saplingPrice: 10, // Grundpreis beim Kaufen
    unlockRep: 0, // Ruf-Stufe, ab der man Setzlinge kaufen kann
    variants: [0, 1, 2], // Pixel-Varianten (Blattfarben)
    trait: null,
  },
  birch: {
    id: 'birch',
    name: 'Birch',
    icon: '[[icon:leaves]]',
    style: 'birch',
    log: 'birch_log',
    sapling: 'birch_sapling',
    plank: 'birch_plank',
    growTime: 7,
    hp: 4,
    logBonus: -1,
    saplingPrice: 8,
    unlockRep: 1,
    variants: [0, 1],
    trait: 'grove', // +30 % Wachstum, wenn eine andere Birke direkt daneben steht
    traitText: 'Grows 30% faster next to another birch',
  },
  pine: {
    id: 'pine',
    name: 'Pine',
    icon: '[[icon:pine]]',
    style: 'pine',
    log: 'pine_log',
    sapling: 'pine_sapling',
    plank: 'pine_plank',
    growTime: 20,
    hp: 10,
    logBonus: 2,
    saplingPrice: 15,
    unlockRep: 3,
    variants: [0, 1],
    trait: 'night', // wächst nachts bis zu 50 % schneller
    traitText: 'Grows up to 50% faster at night',
  },
};
export const SPECIES_ORDER = ['oak', 'birch', 'pine'];
export const DEFAULT_SPECIES = 'oak';

export const speciesOf = (id) => SPECIES[id] ?? SPECIES[DEFAULT_SPECIES];
export const speciesForSapling = (itemKey) => Object.values(SPECIES).find((s) => s.sapling === itemKey) ?? null;
export const speciesForLog = (itemKey) => Object.values(SPECIES).find((s) => s.log === itemKey) ?? null;
export const isSpeciesUnlocked = (state, id) => (state.repLevel ?? 0) >= speciesOf(id).unlockRep;

// ---- Kreislauf-Regeln ----
export const SAPLING_BONUS_CHANCE = 0.4; // Chance auf einen zweiten Setzling beim Fällen
export const SQUIRREL_DELAY = 45; // Sekunden ohne Baum und ohne Setzling, bis ein Eichhörnchen hilft

// Setzling kaufen: wird teurer, je mehr Bäume (inkl. Stümpfe und Markierungen) auf der Wiese stehen
export function saplingBuyPrice(treesUsed, priceMult = 1, species = DEFAULT_SPECIES) {
  const base = speciesOf(species).saplingPrice;
  return Math.max(1, Math.round(base * 1.15 ** Math.max(0, treesUsed - 1) * priceMult));
}

// Welcher Setzling kommt auf einen Stumpf: bevorzugt dieselbe Art, sonst die erste vorhandene.
// reserved = Setzlinge, die schon von Workern eingeplant sind (werden von vorne abgezogen).
export function pickSaplingFor(inventory, preferred, reserved = 0) {
  const order = [preferred, ...SPECIES_ORDER.filter((s) => s !== preferred)];
  let skip = reserved;
  for (const id of order) {
    const n = inventory[speciesOf(id).sapling] ?? 0;
    if (n > skip) return id;
    skip = Math.max(0, skip - n);
  }
  return null;
}

export const totalSaplings = (inventory) => SPECIES_ORDER.reduce((s, id) => s + (inventory[speciesOf(id).sapling] ?? 0), 0);
