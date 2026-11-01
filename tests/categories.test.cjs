const test = require('node:test');
const assert = require('node:assert');
const { categorize, isSensitive, matchRule, userCategory, BUILTIN } = require('../electron/categories.cjs');

test('isSensitive flags sensitive credentials and secrets', () => {
  assert.strictEqual(isSensitive('client_secret_12345.json'), true);
  assert.strictEqual(isSensitive('.env'), true);
  assert.strictEqual(isSensitive('.env.local'), true);
  assert.strictEqual(isSensitive('id_rsa'), true);
  assert.strictEqual(isSensitive('server.pem'), true);
  assert.strictEqual(isSensitive('my_api_key.txt'), true);
  assert.strictEqual(isSensitive('passwords.kdbx'), true);

  assert.strictEqual(isSensitive('project_notes.txt'), false);
  assert.strictEqual(isSensitive('README.md'), false);
  assert.strictEqual(isSensitive('game_shortcut.lnk'), false);
});

test('categorize classifies built-in apps and files correctly', () => {
  // Directories always go to folders
  assert.strictEqual(categorize({ kind: 'dir', file: 'Projects' }), 'folders');

  // Dev tools
  assert.strictEqual(categorize({ kind: 'shortcut', base: 'Visual Studio Code', file: 'Visual Studio Code.lnk' }), 'dev');
  assert.strictEqual(categorize({ kind: 'shortcut', base: 'Antigravity', file: 'Antigravity.lnk' }), 'dev');

  // Games
  assert.strictEqual(categorize({ kind: 'shortcut', base: 'Steam', file: 'Steam.lnk' }), 'games');
  assert.strictEqual(categorize({ kind: 'shortcut', base: 'Epic Games Launcher', file: 'Epic Games Launcher.lnk' }), 'games');

  // Web
  assert.strictEqual(categorize({ kind: 'shortcut', base: 'Google Chrome', file: 'Google Chrome.lnk' }), 'web');

  // Media
  assert.strictEqual(categorize({ kind: 'file', file: 'song.mp3' }), 'media');
  assert.strictEqual(categorize({ kind: 'file', file: 'movie.mp4' }), 'media');

  // Documents
  assert.strictEqual(categorize({ kind: 'file', file: 'report.pdf' }), 'files');
});

test('matchRule handles operators correctly', () => {
  const ruleContains = { field: 'name', op: 'contains', value: 'script', cat: 'dev', enabled: true };
  assert.strictEqual(matchRule(ruleContains, { base: 'My Script File' }), true);
  assert.strictEqual(matchRule(ruleContains, { base: 'Document' }), false);

  const ruleStarts = { field: 'name', op: 'startsWith', value: 'Report', cat: 'work', enabled: true };
  assert.strictEqual(matchRule(ruleStarts, { base: 'Report_2026' }), true);
  assert.strictEqual(matchRule(ruleStarts, { base: 'Annual_Report' }), false);

  const ruleExt = { field: 'ext', op: 'equals', value: 'pdf', cat: 'files', enabled: true };
  assert.strictEqual(matchRule(ruleExt, { ext: '.pdf' }), true);
  assert.strictEqual(matchRule(ruleExt, { ext: '.docx' }), false);

  const ruleRegex = { field: 'name', op: 'regex', value: '^v\\d+\\.', cat: 'dev', enabled: true };
  assert.strictEqual(matchRule(ruleRegex, { base: 'v2.0.0_release' }), true);
  assert.strictEqual(matchRule(ruleRegex, { base: 'beta_v1' }), false);
});
