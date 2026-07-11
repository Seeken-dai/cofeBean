const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../www/data-core.js');

function loadNativeRepository(sqlite, beanCore = core) {
  global.window = {
    Capacitor: { getPlatform: () => 'android', Plugins: { CapacitorSQLite: sqlite } },
    BeanCore: beanCore
  };

  const modulePath = path.resolve(__dirname, '../www/repository.js');
  delete require.cache[modulePath];
  require(modulePath);
  return global.window.BeanRepository;
}

function cleanupNativeRepository() {
  delete global.window;
}

function migrationQuery(statement) {
  if (statement === 'PRAGMA table_info(beans)') {
    return { values: [
      { name: 'opened_date' },
      { name: 'bag_image_path' },
      { name: 'label_image_path' },
      { name: 'best_flavor_days' },
      { name: 'purchase_url' }
    ] };
  }
  if (statement === 'PRAGMA table_info(drink_logs)') {
    return { values: [
      { name: 'brew_plan_id' },
      { name: 'brew_plan_version' },
      { name: 'brew_plan_name' },
      { name: 'brew_plan_snapshot' }
    ] };
  }
  return { values: [] };
}

test('native reads use the existing read/write SQLite connection', async () => {
  const calls = [];
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    query: async (options) => { calls.push(['query', options]); return { values: [] }; }
  };
  const repo = loadNativeRepository(sqlite, { normalizeBean: (value) => value });
  await repo.init();
  await repo.getAll();

  const create = calls.find(([name]) => name === 'createConnection')[1];
  const migrations = calls.filter(([name]) => name === 'execute').map(([, options]) => options.statements).join('\n');
  const query = calls.find(([name]) => name === 'query')[1];
  assert.equal(create.readonly, false);
  assert.equal(create.version, 10);
  assert.match(migrations, /opened_date/);
  assert.match(migrations, /bag_image_path/);
  assert.match(migrations, /label_image_path/);
  assert.match(migrations, /best_flavor_days/);
  assert.match(migrations, /purchase_url/);
  assert.match(migrations, /brew_plans/);
  assert.match(migrations, /brew_plan_snapshot/);
  assert.match(migrations, /ALTER TABLE beans ADD COLUMN deleted_at/);
  assert.match(migrations, /ALTER TABLE drink_logs ADD COLUMN revision/);
  assert.match(migrations, /ALTER TABLE drink_logs ADD COLUMN tasting_status/);
  assert.match(migrations, /user_version = 10/);
  assert.equal(query.readonly, false);
  cleanupNativeRepository();
});

test('native bean saves include image columns on a write transaction', async () => {
  const calls = [];
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    executeSet: async (options) => calls.push(['executeSet', options]),
    query: async (options) => { calls.push(['query', options]); return migrationQuery(options.statement); },
    run: async (options) => calls.push(['run', options])
  };
  const repo = loadNativeRepository(sqlite);

  await repo.init();
  await repo.save(core.normalizeBean({
    id: 'native-image-bean',
    name: '原生图片豆',
    bagImagePath: 'file:///bag.webp',
    labelImagePath: 'file:///label.webp'
  }));

  const save = calls.filter(([name]) => name === 'run').at(-1)[1];
  assert.equal(save.transaction, true);
  assert.equal(save.readonly, false);
  assert.match(save.statement, /bag_image_path/);
  assert.match(save.statement, /label_image_path/);
  assert.match(save.statement, /revision/);
  assert.match(save.statement, /device_id/);
  assert.match(save.statement, /deleted_at/);
  assert.equal(save.values.includes('file:///bag.webp'), true);
  assert.equal(save.values.includes('file:///label.webp'), true);
  cleanupNativeRepository();
});

test('native replace import clears and inserts scoped data in one transaction', async () => {
  const calls = [];
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    executeSet: async (options) => calls.push(['executeSet', options]),
    query: async (options) => { calls.push(['query', options]); return migrationQuery(options.statement); }
  };
  const repo = loadNativeRepository(sqlite);
  const bean = core.normalizeBean({ id: 'import-bean', name: '导入豆', bagImagePath: 'file:///bag.webp' });
  const log = core.normalizeDrinkLog({ id: 'import-log', beanId: 'missing-bean', beanName: '旧豆', grams: 12 });
  const plan = core.normalizeBrewPlan({ id: 'import-plan', name: '导入方案', beanIds: ['import-bean', 'missing-bean'] });

  await repo.init();
  await repo.replaceAllData([bean], [log], core.normalizeSettings({ theme: 'frost' }), [plan]);

  const write = calls.filter(([name]) => name === 'executeSet').at(-1)[1];
  const statements = write.set.map((item) => item.statement);
  assert.equal(write.transaction, true);
  assert.equal(write.readonly, false);
  assert.deepEqual(statements.slice(0, 3), ['DELETE FROM drink_logs', 'DELETE FROM brew_plans', 'DELETE FROM beans']);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO beans') && statement.includes('bag_image_path')), true);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO drink_logs')), true);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO brew_plans')), true);

  const logInsert = write.set.find((item) => item.statement.startsWith('INSERT INTO drink_logs'));
  const planInsert = write.set.find((item) => item.statement.startsWith('INSERT INTO brew_plans'));
  assert.equal(logInsert.values[1], null);
  assert.deepEqual(JSON.parse(planInsert.values[5]), ['import-bean']);
  cleanupNativeRepository();
});

test('native drink log save updates log and bean inventory atomically', async () => {
  const calls = [];
  const beanRow = {
    id: 'drink-bean',
    name: '饮用豆',
    roaster: '',
    origin: '',
    process: '',
    roast_level: '',
    roast_date: '',
    opened_date: '',
    purchase_date: '',
    purchase_url: '',
    initial_weight: 100,
    remaining_weight: 100,
    price: null,
    best_flavor_days: null,
    tasting_notes: '',
    status: '未开封',
    favorite: 0,
    bag_image_path: '',
    label_image_path: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    executeSet: async (options) => calls.push(['executeSet', options]),
    query: async (options) => {
      calls.push(['query', options]);
      if (options.statement === 'SELECT * FROM beans WHERE id = ?') return { values: [beanRow] };
      if (options.statement === 'SELECT * FROM drink_logs WHERE id = ?') return { values: [] };
      return migrationQuery(options.statement);
    }
  };
  const repo = loadNativeRepository(sqlite);

  await repo.init();
  await repo.saveDrinkLog({ id: 'drink-log', beanId: 'drink-bean', beanName: '饮用豆', grams: 15 });

  const write = calls.filter(([name]) => name === 'executeSet').at(-1)[1];
  assert.equal(write.transaction, true);
  assert.equal(write.readonly, false);
  assert.equal(write.set.length, 2);
  assert.match(write.set[0].statement, /^INSERT INTO drink_logs/);
  assert.match(write.set[1].statement, /^UPDATE beans SET remaining_weight/);
  assert.equal(write.set[1].values[0], 85);
  assert.equal(write.set[1].values[1], '饮用中');
  cleanupNativeRepository();
});

test('native applySyncData upserts records without clearing tables', async () => {
  const calls = [];
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    executeSet: async (options) => calls.push(['executeSet', options]),
    query: async (options) => {
      calls.push(['query', options]);
      if (options.statement === 'SELECT * FROM beans') return { values: [{ id: 'local-existing' }] };
      return migrationQuery(options.statement);
    }
  };
  const repo = loadNativeRepository(sqlite);
  const stamp = '2026-07-03T00:00:00.000Z';
  const bean = core.normalizeBean({ id: 'remote-bean', name: '远端豆', updatedAt: stamp }, stamp);
  const log = core.normalizeDrinkLog({ id: 'remote-log', beanId: 'remote-bean', beanName: '远端豆', updatedAt: stamp }, stamp);
  const plan = core.normalizeBrewPlan({ id: 'remote-plan', name: '远端方案', beanIds: ['remote-bean'], updatedAt: stamp }, stamp);

  await repo.init();
  await repo.applySyncData({ beans: [bean], drinkLogs: [log], brewPlans: [plan] });

  const write = calls.filter(([name]) => name === 'executeSet').at(-1)[1];
  const statements = write.set.map((item) => item.statement);
  assert.equal(write.transaction, true);
  assert.equal(write.readonly, false);
  assert.equal(statements.some((statement) => statement.startsWith('DELETE FROM')), false);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO beans') && statement.includes('ON CONFLICT(id) DO UPDATE')), true);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO drink_logs') && statement.includes('ON CONFLICT(id) DO UPDATE')), true);
  assert.equal(statements.some((statement) => statement.startsWith('INSERT INTO brew_plans') && statement.includes('ON CONFLICT(id) DO UPDATE')), true);
  cleanupNativeRepository();
});

test('native bean remove tombstones synced beans without invalid brew plan columns', async () => {
  const calls = [];
  const stamp = '2026-01-01T00:00:00.000Z';
  const plan = core.normalizeBrewPlan({
    id: 'plan-bound',
    name: '绑定方案',
    beanIds: ['remote-bean', 'local-bean'],
    createdAt: stamp,
    updatedAt: stamp
  }, stamp);
  const sqlite = {
    createConnection: async (options) => calls.push(['createConnection', options]),
    open: async (options) => calls.push(['open', options]),
    execute: async (options) => calls.push(['execute', options]),
    executeSet: async (options) => calls.push(['executeSet', options]),
    query: async (options) => {
      calls.push(['query', options]);
      if (options.statement === 'SELECT * FROM brew_plans') {
        return { values: [{
          id: plan.id,
          name: plan.name,
          brew_method: plan.brewMethod,
          version: plan.version,
          source: plan.source,
          bean_ids: JSON.stringify(plan.beanIds),
          payload: JSON.stringify(plan),
          created_at: plan.createdAt,
          updated_at: plan.updatedAt
        }] };
      }
      return migrationQuery(options.statement);
    }
  };
  const repo = loadNativeRepository(sqlite);

  await repo.init();
  await repo.remove('remote-bean');

  const write = calls.filter(([name]) => name === 'executeSet').at(-1)[1];
  const statements = write.set.map((item) => item.statement);
  const planWrite = write.set.find((item) => item.statement.startsWith('INSERT INTO brew_plans'));
  assert.equal(write.transaction, true);
  assert.equal(statements.some((statement) => /json_each|json_remove/.test(statement)), false);
  assert.ok(planWrite, '受影响方案应写回解绑后的 bean_ids');
  assert.equal(/revision|device_id/.test(planWrite.statement), false);
  assert.deepEqual(JSON.parse(planWrite.values[5]), ['local-bean']);
  assert.match(statements.at(-1), /^UPDATE beans SET deleted_at/);
  cleanupNativeRepository();
});
