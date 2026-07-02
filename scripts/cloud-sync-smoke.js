'use strict';

const core = require('../www/data-core.js');
const syncEngine = require('../www/sync-engine.js');
const transportApi = require('../www/sync-transport.js');
const serviceApi = require('../www/sync-service.js');

function createMemoryStorage() {
  const data = {};
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
}

function createRepository(local) {
  return {
    exportForSync: async () => ({
      beans: local.beans.slice(),
      drinkLogs: local.drinkLogs.slice(),
      brewPlans: local.brewPlans.slice()
    }),
    applySyncData: async (merged) => {
      local.beans = merged.beans || [];
      local.drinkLogs = merged.drinkLogs || [];
      local.brewPlans = merged.brewPlans || [];
    }
  };
}

async function main() {
  if (typeof fetch !== 'function') throw new Error('当前 Node 版本缺少 fetch，请使用 Node 18+');
  const stamp = Date.now();
  const password = 'TestPass12345';
  const transportEmail = `codex-smoke-${stamp}@example.test`;
  const serviceEmail = `codex-service-${stamp}@example.test`;

  const auth = transportApi.createAuthClient({ fetch });
  const registered = await auth.register({ email: transportEmail, password, recoveryCode: `REC-${stamp}` });
  if (!registered.token) throw new Error('transport 注册响应缺少 token');

  const http = transportApi.createHttpTransport({ core, fetch, token: registered.token });
  const hello = await http.hello();
  if (hello.protocol !== 1) throw new Error(`后端协议不匹配：${hello.protocol}`);
  const bean = core.normalizeBean({
    id: `smoke-bean-${stamp}`,
    name: 'Codex联调豆',
    updatedAt: new Date().toISOString(),
    revision: 1,
    deviceId: 'codex-smoke'
  });
  const pushed = await http.push({ beans: [bean], drinkLogs: [], brewPlans: [] });
  const pulled = await http.pull(null);
  if (!(pulled.beans || []).some((item) => item.id === bean.id)) throw new Error('transport pull 未拉回刚 push 的豆子');
  let unauthorized = false;
  try {
    await transportApi.createHttpTransport({ core, fetch, token: 'bad-token' }).pull(null);
  } catch (error) {
    unauthorized = error && error.status === 401;
  }
  if (!unauthorized) throw new Error('坏 token 未返回 401');

  const local = {
    beans: [core.normalizeBean({
      id: `service-bean-${stamp}`,
      name: 'Service联调豆',
      updatedAt: new Date().toISOString(),
      revision: 1,
      deviceId: 'codex-service'
    })],
    drinkLogs: [],
    brewPlans: []
  };
  const service = serviceApi.createSyncService({
    core,
    repository: createRepository(local),
    syncEngine,
    transportApi,
    storage: createMemoryStorage(),
    fetch
  });
  await service.register({ email: serviceEmail, password, recoveryCode: `SVC-${stamp}` });
  const result = await service.sync({ force: true });
  if (result.skipped || !result.cursor) throw new Error('service sync 未成功推进 cursor');

  console.log(JSON.stringify({
    ok: true,
    transportEmail,
    serviceEmail,
    helloProtocol: hello.protocol,
    pushed,
    pulledBeans: pulled.beans.length,
    serviceCursor: result.cursor,
    cleanupHint: "wrangler d1 execute cofebean-sync --remote --command \"DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'codex-%@example.test'); DELETE FROM records WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'codex-%@example.test'); DELETE FROM user_seq WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'codex-%@example.test'); DELETE FROM image_refs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'codex-%@example.test'); DELETE FROM users WHERE email LIKE 'codex-%@example.test';\""
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
