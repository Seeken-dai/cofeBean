const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../www/coffee-parser.js');

test('parses common bilingual coffee label fields offline', () => {
  const scan = { width: 1200, height: 1800, lines: [
    { text: 'MAME', left: 420, top: 120, right: 780, bottom: 220 },
    { text: '花魁 7.0', left: 330, top: 260, right: 870, bottom: 390 },
    { text: 'ETHIOPIA GUJI', left: 390, top: 520, right: 810, bottom: 580 },
    { text: 'Natural Process 浅烘', left: 330, top: 640, right: 870, bottom: 700 },
    { text: 'Roast Date: 2026-06-20', left: 300, top: 900, right: 900, bottom: 960 },
    { text: 'Net Weight 200g', left: 390, top: 1040, right: 810, bottom: 1100 },
    { text: 'Notes: Jasmine, Citrus, Honey', left: 270, top: 1180, right: 930, bottom: 1240 }
  ] };
  const result = parser.parse(scan, { knownRoasters: ['MAME'] });
  assert.equal(result.fields.name, '花魁 7.0');
  assert.equal(result.fields.roaster, 'MAME');
  assert.equal(result.fields.origin, '埃塞俄比亚');
  assert.equal(result.fields.process, '日晒');
  assert.equal(result.fields.roastLevel, '浅烘');
  assert.equal(result.fields.roastDate, '2026-06-20');
  assert.equal(result.fields.initialWeight, 200);
  assert.equal(result.fields.remainingWeight, 200);
  assert.equal(result.fields.tastingNotes, 'Jasmine, Citrus, Honey');
});

test('normalizes supported roast date formats', () => {
  assert.equal(parser.isoDate('2026年6月2日'), '2026-06-02');
  assert.equal(parser.isoDate('06/02/26'), '2026-06-02');
});

test('collects multiline flavor notes and stops before metadata', () => {
  const result = parser.parse({ width: 1000, height: 1600, lines: [
    { text: 'Tasting Notes', left: 100, top: 700, right: 500, bottom: 750 },
    { text: 'Jasmine · Citrus', left: 100, top: 760, right: 700, bottom: 810 },
    { text: 'Peach and Honey', left: 100, top: 820, right: 700, bottom: 870 },
    { text: 'Roast Date 2026-06-20', left: 100, top: 900, right: 800, bottom: 950 }
  ] }, {});
  assert.equal(result.fields.tastingNotes, 'Jasmine · Citrus · Peach and Honey');
});

test('uses multiple flavor terms as a fallback without a notes heading', () => {
  const result = parser.parse({ width: 1000, height: 1600, lines: [
    { text: 'Jasmine, Citrus, Peach', left: 100, top: 700, right: 700, bottom: 760 }
  ] }, {});
  assert.equal(result.fields.tastingNotes, 'Jasmine, Citrus, Peach');
  assert.ok(result.confidence.tastingNotes < .65);
});

test('parses YE Coffee table-style labels', () => {
  const result = parser.parse({ width: 1080, height: 1920, lines: [
    { text: 'ROASTED COFFEE', left: 285, top: 980, right: 980, bottom: 1040 },
    { text: '伊迪朵·耶加雪菲', left: 520, top: 1110, right: 770, bottom: 1160 },
    { text: 'IDIDO YEGACHEFFI', left: 535, top: 1160, right: 765, bottom: 1190 },
    { text: '风味 茉莉花 青苹果 葡萄柚', left: 275, top: 1260, right: 720, bottom: 1320 },
    { text: '原产地 埃塞俄比亚', left: 276, top: 1360, right: 610, bottom: 1415 },
    { text: '处理方式 水洗处理', left: 276, top: 1460, right: 620, bottom: 1515 },
    { text: '净含量 100克 227克', left: 276, top: 1560, right: 680, bottom: 1615 },
    { text: '烘焙度 浅度烘焙 LIGHT ROAST', left: 770, top: 1270, right: 1010, bottom: 1430 }
  ] }, {});
  assert.equal(result.fields.name, '伊迪朵·耶加雪菲');
  assert.equal(result.fields.origin, '埃塞俄比亚');
  assert.equal(result.fields.process, '水洗');
  assert.equal(result.fields.roastLevel, '浅烘');
  assert.equal(result.fields.initialWeight, 227);
  assert.equal(result.fields.tastingNotes, '茉莉花 青苹果 葡萄柚');
});

test('parses city roast and natural process labels', () => {
  const result = parser.parse({ width: 1080, height: 1920, lines: [
    { text: '花魁·SOE', left: 520, top: 1070, right: 750, bottom: 1135 },
    { text: 'ROSE·GUJI·SOE', left: 545, top: 1140, right: 735, bottom: 1175 },
    { text: '风味 花香 水蜜桃 红酒', left: 278, top: 1250, right: 660, bottom: 1315 },
    { text: '原产地 埃塞俄比亚', left: 278, top: 1360, right: 610, bottom: 1415 },
    { text: '处理方式 日晒处理', left: 278, top: 1460, right: 620, bottom: 1515 },
    { text: '净含量 227克/包', left: 278, top: 1560, right: 620, bottom: 1615 },
    { text: '烘焙度 中深度烘焙 CITY ROAST', left: 770, top: 1280, right: 1010, bottom: 1460 }
  ] }, {});
  assert.equal(result.fields.name, '花魁·SOE');
  assert.equal(result.fields.process, '日晒');
  assert.equal(result.fields.roastLevel, '中深烘');
  assert.equal(result.fields.initialWeight, 227);
  assert.equal(result.fields.tastingNotes, '花香 水蜜桃 红酒');
});

test('parses Origin horizontal information labels', () => {
  const result = parser.parse({ width: 960, height: 1280, lines: [
    { text: '金菠萝', left: 70, top: 120, right: 280, bottom: 190 },
    { text: '黑咖 香水凤梨 + 草莓 + 深色莓果', left: 230, top: 365, right: 730, bottom: 410 },
    { text: '奶咖 芒果软糖 + 芝士蛋糕', left: 260, top: 420, right: 690, bottom: 465 },
    { text: '[产国] 埃塞俄比亚 [产区] 盖迪欧, Wenago, Adame', left: 185, top: 560, right: 830, bottom: 600 },
    { text: '[庄园] Adame Station [海拔] 1900 米 [豆种] Wolisho [处理] 日晒', left: 95, top: 620, right: 860, bottom: 660 },
    { text: '浅度烘焙', left: 540, top: 910, right: 670, bottom: 950 },
    { text: '净含量：200g', left: 550, top: 1110, right: 820, bottom: 1160 }
  ] }, {});
  assert.equal(result.fields.name, '金菠萝');
  assert.equal(result.fields.origin, '埃塞俄比亚');
  assert.equal(result.fields.process, '日晒');
  assert.equal(result.fields.roastLevel, '浅烘');
  assert.equal(result.fields.initialWeight, 200);
  assert.match(result.fields.tastingNotes, /香水凤梨/);
});
