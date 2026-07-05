import fs from 'node:fs';

const [version, versionCodeRaw, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

function usage() {
  console.error('Usage: npm.cmd run bump-version -- <x.y.z> <versionCode> [--dry-run]');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version || '')) usage();
const versionCode = Number(versionCodeRaw);
if (!Number.isInteger(versionCode) || versionCode <= 0) usage();

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) {
  if (dryRun) {
    console.log(`[dry-run] ${file}`);
    return;
  }
  fs.writeFileSync(file, content);
}
function replaceExact(file, pattern, replacement) {
  const before = read(file);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`未匹配到 ${file}: ${pattern}`);
  write(file, after);
}
function updateJson(file, updater) {
  const data = JSON.parse(read(file));
  updater(data);
  write(file, JSON.stringify(data, null, 2) + '\n');
}

updateJson('package.json', (data) => { data.version = version; });
updateJson('package-lock.json', (data) => {
  data.version = version;
  if (data.packages && data.packages['']) data.packages[''].version = version;
});

replaceExact('android/app/build.gradle', /versionCode\s+\d+/, `versionCode ${versionCode}`);
replaceExact('android/app/build.gradle', /versionName\s+"[^"]+"/, `versionName "${version}"`);
replaceExact('www/index.html', /<p id="aboutVersion">版本 [^<]+<\/p>/, `<p id="aboutVersion">版本 ${version}</p>`);
replaceExact('www/index.html', /<h4>\d+\.\d+\.\d+ 最新功能<\/h4>/, `<h4>${version} 最新功能</h4>`);
replaceExact('www/data-core.js', /appVersion:\s*'\d+\.\d+\.\d+'/g, `appVersion: '${version}'`);
// SW 缓存名随版本变化：每次发版都触发 Service Worker 重新原子化预缓存整套外壳，避免旧缓存与新外壳错配。
replaceExact('www/sw.js', /const CACHE = 'coffee-vault-shell-[^']+';/, `const CACHE = 'coffee-vault-shell-${version}';`);
replaceExact('AGENTS.md', /当前版本为 `[^`]+`，Android `versionCode \d+`，正式产物路径为 `dist\/coffee-vault-[^`]+-release\.apk`。/, `当前版本为 \`${version}\`，Android \`versionCode ${versionCode}\`，正式产物路径为 \`dist/coffee-vault-${version}-release.apk\`。`);

console.log(`${dryRun ? '检查完成' : '已更新'}：${version} / versionCode ${versionCode}`);
