// Gebäude: Daten und reine Spiellogik (ohne Grafik). Platziert werden sie im Raster (world.js).
// size = Kantenlänge in Feldern. unlockRep = nötige Ruf-Stufe (siehe progress.js).

// Richtungen im Raster: 0 = Norden (-j), 1 = Osten (+i), 2 = Süden (+j), 3 = Westen (-i)
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const BUILDING_DEFS = {
  sawmill: {
    name: 'Sawmill',
    icon: '[[icon:saw]]',
    kind: 'processor',
    size: 2,
    unlockRep: 2,
    desc: 'Turns logs into planks of the same wood (about ×2.5 value). Workers bring logs and fetch planks.',
    price: (placed) => Math.round(200 * 3 ** placed),
    // Ausbau-Stufen: Zeit pro Brett, Puffer für Stämme (Eingang) und Bretter (Ausgang)
    levels: [
      { time: 3, inCap: 12, outCap: 12 },
      { time: 2.1, inCap: 20, outCap: 20, cost: 400 },
      { time: 1.5, inCap: 30, outCap: 30, cost: 1200 },
    ],
  },
  // Bewässerung: bewässert die Nachbarfelder in Richtung ihrer Anschlüsse; bessere Qualität = mehr Wachstum
  spout: {
    name: 'Wooden Spout', icon: '[[icon:water]]', kind: 'irrigation', size: 1, unlockRep: 0,
    outlets: [0], growth: 0.25,
    desc: '1 water outlet · watered tiles grow +25%',
    price: (placed) => Math.round(60 * 1.3 ** placed),
  },
  splitter: {
    name: 'Bamboo Splitter', icon: '[[icon:leaves]]', kind: 'irrigation', size: 1, unlockRep: 1,
    outlets: [1, 3], growth: 0.3,
    desc: '2 water outlets · watered tiles grow +30%',
    price: (placed) => Math.round(150 * 1.3 ** placed),
  },
  sprinkler: {
    name: 'Copper Sprinkler', icon: '[[icon:sprinkler]]', kind: 'irrigation', size: 1, unlockRep: 3,
    outlets: [0, 1, 3], growth: 0.4,
    desc: '3 water outlets · watered tiles grow +40%',
    price: (placed) => Math.round(400 * 1.3 ** placed),
  },
  fountain: {
    name: 'Brass Fountain', icon: '[[icon:fountain]]', kind: 'irrigation', size: 1, unlockRep: 5,
    outlets: [0, 1, 2, 3], growth: 0.5,
    desc: '4 water outlets · watered tiles grow +50%',
    price: (placed) => Math.round(1000 * 1.3 ** placed),
  },
};
export const BUILDING_ORDER = ['sawmill', 'spout', 'splitter', 'sprinkler', 'fountain'];

// Felder, die eine Bewässerungsanlage bei Drehung rot (0..3) bewässert
export function wateredCells(b) {
  const def = BUILDING_DEFS[b.type];
  if (def.kind !== 'irrigation') return [];
  return def.outlets.map((o) => {
    const [di, dj] = DIRS[(o + b.rot) % 4];
    return [b.cell[0] + di, b.cell[1] + dj];
  });
}

export const sawmillLevel = (b) => BUILDING_DEFS.sawmill.levels[Math.min(b.level, BUILDING_DEFS.sawmill.levels.length - 1)];
