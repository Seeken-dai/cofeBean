'use strict';

// 外壳清单一致性测试:www/sw.js 的 SHELL 预缓存数组是手工维护的,
// 必须与 www/index.html 实际引用的脚本/样式保持一致。
// 漏加文件的后果是「新外壳缺文件」—— 与曾经的「新 index.html 配旧 app.js」同类错配,
// 弱网下表现为更新后 Web 打开报错。此测试让漏项在 CI/本地测试阶段就失败。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WWW = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8');

function stripQuery(url) { return url.split('?')[0]; }

// 从 sw.js 抽出 SHELL 数组字面量(不执行 SW 代码)。
function shellEntries() {
  const match = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(match, 'sw.js 里应能找到 SHELL 数组');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// index.html 引用的本地脚本与样式(不含内联 script)。
function htmlAssets() {
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  return { scripts, styles };
}

test('index.html 引用的每个脚本/样式都在 sw.js SHELL 预缓存里', () => {
  const shell = shellEntries().map((entry) => stripQuery(entry.replace(/^\.\//, '')));
  const { scripts, styles } = htmlAssets();
  const missing = [...scripts, ...styles]
    .map(stripQuery)
    .filter((asset) => !shell.includes(asset));
  assert.deepEqual(missing, [], `以下资源被 index.html 引用但未预缓存(改 index.html 时同步更新 sw.js SHELL):${missing.join(', ')}`);
});

test('sw.js SHELL 里的每个文件都真实存在', () => {
  const missing = shellEntries()
    .filter((entry) => entry !== './')
    .map((entry) => stripQuery(entry.replace(/^\.\//, '')))
    .filter((rel) => !fs.existsSync(path.join(WWW, rel)));
  assert.deepEqual(missing, [], `SHELL 引用了不存在的文件:${missing.join(', ')}`);
});

test('styles.css 的 ?v= 版本参数在 index.html 与 sw.js 一致', () => {
  const htmlStyle = html.match(/href="(styles\.css\?v=[^"]+)"/);
  const swStyle = sw.match(/'\.\/(styles\.css\?v=[^']+)'/);
  assert.ok(htmlStyle && swStyle, '两处都应带 ?v= 版本参数');
  assert.equal(htmlStyle[1], swStyle[1], 'styles.css 版本参数不一致会导致缓存错配');
});

// 上面那条只保证两边「一样」，两边可以一致地停在旧版本号上而不被发现：浏览器 HTTP 缓存
// 会继续沿用旧 styles.css，表现为升级后新功能配旧界面。这里把它钉死到 package.json 的版本。
test('styles.css 的 ?v= 与 sw.js CACHE 都跟随 package.json 版本', () => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  const buster = html.match(/href="styles\.css\?v=([^"]+)"/);
  const cache = sw.match(/const CACHE = 'coffee-vault-shell-([^']+)';/);
  assert.ok(buster && cache, 'index.html 应有 ?v=，sw.js 应有 CACHE 常量');
  assert.equal(buster[1], version, `styles.css?v= 应为 ${version}（发版请跑 npm run bump-version）`);
  assert.equal(cache[1], version, `sw.js CACHE 应为 coffee-vault-shell-${version}`);
});
