(function (root) {
  'use strict';

  const DB_NAME = 'coffee_vault';
  const DB_VERSION = 4;
  const WEB_KEY = 'coffee-vault-browser-preview';
  const LEGACY_KEYS = ['coffee-vault-data', 'beans-data', 'bean-data'];
  const BEAN_COLUMNS = ['id', 'name', 'roaster', 'origin', 'process', 'roastLevel', 'roastDate', 'openedDate', 'purchaseDate', 'initialWeight', 'remainingWeight', 'price', 'tastingNotes', 'status', 'favorite', 'bagImagePath', 'labelImagePath', 'createdAt', 'updatedAt'];
  const BEAN_NATIVE = { roastLevel: 'roast_level', roastDate: 'roast_date', openedDate: 'opened_date', purchaseDate: 'purchase_date', initialWeight: 'initial_weight', remainingWeight: 'remaining_weight', tastingNotes: 'tasting_notes', bagImagePath: 'bag_image_path', labelImagePath: 'label_image_path', createdAt: 'created_at', updatedAt: 'updated_at' };
  const LOG_COLUMNS = ['id', 'beanId', 'beanName', 'grams', 'brewMethod', 'overallRating', 'aroma', 'acidity', 'sweetness', 'body', 'aftertaste', 'balance', 'bitterness', 'notes', 'consumedAt', 'createdAt', 'updatedAt'];
  const LOG_NATIVE = { beanId: 'bean_id', beanName: 'bean_name', brewMethod: 'brew_method', overallRating: 'overall_rating', consumedAt: 'consumed_at', createdAt: 'created_at', updatedAt: 'updated_at' };
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
        remaining_weight REAL, price REAL, tasting_notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '未开封',
        favorite INTEGER NOT NULL DEFAULT 0, bag_image_path TEXT NOT NULL DEFAULT '', label_image_path TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_beans_status ON beans(status);
      CREATE INDEX IF NOT EXISTS idx_beans_roast_date ON beans(roast_date);
      CREATE TABLE IF NOT EXISTS drink_logs (
        id TEXT PRIMARY KEY NOT NULL, bean_id TEXT, bean_name TEXT NOT NULL, grams REAL NOT NULL,
        brew_method TEXT NOT NULL DEFAULT '手冲', overall_rating INTEGER,
        aroma INTEGER, acidity INTEGER, sweetness INTEGER, body INTEGER, aftertaste INTEGER,
        balance INTEGER, bitterness INTEGER, notes TEXT NOT NULL DEFAULT '', consumed_at TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drink_logs_bean ON drink_logs(bean_id);
      CREATE INDEX IF NOT EXISTS idx_drink_logs_consumed ON drink_logs(consumed_at DESC);
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
    await sqlite.execute({ database: DB_NAME, statements: 'PRAGMA user_version = 4;', transaction: true, readonly: false });
  }

  function fromBeanRow(row) {
    const bean = {};
    BEAN_COLUMNS.forEach((key) => { const value = row[BEAN_NATIVE[key] || key]; bean[key] = key === 'favorite' ? Boolean(value) : value; });
    return root.BeanCore.normalizeBean(bean, bean.updatedAt);
  }

  function beanValues(bean) {
    const b = root.BeanCore.normalizeBean(bean, bean.updatedAt);
    return [b.id, b.name, b.roaster, b.origin, b.process, b.roastLevel, b.roastDate, b.openedDate, b.purchaseDate, b.initialWeight, b.remainingWeight, b.price, b.tastingNotes, b.status, b.favorite ? 1 : 0, b.bagImagePath, b.labelImagePath, b.createdAt, b.updatedAt];
  }

  function fromLogRow(row) {
    const log = {};
    LOG_COLUMNS.forEach((key) => { log[key] = row[LOG_NATIVE[key] || key]; });
    if (row.display_bean_name) log.beanName = row.display_bean_name;
    return root.BeanCore.normalizeDrinkLog(log, log.updatedAt);
  }

  function logValues(log) {
    const l = root.BeanCore.normalizeDrinkLog(log, log.updatedAt);
    return [l.id, l.beanId, l.beanName, l.grams, l.brewMethod, l.overallRating, l.aroma, l.acidity, l.sweetness, l.body, l.aftertaste, l.balance, l.bitterness, l.notes, l.consumedAt, l.createdAt, l.updatedAt];
  }

  function blankWebState() { return { beans: [], drinkLogs: [], settings: root.BeanCore.normalizeSettings({}) }; }
  function loadWebState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WEB_KEY) || 'null');
      if (Array.isArray(parsed)) return { beans: parsed.map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)), drinkLogs: [], settings: root.BeanCore.normalizeSettings({}) };
      if (!parsed || typeof parsed !== 'object') return blankWebState();
      return {
        beans: (parsed.beans || []).map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt)),
        drinkLogs: (parsed.drinkLogs || []).map((log) => root.BeanCore.normalizeDrinkLog(log, log.updatedAt)),
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
      saveWebState(state); return;
    }
    await sqlite.executeSet({ database: DB_NAME, set: [
      { statement: 'UPDATE drink_logs SET bean_name = COALESCE((SELECT name FROM beans WHERE id = ?), bean_name), bean_id = NULL WHERE bean_id = ?', values: [id, id] },
      { statement: 'DELETE FROM beans WHERE id = ?', values: [id] }
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

  async function replaceAllData(beans, drinkLogs, settings) {
    const normalizedBeans = beans.map((bean) => root.BeanCore.normalizeBean(bean, bean.updatedAt));
    const beanIds = new Set(normalizedBeans.map((bean) => bean.id));
    const normalizedLogs = (drinkLogs || []).map((log) => root.BeanCore.normalizeDrinkLog({ ...log, beanId: beanIds.has(log.beanId) ? log.beanId : null }, log.updatedAt));
    if (!native) { const state = loadWebState(); state.beans = normalizedBeans; state.drinkLogs = normalizedLogs; if (settings) state.settings = root.BeanCore.normalizeSettings(settings); saveWebState(state); return; }
    const beanColumns = BEAN_COLUMNS.map((key) => BEAN_NATIVE[key] || key).join(','); const beanPlaceholders = BEAN_COLUMNS.map(() => '?').join(',');
    const logColumns = LOG_COLUMNS.map((key) => LOG_NATIVE[key] || key).join(','); const logPlaceholders = LOG_COLUMNS.map(() => '?').join(',');
    const set = [{ statement: 'DELETE FROM drink_logs', values: [] }, { statement: 'DELETE FROM beans', values: [] }]
      .concat(normalizedBeans.map((bean) => ({ statement: `INSERT INTO beans (${beanColumns}) VALUES (${beanPlaceholders})`, values: beanValues(bean) })))
      .concat(normalizedLogs.map((log) => ({ statement: `INSERT INTO drink_logs (${logColumns}) VALUES (${logPlaceholders})`, values: logValues(log) })));
    if (settings) set.push({ statement: "INSERT INTO app_settings (key, value) VALUES ('preferences', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", values: [JSON.stringify(root.BeanCore.normalizeSettings(settings))] });
    await sqlite.executeSet({ database: DB_NAME, set, transaction: true, readonly: false });
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

  root.BeanRepository = { init, isNative: () => native, getAll, save, remove, getDrinkLogs, saveDrinkLog, deleteDrinkLog, getSettings, saveSettings, replaceAllData, replaceAll, smartValues, renameSmartValue, deleteSmartValue, legacyData };
})(window);
