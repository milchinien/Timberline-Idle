// Generated woodland pictograms. Text data stores semantic tokens, never markup.
const NAMES = 'axe oak pine sapling log planks chest coin worker hut map orders scroll settings sun moon star heart lock check close warning up right repeat sound muted save export import trash trophy saw water sprinkler fountain soil leaves acorn tent boots backpack book clock bolt gift crown tools handshake bread boat bear fish soup lantern market mouse hand flag dice search feather music mountain'.split(' ');
const aliases = { note: 'scroll', person: 'worker', plots: 'map', house: 'hut', 'heart-empty': 'heart', 'north-east': 'right', 'south-east': 'right', 'south-west': 'right', 'north-west': 'right', left: 'right', down: 'up' };
const tokenPattern = /\[\[icon:([a-z-]+)\]\]/g;
const resolve = (name) => aliases[name] ?? name;
export const iconUrl = (name) => {
  const key = resolve(name);
  if (!NAMES.includes(key)) throw new Error(`Unknown icon: ${name}`);
  return `${import.meta.env.BASE_URL}icons/${key}.png`;
};
export const iconMarkup = (name) => `<img class="game-icon icon-${name}" src="${iconUrl(name)}" width="24" height="24" alt="" aria-hidden="true" draggable="false">`;
export const plainIconText = (text) => String(text).replace(tokenPattern, (_, name) => name.replaceAll('-', ' '));

// Only tokens in text become images. Attribute values remain plain text.
export function renderIcons(html) {
  return String(html).replace(/<[^>]*>|\[\[icon:([a-z-]+)\]\]/g, (match, name) =>
    name ? iconMarkup(name) : plainIconText(match));
}
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const renderedText = new WeakMap();
export function setIconText(el, value) {
  const text = String(value ?? '');
  // HUD updates every frame: keep existing image nodes when the value is unchanged.
  if (renderedText.get(el) === text) return;
  renderedText.set(el, text);
  if (text.includes('[[icon:')) el.innerHTML = renderIcons(escapeHtml(text));
  else el.textContent = text;
}
export const ICONS = Object.fromEntries([...NAMES, ...Object.keys(aliases)].map((name) => [name, iconMarkup(name)]));

let atlas;
export async function loadIconAtlas() {
  atlas = new Image();
  // load-Ereignis statt decode(): decode() löst in manchen Umgebungen nie auf und das Spiel bliebe hängen
  await new Promise((resolve, reject) => {
    atlas.onload = resolve;
    atlas.onerror = () => reject(new Error('Icon atlas failed to load'));
    atlas.src = `${import.meta.env.BASE_URL}icons/woodland-atlas.png`;
  });
}
export function iconCanvas(name, size = 32) {
  const index = NAMES.indexOf(resolve(name));
  if (index < 0 || !atlas?.complete) throw new Error(`Icon atlas not ready: ${name}`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const x = Math.round(index % 8 * atlas.width / 8);
  const y = Math.round(Math.floor(index / 8) * atlas.height / 8);
  const right = Math.round((index % 8 + 1) * atlas.width / 8);
  const bottom = Math.round((Math.floor(index / 8) + 1) * atlas.height / 8);
  canvas.getContext('2d').drawImage(atlas, x, y, right - x, bottom - y, 0, 0, size, size);
  return canvas;
}
