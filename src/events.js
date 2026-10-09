// Mini-Ereignis-Bus: Welt und UI melden Aktionen, Tutorial/Hinweise hören zu.
// Ereignisse: treeFelled, itemDeposited {kind}, chestFull, windowOpened {id}, sold {earned},
//             skillBought {id}, tabUnlocked {id}
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function emit(type, data = {}) {
  for (const fn of listeners.get(type) ?? []) fn(data);
}
