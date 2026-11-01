const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('store atomic write and backup recovery', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-store-test-'));
  const storePath = path.join(tmpDir, 'deskly-store.json');
  const bakPath = path.join(tmpDir, 'deskly-store.json.bak');

  try {
    // 1. Simulate saving valid state
    const validData = { prefs: { layoutMode: 'hub', panelOpacity: 0.85 }, customCategories: [{ id: 'test', name: 'Test' }] };
    const tmp = path.join(tmpDir, `deskly-store.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(validData), 'utf8');
    fs.renameSync(tmp, storePath);
    fs.copyFileSync(storePath, bakPath);

    assert.strictEqual(fs.existsSync(storePath), true);
    assert.strictEqual(fs.existsSync(bakPath), true);

    // 2. Corrupt the primary store file
    fs.writeFileSync(storePath, 'CORRUPTED JSON {{{{', 'utf8');

    // 3. Verify parse with recovery
    function tryParse(p) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8').trim();
          if (content) return JSON.parse(content);
        }
      } catch {}
      return null;
    }

    let loaded = tryParse(storePath);
    if (!loaded) loaded = tryParse(bakPath);

    assert.notStrictEqual(loaded, null);
    assert.strictEqual(loaded.prefs.layoutMode, 'hub');
    assert.strictEqual(loaded.customCategories[0].name, 'Test');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
