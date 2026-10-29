'use strict';

// 3.0.15 宽屏紧凑标题行：详情打开时中栏顶栏只剩「标题 · 数量」一行，高度与右栏详情顶栏同一个 token，分隔线对齐。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.join(__dirname, '..', 'www');
const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');

function block(selector) {
  const index = css.indexOf(`${selector} {`);
  assert.ok(index >= 0, `找不到 ${selector}`);
  return css.slice(index, css.indexOf('}', index));
}

test('中栏紧凑标题行与右栏详情顶栏共用高度与分隔线 token', () => {
  assert.match(css, /--context-header-height:72px;/);
  const middle = block('  body.has-context-detail .topbar');
  assert.match(middle, /height:var\(--context-header-height\);/);
  assert.match(middle, /padding:0 16px;/);
  assert.match(middle, /align-items:center;/);
  assert.match(middle, /border-bottom:1px solid var\(--vault-line-soft\);/);
  const right = block('#drinkDetailDialog .detail-header,#planDetailDialog .detail-header');
  assert.match(right, /min-height:calc\(var\(--context-header-height\) \+ env\(safe-area-inset-top,0px\)\);/);
  assert.match(right, /border-bottom:1px solid var\(--vault-line-soft\);/);
});

test('紧凑标题行：无按钮无搜索，标题 16px/600 省略，数量 13px 不收缩', () => {
  assert.match(css, /body\.has-context-detail \.topbar-actions,body\.has-context-detail \.topbar-search,body\.has-context-detail \.shell-eyebrow,body\.has-context-detail #recordCount,body\.has-context-detail #shellTitle \{ display:none!important; \}/, '紧凑行隐藏大标题 h1');
  assert.match(css, /body\.has-context-detail \.brand-copy \{[^}]*min-width:0;/);
  const title = block('  body.has-context-detail .topbar-compact-title');
  for (const rule of ['min-width:0;', 'font-size:16px;', 'font-weight:600;', 'color:var(--text);', 'white-space:nowrap;', 'overflow:hidden;', 'text-overflow:ellipsis;']) assert.ok(title.includes(rule), rule);
  assert.match(css, /body\.has-context-detail \.topbar-compact-count \{ display:inline; flex-shrink:0; font-size:13px;[^}]*color:var\(--muted\);/);
  assert.match(css, /\n\.topbar-compact-title,\.topbar-compact-count \{ display:none; \}/, '其它状态（手机、详情关闭）不显示紧凑行');
  assert.match(html, /<h1 id="shellTitle">[^<]*<\/h1>\s*<span class="topbar-compact-title" id="shellCompactTitle"><\/span>\s*<span class="topbar-compact-count" id="shellCompactCount" aria-hidden="true"><\/span>/);
  assert.match(app, /const COMPACT_TITLES = \{ beans: '豆仓', drinks: '饮用记录', plans: '冲煮方案' \};/, '紧凑行用左导航名称');
  for (const view of ['beans', 'drinks', 'plans']) assert.match(app, new RegExp(`if \\(state\\.view === '${view}'\\) setCompactCount\\(visible\\.length\\);`), view);
});
