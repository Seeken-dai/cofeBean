'use strict';

// 图片同步映射层测试（阶段 4.4-f）：createImageMappingTransport
// push 前 idb→r2（读本地 blob 上传），pull 后 r2→idb（下载存本地）；仅 bean 带图片字段。
// 纯逻辑，用 mock base transport + mock 图片存储。

const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageMappingTransport } = require('../www/sync-service.js');

const R2_A = 'r2:' + 'a'.repeat(64);
const R2_B = 'r2:' + 'b'.repeat(64);

function mockBase(pullBeans) {
  const calls = { pushed: null, uploaded: [], downloaded: [] };
  return {
    calls,
    hello: async () => ({ protocol: 1 }),
    pull: async () => ({ beans: (pullBeans || []).map((b) => ({ ...b })), drinkLogs: [], brewPlans: [], cursor: 1 }),
    push: async (records) => { calls.pushed = records; return { accepted: 1, cursor: 2 }; },
    uploadImage: async (blob) => { calls.uploaded.push(blob); return { key: R2_A, sha256: 'a'.repeat(64) }; },
    downloadImage: async (ref) => { calls.downloaded.push(ref); return new Blob(['img-for-' + ref], { type: 'image/webp' }); }
  };
}
function mockImageStore() {
  const store = new Map();
  let n = 0;
  return {
    store,
    getImage: async (ref) => store.get(ref) || null,
    saveImage: async (blob) => { n += 1; const id = 'idb:new-' + n; store.set(id, blob); return id; }
  };
}

test('image-mapping: push 把本地 idb 图片上传并改写为 r2', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:x', new Blob(['bag'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, img);

  const local = { beans: [{ id: 'b1', name: '豆', bagImagePath: 'idb:x', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push(local);

  assert.equal(base.calls.pushed.beans[0].bagImagePath, R2_A, '推给云端的记录应为 r2 引用');
  assert.equal(base.calls.uploaded.length, 1, '应上传一次');
  assert.equal(local.beans[0].bagImagePath, 'idb:x', '本地记录不被改写');
});

test('image-mapping: pull 把远端 r2 图片下载并改写为 idb', async () => {
  const base = mockBase([{ id: 'b2', name: '远端豆', bagImagePath: R2_B, labelImagePath: '' }]);
  const img = mockImageStore();
  const t = createImageMappingTransport(base, img);

  const res = await t.pull(0);
  assert.match(res.beans[0].bagImagePath, /^idb:/, '本地应拿到 idb 引用');
  assert.equal(base.calls.downloaded[0], R2_B, '应下载该 r2 引用');
  assert.equal(img.store.size, 1, '下载的 blob 已存入本地图片库');
});

test('image-mapping: 无图片/非 idb 值原样通过，不触发上传', async () => {
  const base = mockBase();
  const img = mockImageStore();
  const t = createImageMappingTransport(base, img);

  const local = { beans: [{ id: 'b3', name: '无图豆', bagImagePath: '', labelImagePath: '' }], drinkLogs: [{ id: 'l1' }], brewPlans: [] };
  await t.push(local);

  assert.equal(base.calls.uploaded.length, 0, '无 idb 图片不应上传');
  assert.equal(base.calls.pushed.beans[0].bagImagePath, '', '空值原样');
  assert.equal(base.calls.pushed.drinkLogs.length, 1, '其它集合原样透传');
});

test('image-mapping: 同一 r2 引用在一次 pull 内只下载一次', async () => {
  const base = mockBase([
    { id: 'b4', bagImagePath: R2_B, labelImagePath: R2_B },
    { id: 'b5', bagImagePath: R2_B, labelImagePath: '' }
  ]);
  const img = mockImageStore();
  const t = createImageMappingTransport(base, img);

  await t.pull(0);
  assert.equal(base.calls.downloaded.length, 1, '相同 r2 引用在本次 pull 内应去重下载');
});
