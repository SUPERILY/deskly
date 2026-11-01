const test = require('node:test');
const assert = require('node:assert/strict');
const { WIDGETS, byId, isWidget } = require('../electron/widgets.cjs');
const { dimsOf } = require('../electron/panels.cjs');
const setup = require('../electron/setup.cjs');

test('widgets: w_capture is registered and valid', () => {
  assert.equal(isWidget('w_capture'), true);
  const w = byId['w_capture'];
  assert.ok(w);
  assert.equal(w.id, 'w_capture');
  assert.equal(w.icon, 'Camera');
  assert.equal(w.w, 340);
  assert.equal(w.h, 280);
});

test('widgets: dimsOf correctly sizes w_capture and other widgets', () => {
  const d = dimsOf({ widget: 'w_capture' });
  assert.equal(d.w, 340);
  assert.equal(d.h, 280);

  const collapsed = dimsOf({ widget: 'w_capture', collapsed: true });
  assert.equal(collapsed.w, 340);
  assert.equal(collapsed.h, 56 + 8 * 2); // HEAD + MARGIN * 2

  const custom = dimsOf({ widget: 'w_capture', customW: 460, customH: 380 });
  assert.equal(custom.w, 460);
  assert.equal(custom.h, 380);

  const customCollapsed = dimsOf({ widget: 'w_capture', customW: 460, customH: 380, collapsed: true });
  assert.equal(customCollapsed.w, 460);
  assert.equal(customCollapsed.h, 56 + 8 * 2);
});

test('widgets: setup sanitizes w_capture widget preference', () => {
  const raw = {
    widgets: {
      w_sys: true,
      w_dev: false,
      w_capture: true,
      invalid_widget: true,
    },
  };
  const cleaned = setup._cleanPrefs(raw);
  assert.equal(cleaned.widgets.w_sys, true);
  assert.equal(cleaned.widgets.w_dev, false);
  assert.equal(cleaned.widgets.w_capture, true);
  assert.equal(cleaned.widgets.invalid_widget, undefined);
});
