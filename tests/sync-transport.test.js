'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');
const transport = require('../www/sync-transport.js');

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data)
  };
}

test('sync-transport: domain records convert to worker envelopes and back', () => {
  const bean = core.normalizeBean({ id: 'b1', name: '豆', roaster: 'R', updatedAt: '2026-07-02T00:00:00.000Z', revision: 3, deviceId: 'dev-a' }, '2026-07-02T00:00:00.000Z');
  const envelope = transport.toEnvelope('bean', bean);

  assert.equal(envelope.type, 'bean');
  assert.equal(envelope.id, 'b1');
  assert.equal(envelope.revision, 3);
  assert.equal(envelope.deviceId, 'dev-a');
  assert.equal(envelope.payload.name, '豆');
  assert.equal(Object.hasOwn(envelope.payload, 'revision'), false);

  const restored = transport.fromEnvelope(core, envelope);
  assert.equal(restored.id, 'b1');
  assert.equal(restored.name, '豆');
  assert.equal(restored.revision, 3);
  assert.equal(restored.deviceId, 'dev-a');
});

test('sync-transport: pull adds auth header and normalizes worker envelopes', async () => {
  const calls = [];
  const http = transport.createHttpTransport({
    core,
    baseUrl: 'https://sync.example.test/',
    token: 'token-1',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        cursor: 12,
        protocol: 1,
        beans: [transport.toEnvelope('bean', core.normalizeBean({ id: 'b1', name: '云豆' }))],
        drinkLogs: [],
        brewPlans: []
      });
    }
  });

  const pulled = await http.pull(9);
  assert.equal(calls[0].url, 'https://sync.example.test/sync/pull?cursor=9');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1');
  assert.equal(pulled.cursor, 12);
  assert.equal(pulled.beans[0].name, '云豆');
});

test('sync-transport: push sends worker envelopes and surfaces server errors', async () => {
  const calls = [];
  const http = transport.createHttpTransport({
    core,
    baseUrl: 'https://sync.example.test',
    getToken: () => 'token-2',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1 ? jsonResponse({ accepted: 1, cursor: 3 }) : jsonResponse({ error: '未登录' }, 401);
    }
  });

  const result = await http.push({ beans: [core.normalizeBean({ id: 'b1', name: '本地豆' })], drinkLogs: [], brewPlans: [] });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(result.cursor, 3);
  assert.equal(calls[0].url, 'https://sync.example.test/sync/push');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-2');
  assert.equal(body.beans[0].type, 'bean');
  assert.equal(body.beans[0].payload.name, '本地豆');

  await assert.rejects(http.push({ beans: [] }), /未登录/);
});

test('sync-transport: auth client posts register/login/recover payloads', async () => {
  const calls = [];
  const auth = transport.createAuthClient({
    baseUrl: 'https://sync.example.test',
    fetch: async (url, init) => { calls.push({ url, init }); return jsonResponse({ token: 'ok' }); }
  });

  assert.equal((await auth.register({ email: 'a@b.com', password: '12345678', recoveryCode: 'r' })).token, 'ok');
  assert.equal((await auth.login({ email: 'a@b.com', password: '12345678' })).token, 'ok');
  assert.equal((await auth.recover({ email: 'a@b.com', recoveryCode: 'r', newPassword: 'abcdefgh' })).token, 'ok');
  assert.deepEqual(calls.map((call) => call.url), [
    'https://sync.example.test/auth/register',
    'https://sync.example.test/auth/login',
    'https://sync.example.test/auth/recover'
  ]);
});
