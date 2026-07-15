(function (root) {
  'use strict';

  const DB_NAME = 'coffee_vault';
  const DB_VERSION = 11;
  const DEVICE_KEY = 'coffee-vault-device-id';
  const LEGACY_KEYS = ['coffee-vault-data', 'beans-data', 'bean-data'];
  const BEAN_COLUMNS = ['id', 'name', 'roaster', 'origin', 'process', 'roastLevel', 'roastDate', 'openedDate', 'purchaseDate', 'purchaseUrl', 'initialWeight', 'remainingWeight', 'price', 'bestFlavorDays', 'tastingNotes', 'status', 'favorite', 'bagImagePath', 'bagCutoutImagePath', 'labelImagePath', 'createdAt', 'updatedAt', 'revision', 'deviceId', 'deletedAt'];
  const BEAN_NATIVE = { roastLevel: 'roast_level', roastDate: 'roast_date', openedDate: 'opened_date', purchaseDate: 'purchase_date', purchaseUrl: 'purchase_url', initialWeight: 'initial_weight', remainingWeight: 'remaining_weight', bestFlavorDays: 'best_flavor_days', tastingNotes: 'tasting_notes', bagImagePath: 'bag_image_path', bagCutoutImagePath: 'bag_cutout_image_path', labelImagePath: 'label_image_path', createdAt: 'created_at', updatedAt: 'updated_at', deviceId: 'device_id', deletedAt: 'deleted_at' };
  const LOG_COLUMNS = ['id', 'beanId', 'beanName', 'grams', 'brewMethod', 'brewPlanId', 'brewPlanVersion', 'brewPlanName', 'brewPlanSnapshot', 'photos', 'source', 'cafeName', 'drinkName', 'price', 'location', 'tastingStatus', 'overallRating', 'aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness', 'notes', 'consumedAt', 'createdAt', 'updatedAt', 'revision', 'deviceId', 'deletedAt'];
  const LOG_NATIVE = { beanId: 'bean_id', beanName: 'bean_name', brewMethod: 'brew_method', brewPlanId: 'brew_plan_id', brewPlanVersion: 'brew_plan_version', brewPlanName: 'brew_plan_name', brewPlanSnapshot: 'brew_plan_snapshot', cafeName: 'cafe_name', drinkName: 'drink_name', tastingStatus: 'tasting_status', overallRating: 'overall_rating', consumedAt: 'consumed_at', createdAt: 'created_at', updatedAt: 'updated_at', deviceId: 'device_id', deletedAt: 'deleted_at' };
  const PLAN_COLUMNS = ['id', 'name', 'brewMethod', 'version', 'source', 'beanIds', 'payload', 'createdAt', 'updatedAt'];
  const PLAN_NATIVE = { brewMethod: 'brew_method', beanIds: 'bean_ids', createdAt: 'created_at', updatedAt: 'updated_at' };
  let native = false;
  let webAdapter = null;
  let nativeAdapter = null;

  function plugin(name) { return root.Capacitor && root.Capacitor.Plugins ? root.Capacitor.Plugins[name] : null; }
  function isNative() { return Boolean(root.Capacitor && typeof root.Capacitor.getPlatform === 'function' && root.Capacitor.getPlatform() !== 'web'); }
  function randomId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function getDeviceId() {
    try {
      const stored = localStorage.getItem(DEVICE_KEY);
      if (stored) return stored;
      const id = randomId('device');
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch (_) {
      if (!getDeviceId.fallback) getDeviceId.fallback = randomId('device');
      return getDeviceId.fallback;
    }
  }
  function localRevision(old, fallback) { return old ? Math.max(1, Number(old.revision) || 1) + 1 : Math.max(1, Number(fallback && fallback.revision) || 1); }
  function markLocal(source, old, stamp) {
    return { ...source, updatedAt: stamp, revision: localRevision(old, source), deviceId: getDeviceId(), deletedAt: source.deletedAt || null };
  }
  function createNativeAdapter(sqlite) {
    return {
      createConnection: (options) => sqlite.createConnection(options),
      open: (options) => sqlite.open(options),
      execute: (options) => sqlite.execute(options),
      executeSet: (options) => sqlite.executeSet(options),
      query: (options) => sqlite.query(options),
      run: (options) => sqlite.run(options)
    };
  }
  function nativeDb() {
    if (!nativeAdapter) throw new Error('SQLite 插件没有加载');
    return nativeAdapter;
  }

  async function init() {
    native = isNative();
    if (!native) { await web().init(); return; }
    const sqlite = plugin('CapacitorSQLite');
    if (!sqlite) throw new Error('SQLite 插件没有加载');
    nativeAdapter = createNativeAdapter(sqlite);
    try {
      await nativeDb().createConnection({ database: DB_NAME, encrypted: false, mode: 'no-encryption', version: DB_VERSION, readonly: false });
    } catch (error) {
      if (!String(error && error.message || error).toLowerCase().includes('already')) throw error;
    }
    await nativeDb().open({ database: DB_NAME, readonly: false });
    await migrate();
  }

  async function migrate() {
    const statements = `
      CREATE TABLE IF NOT EXISTS beans (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, roaster TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '', process TEXT NOT NULL DEFAULT '', roast_level TEXT NOT NULL DEFAULT '',
        roast_date TEXT NOT NULL DEFAULT '', opened_date TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL DEFAULT '', purchase_url TEXT NOT NULL DEFAULT '', initial_weight REAL,
        remaining_weight REAL, price REAL, best_flavor_days REAL, tasting_notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '未开封',
        favorite INTEGER NOT NULL DEFAULT 0, bag_image_path TEXT NOT NULL DEFAULT '', bag_cutout_image_path TEXT NOT NULL DEFAULT '', label_image_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_beans_status ON beans(status);
      CREATE INDEX IF NOT EXISTS idx_beans_roast_date ON beans(roast_date);
      CREATE TABLE IF NOT EXISTS drink_logs (
        id TEXT PRIMARY KEY NOT NULL, bean_id TEXT, bean_name TEXT NOT NULL, grams REAL NOT NULL,
        brew_method TEXT NOT NULL DEFAULT '手冲', brew_plan_id TEXT, brew_plan_version INTEGER,
        brew_plan_name TEXT NOT NULL DEFAULT '', brew_plan_snapshot TEXT NOT NULL DEFAULT '', overall_rating INTEGER,
        photos TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'bean',
        cafe_name TEXT NOT NULL DEFAULT '', drink_name TEXT NOT NULL DEFAULT '', price REAL, location TEXT NOT NULL DEFAULT '', tasting_status TEXT NOT NULL DEFAULT 'completed',
        aroma INTEGER, acidity INTEGER, sweetness INTEGER, body INTEGER, aftertaste INTEGER,
        balance INTEGER, bitterness INTEGER, notes TEXT NOT NULL DEFAULT '', consumed_at TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drink_logs_bean ON drink_logs(bean_id);
      CREATE INDEX IF NOT EXISTS idx_drink_logs_consumed ON drink_logs(consumed_at DESC);
      CREATE TABLE IF NOT EXISTS brew_plans (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, brew_method TEXT NOT NULL DEFAULT '手冲',
        version INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'user',
        bean_ids TEXT NOT NULL DEFAULT '[]', payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brew_plans_method ON brew_plans(brew_method);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `;
    await nativeDb().execute({ database: DB_NAME, statements, transaction: true, readonly: false });
    const columns = await nativeDb().query({ database: DB_NAME, statement: 'PRAGMA table_info(beans)', values: [], readonly: false });
    if (!(columns.values || []).some((column) => column.name === 'opened_date')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN opened_date TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'bag_image_path')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN bag_image_path TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'bag_cutout_image_path')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN bag_cutout_image_path TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'label_image_path')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN label_image_path TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'best_flavor_days')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN best_flavor_days REAL;", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'purchase_url')) {
      await nativeDb().execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN purchase_url TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    const beanSyncAdds = [
      ['revision', "ALTER TABLE beans ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;"],
      ['device_id', "ALTER TABLE beans ADD COLUMN device_id TEXT NOT NULL DEFAULT '';"],
      ['deleted_at', "ALTER TABLE beans ADD COLUMN deleted_at TEXT;"]
    ].filter(([name]) => !(columns.values || []).some((column) => column.name === name)).map(([, statement]) => statement).join('\n');
    if (beanSyncAdds) await nativeDb().execute({ database: DB_NAME, statements: beanSyncAdds, transaction: true, readonly: false });
    const logColumns = await nativeDb().query({ database: DB_NAME, statement: 'PRAGMA table_info(drink_logs)', values: [], readonly: false });
    const logNames = (logColumns.values || []).map((column) => column.name);
    // 防御式对齐：确保 drink_logs 拥有 LOG_COLUMNS 写入所需的每一列，缺哪列补哪列。
    // 评分维度等历史列过去只在 CREATE TABLE 里声明、没有单独的 ALTER 兜底；一旦某台设备的表
    // 因异常升级路径缺了任意一列，saveDrinkLog 的 INSERT 会整条失败（饮用记录“保存不了”）。
    const logColumnDdl = {
      bean_id: 'TEXT', bean_name: "TEXT NOT NULL DEFAULT ''", grams: 'REAL NOT NULL DEFAULT 0',
      brew_method: "TEXT NOT NULL DEFAULT '手冲'", brew_plan_id: 'TEXT', brew_plan_version: 'INTEGER',
      brew_plan_name: "TEXT NOT NULL DEFAULT ''", brew_plan_snapshot: "TEXT NOT NULL DEFAULT ''",
      photos: "TEXT NOT NULL DEFAULT '[]'", source: "TEXT NOT NULL DEFAULT 'bean'",
      cafe_name: "TEXT NOT NULL DEFAULT ''", drink_name: "TEXT NOT NULL DEFAULT ''",
      price: 'REAL', location: "TEXT NOT NULL DEFAULT ''",
      tasting_status: "TEXT NOT NULL DEFAULT 'completed'",
      overall_rating: 'INTEGER', aroma: 'INTEGER', acidity: 'INTEGER', sweetness: 'INTEGER',
      body: 'INTEGER', aftertaste: 'INTEGER', balance: 'INTEGER', bitterness: 'INTEGER',
      notes: "TEXT NOT NULL DEFAULT ''", consumed_at: "TEXT NOT NULL DEFAULT ''",
      created_at: "TEXT NOT NULL DEFAULT ''", updated_at: "TEXT NOT NULL DEFAULT ''",
      revision: 'INTEGER NOT NULL DEFAULT 1', device_id: "TEXT NOT NULL DEFAULT ''", deleted_at: 'TEXT'
    };
    const logAdds = Object.entries(logColumnDdl)
      .filter(([name]) => !logNames.includes(name))
      .map(([name, type]) => `ALTER TABLE drink_logs ADD COLUMN ${name} ${type};`)
      .join('\n');
    if (logAdds) await nativeDb().execute({ database: DB_NAME, statements: logAdds, transaction: true, readonly: false });
    await seedPresetPlans();
    await nativeDb().execute({ database: DB_NAME, statements: 'PRAGMA user_version = 11;', transaction: true, readonly: false });
  }

  function fromBeanRow(row) {
    const bean = {};
    BEAN_COLUMNS.forEach((key) => { const value = row[BEAN_NATIVE[key] || key]; bean[key] = key === 'favorite' ? Boolean(value) : value; });
    return root.BeanCore.normalizeBean(bean, bean.updatedAt);
  }

  function beanValues(bean) {
    const b = root.BeanCore.normalizeBean(bean, bean.updatedAt);
    return [b.id, b.name, b.roaster, b.origin, b.process, b.roastLevel, b.roastDate, b.openedDate, b.purchaseDate, b.purchaseUrl, b.initialWeight, b.remainingWeight, b.price, b.bestFlavorDays, b.tastingNotes, b.status, b.favorite ? 1 : 0, b.bagImagePath, b.bagCutoutImagePath, b.labelImagePath, b.createdAt, b.updatedAt, b.revision, b.deviceId, b.deletedAt];
  }

  function fromLogRow(row) {
    const log = {};
    LOG_COLUMNS.forEach((key) => { log[key] = row[LOG_NATIVE[key] || key]; });
    if (row.display_bean_name) log.beanName = row.display_bean_name;
    log.brewPlanSnapshot = row.brew_plan_snapshot || row.brewPlanSnapshot || null;
    return root.BeanCore.normalizeDrinkLog(log, log.updatedAt);
  }

  function logValues(log) {
    const l = root.BeanCore.normalizeDrinkLog(log, log.updatedAt);
    return [l.id, l.beanId, l.beanName, l.grams, l.brewMethod, l.brewPlanId, l.brewPlanVersion, l.brewPlanName, l.brewPlanSnapshot ? JSON.stringify(l.brewPlanSnapshot) : '', JSON.stringify(l.photos || []), l.source, l.cafeName, l.drinkName, l.price, l.location, l.tastingStatus, l.overallRating, l.aroma, l.acidity, l.sweetness, l.body, l.aftertaste, l.balance, l.bitterness, l.notes, l.consumedAt, l.createdAt, l.updatedAt, l.revision, l.deviceId, l.deletedAt];
  }

  function planValues(plan) {
    const p = root.BeanCore.normalizeBrewPlan(plan, plan.updatedAt);
    return [p.id, p.name, p.brewMethod, p.version, p.source, JSON.stringify(p.beanIds), JSON.stringify(p), p.createdAt, p.updatedAt];
  }

  function presetPlans() {
    return root.BeanCore.presetBrewPlans ? root.BeanCore.presetBrewPlans() : [];
  }

  function withPresetPlans(plans) {
    const normalized = (plans || []).map((plan) => root.BeanCore.normalizeBrewPlan(plan, plan.updatedAt));
    const presets = presetPlans();
    const presetIds = new Set(presets.map((plan) => plan.id));
    const userPlans = normalized.filter((plan) => !presetIds.has(plan.id));
    const userIds = new Set(userPlans.map((plan) => plan.id));
    presets.forEach((plan) => { if (!userIds.has(plan.id)) userPlans.push(plan); });
    return userPlans;
  }

  function fromPlanRow(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch (_) {}
    return root.BeanCore.normalizeBrewPlan({ ...payload, id: row.id, name: row.name, brewMethod: row.brew_method, version: row.version, source: row.source, beanIds: JSON.parse(row.bean_ids || '[]'), createdAt: row.created_at, updatedAt: row.updated_at }, row.updated_at);
  }

  async function seedPresetPlans() {
    if (!native) return;
    const presets = presetPlans();
    if (!presets.length) return;
    const columns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(',');
    const placeholders = PLAN_COLUMNS.map(() => '?').join(',');
    await nativeDb().executeSet({ database: DB_NAME, set: presets.map((plan) => ({ statement: `INSERT OR REPLACE INTO brew_plans (${columns}) VALUES (${placeholders})`, values: planValues(plan) })), transaction: true, readonly: false });
  }

  function web() {
    if (!webAdapter) {
      if (!root.BeanWebRepositoryAdapter) throw new Error('Web 仓储适配器没有加载');
      webAdapter = root.BeanWebRepositoryAdapter({ core: root.BeanCore, presetPlans });
    }
    return webAdapter;
  }

  async function getAll() {
    if (!native) return web().loadState().beans.filter((bean) => !bean.deletedAt);
    const result = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE deleted_at IS NULL ORDER BY updated_at DESC', values: [], readonly: false });
    return (result.values || []).map(fromBeanRow);
  }

  async function save(bean) {
    const stamp = new Date().toISOString();
    if (!native) {
      const state = web().loadState(); const id = bean && bean.id;
      const index = id ? state.beans.findIndex((item) => item.id === id) : -1;
      const old = index >= 0 ? state.beans[index] : null;
      const normalized = root.BeanCore.normalizeBean(markLocal({ ...(old || {}), ...bean, createdAt: old ? old.createdAt : bean.createdAt }, old, stamp), stamp);
      if (index >= 0) state.beans[index] = normalized; else state.beans.unshift(normalized);
      await web().saveState(state); return normalized;
    }
    let normalized = root.BeanCore.normalizeBean({ ...bean, updatedAt: stamp }, stamp);
    const oldResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE id = ?', values: [normalized.id], readonly: false });
    const old = (oldResult.values || []).length ? fromBeanRow(oldResult.values[0]) : null;
    normalized = root.BeanCore.normalizeBean(markLocal({ ...(old || {}), ...normalized, createdAt: old ? old.createdAt : normalized.createdAt }, old, stamp), stamp);
    const placeholders = BEAN_COLUMNS.map(() => '?').join(',');
    const updates = BEAN_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${BEAN_NATIVE[key] || key}=excluded.${BEAN_NATIVE[key] || key}`).join(',');
    const columns = BEAN_COLUMNS.map((key) => BEAN_NATIVE[key] || key).join(',');
    await nativeDb().run({ database: DB_NAME, statement: `INSERT INTO beans (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: beanValues(normalized), transaction: true, readonly: false });
    return normalized;
  }

  async function remove(id) {
    const stamp = new Date().toISOString();
    if (!native) {
      const state = web().loadState(); const bean = state.beans.find((item) => item.id === id);
      state.beans = state.beans.map((item) => item.id === id ? root.BeanCore.normalizeBean(markLocal({ ...item, deletedAt: stamp }, item, stamp), stamp) : item);
      state.drinkLogs = state.drinkLogs.map((log) => log.beanId === id ? root.BeanCore.normalizeDrinkLog(markLocal({ ...log, beanId: null, beanName: bean ? bean.name : log.beanName }, log, stamp), stamp) : log);
      state.brewPlans = state.brewPlans.map((plan) => plan.beanIds.includes(id) ? root.BeanCore.normalizeBrewPlan(markLocal({ ...plan, beanIds: plan.beanIds.filter((beanId) => beanId !== id) }, plan, stamp), stamp) : plan);
      await web().saveState(state); return;
    }
    const planResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans', values: [], readonly: false });
    const changedPlans = (planResult.values || [])
      .map(fromPlanRow)
      .filter((plan) => plan.beanIds.includes(id))
      .map((plan) => root.BeanCore.normalizeBrewPlan({
        ...plan,
        beanIds: plan.beanIds.filter((beanId) => beanId !== id),
        updatedAt: stamp
      }, stamp));
    const planColumns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(',');
    const planPlaceholders = PLAN_COLUMNS.map(() => '?').join(',');
    const planUpdates = PLAN_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${PLAN_NATIVE[key] || key}=excluded.${PLAN_NATIVE[key] || key}`).join(',');
    await nativeDb().executeSet({ database: DB_NAME, set: [
      { statement: 'UPDATE drink_logs SET bean_name = COALESCE((SELECT name FROM beans WHERE id = ?), bean_name), bean_id = NULL, updated_at = ?, revision = revision + 1, device_id = ? WHERE bean_id = ?', values: [id, stamp, getDeviceId(), id] },
      ...changedPlans.map((plan) => ({ statement: `INSERT INTO brew_plans (${planColumns}) VALUES (${planPlaceholders}) ON CONFLICT(id) DO UPDATE SET ${planUpdates}`, values: planValues(plan) })),
      { statement: 'UPDATE beans SET deleted_at = ?, updated_at = ?, revision = revision + 1, device_id = ? WHERE id = ?', values: [stamp, stamp, getDeviceId(), id] }
    ], transaction: true, readonly: false });
  }

  async function getBrewPlans() {
    if (!native) return web().loadState().brewPlans.filter((plan) => !plan.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await seedPresetPlans();
    const result = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans ORDER BY updated_at DESC', values: [], readonly: false });
    return (result.values || []).map(fromPlanRow).filter((plan) => !plan.deletedAt);
  }

  async function saveBrewPlan(input) {
    const stamp = new Date().toISOString();
    let normalized = root.BeanCore.normalizeBrewPlan({ ...input, updatedAt: stamp }, stamp);
    if (!native) {
      const state = web().loadState();
      const index = state.brewPlans.findIndex((item) => item.id === normalized.id);
      const old = index >= 0 ? state.brewPlans[index] : null;
      if (old && old.source === 'preset') throw new Error('预置方案请先复制再编辑');
      if (old) normalized = root.BeanCore.normalizeBrewPlan({ ...old, ...normalized, version: old.version + 1, createdAt: old.createdAt }, stamp);
      normalized = root.BeanCore.normalizeBrewPlan(markLocal(normalized, old, stamp), stamp);
      if (index >= 0) state.brewPlans[index] = normalized; else state.brewPlans.unshift(normalized);
      await web().saveState(state); return normalized;
    }
    const oldResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans WHERE id = ?', values: [normalized.id], readonly: false });
    const old = (oldResult.values || []).length ? fromPlanRow(oldResult.values[0]) : null;
    if (old && old.source === 'preset') throw new Error('预置方案请先复制再编辑');
    if (old) normalized = root.BeanCore.normalizeBrewPlan({ ...old, ...normalized, version: old.version + 1, createdAt: old.createdAt }, stamp);
    normalized = root.BeanCore.normalizeBrewPlan(markLocal(normalized, old, stamp), stamp);
    const columns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(',');
    const placeholders = PLAN_COLUMNS.map(() => '?').join(',');
    const updates = PLAN_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${PLAN_NATIVE[key] || key}=excluded.${PLAN_NATIVE[key] || key}`).join(',');
    await nativeDb().run({ database: DB_NAME, statement: `INSERT INTO brew_plans (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: planValues(normalized), transaction: true, readonly: false });
    return normalized;
  }

  async function duplicateBrewPlan(id) {
    const plan = (await getBrewPlans()).find((item) => item.id === id);
    if (!plan) throw new Error('找不到方案');
    return saveBrewPlan(root.BeanCore.cloneBrewPlan(plan, { name: `${plan.name} 副本`, source: 'copy' }));
  }

  async function deleteBrewPlan(id) {
    const plan = (await getBrewPlans()).find((item) => item.id === id);
    if (!plan) return;
    if (plan.source === 'preset') throw new Error('预置方案不能删除');
    const stamp = new Date().toISOString();
    if (!native) {
      const state = web().loadState();
      state.brewPlans = state.brewPlans.map((item) => item.id === id ? root.BeanCore.normalizeBrewPlan(markLocal({ ...item, deletedAt: stamp }, item, stamp), stamp) : item);
      state.drinkLogs = state.drinkLogs.map((log) => log.brewPlanId === id ? root.BeanCore.normalizeDrinkLog(markLocal({ ...log, brewPlanId: null }, log, stamp), stamp) : log);
      await web().saveState(state); return;
    }
    const tombstoned = root.BeanCore.normalizeBrewPlan(markLocal({ ...plan, deletedAt: stamp }, plan, stamp), stamp);
    const planColumns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(',');
    const planPlaceholders = PLAN_COLUMNS.map(() => '?').join(',');
    await nativeDb().executeSet({ database: DB_NAME, set: [
      { statement: `INSERT OR REPLACE INTO brew_plans (${planColumns}) VALUES (${planPlaceholders})`, values: planValues(tombstoned) },
      { statement: 'UPDATE drink_logs SET brew_plan_id = NULL, updated_at = ?, revision = revision + 1, device_id = ? WHERE brew_plan_id = ?', values: [stamp, getDeviceId(), id] }
    ], transaction: true, readonly: false });
  }

  async function getDrinkLogs(beanId) {
    if (!native) {
      return web().loadState().drinkLogs.filter((log) => !log.deletedAt && (!beanId || log.beanId === beanId)).sort((a, b) => root.BeanCore.compareDrinkChronology(b, a));
    }
    const where = beanId ? 'WHERE l.bean_id = ? AND l.deleted_at IS NULL' : 'WHERE l.deleted_at IS NULL';
    const result = await nativeDb().query({ database: DB_NAME, statement: `SELECT l.*, COALESCE(b.name, l.bean_name) AS display_bean_name FROM drink_logs l LEFT JOIN beans b ON b.id = l.bean_id ${where} ORDER BY l.consumed_at DESC, l.created_at DESC, l.id DESC`, values: beanId ? [beanId] : [], readonly: false });
    return (result.values || []).map(fromLogRow);
  }

  async function saveDrinkLog(input) {
    const stamp = new Date().toISOString();
    let log = root.BeanCore.normalizeDrinkLog({ ...input, updatedAt: stamp }, stamp);
    const external = log.source === 'external';
    if (!external && !(log.grams > 0)) throw new Error('本次用量必须大于 0');
    if (!external && !log.beanId) throw new Error('请选择咖啡豆');
    const columns = LOG_COLUMNS.map((key) => LOG_NATIVE[key] || key).join(',');
    const placeholders = LOG_COLUMNS.map(() => '?').join(',');
    const updates = LOG_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${LOG_NATIVE[key] || key}=excluded.${LOG_NATIVE[key] || key}`).join(',');

    if (!native) {
      const state = web().loadState(); const beanIndex = state.beans.findIndex((bean) => bean.id === log.beanId);
      if (!external && beanIndex < 0) throw new Error('找不到对应的咖啡豆');
      const oldIndex = state.drinkLogs.findIndex((item) => item.id === log.id);
      const old = oldIndex >= 0 ? state.drinkLogs[oldIndex] : null;
      if (old && old.source !== log.source) throw new Error('不能更改记录类型');
      if (!external && old && old.beanId !== log.beanId) throw new Error('不能更改饮用记录所属豆子');
      if (old) log = root.BeanCore.normalizeDrinkLog({ ...old, ...log, createdAt: old.createdAt }, stamp);
      log = root.BeanCore.normalizeDrinkLog(markLocal(log, old, stamp), stamp);
      if (!external) {
        const bean = state.beans[beanIndex]; const delta = log.grams - (old ? old.grams : 0);
        const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, delta);
        log.beanName = bean.name;
        state.beans[beanIndex] = root.BeanCore.normalizeBean(markLocal({ ...bean, remainingWeight: remaining, status: remaining <= 0 ? '已喝完' : '饮用中', openedDate: root.BeanCore.resolveOpenedDate(bean, log) }, bean, stamp), stamp);
      }
      if (oldIndex >= 0) state.drinkLogs[oldIndex] = log; else state.drinkLogs.unshift(log);
      await web().saveState(state); return log;
    }

    const oldResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM drink_logs WHERE id = ?', values: [log.id], readonly: false });
    const old = (oldResult.values || []).length ? fromLogRow(oldResult.values[0]) : null;
    if (old && old.source !== log.source) throw new Error('不能更改记录类型');
    if (!external && old && old.beanId !== log.beanId) throw new Error('不能更改饮用记录所属豆子');
    if (old) log = root.BeanCore.normalizeDrinkLog({ ...old, ...log, createdAt: old.createdAt }, stamp);
    log = root.BeanCore.normalizeDrinkLog(markLocal(log, old, stamp), stamp);
    if (external) {
      await nativeDb().run({ database: DB_NAME, statement: `INSERT INTO drink_logs (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: logValues(log), transaction: true, readonly: false });
      return log;
    }
    const beanResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE id = ?', values: [log.beanId], readonly: false });
    if (!(beanResult.values || []).length) throw new Error('找不到对应的咖啡豆');
    const bean = fromBeanRow(beanResult.values[0]);
    log.beanName = bean.name;
    const delta = log.grams - (old ? old.grams : 0);
    const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, delta);
    await nativeDb().executeSet({ database: DB_NAME, set: [
      { statement: `INSERT INTO drink_logs (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: logValues(log) },
      { statement: 'UPDATE beans SET remaining_weight = ?, status = ?, opened_date = ?, updated_at = ?, revision = revision + 1, device_id = ? WHERE id = ?', values: [remaining, remaining <= 0 ? '已喝完' : '饮用中', root.BeanCore.resolveOpenedDate(bean, log), stamp, getDeviceId(), bean.id] }
    ], transaction: true, readonly: false });
    return log;
  }

  async function deleteDrinkLog(id) {
    const stamp = new Date().toISOString();
    if (!native) {
      const state = web().loadState(); const index = state.drinkLogs.findIndex((log) => log.id === id);
      if (index < 0 || state.drinkLogs[index].deletedAt) return; const log = state.drinkLogs[index]; const beanIndex = state.beans.findIndex((bean) => bean.id === log.beanId);
      if (beanIndex >= 0) {
        const bean = state.beans[beanIndex]; const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, -log.grams);
        state.beans[beanIndex] = root.BeanCore.normalizeBean(markLocal({ ...bean, remainingWeight: remaining, status: remaining > 0 && bean.status === '已喝完' ? '饮用中' : bean.status }, bean, stamp), stamp);
      }
      state.drinkLogs[index] = root.BeanCore.normalizeDrinkLog(markLocal({ ...log, deletedAt: stamp }, log, stamp), stamp);
      await web().saveState(state); return;
    }
    const result = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM drink_logs WHERE id = ?', values: [id], readonly: false });
    if (!(result.values || []).length) return; const log = fromLogRow(result.values[0]);
    if (log.deletedAt) return;
    const set = [{ statement: 'UPDATE drink_logs SET deleted_at = ?, updated_at = ?, revision = revision + 1, device_id = ? WHERE id = ?', values: [stamp, stamp, getDeviceId(), id] }];
    if (log.beanId) {
      const beanResult = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE id = ?', values: [log.beanId], readonly: false });
      if ((beanResult.values || []).length) {
        const bean = fromBeanRow(beanResult.values[0]); const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, -log.grams);
        set.push({ statement: 'UPDATE beans SET remaining_weight = ?, status = ?, updated_at = ?, revision = revision + 1, device_id = ? WHERE id = ?', values: [remaining, remaining > 0 && bean.status === '已喝完' ? '饮用中' : bean.status, stamp, getDeviceId(), bean.id] });
      }
    }
    await nativeDb().executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
  }

  async function getSettings() {
    if (!native) return web().loadState().settings;
    const result = await nativeDb().query({ database: DB_NAME, statement: "SELECT value FROM app_settings WHERE key = 'preferences'", values: [], readonly: false });
    if (!(result.values || []).length) return root.BeanCore.normalizeSettings({});
    try { return root.BeanCore.normalizeSettings(JSON.parse(result.values[0].value)); } catch (_) { return root.BeanCore.normalizeSettings({}); }
  }

  async function saveSettings(settings) {
    const normalized = root.BeanCore.normalizeSettings(settings);
    if (!native) { const state = web().loadState(); state.settings = normalized; await web().saveState(state); return normalized; }
    await nativeDb().run({ database: DB_NAME, statement: "INSERT INTO app_settings (key, value) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", values: [JSON.stringify(normalized)], transaction: true, readonly: false });
    return normalized;
  }

  function normalizeScope(scope) { return ['all', 'library', 'brewPlans'].includes(scope) ? scope : 'all'; }
  function includesLibrary(scope) { return scope === 'all' || scope === 'library'; }
  function includesPlans(scope) { return scope === 'all' || scope === 'brewPlans'; }
  function newer(existing, incoming) {
    const existingTime = Date.parse(existing && existing.updatedAt || '');
    const incomingTime = Date.parse(incoming && incoming.updatedAt || '');
    return Number.isFinite(incomingTime) && (!Number.isFinite(existingTime) || incomingTime > existingTime) ? incoming : existing;
  }
  function mergeRecords(existing, incoming, normalize) {
    const map = new Map((existing || []).map((item) => [item.id, item]));
    (incoming || []).forEach((item) => {
      const normalized = normalize(item);
      map.set(normalized.id, map.has(normalized.id) ? newer(map.get(normalized.id), normalized) : normalized);
    });
    return Array.from(map.values());
  }
  function normalizeBeans(beans) { return (beans || []).map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)); }
  function sanitizeLogs(logs, beanIds) {
    return (logs || []).map((log) => {
      const normalized = root.BeanCore.normalizeDrinkLog(log, log && log.updatedAt);
      return root.BeanCore.normalizeDrinkLog({
        ...normalized,
        beanId: normalized.source === 'external' || beanIds.has(normalized.beanId) ? normalized.beanId : null
      }, normalized.updatedAt);
    });
  }
  function sanitizePlans(plans, beanIds) {
    return withPresetPlans(plans || []).map((plan) => root.BeanCore.normalizeBrewPlan({ ...plan, beanIds: plan.beanIds.filter((id) => beanIds.has(id)) }, plan.updatedAt));
  }
  function upsertById(existing, incoming) {
    const map = new Map((existing || []).map((item) => [item.id, item]));
    (incoming || []).forEach((item) => {
      if (item && item.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }
  function upsertStatement(columns, nativeMap) {
    const nativeColumns = columns.map((key) => nativeMap[key] || key);
    const updates = columns.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${nativeMap[key] || key}=excluded.${nativeMap[key] || key}`).join(',');
    return {
      columns: nativeColumns.join(','),
      placeholders: columns.map(() => '?').join(','),
      updates
    };
  }
  async function writeDataSet(beans, drinkLogs, settings, brewPlans, scope) {
    const normalizedBeans = normalizeBeans(beans);
    const beanIds = new Set(normalizedBeans.map((bean) => bean.id));
    const normalizedLogs = sanitizeLogs(drinkLogs, beanIds);
    const normalizedPlans = sanitizePlans(brewPlans, beanIds);
    if (!native) {
      const state = web().loadState();
      if (includesLibrary(scope)) { state.beans = normalizedBeans; state.drinkLogs = normalizedLogs; }
      if (includesPlans(scope) || includesLibrary(scope)) state.brewPlans = normalizedPlans;
      if (scope === 'all' && settings) state.settings = root.BeanCore.normalizeSettings(settings);
      await web().saveState(state); return;
    }
    const beanColumns = BEAN_COLUMNS.map((key) => BEAN_NATIVE[key] || key).join(','); const beanPlaceholders = BEAN_COLUMNS.map(() => '?').join(',');
    const logColumns = LOG_COLUMNS.map((key) => LOG_NATIVE[key] || key).join(','); const logPlaceholders = LOG_COLUMNS.map(() => '?').join(',');
    const planColumns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(','); const planPlaceholders = PLAN_COLUMNS.map(() => '?').join(',');
    const set = [];
    if (includesLibrary(scope)) set.push({ statement: 'DELETE FROM drink_logs', values: [] });
    if (includesPlans(scope) || includesLibrary(scope)) set.push({ statement: 'DELETE FROM brew_plans', values: [] });
    if (includesLibrary(scope)) set.push({ statement: 'DELETE FROM beans', values: [] });
    if (includesLibrary(scope)) set.push(...normalizedBeans.map((bean) => ({ statement: `INSERT INTO beans (${beanColumns}) VALUES (${beanPlaceholders})`, values: beanValues(bean) })));
    if (includesPlans(scope) || includesLibrary(scope)) set.push(...normalizedPlans.map((plan) => ({ statement: `INSERT INTO brew_plans (${planColumns}) VALUES (${planPlaceholders})`, values: planValues(plan) })));
    if (includesLibrary(scope)) set.push(...normalizedLogs.map((log) => ({ statement: `INSERT INTO drink_logs (${logColumns}) VALUES (${logPlaceholders})`, values: logValues(log) })));
    if (scope === 'all' && settings) set.push({ statement: "INSERT INTO app_settings (key, value) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", values: [JSON.stringify(root.BeanCore.normalizeSettings(settings))] });
    await nativeDb().executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
  }

  async function upsertSyncData(beans, drinkLogs, brewPlans) {
    const incomingBeans = normalizeBeans(beans);
    if (!native) {
      const state = web().loadState();
      const beanIds = new Set(upsertById(state.beans, incomingBeans).map((bean) => bean.id));
      const incomingLogs = sanitizeLogs(drinkLogs, beanIds);
      const incomingPlans = sanitizePlans(brewPlans, beanIds);
      state.beans = upsertById(state.beans, incomingBeans);
      state.drinkLogs = upsertById(state.drinkLogs, incomingLogs);
      state.brewPlans = upsertById(state.brewPlans, incomingPlans);
      await web().saveState(state);
      return;
    }
    const currentBeans = await nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans', values: [], readonly: false });
    const beanIds = new Set([...(currentBeans.values || []).map((row) => row.id), ...incomingBeans.map((bean) => bean.id)]);
    const incomingLogs = sanitizeLogs(drinkLogs, beanIds);
    const incomingPlans = sanitizePlans(brewPlans, beanIds);
    const beanSql = upsertStatement(BEAN_COLUMNS, BEAN_NATIVE);
    const logSql = upsertStatement(LOG_COLUMNS, LOG_NATIVE);
    const planSql = upsertStatement(PLAN_COLUMNS, PLAN_NATIVE);
    const set = [
      ...incomingBeans.map((bean) => ({ statement: `INSERT INTO beans (${beanSql.columns}) VALUES (${beanSql.placeholders}) ON CONFLICT(id) DO UPDATE SET ${beanSql.updates}`, values: beanValues(bean) })),
      ...incomingPlans.map((plan) => ({ statement: `INSERT INTO brew_plans (${planSql.columns}) VALUES (${planSql.placeholders}) ON CONFLICT(id) DO UPDATE SET ${planSql.updates}`, values: planValues(plan) })),
      ...incomingLogs.map((log) => ({ statement: `INSERT INTO drink_logs (${logSql.columns}) VALUES (${logSql.placeholders}) ON CONFLICT(id) DO UPDATE SET ${logSql.updates}`, values: logValues(log) }))
    ];
    if (set.length) await nativeDb().executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
  }

  async function importData(imported, mode) {
    const scope = normalizeScope(imported && imported.exportScope);
    const merge = mode === 'merge';
    const currentSync = merge ? await exportForSync() : null;
    const currentBeans = merge ? currentSync.beans : await getAll();
    const currentLogs = merge ? currentSync.drinkLogs : await getDrinkLogs();
    const currentPlans = merge ? currentSync.brewPlans : await getBrewPlans();
    const currentSettings = await getSettings();
    let nextBeans = currentBeans;
    let nextLogs = currentLogs;
    let nextPlans = currentPlans;
    let nextSettings = currentSettings;
    if (includesLibrary(scope)) {
      const incomingBeans = normalizeBeans(imported.beans || []);
      nextBeans = merge ? mergeRecords(currentBeans, incomingBeans, (bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)) : incomingBeans;
      const beanIds = new Set(nextBeans.map((bean) => bean.id));
      const incomingLogs = sanitizeLogs(imported.drinkLogs || [], beanIds);
      nextLogs = merge ? mergeRecords(currentLogs, incomingLogs, (log) => root.BeanCore.normalizeDrinkLog(log, log.updatedAt)) : incomingLogs;
    }
    const beanIds = new Set(nextBeans.map((bean) => bean.id));
    nextLogs = sanitizeLogs(nextLogs, beanIds);
    if (includesPlans(scope)) {
      const incomingPlans = sanitizePlans(imported.brewPlans || [], beanIds);
      nextPlans = merge ? mergeRecords(currentPlans, incomingPlans, (plan) => root.BeanCore.normalizeBrewPlan(plan, plan.updatedAt)) : incomingPlans;
    }
    nextPlans = sanitizePlans(nextPlans, beanIds);
    if (scope === 'all' && imported.settings) nextSettings = root.BeanCore.normalizeSettings(imported.settings);
    await writeDataSet(nextBeans, nextLogs, nextSettings, nextPlans, scope);
  }

  async function replaceAllData(beans, drinkLogs, settings, brewPlans) {
    return writeDataSet(beans, drinkLogs, settings, brewPlans, 'all');
  }

  async function replaceAll(beans) { return replaceAllData(beans, []); }
  function assertSmartField(field) { if (!['roaster', 'origin', 'process'].includes(field)) throw new Error('不支持的字段'); }
  async function smartValues(field) { assertSmartField(field); const beans = await getAll(); return [...new Set(beans.map((bean) => bean[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')); }
  async function renameSmartValue(field, oldValue, newValue) {
    assertSmartField(field); const clean = String(newValue || '').trim(); if (!clean) throw new Error('新名称不能为空');
    const stamp = new Date().toISOString();
    if (!native) { const state = web().loadState(); state.beans = state.beans.map((bean) => bean[field] === oldValue ? root.BeanCore.normalizeBean(markLocal({ ...bean, [field]: clean }, bean, stamp), stamp) : bean); await web().saveState(state); return; }
    await nativeDb().run({ database: DB_NAME, statement: `UPDATE beans SET ${field} = ?, updated_at = ?, revision = revision + 1, device_id = ? WHERE ${field} = ?`, values: [clean, stamp, getDeviceId(), oldValue], transaction: true, readonly: false });
  }
  async function deleteSmartValue(field, value) {
    assertSmartField(field);
    const stamp = new Date().toISOString();
    if (!native) { const state = web().loadState(); state.beans = state.beans.map((bean) => bean[field] === value ? root.BeanCore.normalizeBean(markLocal({ ...bean, [field]: '' }, bean, stamp), stamp) : bean); await web().saveState(state); return; }
    await nativeDb().run({ database: DB_NAME, statement: `UPDATE beans SET ${field} = '', updated_at = ?, revision = revision + 1, device_id = ? WHERE ${field} = ?`, values: [stamp, getDeviceId(), value], transaction: true, readonly: false });
  }

  async function exportForSync() {
    if (!native) {
      const state = web().loadState();
      return {
        beans: state.beans.map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)),
        drinkLogs: state.drinkLogs.map((log) => root.BeanCore.normalizeDrinkLog(log, log.updatedAt)),
        brewPlans: state.brewPlans.map((plan) => root.BeanCore.normalizeBrewPlan(plan, plan.updatedAt))
      };
    }
    await seedPresetPlans();
    const [beans, logs, plans] = await Promise.all([
      nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM beans ORDER BY updated_at DESC', values: [], readonly: false }),
      nativeDb().query({ database: DB_NAME, statement: 'SELECT l.*, COALESCE(b.name, l.bean_name) AS display_bean_name FROM drink_logs l LEFT JOIN beans b ON b.id = l.bean_id ORDER BY l.consumed_at DESC, l.created_at DESC, l.id DESC', values: [], readonly: false }),
      nativeDb().query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans ORDER BY updated_at DESC', values: [], readonly: false })
    ]);
    return {
      beans: (beans.values || []).map(fromBeanRow),
      drinkLogs: (logs.values || []).map(fromLogRow),
      brewPlans: (plans.values || []).map(fromPlanRow)
    };
  }

  async function applySyncData(data) {
    const beans = (data && data.beans) || [];
    const drinkLogs = (data && data.drinkLogs) || [];
    const brewPlans = (data && data.brewPlans) || [];
    return upsertSyncData(beans, drinkLogs, brewPlans);
  }

  function legacyData() {
    for (const key of LEGACY_KEYS) {
      try { const parsed = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(parsed) && parsed.length) return { key, beans: parsed.map((bean) => root.BeanCore.normalizeBean(bean)) }; }
      catch (_) {}
    }
    return null;
  }

  function saveWebImage(blob) { return web().saveImage(blob); }
  function getWebImage(ref) { return web().getImage(ref); }
  function deleteWebImage(ref) { return web().deleteImage(ref); }

  root.BeanRepository = { init, isNative: () => native, getAll, save, remove, getBrewPlans, saveBrewPlan, duplicateBrewPlan, deleteBrewPlan, getDrinkLogs, saveDrinkLog, deleteDrinkLog, getSettings, saveSettings, importData, replaceAllData, replaceAll, smartValues, renameSmartValue, deleteSmartValue, legacyData, saveWebImage, getWebImage, deleteWebImage, getDeviceId, exportForSync, applySyncData };
})(window);
