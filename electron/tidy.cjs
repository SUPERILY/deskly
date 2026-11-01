// "Tidy desktop": move loose shortcuts/files into one folder per category.
// Safe by design: never deletes, never touches folders or secrets, skips name
// clashes, and every batch can be undone.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Public Desktop items can only be moved when Deskly runs as administrator.
function plan(items, categories, primary, elevated = false) {
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const moves = [];
  const skipped = { sensitive: [], publicItems: [], folders: 0, clashes: [] };

  for (const it of items) {
    if (it.kind === 'special') continue; // This PC, Recycle Bin
    if (it.kind === 'dir') {
      skipped.folders++;
      continue;
    }
    if (it.sensitive) {
      skipped.sensitive.push(it.name);
      continue;
    }
    if (it.owner !== 'user' && !elevated) {
      skipped.publicItems.push(it.name);
      continue;
    }
    const folder = nameOf.get(it.category) || 'Other';
    const destDir = path.join(primary, folder);
    const to = path.join(destDir, it.file);
    if (path.resolve(it.path).toLowerCase() === path.resolve(to).toLowerCase()) continue;
    if (fs.existsSync(to)) {
      skipped.clashes.push(it.name);
      continue;
    }
    moves.push({ key: it.key, name: it.name, icon: it.icon, cat: it.category, folder, from: it.path, to });
  }

  const groups = {};
  for (const m of moves) (groups[m.cat] ||= { cat: m.cat, folder: m.folder, moves: [] }).moves.push(m);
  return { moves, groups: Object.values(groups), skipped };
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

function apply(moves, store) {
  const done = [];
  const createdDirs = [];
  for (const m of moves) {
    try {
      const dir = path.dirname(m.to);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        createdDirs.push(dir);
      }
      if (fs.existsSync(m.to) || !fs.existsSync(m.from)) continue;
      moveFile(m.from, m.to);
      done.push({ from: m.from, to: m.to });
      if (!store.managedDirs.some((d) => d.path.toLowerCase() === dir.toLowerCase())) {
        store.managedDirs.push({ path: dir, cat: m.cat });
      }
    } catch (e) {
      console.error('move failed', m.from, e.message);
    }
  }
  const batch = { id: crypto.randomUUID(), ts: Date.now(), moves: done, dirs: createdDirs };
  if (done.length) store.tidyHistory.push(batch);
  return { moved: done.length, batch };
}

function undo(store) {
  const batch = store.tidyHistory.pop();
  if (!batch) return { restored: 0 };
  let restored = 0;
  const failed = [];
  for (const m of [...batch.moves].reverse()) {
    try {
      if (fs.existsSync(m.to) && !fs.existsSync(m.from)) {
        moveFile(m.to, m.from);
        restored++;
      }
    } catch (e) {
      console.error('undo failed', m.to, e.message);
      failed.push(m); // e.g. a Public Desktop item while not running as admin
    }
  }
  // Keep what could not be restored so a later undo (as admin) can finish the job.
  if (failed.length) {
    store.tidyHistory.push({ ...batch, moves: failed.reverse() });
  }
  for (const dir of batch.dirs) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
    if (!fs.existsSync(dir)) {
      store.managedDirs = store.managedDirs.filter((d) => d.path.toLowerCase() !== dir.toLowerCase());
    }
  }
  return { restored, failed: failed.length };
}

module.exports = { plan, apply, undo };
