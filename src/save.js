// Spielstände im Browser (localStorage): 3 Slots, Autosave alle paar Sekunden, beim Schließen und beim Tab-Wechsel.
// Dazu Export/Import als Text, der Start eines Slots aus dem Hauptmenü und die Einstellungen (Ton),
// die getrennt von den Spielständen liegen.
import { SAVED_FIELDS } from './state.js';

export const SLOT_COUNT = 3;
const slotKey = (n) => `lumberjack-idle-slot-${n}`;
const LEGACY_KEY = 'lumberjack-idle-save-v1'; // vor den Slots: ein einziger Spielstand
const BOOT_KEY = 'lumberjack-idle-boot'; // sessionStorage: welcher Slot nach dem Neuladen startet
const SETTINGS_KEY = 'lumberjack-idle-settings';
const AUTOSAVE_MS = 5000;
export const SAVE_VERSION = 2;

let activeSlot = 1;
export const setActiveSlot = (n) => { activeSlot = n; };
export const getActiveSlot = () => activeSlot;

// Ältere Spielstände Schritt für Schritt auf die aktuelle Version bringen.
// MIGRATIONS[v] macht aus Version v die Version v + 1. Fehlende Felder ergänzt sonst createState().
const MIGRATIONS = {
  // v2: Land aus Plot-Reihen (state.land); alte Stände haben nur das Startland
  1: (data) => {
    data.state.land ??= { n: 0, e: 0, s: 0, w: 0 };
    return data;
  },
};

export function migrate(data) {
  if (!data?.state) return null;
  let v = data.version ?? 1;
  while (v < SAVE_VERSION) {
    data = MIGRATIONS[v]?.(data) ?? data;
    v += 1;
  }
  data.version = SAVE_VERSION;
  return data;
}

// Alter Einzel-Spielstand -> Slot 1 (einmalig)
export function migrateLegacySave() {
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (!old) return;
    if (!localStorage.getItem(slotKey(1))) localStorage.setItem(slotKey(1), old);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // egal
  }
}

export function loadSave(slot = activeSlot) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null; // kaputter oder fehlender Spielstand -> neues Spiel
  }
}

function snapshot(state, world) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state: Object.fromEntries(SAVED_FIELDS.map((k) => [k, state[k]])),
    world: world.serialize(),
  };
}

let autosaveOff = false; // nach Import/Neustart/Menü: nichts mehr speichern, bis die Seite neu lädt

export function writeSave(state, world) {
  if (autosaveOff) return;
  try {
    localStorage.setItem(slotKey(activeSlot), JSON.stringify(snapshot(state, world)));
  } catch {
    // Speicher voll oder gesperrt – Spiel läuft trotzdem weiter
  }
}

export function clearSave(slot = activeSlot) {
  localStorage.removeItem(slotKey(slot));
}
export function clearAllSaves() {
  for (let n = 1; n <= SLOT_COUNT; n++) clearSave(n);
  localStorage.removeItem(LEGACY_KEY);
}

export function startAutosave(state, world) {
  const save = () => writeSave(state, world);
  setInterval(save, AUTOSAVE_MS);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  return save;
}

// ---- Slots fürs Hauptmenü ----
// Kurzinfo eines Slots (oder null, wenn leer)
export function slotInfo(n) {
  const data = loadSave(n);
  if (!data) return null;
  const s = data.state;
  return {
    slot: n,
    savedAt: data.savedAt ?? 0,
    day: s.day ?? 1,
    money: s.money ?? 0,
    workers: s.workers?.length ?? 0,
    reputation: s.reputation ?? 0,
    land: s.land ?? { n: 0, e: 0, s: 0, w: 0 },
    skills: Object.keys(s.skills ?? {}).length,
    playTime: s.playTime ?? 0,
    tutorial: s.tutorial !== 'done',
  };
}

// Slot starten: merkt sich die Wahl und lädt die Seite neu (sauberer Start ohne Menü-Welt).
// newGame = { tutorial } für einen neuen Spielstand.
export function bootSlot(slot, newGame = null) {
  autosaveOff = true;
  if (newGame) clearSave(slot);
  sessionStorage.setItem(BOOT_KEY, JSON.stringify({ slot, newGame }));
  location.href = location.pathname; // ohne Test-Parameter
}
export function takeBoot() {
  try {
    const raw = sessionStorage.getItem(BOOT_KEY);
    sessionStorage.removeItem(BOOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
// Zurück ins Hauptmenü (vorher speichern)
export function backToMenu(state, world) {
  writeSave(state, world);
  autosaveOff = true;
  location.href = location.pathname;
}

// ---- Export / Import / Neustart (immer der aktive Slot) ----
// Exportiert wird der aktuelle Stand als Base64-Text (zum Kopieren und Einfügen)
export function exportSave(state, world) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot(state, world)));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Liest einen exportierten Text (Base64 oder rohes JSON). Gibt false zurück, wenn er kaputt ist.
export function importSave(text) {
  let data;
  try {
    const t = text.trim();
    const json = t.startsWith('{') ? t : new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
    data = migrate(JSON.parse(json));
  } catch {
    return false;
  }
  if (!data) return false;
  autosaveOff = true;
  localStorage.setItem(slotKey(activeSlot), JSON.stringify(data));
  bootSlot(activeSlot);
  return true;
}

// Neu anfangen im selben Slot (mit Tutorial)
export function resetGame() {
  bootSlot(activeSlot, { tutorial: true });
}

// ---- Einstellungen ----
export function loadSettings() {
  try {
    return { volume: 1, muted: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { volume: 1, muted: false };
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // egal
  }
}
