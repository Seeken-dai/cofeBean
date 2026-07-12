'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const widgetIntent = require('../www/app-widget-intent.js');

test('widget intent: parses the two supported quick drink actions', () => {
  assert.equal(widgetIntent.parseAction('coffeebean://quick-drink/bean'), 'bean');
  assert.equal(widgetIntent.parseAction('coffeebean://quick-drink/external'), 'external');
  assert.equal(widgetIntent.parseAction('coffeebean://quick-drink/bean/'), 'bean');
});

test('widget intent: rejects unknown or unrelated URLs', () => {
  assert.equal(widgetIntent.parseAction('coffeebean://quick-drink/delete'), null);
  assert.equal(widgetIntent.parseAction('https://quick-drink/bean'), null);
  assert.equal(widgetIntent.parseAction('coffeebean://other/bean'), null);
  assert.equal(widgetIntent.parseAction('not a url'), null);
  assert.equal(widgetIntent.parseAction(null), null);
});
