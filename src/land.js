// Land: die Wiese wächst um ganze Plot-Reihen. Start 3x3 Plots à 3x3 Felder; jede gekaufte Reihe
// legt eine komplette Plot-Reihe an eine Seite an (so breit wie das Land an dieser Seite gerade ist).
// Reine Daten und Regeln (ohne Grafik). Feld-Koordinaten bleiben stabil: das Startland sind die Felder 0..8,
// neue Reihen im Norden/Westen bekommen negative Indizes.

export const PLOT_SIZE = 3; // Felder pro Plot (Kantenlänge)
export const START_PLOTS = 3; // Start: 3x3 Plots
export const MAX_ROWS_PER_SIDE = 2; // höchstens so viele Reihen je Seite (Land max. 7x7 Plots)
export const TREE_SLOTS_PER_ROW = 1; // jede gekaufte Reihe gibt zusätzliche Baumplätze

// Seiten wie die Richtungen in buildings.js: n = -j, e = +i, s = +j, w = -i
export const SIDES = ['n', 'e', 's', 'w'];
// Pfeil = Richtung auf dem Bildschirm (isometrische Kamera schaut von +x/+z)
export const SIDE_INFO = {
  n: { arrow: '[[icon:north-east]]', name: 'Back right' },
  e: { arrow: '[[icon:south-east]]', name: 'Front right' },
  s: { arrow: '[[icon:south-west]]', name: 'Front left' },
  w: { arrow: '[[icon:north-west]]', name: 'Back left' },
};

export const defaultLand = () => ({ n: 0, e: 0, s: 0, w: 0 });
export const landOf = (state) => (state.land ??= defaultLand());
export const rowsBought = (state) => SIDES.reduce((s, k) => s + (landOf(state)[k] ?? 0), 0);

// Plots in x-Richtung (i) und y-Richtung (j)
export function landPlots(state) {
  const l = landOf(state);
  return { cols: START_PLOTS + l.w + l.e, rows: START_PLOTS + l.n + l.s };
}

// Feld-Grenzen (inklusive)
export function landBounds(state) {
  const l = landOf(state);
  const end = START_PLOTS * PLOT_SIZE - 1;
  return {
    minI: -l.w * PLOT_SIZE,
    maxI: end + l.e * PLOT_SIZE,
    minJ: -l.n * PLOT_SIZE,
    maxJ: end + l.s * PLOT_SIZE,
  };
}

// Wie viele Plots eine neue Reihe an dieser Seite hat (= aktuelle Breite des Landes dort)
export function rowPlots(state, side) {
  const { cols, rows } = landPlots(state);
  return side === 'n' || side === 's' ? cols : rows;
}

export const canExpand = (state, side) => (landOf(state)[side] ?? 0) < MAX_ROWS_PER_SIDE;

// Preis: pro Plot, jede bereits gekaufte Reihe macht die nächste deutlich teurer
export function rowPrice(state, side) {
  return Math.round(150 * rowPlots(state, side) * 2.1 ** rowsBought(state) * (state.landPriceMult ?? 1));
}

// Kauft eine Reihe (Geld wird abgezogen). Gibt true zurück, wenn es geklappt hat.
export function buyRow(state, side) {
  if (!SIDES.includes(side) || !canExpand(state, side)) return false;
  const price = rowPrice(state, side);
  if (state.money < price) return false;
  state.money -= price;
  landOf(state)[side] += 1;
  return true;
}
