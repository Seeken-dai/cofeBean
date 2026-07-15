'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/subject-crop-core.js');

test('normalizePoint 限制无效和越界坐标', () => {
  assert.deepEqual(core.normalizePoint({ x: -1, y: 2 }), { x: 0, y: 1 });
  assert.deepEqual(core.normalizePoint({}), { x: 0.5, y: 0.5 });
});

test('computeMaskBounds 加入比例边距并限制在图像内', () => {
  const mask = new Float32Array(100);
  for (let y = 2; y <= 7; y += 1) for (let x = 3; x <= 6; x += 1) mask[y * 10 + x] = 1;
  const bounds = core.computeMaskBounds(mask, 10, 10, { threshold: 0.5, marginRatio: 0.2 });
  assert.deepEqual(bounds.subject, { x: 3, y: 2, width: 4, height: 6 });
  assert.deepEqual({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, { x: 2, y: 1, width: 6, height: 8 });
  assert.equal(bounds.selectedPixels, 24);
});

test('computeMaskBounds 对空 Mask 返回 null', () => {
  assert.equal(core.computeMaskBounds(new Float32Array(4), 2, 2), null);
});

test('边缘补位只恢复被图片边界截掉的留白', () => {
  const padding = core.computeEdgePadding({ x: 0, y: 1, width: 6, height: 8, subject: { x: 0, y: 3, width: 4, height: 4 } }, 2);
  assert.deepEqual(padding, { left: 2, top: 0, right: 0, bottom: 0 });
});

test('裁切区已有足够留白时不额外补位', () => {
  const padding = core.computeEdgePadding({ x: 2, y: 2, width: 8, height: 8, subject: { x: 4, y: 4, width: 4, height: 4 } }, 2);
  assert.deepEqual(padding, { left: 0, top: 0, right: 0, bottom: 0 });
});

test('alpha 在阈值附近平滑过渡', () => {
  const alpha = core.buildAlphaValues(new Float32Array([0, 0.5, 1]), 3, 1, { threshold: 0.5, softness: 0.1 });
  assert.deepEqual([...alpha], [0, 128, 255]);
  assert.equal(core.smoothstep(0, 1, 0.5), 0.5);
});

test('纸边 alpha 只使用全透明或全不透明', () => {
  const alpha = core.buildOpaqueAlphaValues(new Float32Array([0.49, 0.5, 0.7]), 3, 1, { threshold: 0.5 });
  assert.deepEqual([...alpha], [0, 255, 255]);
});

test('连通域只保留包含提示点的主体', () => {
  const mask = new Float32Array([1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1]);
  const connected = core.keepConnectedComponent(mask, 5, 3, { x: 0.1, y: 0.2 }, { threshold: 0.5 });
  assert.deepEqual([...connected], [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('提示点恰好落在空洞时查找附近种子', () => {
  const mask = new Float32Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  const connected = core.keepConnectedComponent(mask, 3, 3, { x: 0.5, y: 0.5 }, { threshold: 0.5, maxSeedDistance: 1 });
  assert.equal([...connected].filter(Boolean).length, 8);
});

test('撕纸边偏移可复现且接近指定半径', () => {
  const first = core.buildPaperEdgeOffsets(20, { steps: 32, roughness: 0.2 });
  assert.deepEqual(first, core.buildPaperEdgeOffsets(20, { steps: 32, roughness: 0.2 }));
  assert.equal(first.length, 33);
  assert.deepEqual(first[0], { x: 0, y: 0 });
  first.slice(1).forEach((offset) => assert.ok(Math.hypot(offset.x, offset.y) >= 16 && Math.hypot(offset.x, offset.y) <= 20));
});

test('撕纸边可关闭粗糙度用于对照', () => {
  const offsets = core.buildPaperEdgeOffsets(12, { steps: 16, roughness: 0 });
  assert.ok(offsets.slice(1).every((offset) => Math.abs(Math.hypot(offset.x, offset.y) - 12) < 1e-9));
});

test('formatBytes 输出紧凑资源大小', () => {
  assert.equal(core.formatBytes(28_643_783), '27.3 MB');
});
