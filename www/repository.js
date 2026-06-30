(function (root) {
  'use strict';

  const DB_NAME = 'coffee_vault';
  const DB_VERSION = 6;
  const WEB_KEY = 'coffee-vault-browser-preview';
  const LEGACY_KEYS = ['coffee-vault-data', 'beans-data', 'bean-data'];
  const BEAN_COLUMNS = ['id', 'name', 'roaster', 'origin', 'process', 'roastLevel', 'roastDate', 'openedDate', 'purchaseDate', 'initialWeight', 'remainingWeight', 'price', 'bestFlavorDays', 'tastingNotes', 'status', 'favorite', 'bagImagePath', 'labelImagePath', 'createdAt', 'updatedAt'];
  const BEAN_NATIVE = { roastLevel: 'roast_level', roastDate: 'roast_date', openedDate: 'opened_date', purchaseDate: 'purchase_date', initialWeight: 'initial_weight', remainingWeight: 'remaining_weight', bestFlavorDays: 'best_flavor_days', tastingNotes: 'tasting_notes', bagImagePath: 'bag_image_path', labelImagePath: 'label_image_path', createdAt: 'created_at', updatedAt: 'updated_at' };
  const LOG_COLUMNS = ['id', 'beanId', 'beanName', 'grams', 'brewMethod', 'brewPlanId', 'brewPlanVersion', 'brewPlanName', 'brewPlanSnapshot', 'overallRating', 'aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness', 'notes', 'consumedAt', 'createdAt', 'updatedAt'];
  const LOG_NATIVE = { beanId: 'bean_id', beanName: 'bean_name', brewMethod: 'brew_method', brewPlanId: 'brew_plan_id', brewPlanVersion: 'brew_plan_version', brewPlanName: 'brew_plan_name', brewPlanSnapshot: 'brew_plan_snapshot', overallRating: 'overall_rating', consumedAt: 'consumed_at', createdAt: 'created_at', updatedAt: 'updated_at' };
  const PLAN_COLUMNS = ['id', 'name', 'brewMethod', 'version', 'source', 'beanIds', 'payload', 'createdAt', 'updatedAt'];
  const PLAN_NATIVE = { brewMethod: 'brew_method', beanIds: 'bean_ids', createdAt: 'created_at', updatedAt: 'updated_at' };
  let sqlite = null;
  let native = false;

  function plugin(name) { return root.Capacitor && root.Capacitor.Plugins ? root.Capacitor.Plugins[name] : null; }
  function isNative() { return Boolean(root.Capacitor && typeof root.Capacitor.getPlatform === 'function' && root.Capacitor.getPlatform() !== 'web'); }

  async function init() {
    native = isNative();
    if (!native) return;
    sqlite = plugin('CapacitorSQLite');
    if (!sqlite) throw new Error('SQLite 插件没有加载');
    try {
      await sqlite.createConnection({ database: DB_NAME, encrypted: false, mode: 'no-encryption', version: DB_VERSION, readonly: false });
    } catch (error) {
      if (!String(error && error.message || error).toLowerCase().includes('already')) throw error;
    }
    await sqlite.open({ database: DB_NAME, readonly: false });
    await migrate();
  }

  async function migrate() {
    const statements = `
      CREATE TABLE IF NOT EXISTS beans (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, roaster TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT '', process TEXT NOT NULL DEFAULT '', roast_level TEXT NOT NULL DEFAULT '',
        roast_date TEXT NOT NULL DEFAULT '', opened_date TEXT NOT NULL DEFAULT '', purchase_date TEXT NOT NULL DEFAULT '', initial_weight REAL,
        remaining_weight REAL, price REAL, best_flavor_days REAL, tasting_notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '未开封',
        favorite INTEGER NOT NULL DEFAULT 0, bag_image_path TEXT NOT NULL DEFAULT '', label_image_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_beans_status ON beans(status);
      CREATE INDEX IF NOT EXISTS idx_beans_roast_date ON beans(roast_date);
      CREATE TABLE IF NOT EXISTS drink_logs (
        id TEXT PRIMARY KEY NOT NULL, bean_id TEXT, bean_name TEXT NOT NULL, grams REAL NOT NULL,
        brew_method TEXT NOT NULL DEFAULT '手冲', brew_plan_id TEXT, brew_plan_version INTEGER,
        brew_plan_name TEXT NOT NULL DEFAULT '', brew_plan_snapshot TEXT NOT NULL DEFAULT '', overall_rating INTEGER,
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
    await sqlite.execute({ database: DB_NAME, statements, transaction: true, readonly: false });
    const columns = await sqlite.query({ database: DB_NAME, statement: 'PRAGMA table_info(beans)', values: [], readonly: false });
    if (!(columns.values || []).some((column) => column.name === 'opened_date')) {
      await sqlite.execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN opened_date TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'bag_image_path')) {
      await sqlite.execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN bag_image_path TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'label_image_path')) {
      await sqlite.execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN label_image_path TEXT NOT NULL DEFAULT '';", transaction: true, readonly: false });
    }
    if (!(columns.values || []).some((column) => column.name === 'best_flavor_days')) {
      await sqlite.execute({ database: DB_NAME, statements: "ALTER TABLE beans ADD COLUMN best_flavor_days REAL;", transaction: true, readonly: false });
    }
    const logColumns = await sqlite.query({ database: DB_NAME, statement: 'PRAGMA table_info(drink_logs)', values: [], readonly: false });
    const logNames = (logColumns.values || []).map((column) => column.name);
    const logAdds = [
      ['brew_plan_id', "ALTER TABLE drink_logs ADD COLUMN brew_plan_id TEXT;"],
      ['brew_plan_version', "ALTER TABLE drink_logs ADD COLUMN brew_plan_version INTEGER;"],
      ['brew_plan_name', "ALTER TABLE drink_logs ADD COLUMN brew_plan_name TEXT NOT NULL DEFAULT '';"],
      ['brew_plan_snapshot', "ALTER TABLE drink_logs ADD COLUMN brew_plan_snapshot TEXT NOT NULL DEFAULT '';"]
    ].filter(([name]) => !logNames.includes(name)).map(([, statement]) => statement).join('\n');
    if (logAdds) await sqlite.execute({ database: DB_NAME, statements: logAdds, transaction: true, readonly: false });
    await seedPresetPlans();
    await sqlite.execute({ database: DB_NAME, statements: 'PRAGMA user_version = 6;', transaction: true, readonly: false });
  }

  function fromBeanRow(row) {
    const bean = {};
    BEAN_COLUMNS.forEach((key) => { const value = row[BEAN_NATIVE[key] || key]; bean[key] = key === 'favorite' ? Boolean(value) : value; });
    return root.BeanCore.normalizeBean(bean, bean.updatedAt);
  }

  function beanValues(bean) {
    const b = root.BeanCore.normalizeBean(bean, bean.updatedAt);
    return [b.id, b.name, b.roaster, b.origin, b.process, b.roastLevel, b.roastDate, b.openedDate, b.purchaseDate, b.initialWeight, b.remainingWeight, b.price, b.bestFlavorDays, b.tastingNotes, b.status, b.favorite ? 1 : 0, b.bagImagePath, b.labelImagePath, b.createdAt, b.updatedAt];
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
    return [l.id, l.beanId, l.beanName, l.grams, l.brewMethod, l.brewPlanId, l.brewPlanVersion, l.brewPlanName, l.brewPlanSnapshot ? JSON.stringify(l.brewPlanSnapshot) : '', l.overallRating, l.aroma, l.acidity, l.sweetness, l.body, l.aftertaste, l.balance, l.bitterness, l.notes, l.consumedAt, l.createdAt, l.updatedAt];
  }

  function planValues(plan) {
    const p = root.BeanCore.normalizeBrewPlan(plan, plan.updatedAt);
    return [p.id, p.name, p.brewMethod, p.version, p.source, JSON.stringify(p.beanIds), JSON.stringify(p), p.createdAt, p.updatedAt];
  }

  function presetPlans() {
    return root.BeanCore.presetBrewPlans ? root.BeanCore.presetBrewPlans() : [];
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
    await sqlite.executeSet({ database: DB_NAME, set: presets.map((plan) => ({ statement: `INSERT OR REPLACE INTO brew_plans (${columns}) VALUES (${placeholders})`, values: planValues(plan) })), transaction: true, readonly: false });
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

  function blankWebState() { return { beans: [], drinkLogs: [], brewPlans: presetPlans(), settings: root.BeanCore.normalizeSettings({}) }; }
  function loadWebState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WEB_KEY) || 'null');
      if (Array.isArray(parsed)) return { beans: parsed.map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)), drinkLogs: [], brewPlans: presetPlans(), settings: root.BeanCore.normalizeSettings({}) };
      if (!parsed || typeof parsed !== 'object') return blankWebState();
      return {
        beans: (parsed.beans || []).map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)),
        drinkLogs: (parsed.drinkLogs || []).map((log) => root.BeanCore.normalizeDrinkLog(log, log.updatedAt)),
        brewPlans: withPresetPlans(parsed.brewPlans || []),
        settings: root.BeanCore.normalizeSettings(parsed.settings)
      };
    } catch (_) { return blankWebState(); }
  }
  function saveWebState(state) { localStorage.setItem(WEB_KEY, JSON.stringify(state)); }

  async function getAll() {
    if (!native) return loadWebState().beans;
    const result = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM beans ORDER BY updated_at DESC', values: [], readonly: false });
    return (result.values || []).map(fromBeanRow);
  }

  async function save(bean) {
    const normalized = root.BeanCore.normalizeBean({ ...bean, updatedAt: new Date().toISOString() });
    if (!native) {
      const state = loadWebState(); const index = state.beans.findIndex((item) => item.id === normalized.id);
      if (index >= 0) state.beans[index] = normalized; else state.beans.unshift(normalized);
      saveWebState(state); return normalized;
    }
    const placeholders = BEAN_COLUMNS.map(() => '?').join(',');
    const updates = BEAN_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${BEAN_NATIVE[key] || key}=excluded.${BEAN_NATIVE[key] || key}`).join(',');
    const columns = BEAN_COLUMNS.map((key) => BEAN_NATIVE[key] || key).join(',');
    await sqlite.run({ database: DB_NAME, statement: `INSERT INTO beans (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: beanValues(normalized), transaction: true, readonly: false });
    return normalized;
  }

  async function remove(id) {
    if (!native) {
      const state = loadWebState(); const bean = state.beans.find((item) => item.id === id);
      state.beans = state.beans.filter((item) => item.id !== id);
      state.drinkLogs = state.drinkLogs.map((log) => log.beanId === id ? { ...log, beanId: null, beanName: bean ? bean.name : log.beanName } : log);
      state.brewPlans = state.brewPlans.map((plan) => root.BeanCore.normalizeBrewPlan({ ...plan, beanIds: plan.beanIds.filter((beanId) => beanId !== id) }, plan.updatedAt));
      saveWebState(state); return;
    }
    await sqlite.executeSet({ database: DB_NAME, set: [
      { statement: 'UPDATE drink_logs SET bean_name = COALESCE((SELECT name FROM beans WHERE id = ?), bean_name), bean_id = NULL WHERE bean_id = ?', values: [id, id] },
      { statement: "UPDATE brew_plans SET bean_ids = json_remove(bean_ids, '$[' || (SELECT key FROM json_each(bean_ids) WHERE value = ? LIMIT 1) || ']') WHERE EXISTS (SELECT 1 FROM json_each(bean_ids) WHERE value = ?)", values: [id, id] },
      { statement: 'DELETE FROM beans WHERE id = ?', values: [id] }
    ], transaction: true, readonly: false });
  }

  async function getBrewPlans() {
    if (!native) return loadWebState().brewPlans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await seedPresetPlans();
    const result = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans ORDER BY updated_at DESC', values: [], readonly: false });
    return (result.values || []).map(fromPlanRow);
  }

  async function saveBrewPlan(input) {
    const stamp = new Date().toISOString();
    let normalized = root.BeanCore.normalizeBrewPlan({ ...input, updatedAt: stamp }, stamp);
    if (!native) {
      const state = loadWebState();
      const index = state.brewPlans.findIndex((item) => item.id === normalized.id);
      const old = index >= 0 ? state.brewPlans[index] : null;
      if (old && old.source === 'preset') throw new Error('预置方案请先复制再编辑');
      if (old) normalized = root.BeanCore.normalizeBrewPlan({ ...old, ...normalized, version: old.version + 1, createdAt: old.createdAt }, stamp);
      if (index >= 0) state.brewPlans[index] = normalized; else state.brewPlans.unshift(normalized);
      saveWebState(state); return normalized;
    }
    const oldResult = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM brew_plans WHERE id = ?', values: [normalized.id], readonly: false });
    const old = (oldResult.values || []).length ? fromPlanRow(oldResult.values[0]) : null;
    if (old && old.source === 'preset') throw new Error('预置方案请先复制再编辑');
    if (old) normalized = root.BeanCore.normalizeBrewPlan({ ...old, ...normalized, version: old.version + 1, createdAt: old.createdAt }, stamp);
    const columns = PLAN_COLUMNS.map((key) => PLAN_NATIVE[key] || key).join(',');
    const placeholders = PLAN_COLUMNS.map(() => '?').join(',');
    const updates = PLAN_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${PLAN_NATIVE[key] || key}=excluded.${PLAN_NATIVE[key] || key}`).join(',');
    await sqlite.run({ database: DB_NAME, statement: `INSERT INTO brew_plans (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: planValues(normalized), transaction: true, readonly: false });
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
    if (!native) {
      const state = loadWebState();
      state.brewPlans = state.brewPlans.filter((item) => item.id !== id);
      state.drinkLogs = state.drinkLogs.map((log) => log.brewPlanId === id ? root.BeanCore.normalizeDrinkLog({ ...log, brewPlanId: null }, log.updatedAt) : log);
      saveWebState(state); return;
    }
    await sqlite.executeSet({ database: DB_NAME, set: [
      { statement: 'DELETE FROM brew_plans WHERE id = ? AND source != ?', values: [id, 'preset'] },
      { statement: 'UPDATE drink_logs SET brew_plan_id = NULL WHERE brew_plan_id = ?', values: [id] }
    ], transaction: true, readonly: false });
  }

  async function getDrinkLogs(beanId) {
    if (!native) {
      return loadWebState().drinkLogs.filter((log) => !beanId || log.beanId === beanId).sort((a, b) => b.consumedAt.localeCompare(a.consumedAt));
    }
    const where = beanId ? 'WHERE l.bean_id = ?' : '';
    const result = await sqlite.query({ database: DB_NAME, statement: `SELECT l.*, COALESCE(b.name, l.bean_name) AS display_bean_name FROM drink_logs l LEFT JOIN beans b ON b.id = l.bean_id ${where} ORDER BY l.consumed_at DESC`, values: beanId ? [beanId] : [], readonly: false });
    return (result.values || []).map(fromLogRow);
  }

  async function saveDrinkLog(input) {
    const stamp = new Date().toISOString();
    let log = root.BeanCore.normalizeDrinkLog({ ...input, updatedAt: stamp }, stamp);
    if (!(log.grams > 0)) throw new Error('本次用量必须大于 0');
    if (!log.beanId) throw new Error('请选择咖啡豆');

    if (!native) {
      const state = loadWebState(); const beanIndex = state.beans.findIndex((bean) => bean.id === log.beanId);
      if (beanIndex < 0) throw new Error('找不到对应的咖啡豆');
      const oldIndex = state.drinkLogs.findIndex((item) => item.id === log.id);
      const old = oldIndex >= 0 ? state.drinkLogs[oldIndex] : null;
      if (old && old.beanId !== log.beanId) throw new Error('不能更改饮用记录所属豆子');
      if (old) log = root.BeanCore.normalizeDrinkLog({ ...old, ...log, createdAt: old.createdAt }, stamp);
      const bean = state.beans[beanIndex]; const delta = log.grams - (old ? old.grams : 0);
      const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, delta);
      state.beans[beanIndex] = { ...bean, remainingWeight: remaining, status: remaining <= 0 ? '已喝完' : '饮用中', updatedAt: stamp };
      if (oldIndex >= 0) state.drinkLogs[oldIndex] = log; else state.drinkLogs.unshift(log);
      saveWebState(state); return log;
    }

    const beanResult = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE id = ?', values: [log.beanId], readonly: false });
    if (!(beanResult.values || []).length) throw new Error('找不到对应的咖啡豆');
    const bean = fromBeanRow(beanResult.values[0]);
    const oldResult = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM drink_logs WHERE id = ?', values: [log.id], readonly: false });
    const old = (oldResult.values || []).length ? fromLogRow(oldResult.values[0]) : null;
    if (old && old.beanId !== log.beanId) throw new Error('不能更改饮用记录所属豆子');
    if (old) log = root.BeanCore.normalizeDrinkLog({ ...old, ...log, createdAt: old.createdAt }, stamp);
    log.beanName = bean.name;
    const delta = log.grams - (old ? old.grams : 0);
    const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, delta);
    const columns = LOG_COLUMNS.map((key) => LOG_NATIVE[key] || key).join(',');
    const placeholders = LOG_COLUMNS.map(() => '?').join(',');
    const updates = LOG_COLUMNS.filter((key) => key !== 'id' && key !== 'createdAt').map((key) => `${LOG_NATIVE[key] || key}=excluded.${LOG_NATIVE[key] || key}`).join(',');
    await sqlite.executeSet({ database: DB_NAME, set: [
      { statement: `INSERT INTO drink_logs (${columns}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values: logValues(log) },
      { statement: 'UPDATE beans SET remaining_weight = ?, status = ?, updated_at = ? WHERE id = ?', values: [remaining, remaining <= 0 ? '已喝完' : '饮用中', stamp, bean.id] }
    ], transaction: true, readonly: false });
    return log;
  }

  async function deleteDrinkLog(id) {
    if (!native) {
      const state = loadWebState(); const index = state.drinkLogs.findIndex((log) => log.id === id);
      if (index < 0) return; const log = state.drinkLogs[index]; const beanIndex = state.beans.findIndex((bean) => bean.id === log.beanId);
      if (beanIndex >= 0) {
        const bean = state.beans[beanIndex]; const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, -log.grams);
        state.beans[beanIndex] = { ...bean, remainingWeight: remaining, status: remaining > 0 && bean.status === '已喝完' ? '饮用中' : bean.status, updatedAt: new Date().toISOString() };
      }
      state.drinkLogs.splice(index, 1); saveWebState(state); return;
    }
    const result = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM drink_logs WHERE id = ?', values: [id], readonly: false });
    if (!(result.values || []).length) return; const log = fromLogRow(result.values[0]);
    const set = [{ statement: 'DELETE FROM drink_logs WHERE id = ?', values: [id] }];
    if (log.beanId) {
      const beanResult = await sqlite.query({ database: DB_NAME, statement: 'SELECT * FROM beans WHERE id = ?', values: [log.beanId], readonly: false });
      if ((beanResult.values || []).length) {
        const bean = fromBeanRow(beanResult.values[0]); const remaining = root.BeanCore.consumptionResult(bean.remainingWeight, bean.initialWeight, -log.grams);
        set.push({ statement: 'UPDATE beans SET remaining_weight = ?, status = ?, updated_at = ? WHERE id = ?', values: [remaining, remaining > 0 && bean.status === '已喝完' ? '饮用中' : bean.status, new Date().toISOString(), bean.id] });
      }
    }
    await sqlite.executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
  }

  async function getSettings() {
    if (!native) return loadWebState().settings;
    const result = await sqlite.query({ database: DB_NAME, statement: "SELECT value FROM app_settings WHERE key = 'preferences'", values: [], readonly: false });
    if (!(result.values || []).length) return root.BeanCore.normalizeSettings({});
    try { return root.BeanCore.normalizeSettings(JSON.parse(result.values[0].value)); } catch (_) { return root.BeanCore.normalizeSettings({}); }
  }

  async function saveSettings(settings) {
    const normalized = root.BeanCore.normalizeSettings(settings);
    if (!native) { const state = loadWebState(); state.settings = normalized; saveWebState(state); return normalized; }
    await sqlite.run({ database: DB_NAME, statement: "INSERT INTO app_settings (key, value) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", values: [JSON.stringify(normalized)], transaction: true, readonly: false });
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
    return (logs || []).map((log) => root.BeanCore.normalizeDrinkLog({ ...log, beanId: beanIds.has(log.beanId) ? log.beanId : null }, log.updatedAt));
  }
  function sanitizePlans(plans, beanIds) {
    return withPresetPlans(plans || []).map((plan) => root.BeanCore.normalizeBrewPlan({ ...plan, beanIds: plan.beanIds.filter((id) => beanIds.has(id)) }, plan.updatedAt));
  }
  async function writeDataSet(beans, drinkLogs, settings, brewPlans, scope) {
    const normalizedBeans = normalizeBeans(beans);
    const beanIds = new Set(normalizedBeans.map((bean) => bean.id));
    const normalizedLogs = sanitizeLogs(drinkLogs, beanIds);
    const normalizedPlans = sanitizePlans(brewPlans, beanIds);
    if (!native) {
      const state = loadWebState();
      if (includesLibrary(scope)) { state.beans = normalizedBeans; state.drinkLogs = normalizedLogs; }
      if (includesPlans(scope) || includesLibrary(scope)) state.brewPlans = normalizedPlans;
      if (scope === 'all' && settings) state.settings = root.BeanCore.normalizeSettings(settings);
      saveWebState(state); return;
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
    await sqlite.executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
  }

  async function importData(imported, mode) {
    const scope = normalizeScope(imported && imported.exportScope);
    const merge = mode === 'merge';
    const currentBeans = await getAll();
    const currentLogs = await getDrinkLogs();
    const currentPlans = await getBrewPlans();
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
    if (!native) { const state = loadWebState(); state.beans = state.beans.map((bean) => bean[field] === oldValue ? { ...bean, [field]: clean, updatedAt: new Date().toISOString() } : bean); saveWebState(state); return; }
    await sqlite.run({ database: DB_NAME, statement: `UPDATE beans SET ${field} = ?, updated_at = ? WHERE ${field} = ?`, values: [clean, new Date().toISOString(), oldValue], transaction: true, readonly: false });
  }
  async function deleteSmartValue(field, value) {
    assertSmartField(field);
    if (!native) { const state = loadWebState(); state.beans = state.beans.map((bean) => bean[field] === value ? { ...bean, [field]: '', updatedAt: new Date().toISOString() } : bean); saveWebState(state); return; }
    await sqlite.run({ database: DB_NAME, statement: `UPDATE beans SET ${field} = '', updated_at = ? WHERE ${field} = ?`, values: [new Date().toISOString(), value], transaction: true, readonly: false });
  }

  function legacyData() {
    for (const key of LEGACY_KEYS) {
      try { const parsed = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(parsed) && parsed.length) return { key, beans: parsed.map((bean) => root.BeanCore.normalizeBean(bean)) }; }
      catch (_) {}
    }
    return null;
  }

  root.BeanRepository = { init, isNative: () => native, getAll, save, remove, getBrewPlans, saveBrewPlan, duplicateBrewPlan, deleteBrewPlan, getDrinkLogs, saveDrinkLog, deleteDrinkLog, getSettings, saveSettings, importData, replaceAllData, replaceAll, smartValues, renameSmartValue, deleteSmartValue, legacyData };
})(window);
