// Node process cleanup: group the many node.exe processes by the tool and project that started
// them, mark the orphaned ones (their parent has exited), and let you end whole groups.
const { execFile } = require('child_process');
const path = require('path');

const script = () => path.join(__dirname, 'procs.ps1').replace('app.asar', 'app.asar.unpacked');

const TOOLS = [
  [/modelcontextprotocol|mcp[-_ ]?server|[\\/]mcp[\\/ ]|\bmcp\b/i, 'MCP server'],
  [/tsserver|typingsInstaller/i, 'TypeScript server'],
  [/language[-_ ]?server|lsp/i, 'Language server'],
  [/vitest|jest/i, 'Test runner'],
  [/vite/i, 'Vite'],
  [/next[\\/ ]|next dev|next start/i, 'Next.js'],
  [/webpack/i, 'webpack'],
  [/eslint/i, 'ESLint'],
  [/prettier/i, 'Prettier'],
  [/playwright/i, 'Playwright'],
  [/npm-cli|npm\.cjs|npx-cli|\bnpx\b|pnpm|yarn/i, 'Package manager'],
  [/claude|codex|gemini|antigravity|cursor|windsurf/i, 'AI tool'],
  [/electron/i, 'Electron app'],
];

// Helper tools that exist only to serve another app: if that app is gone, they are leftovers.
const HELPERS = new Set(['MCP server', 'TypeScript server', 'Language server', 'ESLint', 'Prettier', 'Playwright', 'Test runner']);

// Anything that could be Deskly itself, or something Windows or an editor needs to keep alive.
const NEVER = /deskly|resources[\\/]app\.asar|\\Microsoft VS Code\\|code\.exe/i;

function classify(cmd) {
  const tool = (TOOLS.find(([re]) => re.test(cmd)) || [null, 'Node script'])[1];
  const proj = /(?:my projects|projects|repos|code|dev|github|documents)[\\/]+([^\\/"']+)/i.exec(cmd);
  let project = proj ? proj[1] : '';
  if (!project) {
    // fall back to the folder holding node_modules or the script
    const nm = /([^\\/"']+)[\\/]node_modules[\\/]/i.exec(cmd);
    project = nm ? nm[1] : '';
  }
  return { tool, project };
}

let lastGroups = new Map();

function scan() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script()], { windowsHide: true, timeout: 25000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
      if (err) return resolve({ groups: [], total: 0, ram: 0 });
      let rows = [];
      try {
        const j = JSON.parse(out);
        rows = Array.isArray(j) ? j : [j];
      } catch {}
      // The program that started a node process: the first ancestor that is not just a wrapper
      // (node, cmd, powershell, conhost...). Empty when the chain was cut because a parent has exited.
      const WRAPPERS = /^(node|cmd|conhost|powershell|pwsh|OpenConsole|bash|sh|wsl|npm|npx|pnpm|yarn)\.exe$/i;
      const rootOf = (r) => {
        const real = (r.chain || []).find((n) => !WRAPPERS.test(n));
        if (real) return real;
        return r.orphan ? '' : (r.chain || [])[(r.chain || []).length - 1] || 'a terminal';
      };
      const label = (n) => {
        const s = String(n || '').replace(/\.exe$/i, '');
        if (!s) return 'Nothing (orphaned)';
        if (/^(cmd|powershell|pwsh|conhost|OpenConsole|WindowsTerminal)$/i.test(s)) return 'A terminal';
        if (/^code$/i.test(s)) return 'VS Code';
        return s;
      };
      const groups = new Map();
      let total = 0;
      let ramAll = 0;
      for (const r of rows) {
        if (r.pid === process.pid) continue;
        const { tool, project } = classify(r.cmd || '');
        const root = rootOf(r);
        const protectedProc = NEVER.test(r.cmd || '') || /^(deskly|electron|code)\.exe$/i.test(root);
        const orphan = !root; // the program that started it has exited
        const by = label(root);
        const key = `${by}|${tool}`;
        let g = groups.get(key);
        if (!g) {
          g = { key, by, tool, projects: new Map(), count: 0, ram: 0, orphans: 0, oldest: Infinity, pids: [], locked: 0, sample: r.cmd };
          groups.set(key, g);
        }
        total++;
        ramAll += r.ram || 0;
        if (protectedProc) {
          g.locked++;
          continue; // counted, never offered for ending
        }
        g.count++;
        g.ram += r.ram || 0;
        if (orphan) g.orphans++;
        if (project) g.projects.set(project, (g.projects.get(project) || 0) + 1);
        if (r.start) g.oldest = Math.min(g.oldest, r.start);
        g.pids.push(r.pid);
      }
      const list = [...groups.values()]
        .filter((g) => g.count > 0)
        .map((g) => ({
          ...g,
          projects: [...g.projects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
          oldest: g.oldest === Infinity ? 0 : g.oldest,
          stale: g.orphans === g.count,
          // "safe": a helper tool whose parent app has closed. Anything else is only shown, never preselected.
          safe: g.orphans === g.count && HELPERS.has(g.tool),
        }))
        .sort((a, b) => b.ram - a.ram);
      lastGroups = new Map(list.map((g) => [g.key, g]));
      resolve({ groups: list, total, ram: ramAll });
    });
  });
}

// End the chosen groups. Only pids from the last scan are accepted.
function end(keys) {
  const pids = [];
  for (const k of keys || []) {
    const g = lastGroups.get(k);
    if (g) pids.push(...g.pids);
  }
  if (!pids.length) return Promise.resolve({ ok: false, ended: 0, freed: 0 });
  const freed = (keys || []).reduce((a, k) => a + ((lastGroups.get(k) || {}).ram || 0), 0);
  return Promise.all(
    pids.map((p) => new Promise((res) => execFile('taskkill', ['/PID', String(p), '/F'], { windowsHide: true }, (e) => res(!e))))
  ).then((r) => {
    for (const k of keys) lastGroups.delete(k);
    return { ok: true, ended: r.filter(Boolean).length, freed };
  });
}

module.exports = { scan, end };
