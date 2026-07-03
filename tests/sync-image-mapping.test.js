'use strict';

// 图片同步映射层测试（阶段 4.4-f）：createImageMappingTransport
// push 前 idb→r2（读本地 blob 上传），pull 后 r2→idb（下载存本地）；仅 bean 带图片字段。
// 纯逻辑，用 mock base transport + mock 图片存储。

const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageMappingTransport, createNativeImageStore } = require('../www/sync-service.js');

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

test('image-mapping: 存量本地图（不在增量集）通过全量参数被补推上传为 r2', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['legacy-bag'], { type: 'image/webp' }));
  const imageRefs = {};
  const t = createImageMappingTransport(base, { ...img, imageRefs });

  // 增量集为空（记录内容没变），但全量里有一张从未上传的本地图
  const delta = { beans: [], drinkLogs: [], brewPlans: [] };
  const all = { beans: [{ id: 'b1', name: '存量豆', bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push(delta, 0, all);

  assert.equal(base.calls.uploaded.length, 1, '存量图应被上传一次');
  assert.equal(base.calls.pushed.beans.length, 1, '该豆被补推');
  assert.equal(base.calls.pushed.beans[0].id, 'b1');
  assert.equal(base.calls.pushed.beans[0].bagImagePath, R2_A, '补推记录用 r2 引用');
  assert.equal(imageRefs['idb:old'], R2_A, '映射已持久化，下轮不再重复处理');
});

test('image-mapping: 图片已映射后不再重复上传或补推', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['bag'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, { ...img, imageRefs: { 'idb:old': R2_A } });

  const all = { beans: [{ id: 'b1', bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);

  assert.equal(base.calls.uploaded.length, 0, '已映射不再上传');
  assert.equal(base.calls.pushed.beans.length, 0, '已映射不再补推');
});

test('image-mapping: push 后 pull 拿回自己刚传的 r2 时复用原引用，不重复落盘', async () => {
  const base = mockBase([{ id: 'b1', bagImagePath: R2_A, labelImagePath: '' }]);
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['bag'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, { ...img, imageRefs: {} });

  const all = { beans: [{ id: 'b1', bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);
  const pulled = await t.pull(0);

  assert.equal(pulled.beans[0].bagImagePath, 'idb:old', 'pull 回来复用原本地引用');
  assert.equal(base.calls.downloaded.length, 0, '不重复下载自己刚传的图');
  assert.equal(img.store.size, 1, '不新增本地图片，杜绝每次同步生成新文件的死循环');
});

test('image-mapping: Android file 图片可上传为 r2，下载后恢复到原生归档目录', async () => {
  const fileRef = 'file:///data/user/0/com.coffeebean.vault/files/bean-images/bag-1.webp';
  const restoredRef = 'file:///data/user/0/com.coffeebean.vault/files/bean-images/label-2.webp';
  const scannerCalls = { read: [], restore: [] };
  const scanner = {
    readArchivedImage: async ({ path }) => {
      scannerCalls.read.push(path);
      return { data: Buffer.from('native-bag').toString('base64'), mimeType: 'image/webp', extension: '.webp' };
    },
    restoreArchivedImage: async (payload) => {
      scannerCalls.restore.push(payload);
      return { path: restoredRef, uri: restoredRef };
    }
  };
  const nativeStore = createNativeImageStore(scanner);
  const base = mockBase([{ id: 'b6', name: '远端豆', bagImagePath: '', labelImagePath: R2_B }]);
  const t = createImageMappingTransport(base, nativeStore);

  await t.push({ beans: [{ id: 'b6', bagImagePath: fileRef, labelImagePath: '' }], drinkLogs: [], brewPlans: [] });
  const pulled = await t.pull(0);

  assert.equal(base.calls.pushed.beans[0].bagImagePath, R2_A);
  assert.equal(scannerCalls.read[0], fileRef);
  assert.equal(pulled.beans[0].labelImagePath, restoredRef);
  assert.equal(scannerCalls.restore[0].role, 'label');
  assert.equal(scannerCalls.restore[0].extension, '.webp');
});
