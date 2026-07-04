const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../www/data-core.js');

// 无图豆子生成式占位参数（UI 2.0.8 项 1.5 方案 B）。纯函数，须确定性、双端一致。

test('beanPlaceholder 对同一颗豆确定性稳定', () => {
  const bean = { id: 'bean-abc', name: '耶加雪菲', roastLevel: '中烘' };
  const a = core.beanPlaceholder(bean);
  const b = core.beanPlaceholder({ ...bean });
  assert.deepEqual(a, b);
});

test('beanPlaceholder 取豆名首字为字纹，支持含空白与 emoji', () => {
  assert.equal(core.beanPlaceholder({ id: '1', name: '  瑰夏 ' }).glyph, '瑰');
  assert.equal(core.beanPlaceholder({ id: '2', name: '🌸 花魁' }).glyph, '🌸');
});

test('beanPlaceholder 空豆名回落到「豆」字', () => {
  assert.equal(core.beanPlaceholder({ id: '3', name: '   ' }).glyph, '豆');
  assert.equal(core.beanPlaceholder({ id: '4' }).glyph, '豆');
  assert.equal(core.beanPlaceholder(null).glyph, '豆');
});

test('beanPlaceholder 按烘焙度映射底色档位，未知/缺失回落中性', () => {
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '浅烘' }).roastKey, 'light');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '中浅烘' }).roastKey, 'medium-light');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '中烘' }).roastKey, 'medium');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '中深烘' }).roastKey, 'medium-dark');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '深烘' }).roastKey, 'dark');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '' }).roastKey, 'neutral');
  assert.equal(core.beanPlaceholder({ id: 'a', roastLevel: '炭烧' }).roastKey, 'neutral');
});

test('beanPlaceholder 派生量落在约定范围内', () => {
  for (let i = 0; i < 200; i += 1) {
    const p = core.beanPlaceholder({ id: 'bean-' + i, name: '豆' + i });
    assert.ok(p.variant >= 0 && p.variant < 4, 'variant 0-3');
    assert.ok(p.angle >= 0 && p.angle < 360, 'angle 0-359');
    assert.ok(p.shift >= 0 && p.shift < 100, 'shift 0-99');
    assert.ok(Number.isInteger(p.hash) && p.hash >= 0, 'hash 非负整数');
  }
});

test('beanPlaceholder 不同豆子 variant 有分布（非恒定）', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) seen.add(core.beanPlaceholder({ id: 'x' + i }).variant);
  assert.ok(seen.size > 1, '至少出现两种 variant');
});
