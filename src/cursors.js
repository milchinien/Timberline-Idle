import { iconCanvas, iconUrl } from './icons.js';

export const handImageUrl = () => iconUrl('hand');

export function installCursors() {
  const root = document.documentElement.style;
  const set = (name, icon, x, y, fallback) => {
    const canvas = iconCanvas(icon, 32);
    root.setProperty(name, `url("${canvas.toDataURL()}") ${x} ${y}, ${fallback}`);
  };
  root.setProperty('--cur-default', 'default');
  set('--cur-pointer', 'hand', 12, 4, 'pointer');
  set('--cur-grab', 'hand', 12, 4, 'grab');
  set('--cur-grabbing', 'hand', 16, 16, 'grabbing');
  set('--cur-axe', 'axe', 26, 18, 'pointer');
}
