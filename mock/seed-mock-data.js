/*
 * 豆仓 Web 预览 Mock 数据
 * 用法：浏览器打开 http://localhost:4178/ → 按 F12 打开控制台（Console）
 *      → 把本文件内容整段粘贴、回车。页面会自动刷新并载入示例数据。
 * 清空：localStorage.removeItem('coffee-vault-browser-preview'); location.reload();
 *
 * 仅用于开发预览：数据写入浏览器 localStorage，不影响 Android 真机 SQLite。
 */
(function () {
  'use strict';
  var WEB_KEY = 'coffee-vault-browser-preview';

  // 用紧凑的 SVG data-URL 模拟包装袋图片：
  // 咖啡豆记录里的图片路径会被规范化截断到 1000 字符（真机上是短文件路径），
  // 因此这里不能用动辄上万字符的位图 data-URL，改用矢量 SVG（约 800 字符以内）。
  function bagImage(name, sub, tone) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450'>" +
      "<rect width='300' height='450' fill='" + tone + "'/>" +
      "<rect x='18' y='18' width='264' height='414' rx='10' fill='none' stroke='%23e8d9c4' stroke-width='4'/>" +
      "<rect x='42' y='66' width='216' height='66' fill='rgba(0,0,0,0.2)'/>" +
      "<text x='150' y='250' font-size='46' fill='%23f3e9d8' text-anchor='middle' font-family='sans-serif'>" + name + "</text>" +
      "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  var beans = [
    { id: 'bean-huakui', name: '花魁', roaster: '豆仓烘焙所', origin: '埃塞俄比亚 耶加雪菲', process: '水洗', roastLevel: '浅中烘', roastDate: '2026-06-01', openedDate: '2026-06-10', initialWeight: 200, remainingWeight: 118, price: 88, tastingNotes: '柑橘 · 白花 · 蜂蜜 · 茶感', status: '饮用中', favorite: true, bagImagePath: bagImage('花魁', '埃塞俄比亚 耶加雪菲', '#5b3a26') },
    { id: 'bean-geisha', name: '瑰夏', roaster: '晨光烘焙', origin: '巴拿马 翡翠庄园', process: '水洗', roastLevel: '浅烘', roastDate: '2026-06-18', initialWeight: 100, remainingWeight: 100, price: 220, tastingNotes: '茉莉 · 佛手柑 · 蜜桃 · 红茶', status: '未开封', favorite: true, bagImagePath: bagImage('瑰夏', '巴拿马 翡翠庄园', '#3f5340') },
    { id: 'bean-mandheling', name: '曼特宁', roaster: '南洋焙坊', origin: '印尼 苏门答腊', process: '湿刨', roastLevel: '深烘', roastDate: '2026-05-12', openedDate: '2026-05-20', initialWeight: 250, remainingWeight: 64, price: 90, tastingNotes: '黑巧 · 草本 · 烟熏', status: '饮用中', favorite: false },
    { id: 'bean-sidamo', name: '西达摩', roaster: '豆仓烘焙所', origin: '埃塞俄比亚 西达摩', process: '日晒', roastLevel: '中烘', roastDate: '2026-03-08', openedDate: '2026-03-15', initialWeight: 200, remainingWeight: 0, price: 78, tastingNotes: '蓝莓 · 红酒 · 发酵感', status: '已喝完', favorite: false },
    { id: 'bean-huila', name: '哥伦比亚 蕙兰', roaster: '山城咖啡', origin: '哥伦比亚 蕙兰', process: '水洗', roastLevel: '中深烘', roastDate: '2026-06-08', openedDate: '2026-06-12', initialWeight: 227, remainingWeight: 150, price: 85, tastingNotes: '焦糖 · 坚果 · 橙皮', status: '饮用中', favorite: false },
    { id: 'bean-antigua', name: '危地马拉 安提瓜', roaster: '晨光烘焙', origin: '危地马拉 安提瓜', process: '水洗', roastLevel: '中烘', roastDate: '2026-06-20', initialWeight: 200, remainingWeight: 200, price: 95, tastingNotes: '可可 · 太妃糖 · 柑橘', status: '未开封', favorite: false },
    { id: 'bean-kenya', name: '肯尼亚 AA', roaster: '豆仓烘焙所', origin: '肯尼亚 涅里', process: '水洗', roastLevel: '浅中烘', roastDate: '2026-05-28', openedDate: '2026-06-02', initialWeight: 200, remainingWeight: 88, price: 130, tastingNotes: '黑加仑 · 番茄 · 莓果 · 明亮酸', status: '饮用中', favorite: true },
    { id: 'bean-yunnan', name: '云南 保山', roaster: '山城咖啡', origin: '中国 云南 保山', process: '蜜处理', roastLevel: '中烘', roastDate: '2026-02-10', openedDate: '2026-02-14', initialWeight: 200, remainingWeight: 0, price: 60, tastingNotes: '红糖 · 柑橘 · 花香', status: '已喝完', favorite: false }
  ];

  var v60Plan = { id: 'plan-huakui-v60', name: '花魁 V60 三段式', brewMethod: '手冲', source: 'user', dose: 15, ratio: '1:15', totalWater: 225, waterTemp: '92°C', grinder: 'C40', grindSetting: '22 格', targetDuration: '2:30', notes: '浅中烘耶加雪菲，前段拉花香，后段控制甜感。', beanIds: ['bean-huakui'],
    steps: [
      { label: '闷蒸', water: 30, startTime: '0:00', endTime: '0:30', time: '0:00-0:30', note: '绕圈注水至 30g' },
      { label: '第 1 段', water: 100, startTime: '0:30', endTime: '1:00', time: '0:30-1:00', note: '注水至 100g' },
      { label: '第 2 段', water: 150, startTime: '1:00', endTime: '1:30', time: '1:00-1:30', note: '注水至 150g' },
      { label: '第 3 段', water: 225, startTime: '1:30', endTime: '2:00', time: '1:30-2:00', note: '注水至 225g' },
      { label: '结束萃取', water: 0, startTime: '2:00', endTime: '2:30', time: '2:00-2:30', note: '等待滴滤完成' }
    ] };
  var kenyaPlan = { id: 'plan-kenya-pour', name: '肯尼亚 明亮四段', brewMethod: '手冲', source: 'user', dose: 16, ratio: '1:16', totalWater: 256, waterTemp: '90°C', grinder: 'C40', grindSetting: '20 格', targetDuration: '2:45', notes: '突出莓果与酸质。', beanIds: ['bean-kenya'],
    steps: [
      { label: '闷蒸', water: 32, startTime: '0:00', endTime: '0:35', time: '0:00-0:35', note: '闷蒸 32g' },
      { label: '第 1 段', water: 120, startTime: '0:35', endTime: '1:10', time: '0:35-1:10', note: '注水至 120g' },
      { label: '第 2 段', water: 190, startTime: '1:10', endTime: '1:45', time: '1:10-1:45', note: '注水至 190g' },
      { label: '第 3 段', water: 256, startTime: '1:45', endTime: '2:20', time: '1:45-2:20', note: '注水至 256g' }
    ] };
  var espressoPlan = { id: 'plan-espresso', name: '曼特宁 意式日常', brewMethod: '意式', source: 'user', dose: 18, ratio: '1:2', waterTemp: '93°C', grinder: '意式磨', grindSetting: '细', coffeeMachine: '家用半自动', basket: '18g 双份', targetYield: 36, targetExtractionTime: '28s', notes: '深烘打浓缩，奶咖基底。', beanIds: ['bean-mandheling'] };
  var brewPlans = [v60Plan, kenyaPlan, espressoPlan];

  var methods = ['手冲', '意式', '法压', '冷萃', '爱乐压'];
  var noteBank = ['今天状态不错，甜感清晰', '酸质明亮，回甘持久', '闷蒸再久一点会更好', '奶咖基底，顺滑', '尾段略涩，下次调粗一点', '花香突出，很惊艳', ''];
  var activeBeans = beans.filter(function (b) { return b.status !== '未开封'; });
  function iso(y, m, d, hh, mm) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00'; }
  var logs = []; var n = 0;
  function pushLog(y, m, d, hh, mm, beanIdx, extra) {
    var bean = activeBeans[beanIdx % activeBeans.length];
    var base = { id: 'log-' + (++n), beanId: bean.id, beanName: bean.name, grams: 14 + (n % 5), brewMethod: methods[n % methods.length], overallRating: 3 + (n % 3), notes: noteBank[n % noteBank.length], consumedAt: iso(y, m, d, hh, mm) };
    logs.push(Object.assign(base, extra || {}));
  }
  var monthDays = { 1: [5, 12, 19, 26], 2: [3, 9, 17, 24], 3: [2, 8, 15, 22, 28], 4: [4, 11, 18, 25], 5: [1, 7, 14, 21, 27], 6: [1, 4, 8, 11, 15] };
  Object.keys(monthDays).forEach(function (mk) { var m = Number(mk); monthDays[m].forEach(function (d, i) { pushLog(2026, m, d, 8 + (i % 10), (i * 13) % 60, i + m); }); });
  // 最近连续 8 天（截至 2026-06-29），用于「连续天数」与月历/年历验证
  for (var d = 22; d <= 29; d++) {
    pushLog(2026, 6, d, 8, 15 + d % 30, d, d % 3 === 0 ? { brewMethod: '手冲', brewPlanId: v60Plan.id, brewPlanName: v60Plan.name, brewPlanVersion: 1, brewPlanSnapshot: v60Plan, aroma: 4, acidity: 4, sweetness: 5, body: 3, aftertaste: 4, balance: 4, bitterness: 2 } : {});
  }
  pushLog(2026, 6, 29, 13, 45, 1, { brewMethod: '意式', notes: '下午第二杯，奶咖' });

  var settings = { quickGrams: 15, enableBrewPlans: true, advancedRatings: true, priceUnit: '100g', theme: 'dark-roast', lastBrewMethod: '手冲' };

  localStorage.setItem(WEB_KEY, JSON.stringify({ beans: beans, drinkLogs: logs, brewPlans: brewPlans, settings: settings }));
  console.log('[豆仓] 已写入示例数据：' + beans.length + ' 款豆、' + logs.length + ' 杯记录、' + brewPlans.length + ' 个方案。即将刷新…');
  location.reload();
})();
