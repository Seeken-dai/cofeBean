// 3.0.15 回归：滚轮选择器方向键逐格步进、不跳值、焦点不丢（含跨窗口边界重建）。
// 用法：cd www && python3 -m http.server 8352 &  然后  NODE_PATH=$(npm root -g) node qa/wheel-arrow-keys.js [baseUrl]
// 需要 playwright-core 与 /usr/bin/google-chrome。退出码非 0 表示失败。
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || 'http://127.0.0.1:8352';
const demo = fs.readFileSync(path.join(__dirname, '..', 'www', 'mock', 'demo-backup.json'), 'utf8');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((seed) => { if (!sessionStorage.getItem('qa-seeded')) { localStorage.clear(); localStorage.setItem('coffee-vault-browser-preview', seed); sessionStorage.setItem('qa-seeded', '1'); } }, demo);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/index.html`); await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector('[data-view="plans"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('addBean').click()); await page.waitForTimeout(500);
  const state = () => page.evaluate(() => {
    const wheel = document.querySelector('#numberPickerDialog [data-wheel-column]');
    return { selected: Number((wheel.querySelector('.selected') || {}).textContent), focused: wheel.contains(document.activeElement) };
  });
  const failures = [];
  async function run(label, start, keys, waitMs) {
    await page.evaluate((value) => { const input = document.getElementById('plan-waterTemp'); input.value = String(value); input.scrollIntoView({ block: 'center' }); }, start);
    await page.click('#plan-waterTemp'); await page.waitForTimeout(600);
    let expected = start;
    for (const key of keys) {
      await page.keyboard.press(key); await page.waitForTimeout(waitMs);
      expected = Math.min(100, Math.max(0, expected + ({ ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 })[key]));
      const now = await state();
      if (now.selected !== expected || !now.focused) { failures.push(`${label}: after ${key} expected ${expected} (focused) got ${now.selected} focused=${now.focused}`); break; }
    }
    await page.waitForTimeout(800);
    const settled = await state();
    if (settled.selected !== expected) failures.push(`${label}: settled at ${settled.selected}, expected ${expected}`);
    await page.click('#numberPickerDone');
    await page.waitForTimeout(300);
    const value = await page.evaluate(() => document.getElementById('plan-waterTemp').value);
    if (Number(value) !== expected) failures.push(`${label}: committed ${value}, expected ${expected}`);
    console.log(`${label}: ${start} → ${expected}, committed ${value}`);
  }
  await run('slow arrows', 93, ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowDown'], 500);
  await run('fast arrows', 80, Array(6).fill('ArrowDown'), 40);
  await run('page keys', 90, ['PageDown', 'PageUp', 'PageUp'], 400);
  await run('cross window edge', 20, Array(50).fill('ArrowDown'), 30);
  await run('cross window edge up', 75, Array(50).fill('ArrowUp'), 30);
  await browser.close();
  if (errors.length) failures.push(...errors.map((message) => `pageerror: ${message}`));
  if (failures.length) { console.error('FAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('PASS');
})();
