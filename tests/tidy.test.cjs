const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { plan } = require('../electron/tidy.cjs');

test('tidy plan skips sensitive files, directories, and un-elevated public items', () => {
  const categories = [
    { id: 'dev', name: 'Dev' },
    { id: 'work', name: 'Work' },
    { id: 'folders', name: 'Folders' },
  ];
  const primaryDesktop = 'C:\\Users\\Test\\Desktop';

  const items = [
    { key: 'secret', name: 'client_secret.json', file: 'client_secret.json', kind: 'file', sensitive: true, owner: 'user', category: 'dev', path: path.join(primaryDesktop, 'client_secret.json') },
    { key: 'myfolder', name: 'Projects', file: 'Projects', kind: 'dir', sensitive: false, owner: 'user', category: 'folders', path: path.join(primaryDesktop, 'Projects') },
    { key: 'publicapp', name: 'PublicApp.lnk', file: 'PublicApp.lnk', kind: 'shortcut', sensitive: false, owner: 'public', category: 'work', path: 'C:\\Users\\Public\\Desktop\\PublicApp.lnk' },
    { key: 'normal', name: 'App.lnk', file: 'App.lnk', kind: 'shortcut', sensitive: false, owner: 'user', category: 'dev', path: path.join(primaryDesktop, 'App.lnk') },
  ];

  const p = plan(items, categories, primaryDesktop, false);

  assert.strictEqual(p.moves.length, 1);
  assert.strictEqual(p.moves[0].key, 'normal');
  assert.strictEqual(p.moves[0].to, path.join(primaryDesktop, 'Dev', 'App.lnk'));

  assert.strictEqual(p.skipped.sensitive.length, 1);
  assert.strictEqual(p.skipped.sensitive[0], 'client_secret.json');

  assert.strictEqual(p.skipped.folders, 1);

  assert.strictEqual(p.skipped.publicItems.length, 1);
  assert.strictEqual(p.skipped.publicItems[0], 'PublicApp.lnk');
});
