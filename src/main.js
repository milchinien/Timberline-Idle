import '@fontsource/jersey-15'; // Pixel-Schrift (lokal eingebunden, siehe --font-ui in style.css)
import './style.css';
import './menu.css';
import './icon-style.css';
import './randomevents.css';
import { installWoodTextures } from './woodtex.js';
import { installCursors } from './cursors.js';
import { loadIconAtlas } from './icons.js';
import { createState, advanceTime, recomputeStats, applySave } from './state.js';
import { createWorld } from './world.js';
import { createUi } from './ui.js';
import { createTutorial } from './tutorial.js';
import {
  loadSave, startAutosave, clearAllSaves, migrateLegacySave, takeBoot, setActiveSlot,
} from './save.js';
import { debugWorker } from './workers.js';
import { tickOrders, fillOrders } from './orders.js';
import { applyOffline, decayIdle, MIN_AWAY } from './offline.js';
import { startMenu } from './menu.js';
import { startAchievements } from './achievements.js';
import { emit } from './events.js';
import { createRandomEvents } from './randomevents.js';

installWoodTextures();
await loadIconAtlas();
installCursors();
migrateLegacySave();

const params = new URLSearchParams(location.search);
// Dev-Sandbox: Sobald Test-Parameter in der URL stehen, wird weder geladen noch gespeichert,
// damit Tests nie den echten Spielstand überschreiben. ?reset löscht alle Spielstände, ?menu zeigt das Hauptmenü.
const devSandbox = import.meta.env.DEV && [...params.keys()].some((k) => k !== 'reset' && k !== 'menu');
if (import.meta.env.DEV && params.has('reset')) clearAllSaves();

// Ohne gewählten Slot (frischer Seitenaufruf) kommt das Hauptmenü; die Wahl dort lädt die Seite neu
const boot = devSandbox ? null : takeBoot();
if (!devSandbox && !boot) {
  const menu = startMenu();
  if (import.meta.env.DEV && params.get('menu')) menu.show(params.get('menu')); // ?menu=play öffnet ein Panel
} else startGame(boot);

function startGame(boot) {
  document.body.classList.add('mode-game');
  if (boot) setActiveSlot(boot.slot);
  const saved = devSandbox || boot?.newGame ? null : loadSave();
  const state = createState();
  if (saved?.state) applySave(state, saved.state);
  if (boot?.newGame) state.tutorial = boot.newGame.tutorial ? 'chop' : 'done';

  if (devSandbox) {
    state.tutorial = params.get('tutorial') ?? 'done'; // ?tutorial=chop startet das Tutorial
    // ?skills=axe:2,crit:1 setzt Skill-Stufen direkt
    const skills = params.get('skills');
    if (skills) {
      for (const pair of skills.split(',')) {
        const [id, lvl] = pair.split(':');
        state.skills[id] = Number(lvl ?? 1);
      }
      recomputeStats(state);
    }
    // ?inv=wood:7,sapling:2 füllt die Truhe
    const inv = params.get('inv');
    if (inv) {
      for (const pair of inv.split(',')) {
        const [key, n] = pair.split(':');
        state.inventory[key] = Number(n);
      }
    }
    // ?rep=16 setzt Ruf-Punkte
    if (params.has('rep')) state.reputation = Number(params.get('rep'));
    // ?land=n:1,e:2 setzt gekaufte Plot-Reihen je Seite
    for (const pair of params.get('land')?.split(',') ?? []) {
      const [side, n] = pair.split(':');
      if (side in state.land) state.land[side] = Number(n ?? 1);
    }
    recomputeStats(state);
    // ?workers=3 stellt direkt Worker ein (Plätze werden mit erhöht, daher nach recomputeStats)
    if (params.has('workers')) {
      const n = Number(params.get('workers'));
      for (let i = 0; i < n; i++) state.workers.push(debugWorker());
      state.workerCap = Math.max(state.workerCap, n);
    }
    // ?money=500 setzt Startgeld
    if (params.has('money')) state.money = Number(params.get('money'));
  }

  const world = createWorld(document.getElementById('viewport'), document.getElementById('floaters'), state, saved?.world);
  const ui = createUi(state, world);
  const tutorial = createTutorial(state, world, ui);
  const randomEvents = createRandomEvents({ state, world, onMerchantClick: () => ui.openMerchant() });
  ui.setRandomEvents(randomEvents);
  // ?event=rain|golden|market|merchant|storm startet sofort ein Zufallsereignis
  if (devSandbox && params.has('event')) setTimeout(() => randomEvents.debugStart(params.get('event')), 300);

  if (devSandbox) {
    // ?open=0..4 öffnet direkt ein Fenster (für Screenshots)
    const open = params.get('open');
    if (open !== null) document.querySelectorAll('#side-tabs .tab-btn')[Number(open)]?.click();
    // ?tree=economy|worker|click zeigt direkt einen Skill-Tree
    if (params.has('tree')) ui.showTree(params.get('tree'));
    // ?place=sapling oder ?place=rich startet den Platzier-Modus
    const place = params.get('place');
    if (place === 'sapling') world.beginPlanting();
    else if (place) world.beginSoil(place);
    // ?build=sawmill:0:0,splitter:3:6:0 platziert Gebäude (Typ:i:j:Drehung), ?grow=birch:6:6,pine:6:2 setzt fast reife Bäume
    for (const d of params.get('build')?.split(',') ?? []) {
      const [type, i, j, rot] = d.split(':');
      state.money += 1e6;
      world.debug.build(type, Number(i), Number(j), Number(rot ?? 0));
      state.money -= 1e6;
    }
    for (const d of params.get('grow')?.split(',') ?? []) {
      const [sp, i, j, g] = d.split(':');
      world.debug.plantAt(sp, Number(i), Number(j), Number(g ?? 0.98));
    }
    // ?panel=0 öffnet das Fenster des ersten Gebäudes
    if (params.has('panel')) ui.openBuilding(world.buildings[Number(params.get('panel'))]);
    // ?away=3600 simuliert eine Abwesenheit (Sekunden); ?idle=wood:0.2,sapling:0.1 setzt die gemessene Produktion pro Sekunde
    for (const pair of params.get('idle')?.split(',') ?? []) {
      const [key, rate] = pair.split(':');
      state.idle = state.idle ?? { w: 600, s: {} };
      state.idle.w = 600;
      state.idle.s[key] = Number(rate) * 600;
    }
    // ?love=hugo:6,mia:15 setzt Treue-Punkte bei Kunden, ?orders=1 füllt sofort alle Auftragsplätze
    if (params.has('love')) {
      for (const pair of params.get('love').split(',')) {
        const [id, pts] = pair.split(':');
        state.customers[id] = { pts: Number(pts), orders: Number(pts) };
      }
      const cap = state.workerCap; // ?workers kann Plätze erhöht haben
      recomputeStats(state);
      state.workerCap = Math.max(state.workerCap, cap);
    }
    if (params.has('orders')) fillOrders(state, world.hasSawmill());
    if (params.has('away')) welcomeBack(Number(params.get('away')));
    // ?demo=1 fällt den ersten Baum automatisch
    if (params.has('demo')) {
      for (let i = 0; i < 5; i++) setTimeout(() => world.debugHit(0), 300 + i * 150);
    }
  } else {
    startAchievements(state);
    // Offline-Fortschritt seit dem letzten Speichern
    if (saved?.savedAt) welcomeBack((Date.now() - saved.savedAt) / 1000);
    startAutosave(state, world);
  }

  function welcomeBack(awaySec) {
    if (awaySec < MIN_AWAY || state.tutorial !== 'done') return;
    const report = applyOffline(state, awaySec, world);
    report.customers = fillOrders(state, world.hasSawmill()); // Kunden haben gewartet
    ui.showOfflineReport(report);
    emit('welcomeBack', { report });
  }
  if (import.meta.env.DEV) window.__game = { state, world, ui };

  // ?bot=5400 lässt den Balance-Bot so viele Spielsekunden spielen (das normale Spiel pausiert dabei);
  // &report=http://localhost:5299 schickt alle 5 Spielminuten einen Zwischenstand dorthin, &idle=1 spielt ohne Klicks
  let botRunning = false;
  if (devSandbox && params.has('bot')) {
    botRunning = true;
    setTimeout(async () => {
      const bot = await (await import(/* @vite-ignore */ `${location.origin}/balance-bot.js`)).createBot({ idle: params.get('botidle') === '1' });
      const report = params.get('report');
      const send = (data) => report && fetch(report, { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
      const total = Number(params.get('bot'));
      let nextReport = 300;
      while (bot.t < total) {
        // kleine Häppchen: dazwischen räumt der Browser Einblendungen (Timer) auf, sonst wird es immer langsamer
        bot.run(Math.min(20, total - bot.t));
        if (bot.t >= nextReport) {
          nextReport += 300;
          send({ snap: bot.snapshot(), log: bot.log.at(-1) });
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      send({ done: true, buys: bot.buys, log: bot.log });
    }, 500);
  }

  let last = performance.now();
  function frame(now) {
    if (botRunning) return requestAnimationFrame(frame);
    // rAF-Zeitstempel kann im ersten Frame vor performance.now() liegen: nie negativ
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    const gameDt = dt * state.speed;
    state.playTime = (state.playTime ?? 0) + dt;
    advanceTime(state, gameDt);
    decayIdle(state, gameDt);
    world.update(dt, gameDt);
    tickOrders(state, gameDt, world.hasSawmill());
    ui.update();
    tutorial.update();
    randomEvents.update(gameDt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
