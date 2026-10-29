// 3.0.15 回归：编辑页打开后 document.activeElement 落在哪里（4 个视口）。
// 触屏视口焦点必须落在对话框标题 h2 上且无焦点框（不弹键盘、不落在删除上）；第一次 Tab 到首个按钮（编辑页即删除），
// 此时应显示焦点框。桌面视口应自动聚焦首个文本框。
// 用法：cd www && python3 -m http.server 8352 &  然后  NODE_PATH=$(npm root -g) node qa/focus-probe.js [baseUrl]
// 需要 playwright-core 与 /usr/bin/google-chrome。退出码非 0 表示失败。注意：模拟的 pointer/hover 只是近似，真机仍需人工确认。
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || 'http://127.0.0.1:8352';
const demo = fs.readFileSync(path.join(__dirname, '..', 'www', 'mock', 'demo-backup.json'), 'utf8');

const VIEWPORTS = [
  { name: 'phone-390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, desktop: false },
  { name: 'tablet-820', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, desktop: false },
  { name: 'tablet-landscape-1366', viewport: { width: 1366, height: 1024 }, isMobile: true, hasTouch: true, desktop: false },
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, desktop: true }
];

const FLOWS = [
  { name: '新建咖啡豆', field: 'field-name', dialog: 'editorDialog', title: 'editorTitle', firstTab: null, open: [() => document.querySelector('[data-view="beans"]').click(), () => document.getElementById('addBean').click()] },
  { name: '编辑咖啡豆', field: 'field-name', dialog: 'editorDialog', title: 'editorTitle', firstTab: 'deleteBean', open: [() => document.querySelector('[data-view="beans"]').click(), () => document.querySelector('[data-id="mock-bean-kenya"]').click(), () => document.getElementById('detailEdit').click()] },
  { name: '新建方案', field: 'plan-name', dialog: 'planEditorDialog', title: 'planEditorTitle', firstTab: null, open: [() => document.querySelector('[data-view="plans"]').click(), () => document.getElementById('addBean').click()] },
  { name: '编辑方案', field: 'plan-name', dialog: 'planEditorDialog', title: 'planEditorTitle', firstTab: 'planEditorDelete', open: [() => document.querySelector('[data-view="plans"]').click(), () => document.querySelector('[data-plan-id]').click(), () => document.getElementById('planDetailEdit').click()] }
];

function describe() {
  const element = document.activeElement;
  const editable = Boolean(element && !element.readOnly && !element.disabled && (element.isContentEditable || element.tagName === 'TEXTAREA' || (element.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'file', 'hidden'].includes(element.type))));
  const style = element ? getComputedStyle(element) : null;
  const ring = Boolean(style && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0);
  let focusVisible = false; try { focusVisible = Boolean(element && element.matches(':focus-visible')); } catch { focusVisible = false; }
  return { tag: element ? element.tagName.toLowerCase() : null, id: element && element.id, editable, ring, focusVisible, dialog: element && element.closest('dialog[open]') ? element.closest('dialog[open]').id : null };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const failures = [];
  const rows = [];
  for (const vp of VIEWPORTS) {
    for (const flow of FLOWS) {
      const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
      await ctx.addInitScript((seed) => { localStorage.clear(); localStorage.setItem('coffee-vault-browser-preview', seed); }, demo);
      const page = await ctx.newPage();
      page.on('pageerror', (error) => failures.push(`${vp.name} ${flow.name}: pageerror ${error.message}`));
      await page.goto(`${base}/index.html`); await page.waitForTimeout(1300);
      for (const step of flow.open) { await page.evaluate(step); await page.waitForTimeout(450); }
      await page.waitForTimeout(400);
      const media = await page.evaluate(() => ({ fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches }));
      const focus = await page.evaluate(describe);
      let tab = null;
      if (!vp.desktop) { await page.keyboard.press('Tab'); await page.waitForTimeout(150); tab = await page.evaluate(describe); }
      rows.push({ viewport: vp.name, flow: flow.name, ...media, focus: `${focus.tag}#${focus.id}`, ring: focus.ring, afterTab: tab ? `${tab.tag}#${tab.id}` : '', tabRing: tab ? tab.ring : '' });
      if (vp.desktop && focus.id !== flow.field) failures.push(`${vp.name} ${flow.name}: expected #${flow.field} focused, got ${focus.tag}#${focus.id}`);
      if (!vp.desktop) {
        if (!(focus.tag === 'h2' && focus.id === flow.title && focus.dialog === flow.dialog)) failures.push(`${vp.name} ${flow.name}: expected h2#${flow.title} focused, got ${focus.tag}#${focus.id}${focus.editable ? ' (editable: keyboard would open)' : ''}`);
        if (focus.ring) failures.push(`${vp.name} ${flow.name}: focused title draws an outline`);
        if (/delete/i.test(focus.id || '')) failures.push(`${vp.name} ${flow.name}: focus landed on delete`);
        if (!tab || tab.tag !== 'button' || tab.dialog !== flow.dialog) failures.push(`${vp.name} ${flow.name}: first Tab should reach a dialog button, got ${tab && tab.tag}#${tab && tab.id}`);
        else if (flow.firstTab && tab.id !== flow.firstTab) failures.push(`${vp.name} ${flow.name}: first Tab expected #${flow.firstTab}, got #${tab.id}`);
        else if (!tab.focusVisible || !tab.ring) failures.push(`${vp.name} ${flow.name}: #${tab.id} after Tab should show a focus ring`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.table(rows);
  if (failures.length) { console.error('FAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('PASS');
})();
