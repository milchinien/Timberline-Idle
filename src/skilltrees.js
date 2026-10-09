// Skill-Tree-Daten (Texte auf Englisch, Kommentare auf Deutsch).
//
// Knoten-Format:
// {
//   id: 'axe',                       // eindeutig (nicht umbenennen – Spielstände speichern die id)
//   name: 'Sharper Axe',
//   icon: '[[icon:axe]]',
//   desc: '+1 damage per click',      // kurze Beschreibung
//   col: 1, row: 1,                   // Position (row 0..2, col wächst nach rechts)
//   max: 3,                           // Anzahl Stufen (1 = Einmal-Upgrade)
//   requires: ['andere_id'],          // Knoten ist erst sichtbar, wenn der Vorgänger gekauft ist
//   cost: (lvl) => 10,                // Preis für die NÄCHSTE Stufe (lvl = aktuelle Stufe)
//   value: (lvl) => '2 dmg',          // optional: Anzeige des Werts bei Stufe lvl (nur bei Stufen-Knoten)
//   unlocks: 'buildings',             // optional: schaltet einen Tab links frei
//   apply: (stats, lvl) => {},        // wirkt auf die abgeleiteten Werte (siehe state.js)
// }
//
// Kostenkurve je Spalte (grob): 0: 1–15 · 1: 30–80 · 2: 100–300 · 3: 300–600 · 4: 500–1.200
// · 5: 1.000–2.500 · 6: 2.000–8.000 · 7: 4.000–12.000 · 8: ~9.000. Stufen-Knoten werden je Stufe ~2× teurer.
// Jeder Tree hat 3 Reihen (Pfade/Builds); Werte-Themen kommen weiter rechts als stärkere Einmal-Upgrades wieder.

import { SAPLING_BONUS_CHANCE } from './species.js';

const scaled = (base, mult) => (lvl) => Math.round(base * mult ** lvl);
const once = (price) => () => price;
const pct = (v) => `${Math.round(v * 100)}%`;

// ---------- Clicker: oben „Kraft & Krit“, Mitte „Werkzeug & Helfer“, unten „Ertrag“ ----------
const CLICK_NODES = [
  {
    // Erstes Upgrade im Tutorial: kostet genau 1 Coin
    id: 'haul', name: 'Bigger Haul', icon: '[[icon:log]]', desc: '+1 log per tree',
    col: 0, row: 1, max: 1, cost: once(1),
    apply: (s) => { s.woodPerTree += 1; },
  },
  {
    id: 'axe', name: 'Sharper Axe', icon: '[[icon:axe]]', desc: '+1 damage per click',
    col: 1, row: 1, max: 3, requires: ['haul'], cost: scaled(10, 1.8),
    value: (l) => `${1 + l} dmg`,
    apply: (s, l) => { s.clickPower += l; },
  },
  // Spalte 2
  {
    id: 'crit', name: 'Critical Strike', icon: '[[icon:bolt]]', desc: '+8% chance for triple damage',
    col: 2, row: 0, max: 3, requires: ['axe'], cost: scaled(40, 2),
    value: (l) => `${pct(l * 0.08)} chance`,
    apply: (s, l) => { s.critChance += l * 0.08; },
  },
  {
    id: 'iron_axe', name: 'Iron Axe', icon: '[[icon:axe]]', desc: '+2 damage per click',
    col: 3, row: 1, max: 1, requires: ['axe'], cost: once(120),
    apply: (s) => { s.clickPower += 2; },
  },
  {
    id: 'thorough', name: 'Thorough', icon: '[[icon:pine]]', desc: '+1 log per tree',
    col: 2, row: 2, max: 2, requires: ['axe'], cost: scaled(45, 2.4),
    value: (l) => `+${l} logs`,
    apply: (s, l) => { s.woodPerTree += l; },
  },
  // Spalte 3
  {
    id: 'rhythm', name: 'Lumberjack Rhythm', icon: '[[icon:music]]', desc: 'Fast clicks build a combo: +10% damage per hit, up to ×2',
    col: 4, row: 0, max: 1, requires: ['crit'], cost: once(300),
    apply: (s) => { s.combo = true; },
  },
  {
    id: 'woodpecker', name: 'Woodpecker', icon: '[[icon:feather]]', desc: 'A woodpecker pecks a random tree for 1 damage – chops while you idle',
    col: 5, row: 1, max: 3, requires: ['iron_axe'], cost: scaled(90, 2.5),
    value: (l) => (l ? `every ${[0, 4, 2.5, 1.5][l]}s` : 'none'),
    apply: (s, l) => { s.woodpecker = l; },
  },
  {
    id: 'reach', name: 'Wide Grab', icon: '[[icon:hand]]', desc: 'One click also collects nearby logs',
    col: 3, row: 2, max: 1, requires: ['thorough'], cost: once(150),
    apply: (s) => { s.pickupRadius = Math.max(s.pickupRadius, 1.2); },
  },
  // Spalte 4
  {
    id: 'heavy_crit', name: 'Mighty Blow', icon: '[[icon:tools]]', desc: 'Critical hits deal ×4 instead of ×3',
    col: 5, row: 0, max: 1, requires: ['rhythm'], cost: once(700),
    apply: (s) => { s.critMult = 4; },
  },
  {
    id: 'steel_axe', name: 'Steel Axe', icon: '[[icon:axe]]', desc: '+3 damage per click',
    col: 6, row: 1, max: 1, requires: ['woodpecker'], cost: once(900),
    apply: (s) => { s.clickPower += 3; },
  },
  {
    id: 'golden', name: 'Golden Strike', icon: '[[icon:star]]', desc: '+3% chance for gold wood instead of wood (×10 value)',
    col: 6, row: 2, max: 3, requires: ['reach'], cost: scaled(400, 2),
    value: (l) => `${pct(l * 0.03)} chance`,
    apply: (s, l) => { s.goldenChance += l * 0.03; },
  },
  // Spalte 5
  {
    id: 'combo_master', name: 'Combo Master', icon: '[[icon:bolt]]', desc: 'Combo can rise up to ×3',
    col: 7, row: 0, max: 1, requires: ['heavy_crit'], cost: once(1500),
    apply: (s) => { s.comboMax = 20; },
  },
  {
    id: 'splinters', name: 'Splinters', icon: '[[icon:saw]]', desc: 'Your hits sometimes knock out a bonus log',
    col: 8, row: 1, max: 2, requires: ['steel_axe'], cost: scaled(1200, 2.2),
    value: (l) => `${pct(l * 0.08)} per hit`,
    apply: (s, l) => { s.splinterChance += l * 0.08; },
  },
  {
    id: 'magnet', name: 'Magnet Chest', icon: '[[icon:search]]', desc: 'Logs on the ground fly into the chest by themselves',
    col: 8, row: 2, max: 2, requires: ['golden'], cost: scaled(1000, 2.5),
    value: (l) => (l ? `after ${[0, 5, 1.5][l]}s` : 'off'),
    apply: (s, l) => {
      s.magnet = true;
      s.magnetDelay = [5, 5, 1.5][l];
    },
  },
  // Spalte 6
  {
    id: 'eagle_eye', name: 'Eagle Eye', icon: '[[icon:search]]', desc: '+5% crit chance',
    col: 9, row: 0, max: 3, requires: ['combo_master'], cost: scaled(2000, 1.8),
    value: (l) => `+${pct(l * 0.05)}`,
    apply: (s, l) => { s.critChance += l * 0.05; },
  },
  {
    id: 'titan_axe', name: 'Titan Axe', icon: '[[icon:tools]]', desc: 'All click damage ×1.5',
    col: 10, row: 1, max: 1, requires: ['splinters'], cost: once(3500),
    apply: (s) => { s.clickPowerMult *= 1.5; },
  },
  {
    id: 'wide_reach', name: 'Long Arms', icon: '[[icon:hand]]', desc: 'Much bigger collect radius',
    col: 9, row: 2, max: 1, requires: ['magnet'], cost: once(2500),
    apply: (s) => { s.pickupRadius = 2.2; },
  },
  // Spalte 7
  {
    id: 'frenzy', name: 'Frenzy', icon: '[[icon:bolt]]', desc: 'Every combo step also adds +1.5% crit chance',
    col: 11, row: 0, max: 1, requires: ['eagle_eye'], cost: once(6000),
    apply: (s) => { s.frenzy = true; },
  },
  {
    id: 'gilded_edge', name: 'Gilded Edge', icon: '[[icon:star]]', desc: '+5% chance for gold wood',
    col: 12, row: 1, max: 1, requires: ['titan_axe'], cost: once(7000),
    apply: (s) => { s.goldenChance += 0.05; },
  },
  {
    id: 'double_harvest', name: 'Double Harvest', icon: '[[icon:oak]]', desc: '+1 log per tree',
    col: 12, row: 2, max: 1, requires: ['wide_reach'], cost: once(4000),
    apply: (s) => { s.woodPerTree += 1; },
  },
  // Spalte 8
  {
    id: 'lumber_baron', name: 'Lumber Baron', icon: '[[icon:crown]]', desc: '+2 logs per tree',
    col: 14, row: 2, max: 1, requires: ['double_harvest'], cost: once(10000),
    apply: (s) => { s.woodPerTree += 2; },
  },
];

// ---------- Economy: oben „Handel“, Mitte „Lager & Bauen“, unten „Wald“ ----------
const ECONOMY_NODES = [
  {
    id: 'chest', name: 'Bigger Chest', icon: '[[icon:chest]]', desc: '+5 chest slots',
    col: 0, row: 1, max: 4, cost: scaled(15, 1.7),
    value: (l) => `${20 + l * 5} slots`,
    apply: (s, l) => { s.woodCap += l * 5; },
  },
  // Spalte 1
  {
    id: 'orders', name: 'Order Board', icon: '[[icon:orders]]', desc: 'Unlocks the Orders tab: customers pay extra & give [[icon:star]] reputation',
    col: 1, row: 0, max: 1, requires: ['chest'], cost: once(40), unlocks: 'orders',
    apply: () => {},
  },
  {
    id: 'trade', name: 'Trade Contacts', icon: '[[icon:handshake]]', desc: '+15% sell price',
    col: 3, row: 0, max: 3, requires: ['orders'], cost: scaled(35, 1.9),
    value: (l) => `+${pct(l * 0.15)}`,
    apply: (s, l) => { s.woodPrice *= 1 + l * 0.15; },
  },
  {
    id: 'construction', name: 'Workshop', icon: '[[icon:hut]]', desc: 'Unlocks the Build tab: soils & buildings',
    col: 2, row: 1, max: 1, requires: ['chest'], cost: once(80), unlocks: 'buildings',
    apply: () => {},
  },
  {
    id: 'fertilizer', name: 'Fertilizer', icon: '[[icon:sapling]]', desc: 'Trees grow 25% faster',
    col: 1, row: 2, max: 2, requires: ['chest'], cost: scaled(40, 2.2),
    value: (l) => `${pct(1 + l * 0.25)} speed`,
    apply: (s, l) => { s.growthMult += l * 0.25; },
  },
  // Spalte 2
  {
    id: 'market', name: 'Market Stall', icon: '[[icon:market]]', desc: '+25% sell price',
    col: 4, row: 0, max: 1, requires: ['trade'], cost: once(200),
    apply: (s) => { s.woodPrice *= 1.25; },
  },
  {
    id: 'annex', name: 'Chest Annex', icon: '[[icon:chest]]', desc: '+10 chest slots',
    col: 3, row: 1, max: 1, requires: ['construction'], cost: once(150),
    apply: (s) => { s.woodCap += 10; },
  },
  {
    id: 'plot_tree', name: 'Forest Space', icon: '[[icon:oak]]', desc: 'Prepare a new tree bed: +1 tree on the meadow',
    col: 2, row: 2, max: 2, requires: ['fertilizer'], cost: scaled(400, 5), // neue Bäume sind selten und besonders
    value: (l) => `+${l} slots`,
    apply: (s, l) => { s.treeCap += l; },
  },
  // Spalte 3
  {
    id: 'autosell', name: 'Auto-Sell', icon: '[[icon:repeat]]', desc: 'When the chest is full, items are sold automatically · choose items & amount to keep in the chest',
    col: 6, row: 0, max: 1, requires: ['market'], cost: once(450),
    apply: (s) => { s.autoSell = true; },
  },
  {
    id: 'iron_fittings', name: 'Iron Fittings', icon: '[[icon:settings]]', desc: '+10 chest slots',
    col: 5, row: 1, max: 1, requires: ['annex'], cost: once(350),
    apply: (s) => { s.woodCap += 10; },
  },
  {
    id: 'saplings', name: 'Seed Bag', icon: '[[icon:acorn]]', desc: '+15% chance for a bonus sapling when a tree falls',
    col: 5, row: 2, max: 2, requires: ['plot_tree'], cost: scaled(250, 2.4),
    value: (l) => `${pct(SAPLING_BONUS_CHANCE + l * 0.15)} chance`,
    apply: (s, l) => { s.saplingBonus += l * 0.15; },
  },
  // Spalte 4
  {
    id: 'appraiser', name: 'Gold Appraiser', icon: '[[icon:search]]', desc: 'Gold wood sells for more',
    col: 8, row: 0, max: 2, requires: ['autosell'], cost: scaled(600, 2.5),
    value: (l) => `×${[1, 1.5, 2][l]} value`,
    apply: (s, l) => { s.goldValueMult = [1, 1.5, 2][l]; },
  },
  {
    id: 'treasury', name: 'Treasury', icon: '[[icon:hut]]', desc: '+15 chest slots',
    col: 7, row: 1, max: 1, requires: ['iron_fittings'], cost: once(900),
    apply: (s) => { s.woodCap += 15; },
  },
  {
    id: 'clearing', name: 'Clearing', icon: '[[icon:map]]', desc: '+1 tree bed on the meadow',
    col: 7, row: 2, max: 1, requires: ['saplings'], cost: once(3000),
    apply: (s) => { s.treeCap += 1; },
  },
  // Spalte 5
  {
    id: 'guild', name: 'Trade Guild', icon: '[[icon:handshake]]', desc: '+50% sell price',
    col: 9, row: 0, max: 1, requires: ['appraiser'], cost: once(2000),
    apply: (s) => { s.woodPrice *= 1.5; },
  },
  {
    id: 'soil_science', name: 'Soil Science', icon: '[[icon:soil]]', desc: 'Rich Soil is 30% cheaper and boosts growth even more',
    col: 9, row: 1, max: 1, requires: ['treasury'], cost: once(1500),
    apply: (s) => {
      s.soilBonus += 0.5;
      s.soilPriceMult *= 0.7;
    },
  },
  {
    id: 'stump_grinder', name: 'Stump Grinder', icon: '[[icon:settings]]', desc: 'Stumps replant themselves when you have saplings',
    col: 8, row: 2, max: 1, requires: ['clearing'], cost: once(1800),
    apply: (s) => { s.autoReplant = true; },
  },
  // Spalte 6
  {
    id: 'bulk_deals', name: 'Wholesale', icon: '[[icon:up]]', desc: '+10% sell price',
    col: 11, row: 0, max: 3, requires: ['guild'], cost: scaled(3000, 1.9),
    value: (l) => `+${pct(l * 0.1)}`,
    apply: (s, l) => { s.woodPrice *= 1 + l * 0.1; },
  },
  {
    id: 'warehouse', name: 'Warehouse', icon: '[[icon:hut]]', desc: '+25 chest slots',
    col: 11, row: 1, max: 1, requires: ['soil_science'], cost: once(3500),
    apply: (s) => { s.woodCap += 25; },
  },
  {
    id: 'head_start', name: 'Head Start', icon: '[[icon:leaves]]', desc: 'New saplings start 30% grown',
    col: 10, row: 2, max: 1, requires: ['stump_grinder'], cost: once(2500),
    apply: (s) => { s.headStart = 0.3; },
  },
  // Spalte 7
  {
    id: 'royal_contract', name: 'Royal Contract', icon: '[[icon:scroll]]', desc: 'Sell price ×2',
    col: 14, row: 0, max: 1, requires: ['bulk_deals'], cost: once(12000),
    apply: (s) => { s.woodPrice *= 2; },
  },
  {
    id: 'nursery', name: 'Nursery', icon: '[[icon:sapling]]', desc: 'Buying saplings is 40% cheaper',
    col: 13, row: 1, max: 1, requires: ['warehouse'], cost: once(4000),
    apply: (s) => { s.saplingPriceMult *= 0.6; },
  },
  {
    id: 'old_growth', name: 'Old Growth', icon: '[[icon:pine]]', desc: '+2 tree beds on the meadow',
    col: 12, row: 2, max: 1, requires: ['head_start'], cost: once(15000),
    apply: (s) => { s.treeCap += 2; },
  },
  // Spalte 8
  {
    id: 'ancient_forest', name: 'Ancient Forest', icon: '[[icon:oak]]', desc: 'Trees grow 50% faster',
    col: 14, row: 2, max: 1, requires: ['old_growth'], cost: once(9000),
    apply: (s) => { s.growthMult += 0.5; },
  },
];

// ---------- Workers: oben „Werte“, Mitte „Plätze“, unten „Verwaltung“ ----------
const WORKER_NODES = [
  {
    id: 'hut', name: 'First Hut', icon: '[[icon:hut]]', desc: 'Your first worker slot. Unlocks Board & Team',
    col: 0, row: 1, max: 1, cost: once(50), unlocks: 'workers',
    apply: (s) => { s.workerCap += 1; },
  },
  // Spalte 1
  {
    id: 'boots', name: 'Work Boots', icon: '[[icon:boots]]', desc: '+10% walk speed for all workers',
    col: 1, row: 0, max: 3, requires: ['hut'], cost: scaled(80, 2),
    value: (l) => `+${pct(l * 0.1)}`,
    apply: (s, l) => { s.workerSpeedMult *= 1 + l * 0.1; },
  },
  {
    id: 'bunk', name: 'Bunk Bed', icon: '[[icon:moon]]', desc: '+1 worker slot',
    col: 2, row: 1, max: 1, requires: ['hut'], cost: once(300),
    apply: (s) => { s.workerCap += 1; },
  },
  {
    id: 'notice', name: 'Bigger Board', icon: '[[icon:flag]]', desc: '+1 note on the board',
    col: 1, row: 2, max: 2, requires: ['hut'], cost: scaled(60, 3),
    value: (l) => `${3 + l} notes`,
    apply: (s, l) => { s.boardSize += l; },
  },
  // Spalte 2
  {
    id: 'whetstone', name: 'Whetstone', icon: '[[icon:tools]]', desc: '+10% swing speed for all workers',
    col: 3, row: 0, max: 3, requires: ['boots'], cost: scaled(150, 2),
    value: (l) => `+${pct(l * 0.1)}`,
    apply: (s, l) => { s.workerSwingMult *= 1 + l * 0.1; },
  },
  {
    id: 'camp', name: 'Lumber Camp', icon: '[[icon:tent]]', desc: '+1 worker slot',
    col: 4, row: 1, max: 1, requires: ['bunk'], cost: once(1000),
    apply: (s) => { s.workerCap += 1; },
  },
  {
    id: 'recruiter', name: 'Recruiter', icon: '[[icon:search]]', desc: 'Rare, epic and legendary workers show up more often',
    col: 2, row: 2, max: 2, requires: ['notice'], cost: scaled(250, 2.5),
    value: (l) => (l ? `+${l} luck` : 'normal'),
    apply: (s, l) => { s.rarityBoost += l; },
  },
  // Spalte 3
  {
    id: 'lunch', name: 'Hearty Lunch', icon: '[[icon:soup]]', desc: '+15% damage for all workers',
    col: 4, row: 0, max: 3, requires: ['whetstone'], cost: scaled(300, 2),
    value: (l) => `+${pct(l * 0.15)}`,
    apply: (s, l) => { s.workerDamageMult *= 1 + l * 0.15; },
  },
  {
    id: 'backpacks', name: 'Backpacks', icon: '[[icon:backpack]]', desc: 'Workers carry +1 log',
    col: 6, row: 1, max: 1, requires: ['camp'], cost: once(600),
    apply: (s) => { s.workerCarryBonus += 1; },
  },
  {
    id: 'dice', name: 'Lucky Dice', icon: '[[icon:dice]]', desc: 'Rerolling the board is 60% cheaper',
    col: 5, row: 2, max: 1, requires: ['recruiter'], cost: once(400),
    apply: (s) => { s.rerollPriceMult *= 0.4; },
  },
  // Spalte 4
  {
    id: 'mentor', name: 'Mentor', icon: '[[icon:book]]', desc: '+25% XP for all workers',
    col: 6, row: 0, max: 2, requires: ['lunch'], cost: scaled(500, 2.5),
    value: (l) => `+${pct(l * 0.25)}`,
    apply: (s, l) => { s.xpMult *= 1 + l * 0.25; },
  },
  {
    id: 'treehouse', name: 'Treehouse', icon: '[[icon:hut]]', desc: '+1 worker slot',
    col: 8, row: 1, max: 1, requires: ['backpacks'], cost: once(2500),
    apply: (s) => { s.workerCap += 1; },
  },
  {
    id: 'union', name: 'Union Deal', icon: '[[icon:handshake]]', desc: '-15% wages for all workers',
    col: 7, row: 2, max: 2, requires: ['dice'], cost: scaled(600, 2.5),
    value: (l) => `-${pct(l * 0.15)}`,
    apply: (s, l) => { s.wageMult *= 1 - l * 0.15; },
  },
  // Spalte 5
  {
    id: 'training', name: 'Training Camp', icon: '[[icon:bolt]]', desc: 'Worker level cap +5',
    col: 9, row: 0, max: 1, requires: ['mentor'], cost: once(2000),
    apply: (s) => { s.levelCapBonus += 5; },
  },
  {
    id: 'lanterns', name: 'Lanterns', icon: '[[icon:lantern]]', desc: 'No night penalties, +10% speed at night',
    col: 10, row: 1, max: 1, requires: ['treehouse'], cost: once(1500),
    apply: (s) => { s.nightProof = true; },
  },
  {
    id: 'headhunter', name: 'Headhunter', icon: '[[icon:worker]]', desc: 'Hiring workers is 25% cheaper',
    col: 10, row: 2, max: 1, requires: ['union'], cost: once(1800),
    apply: (s) => { s.hireDiscount *= 0.75; },
  },
  // Spalte 6
  {
    id: 'masterclass', name: 'Masterclass', icon: '[[icon:book]]', desc: 'Every level-up gives +1 extra stat point',
    col: 11, row: 0, max: 1, requires: ['training'], cost: once(6000),
    apply: (s) => { s.masterclass = true; },
  },
  {
    id: 'lodge', name: 'Lumber Lodge', icon: '[[icon:hut]]', desc: '+2 worker slots',
    col: 12, row: 1, max: 1, requires: ['lanterns'], cost: once(8000),
    apply: (s) => { s.workerCap += 2; },
  },
  {
    id: 'team_spirit', name: 'Team Spirit', icon: '[[icon:heart]]', desc: '+3% speed and damage per hired worker',
    col: 13, row: 2, max: 1, requires: ['headhunter'], cost: once(5000),
    apply: (s) => { s.teamSpirit = true; },
  },
  // Spalte 7
  {
    id: 'night_shift', name: 'Night Shift', icon: '[[icon:moon]]', desc: 'Your team keeps working longer while you are away (offline time)',
    col: 14, row: 1, max: 2, requires: ['lodge'], cost: scaled(2500, 3),
    value: (l) => `${[2, 6, 12][l]}h offline`,
    apply: (s, l) => { s.offlineHours = [2, 6, 12][l]; },
  },
];

export const SKILL_TREES = [
  { id: 'worker', name: 'Workers', icon: 'person', accent: '#4a90d9', nodes: WORKER_NODES },
  { id: 'economy', name: 'Economy', icon: 'coin', accent: '#e0a82a', nodes: ECONOMY_NODES },
  { id: 'click', name: 'Clicker', icon: 'axe', accent: '#d9503c', nodes: CLICK_NODES },
];
