const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('native reads use the existing read/write SQLite connection', async () => {
  const calls = [];
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    query: async (options) => { calls.push(['query', options]); return { values: [] }; }
  };
  global.window = {
    Capacitor: { getPlatform: () => 'android', Plugins: { CapacitorSQLite: sqlite } },
    BeanCore: { normalizeBean: (value) => value }
  };

  const modulePath = path.resolve(__dirname, '../www/repository.js');
  delete require.cache[modulePath];
  require(modulePath);
  await global.window.BeanRepository.init();
  await global.window.BeanRepository.getAll();

  const create = calls.find(([name]) => name === 'createConnection')[1];
  const migrations = calls.filter(([name]) => name === 'execute').map(([, options]) => options.statements).join('\n');
  const query = calls.find(([name]) => name === 'query')[1];
  assert.equal(create.readonly, false);
  assert.equal(create.version, 6);
  assert.match(migrations, /opened_date/);
  assert.match(migrations, /bag_image_path/);
  assert.match(migrations, /label_image_path/);
  assert.match(migrations, /best_flavor_days/);
  assert.match(migrations, /brew_plans/);
  assert.match(migrations, /brew_plan_snapshot/);
  assert.match(migrations, /user_version = 6/);
  assert.equal(query.readonly, false);
  delete global.window;
});
