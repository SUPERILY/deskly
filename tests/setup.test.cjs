const test = require('node:test');
const assert = require('node:assert');
const { parse, MAX_BYTES, FORMAT } = require('../electron/setup.cjs');

test('setup parse rejects oversized payloads or bad format', () => {
  const huge = 'x'.repeat(MAX_BYTES + 10);
  const resHuge = parse(huge);
  assert.strictEqual(resHuge.ok, false);
  assert.match(resHuge.error, /too big/i);

  const badApp = JSON.stringify({ app: 'NotDeskly', format: FORMAT, sections: {} });
  const resBadApp = parse(badApp);
  assert.strictEqual(resBadApp.ok, false);
  assert.match(resBadApp.error, /not a Deskly setup/i);

  const badFormat = JSON.stringify({ app: 'Deskly', format: FORMAT + 1, sections: {} });
  const resBadFormat = parse(badFormat);
  assert.strictEqual(resBadFormat.ok, false);
  assert.match(resBadFormat.error, /newer Deskly/i);
});

test('setup parse sanitizes untrusted input strictly', () => {
  const untrusted = JSON.stringify({
    app: 'Deskly',
    format: FORMAT,
    exportedAt: '2026-11-01',
    version: '2.0.0',
    sections: {
      look: {
        prefs: {
          density: 'invalid-density', // Should be dropped
          layoutMode: 'hub',          // Should be kept
          panelOpacity: 9999,         // Out of range (0.3 - 1), should be dropped
          snap: true,                 // Should be kept
          maliciousKey: 'malicious',  // Unknown, should be dropped
        },
      },
      workspaces: {
        'my-project': {
          editor: true,
          terminal: false,
          urls: ['https://valid.com', 'javascript:alert(1)', 'ftp://bad.com'], // Only https/http kept
          start: 'npm run dev',
        },
      },
    },
  });

  const parsed = parse(untrusted);
  assert.strictEqual(parsed.ok, true);
  const lookPrefs = parsed.doc.sections.look.prefs;
  assert.strictEqual(lookPrefs.layoutMode, 'hub');
  assert.strictEqual(lookPrefs.snap, true);
  assert.strictEqual(lookPrefs.density, undefined);
  assert.strictEqual(lookPrefs.panelOpacity, undefined);
  assert.strictEqual(lookPrefs.maliciousKey, undefined);

  const ws = parsed.doc.sections.workspaces['my-project'];
  assert.strictEqual(ws.urls.length, 1);
  assert.strictEqual(ws.urls[0], 'https://valid.com');
  assert.strictEqual(ws.start, 'npm run dev');
});
