// Run against `npm run dev`; requires Playwright and a local Edge installation.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const artifactDir = 'artifacts/icon-review';
fs.mkdirSync(artifactDir, { recursive: true });
for (const file of [...fs.readdirSync('src').map(f => `src/${f}`), 'index.html']) {
  if (!/\.(js|css|html)$/.test(file)) continue;
  assert(!/\p{Extended_Pictographic}/u.test(fs.readFileSync(file, 'utf8')), `Emoji in ${file}`);
}
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
async function check(label) {
  await page.waitForTimeout(350);
  const result = await page.evaluate(async () => {
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
    const visible = el => el.getBoundingClientRect().width && el.getBoundingClientRect().height;
    return {
      rawTokens: document.body.innerText.includes('[[icon:'),
      emoji: /\p{Extended_Pictographic}/u.test(document.body.innerText),
      broken: [...document.images].filter(img => visible(img) && !img.naturalWidth).map(img => img.src),
      iconCount: document.querySelectorAll('.game-icon').length,
      clipped: [...document.querySelectorAll('button .game-icon')].filter(img => {
        if (!visible(img)) return false;
        const a = img.getBoundingClientRect();
        // Skill prices and levels are deliberately attached outside the circular node.
        const b = (img.closest('.node-cost, .node-level') ?? img.closest('button')).getBoundingClientRect();
        return a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1;
      }).map(img => img.closest('button').outerHTML),
    };
  });
  assert.equal(result.rawTokens, false, `${label}: raw tokens`);
  assert.equal(result.emoji, false, `${label}: visible emoji`);
  assert.deepEqual(result.broken, [], `${label}: broken images`);
  assert.deepEqual(result.clipped, [], `${label}: icons outside buttons`);
  assert(result.iconCount > 0, `${label}: icons missing`);
  console.log(`${label}: ${result.iconCount} icons OK`);
}
try {
  await page.goto(base);
  await page.waitForSelector('.menu-btn');
  for (const panel of ['play', 'settings', 'achievements', 'credits']) {
    await page.locator(`[data-panel="${panel}"]`).click();
    await check(`menu/${panel}`);
    if (panel === 'settings') {
      await page.locator('.mute-btn').click();
      await check('menu/muted');
    }
  }
  await page.screenshot({ path: `${artifactDir}/menu.png` });
  await page.goto(`${base}/?skills=hut:1,orders:1,construction:1&workers=3&rep=100&money=1000000&inv=wood:10,sapling:5&tree=economy`);
  await page.waitForFunction(() => Boolean(window.__game));
  await check('game/HUD');
  const count = await page.locator('#side-tabs .tab-btn').count();
  for (let i = 0; i < count; i++) {
    await page.locator('#side-tabs .tab-btn').nth(i).click();
    await check(`game/tab-${i}`);
    await page.screenshot({ path: `${artifactDir}/tab-${i}.png` });
    await page.locator('#window-close').click();
  }
  await page.locator('#settings-btn').click();
  await check('game/settings');
  await page.locator('#window-close').click();
  await page.evaluate(() => { window.__game.state.hour = 23; });
  await page.waitForSelector('#time-icon .icon-moon');
  await check('game/night');
  await page.evaluate(() => { window.__game.state.hour = 10; });
  await page.waitForSelector('#time-icon .icon-sun');
  for (let i = 0; i < 3; i++) {
    await page.locator('#tree-tabs .tab-btn').nth(i).click();
    await check(`game/skill-tree-${i}`);
  }
  const helperResult = await page.evaluate(async () => {
    const { setIconText, renderIcons, plainIconText } = await import('/src/icons.js');
    const el = document.createElement('div');
    setIconText(el, '[[icon:coin]] 42 <img src=x onerror=alert(1)>');
    const img = el.firstChild;
    setIconText(el, '[[icon:coin]] 42 <img src=x onerror=alert(1)>');
    return { cached: img === el.firstChild, safe: el.querySelectorAll('img').length === 1,
      title: renderIcons('<b title="[[icon:coin]] price">[[icon:coin]]</b>').includes('title="coin price"'),
      plain: plainIconText('[[icon:warning]] Invalid save') };
  });
  assert.deepEqual(helperResult, { cached: true, safe: true, title: true, plain: 'warning Invalid save' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await check('game/compact');
  await page.screenshot({ path: `${artifactDir}/compact.png` });
  await page.goto(`${base}/?tutorial=chop`);
  await page.waitForSelector('.tut-icons .game-icon');
  await check('tutorial');
  await page.screenshot({ path: `${artifactDir}/tutorial.png` });
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('PASS: source scan, menus, all game tabs, skill trees, day/night, tutorial, compact layout, safe rendering and DOM caching.');
} finally { await browser.close(); }
