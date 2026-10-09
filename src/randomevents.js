// Zufallsereignisse: alle paar Spielminuten passiert etwas (Regen, goldener Baum, Markttag, Wanderhändler, Gewitter).
// Sie belohnen gelegentliches Reinschauen. Immer nur ein Ereignis gleichzeitig; nicht im Tutorial, nicht offline.
// Die Wirkung läuft über state.eventGrowthMult / state.eventPriceMult (werden hier jeden Frame gesetzt),
// die Grafik (Regen, Blitze, goldener Baum, Händler-Figur) über die Welt.
import { emit } from './events.js';
import { ITEM_DEFS, itemPrice, earn, orderReserve } from './state.js';
import { addXp, xpForLevel, traitLevel } from './workers.js';
import { SPECIES_ORDER, speciesOf, isSpeciesUnlocked, saplingBuyPrice } from './species.js';
import { setIconText } from './icons.js';
import * as sfx from './sfx.js';

// duration in Spielsekunden; ok(state) = darf gerade passieren
export const EVENT_DEFS = {
  rain: { name: 'Rain', icon: '[[icon:water]]', desc: 'Trees grow twice as fast', duration: 120, weight: 30 },
  golden: { name: 'Golden Tree', icon: '[[icon:star]]', desc: 'Chop the shining tree: every log turns into gold wood', duration: 90, weight: 22 },
  market: { name: 'Market Day', icon: '[[icon:market]]', desc: 'Everything sells for 50% more', duration: 120, weight: 18 },
  merchant: { name: 'Traveling Merchant', icon: '[[icon:backpack]]', desc: 'Special deals today · click him!', duration: 150, weight: 18, ok: (s) => s.money >= 30 || s.workers.length > 0 },
  storm: { name: 'Thunderstorm', icon: '[[icon:bolt]]', desc: 'Lightning fells trees · grab the logs!', duration: 60, weight: 12, ok: (s) => s.day >= 3 },
};
const FIRST_EVENT = 240; // Spielsekunden nach Spielbeginn (bzw. Laden)
const GAP = [150, 300]; // Pause zwischen zwei Ereignissen
const FERTILIZER_TIME = 180; // Wunderdünger vom Händler

const randRange = (a, b) => a + Math.random() * (b - a);

export function createRandomEvents({ state, world, onMerchantClick }) {
  let nextIn = FIRST_EVENT;
  let current = null; // { id, t, total, offers, strikeIn }
  let fertilizerT = 0;
  state.eventGrowthMult = 1;
  state.eventPriceMult = 1;

  // ---- Schild oben rechts über der Welt: was gerade passiert, wie lange noch ----
  const banner = document.createElement('div');
  banner.id = 'event-banner';
  banner.hidden = true;
  banner.innerHTML = '<span class="ev-icon"></span><div class="ev-text"><b></b><span></span><div class="fill-bar"><div class="fill-bar-in"></div></div></div>';
  document.getElementById('stage')?.appendChild(banner);
  const bIcon = banner.querySelector('.ev-icon');
  const bName = banner.querySelector('b');
  const bDesc = banner.querySelector('.ev-text > span');
  const bBar = banner.querySelector('.fill-bar-in');
  banner.addEventListener('click', () => {
    if (current?.id === 'merchant') onMerchantClick?.();
  });

  function pickEvent() {
    const pool = Object.entries(EVENT_DEFS).filter(([, d]) => !d.ok || d.ok(state));
    const total = pool.reduce((s, [, d]) => s + d.weight, 0);
    let roll = Math.random() * total;
    for (const [id, d] of pool) {
      roll -= d.weight;
      if (roll < 0) return id;
    }
    return pool[0]?.[0];
  }

  function start(id) {
    const def = EVENT_DEFS[id];
    current = { id, t: def.duration, total: def.duration, offers: null, strikeIn: 4 };
    if (id === 'golden' && !world.makeGolden()) {
      current = null; // gerade kein ausgewachsener Baum: später nochmal
      nextIn = 30;
      return;
    }
    if (id === 'rain') sfx.rain();
    if (id === 'storm') sfx.thunder(0.6);
    if (id === 'market') sfx.coin();
    if (id === 'merchant') {
      current.offers = rollOffers();
      world.spawnMerchant();
      sfx.bell();
    }
    if (id === 'golden') sfx.fanfare();
    world.setWeather({ rain: id === 'rain' || id === 'storm' ? 1 : 0, storm: id === 'storm' });
    banner.dataset.event = id;
    banner.classList.toggle('clickable', id === 'merchant');
    setIconText(bIcon, def.icon);
    setIconText(bName, def.name);
    setIconText(bDesc, def.desc);
    banner.hidden = false;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    emit('randomEvent', { id });
  }

  function end() {
    if (!current) return;
    if (current.id === 'golden') world.clearGolden();
    if (current.id === 'merchant') world.dismissMerchant();
    world.setWeather({ rain: 0, storm: false });
    emit('randomEventEnd', { id: current.id });
    current = null;
    banner.hidden = true;
    nextIn = randRange(...GAP);
  }

  function update(gameDt) {
    fertilizerT = Math.max(0, fertilizerT - gameDt);
    state.eventGrowthMult = (current?.id === 'rain' ? 2 : 1) * (fertilizerT > 0 ? 2 : 1);
    state.eventPriceMult = current?.id === 'market' ? 1.5 : 1;
    if (state.tutorial !== 'done') return;
    if (!current) {
      nextIn -= gameDt;
      if (nextIn <= 0) start(pickEvent());
      return;
    }
    current.t -= gameDt;
    bBar.style.width = Math.max(0, (current.t / current.total) * 100) + '%';
    // Gewitter: alle paar Sekunden ein Blitz, der einen ausgewachsenen Baum fällt
    if (current.id === 'storm') {
      current.strikeIn -= gameDt;
      if (current.strikeIn <= 0) {
        current.strikeIn = randRange(9, 16);
        world.lightning();
      }
    }
    // goldener Baum gefällt: Ereignis vorbei
    if (current.id === 'golden' && !world.hasGolden()) current.t = Math.min(current.t, 0);
    if (current.t <= 0) end();
  }

  // ---- Wanderhändler: 3 zufällige Angebote, jedes einmal kaufbar ----
  function rollOffers() {
    // Preise wachsen mit dem Spielfortschritt: Wert einer vollen Ernte aller Baumplätze
    const harvest = Math.max(25, state.treeCap * state.woodPerTree * state.woodPrice);
    const sp = [...SPECIES_ORDER].reverse().find((id) => isSpeciesUnlocked(state, id)) ?? 'oak';
    const pool = [
      { id: 'buyLogs', icon: '[[icon:log]]', name: 'Log Collector', desc: 'Buys all logs in your chest for double the price', price: 0 },
      { id: 'saplings', icon: '[[icon:sapling]]', name: `${speciesOf(sp).name} saplings`, desc: '3 saplings at half price', price: Math.round(saplingBuyPrice(1, state.saplingPriceMult, sp) * 1.5), species: sp },
      { id: 'growth', icon: '[[icon:leaves]]', name: 'Magic Fertilizer', desc: 'Trees grow 2× faster for 3 minutes', price: Math.round(harvest * 1.2) },
    ];
    if (state.workers.length) {
      pool.push({ id: 'training', icon: '[[icon:book]]', name: 'Training Scroll', desc: 'Every worker gains a level', price: Math.round(harvest * 1.5 + 30 * state.workers.length) });
    }
    return pool.sort(() => Math.random() - 0.5).slice(0, 3);
  }

  function buyOffer(id) {
    const o = current?.offers?.find((x) => x.id === id);
    if (!o || o.bought || state.money < o.price) return false;
    state.money -= o.price;
    o.bought = true;
    if (o.id === 'buyLogs') {
      // alle Stämme (ohne die für offene Aufträge) zum doppelten Preis
      let earned = 0;
      for (const key of Object.keys(ITEM_DEFS).filter((k) => ITEM_DEFS[k].type === 'log')) {
        const n = (state.inventory[key] ?? 0) - orderReserve(state, key);
        if (n <= 0) continue;
        state.inventory[key] -= n;
        earned += earn(state, n * itemPrice(state, key) * 2);
      }
      o.result = earned;
      emit('sold', { earned });
    } else if (o.id === 'saplings') {
      const key = speciesOf(o.species).sapling;
      state.inventory[key] = (state.inventory[key] ?? 0) + 3;
    } else if (o.id === 'growth') {
      fertilizerT = FERTILIZER_TIME;
    } else if (o.id === 'training') {
      for (const w of state.workers) {
        const mult = (1 + traitLevel(w, 'fastLearner') * 0.25) * (state.xpMult ?? 1);
        addXp(w, (xpForLevel(w.level) - w.xp) / mult + 0.01, state);
      }
    }
    emit('merchantDeal', { id: o.id });
    return o;
  }

  return {
    update,
    current: () => current,
    offers: () => current?.offers ?? [],
    buyOffer,
    fertilizerLeft: () => fertilizerT,
    // Dev: Ereignis sofort starten
    debugStart: (id) => {
      end();
      start(id);
    },
  };
}
