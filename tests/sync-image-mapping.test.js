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
  img.store.set('idb:cutout', new Blob(['cutout'], { type: 'image/png' }));
  const t = createImageMappingTransport(base, img);

  const local = { beans: [{ id: 'b1', name: '豆', bagImagePath: 'idb:x', bagCutoutImagePath: 'idb:cutout', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push(local);

  assert.equal(base.calls.pushed.beans[0].bagImagePath, R2_A, '推给云端的记录应为 r2 引用');
  assert.equal(base.calls.pushed.beans[0].bagCutoutImagePath, R2_A, '手账封面也应改写为 r2 引用');
  assert.equal(base.calls.uploaded.length, 2, '原图与手账封面应分别上传');
  assert.equal(local.beans[0].bagImagePath, 'idb:x', '本地记录不被改写');
  assert.equal(local.beans[0].bagCutoutImagePath, 'idb:cutout', '本地手账封面引用不被改写');
});

test('image-mapping: drink photos push/pull between local refs and r2', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:cup', new Blob(['cup'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, img);

  await t.push({ beans: [], drinkLogs: [{ id: 'l1', source: 'external', photos: ['idb:cup'] }], brewPlans: [] });
  assert.equal(base.calls.pushed.drinkLogs[0].photos[0], R2_A);
  assert.equal(base.calls.uploaded.length, 1);

  const pullBase = {
    ...mockBase(),
    pull: async () => ({ beans: [], drinkLogs: [{ id: 'l2', photos: [R2_B] }], brewPlans: [], cursor: 1 }),
    downloadImage: async (ref) => new Blob(['drink-' + ref], { type: 'image/webp' })
  };
  const pulled = await createImageMappingTransport(pullBase, img).pull(0);
  assert.match(pulled.drinkLogs[0].photos[0], /^idb:/);
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
  const imageSynced = {};
  const t = createImageMappingTransport(base, { ...img, imageSynced });

  // 增量集为空（记录内容没变），但全量里有一张从未上传的本地图
  const delta = { beans: [], drinkLogs: [], brewPlans: [] };
  const all = { beans: [{ id: 'b1', name: '存量豆', revision: 3, bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push(delta, 0, all);

  assert.equal(base.calls.uploaded.length, 1, '存量图应被上传一次');
  assert.equal(base.calls.pushed.beans.length, 1, '该豆被补推');
  assert.equal(base.calls.pushed.beans[0].id, 'b1');
  assert.equal(base.calls.pushed.beans[0].bagImagePath, R2_A, '补推记录用 r2 引用');
  assert.equal(base.calls.pushed.beans[0].revision, 4, 'revision 应 +1，确保服务端 LWW 接受覆盖脏 file: 记录');
  assert.equal(imageSynced['idb:old'], undefined, 'push 未回显前不落持久层（避免误标已同步）');
});

test('image-mapping: 存量饮用照片通过全量参数被补推上传为 r2', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:drink-old', new Blob(['legacy-drink'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, { ...img, imageSynced: {} });

  await t.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, { beans: [], drinkLogs: [{ id: 'l1', revision: 2, photos: ['idb:drink-old'] }], brewPlans: [] });

  assert.equal(base.calls.uploaded.length, 1);
  assert.equal(base.calls.pushed.drinkLogs.length, 1);
  assert.equal(base.calls.pushed.drinkLogs[0].photos[0], R2_A);
  assert.equal(base.calls.pushed.drinkLogs[0].revision, 3);
});

test('image-mapping: 上传成功但 push 未被云端回显时，下轮仍会补推（防金菠萝缓存中毒）', async () => {
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['bag'], { type: 'image/webp' }));
  const imageSynced = {};

  // 第一轮：base 不回显该豆（模拟服务端 LWW 拒绝），只上传了 blob
  const base1 = mockBase();
  const t1 = createImageMappingTransport(base1, { ...img, imageSynced });
  const all = { beans: [{ id: 'b1', revision: 2, bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t1.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);
  assert.equal(imageSynced['idb:old'], undefined, '未回显 → 未确认');

  // 第二轮：换新 transport 复用同一持久映射，应仍然补推（不被“已上传”误跳过）
  const base2 = mockBase();
  const t2 = createImageMappingTransport(base2, { ...img, imageSynced });
  await t2.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);
  assert.equal(base2.calls.pushed.beans.length, 1, '未确认的图片应继续补推重试');
  assert.equal(base2.calls.pushed.beans[0].bagImagePath, R2_A);
});

test('image-mapping: 已确认（云端回显过）的图不再重复上传或补推', async () => {
  const base = mockBase();
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['bag'], { type: 'image/webp' }));
  const t = createImageMappingTransport(base, { ...img, imageSynced: { 'idb:old': R2_A } });

  const all = { beans: [{ id: 'b1', bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);

  assert.equal(base.calls.uploaded.length, 0, '已确认不再上传');
  assert.equal(base.calls.pushed.beans.length, 0, '已确认不再补推');
});

test('image-mapping: push 后 pull 拿回自己刚传的 r2 时复用原引用并确认，不重复落盘', async () => {
  const base = mockBase([{ id: 'b1', bagImagePath: R2_A, labelImagePath: '' }]);
  const img = mockImageStore();
  img.store.set('idb:old', new Blob(['bag'], { type: 'image/webp' }));
  const imageSynced = {};
  const t = createImageMappingTransport(base, { ...img, imageSynced });

  const all = { beans: [{ id: 'b1', bagImagePath: 'idb:old', labelImagePath: '' }], drinkLogs: [], brewPlans: [] };
  await t.push({ beans: [], drinkLogs: [], brewPlans: [] }, 0, all);
  const pulled = await t.pull(0);

  assert.equal(pulled.beans[0].bagImagePath, 'idb:old', 'pull 回来复用原本地引用');
  assert.equal(imageSynced['idb:old'], R2_A, 'pull 回显后才落持久层确认');
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
