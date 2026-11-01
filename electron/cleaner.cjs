// Space cleaner: finds rebuildable folders (node_modules, build caches...) and tool caches.
// Nothing is deleted without an explicit request, and only paths from the last scan are accepted.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { shell } = require('electron');

// `needs`: a file that must sit next to the folder, so we only touch real project output.
const JUNK = {
  node_modules: { label: 'node_modules', needs: ['package.json'], safe: true },
  '.next': { label: 'Next.js build cache', needs: ['package.json'], safe: true },
  '.nuxt': { label: 'Nuxt build cache', needs: ['package.json'], safe: true },
  '.turbo': { label: 'Turborepo cache', needs: [], safe: true },
  '.parcel-cache': { label: 'Parcel cache', needs: [], safe: true },
  '.svelte-kit': { label: 'SvelteKit build cache', needs: ['package.json'], safe: true },
  '.pytest_cache': { label: 'pytest cache', needs: [], safe: true },
  '.mypy_cache': { label: 'mypy cache', needs: [], safe: true },
  target: { label: 'Rust build output', needs: ['Cargo.toml'], safe: true },
  dist: { label: 'Build output (dist)', needs: ['package.json'], safe: false },
  release: { label: 'App packages (release)', needs: ['package.json'], safe: false },
};

const lad = process.env.LOCALAPPDATA || '';
const TOOL_CACHES = [
  { label: 'npm cache', p: path.join(lad, 'npm-cache') },
  { label: 'pip cache', p: path.join(lad, 'pip', 'Cache') },
  { label: 'Yarn cache', p: path.join(lad, 'Yarn', 'Cache') },
  { label: 'Electron downloads', p: path.join(lad, 'electron', 'Cache') },
  { label: 'electron-builder cache', p: path.join(lad, 'electron-builder', 'Cache') },
];

const exists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

async function dirSize(root) {
  let size = 0;
  let files = 0;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    await Promise.all(
      ents.map(async (e) => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile()) {
          try {
            size += (await fsp.stat(full)).size;
            files++;
          } catch {}
        }
      })
    );
  }
  return { size, files };
}

// Find candidate folders under the project roots (depth <= 3), never descending into the junk itself.
async function findCandidates(roots) {
  const found = [];
  const walk = async (dir, depth, project) => {
    let ents;
    try {
      ents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(ents.map((e) => e.name));
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const rule = JUNK[e.name];
      if (rule && rule.needs.every((n) => names.has(n))) {
        found.push({ path: path.join(dir, e.name), rule, project: path.basename(dir) });
        continue;
      }
      if (e.name === 'venv' || e.name === '.venv') {
        if (exists(path.join(dir, e.name, 'pyvenv.cfg'))) {
          found.push({ path: path.join(dir, e.name), rule: { label: 'Python virtualenv', safe: false }, project: path.basename(dir) });
        }
        continue;
      }
      if (depth < 3 && !e.name.startsWith('.') && e.name !== 'node_modules') await walk(path.join(dir, e.name), depth + 1, project);
    }
  };
  for (const r of roots) await walk(r, 1, path.basename(r));
  return found;
}

let lastScan = new Map();

async function scan(roots, onProgress) {
  const cands = await findCandidates(roots);
  const total = cands.length + TOOL_CACHES.filter((c) => exists(c.p)).length;
  const out = [];
  let done = 0;
  const jobs = [
    ...cands.map((c) => ({ path: c.path, label: c.rule.label, project: c.project, safe: c.rule.safe, perm: false, group: 'projects' })),
    ...TOOL_CACHES.filter((c) => exists(c.p)).map((c) => ({ path: c.p, label: c.label, project: 'Tool cache', safe: true, perm: true, group: 'caches' })),
  ];
  let i = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (i < jobs.length) {
        const j = jobs[i++];
        const { size, files } = await dirSize(j.path);
        done++;
        if (size > 1024 * 1024) {
          out.push({ ...j, id: crypto.createHash('sha1').update(j.path.toLowerCase()).digest('hex').slice(0, 16), size, files });
        }
        if (onProgress) onProgress({ done, total: jobs.length, current: j.project });
      }
    })
  );
  out.sort((a, b) => b.size - a.size);
  lastScan = new Map(out.map((o) => [o.id, o]));
  return out;
}

// Remove items by id. Project folders go to the Recycle Bin; tool caches are rebuilt on demand, so they are removed outright.
async function remove(ids) {
  let freed = 0;
  const failed = [];
  for (const id of ids || []) {
    const it = lastScan.get(id);
    if (!it || !exists(it.path)) continue;
    try {
      if (it.perm) await fsp.rm(it.path, { recursive: true, force: true, maxRetries: 2 });
      else await shell.trashItem(it.path);
      freed += it.size;
      lastScan.delete(id);
    } catch (e) {
      failed.push({ id, label: `${it.project} / ${it.label}`, error: e.message });
    }
  }
  return { freed, failed };
}

module.exports = { scan, remove, dirSize };
