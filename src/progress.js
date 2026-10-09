// Ruf (Reputation): kommt aus erfüllten Aufträgen und schaltet Holzarten, Gebäude und Boni frei.
export const REP_LEVELS = [0, 5, 15, 30, 55, 90, 140]; // Punkte für Stufe 0..6
export const REP_PRICE_BONUS = 0.03; // jede Ruf-Stufe: Markt zahlt 3 % mehr

export const REP_UNLOCKS = {
  1: { icon: '[[icon:leaves]]', text: 'Birch saplings & Bamboo Splitter' },
  2: { icon: '[[icon:saw]]', text: 'Sawmill' },
  3: { icon: '[[icon:pine]]', text: 'Pine saplings & Copper Sprinkler' },
  4: { icon: '[[icon:orders]]', text: '+1 order slot' },
  5: { icon: '[[icon:fountain]]', text: 'Brass Fountain & orders pay +25%' },
  6: { icon: '[[icon:crown]]', text: 'Royal customers: orders pay +25% more' },
};

export function repLevelFor(points) {
  let lvl = 0;
  REP_LEVELS.forEach((need, i) => {
    if (points >= need) lvl = i;
  });
  return lvl;
}

export const nextRepLevelPoints = (lvl) => REP_LEVELS[lvl + 1] ?? null;
