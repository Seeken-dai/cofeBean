'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'www', 'app.js'), 'utf8');

test('plan import/bind bean pickers only list vault 在饮 beans via activeVaultBeans', () => {
  assert.match(appSource, /function activeVaultBeans\(\) \{[\s\S]*?BeanCore\.filterAndSort\([\s\S]*?status:\s*'在饮'/);
  assert.match(appSource, /function renderPlanBeanBind\(selected\) \{[\s\S]*?const beans = activeVaultBeans\(\);/);
  assert.match(appSource, /function fillPlanImportBeans\(\) \{[\s\S]*?const beans = activeVaultBeans\(\);/);
  const bindBody = appSource.match(/function renderPlanBeanBind\(selected\) \{[\s\S]*?\n  function /)[0];
  const importBody = appSource.match(/function fillPlanImportBeans\(\) \{[\s\S]*?\n  function /)[0];
  assert.doesNotMatch(bindBody, /drinkableBeans\(/);
  assert.doesNotMatch(importBody, /drinkableBeans\(/);
  assert.doesNotMatch(bindBody, /state\.beans\.map/);
  assert.doesNotMatch(importBody, /state\.beans\.filter\(\(bean\) => !bean\.deletedAt\)/);
});
