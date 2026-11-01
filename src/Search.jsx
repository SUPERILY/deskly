import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, CornerDownLeft, Layers, Command, Code2 } from 'lucide-react';
import { api } from './api.js';

// Score: exact > prefix > word start > substring > initials ("vsc" = Visual Studio Code). 0 = no match.
function score(name, q) {
  const n = name.toLowerCase();
  if (n === q) return 100;
  if (n.startsWith(q)) return 80 - n.length * 0.1;
  const words = n.split(/[\s\-_.·:()]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 60 - n.length * 0.05;
  if (n.includes(q)) return 40 - n.indexOf(q) * 0.1;
  if (q.length >= 2 && words.map((w) => w[0]).join('').startsWith(q)) return 30;
  return 0;
}

const KIND_ORDER = { Desktop: 0, App: 1, Game: 1, Browser: 2, Project: 3, Scene: 4, Action: 5 };

export default function Search() {
  const [entries, setEntries] = useState([]);
  const [indexing, setIndexing] = useState(false);
  const [hotkey, setHotkey] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  const load = useCallback(async () => {
    const d = await api.searchData();
    setEntries(d.entries);
    setIndexing(d.indexing);
    setHotkey(d.hotkey || '');
  }, []);

  useEffect(() => {
    load();
    const offShow = api.onSearchShow?.(() => { setQ(''); setSel(0); load(); setTimeout(() => input.current?.focus(), 20); });
    const offChanged = api.onChanged?.(load);
    return () => { offShow?.(); offChanged?.(); };
  }, [load]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) {
      // nothing typed: your most used things, then scenes and actions
      const top = entries.filter((e) => e.use > 0 && e.type !== 'action').sort((a, b) => b.use - a.use).slice(0, 5);
      const scenes = entries.filter((e) => e.type === 'scene').slice(0, 3);
      const actions = entries.filter((e) => e.type === 'action').slice(0, 3);
      return [...top, ...scenes, ...actions];
    }
    return entries
      .map((e) => ({ e, base: score(e.name, needle) }))
      .filter((x) => x.base > 0) // usage and pins only break ties between real matches
      .map((x) => ({ e: x.e, s: x.base + (x.e.use ? Math.min(12, x.e.use) : 0) + (x.e.pinned ? 4 : 0) - (KIND_ORDER[x.e.kind] || 0) * 0.2 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((x) => x.e);
  }, [entries, needle]);

  useEffect(() => setSel(0), [needle]);
  useEffect(() => {
    list.current?.querySelector('.sr.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (e, alt = false) => e && api.searchRun(e, alt);

  const onKey = (ev) => {
    if (ev.key === 'Escape') return api.searchHide();
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); run(results[sel], ev.ctrlKey); }
  };

  const heading = needle ? null : results.some((r) => r.use > 0 && r.type !== 'scene' && r.type !== 'action') ? 'Most used' : null;

  return (
    <div className="s-win" onKeyDown={onKey}>
      <div className="s-card">
        <div className="s-input">
          <SearchIcon size={20} />
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps, games, projects, scenes…" spellCheck={false} />
          {indexing && <span className="s-idx">indexing…</span>}
          <kbd>Esc</kbd>
        </div>
        <div className="s-list" ref={list}>
          {heading && <div className="s-head">{heading}</div>}
          {results.map((r, i) => (
            <button key={(r.key || r.id) + i} className={'sr' + (i === sel ? ' on' : '')} onMouseMove={() => setSel(i)} onClick={() => run(r)}>
              <span className="sr-icon" style={r.color ? { '--c': r.color } : null}>
                {r.icon ? <img src={r.icon} alt="" draggable={false} /> : r.type === 'scene' ? <Layers size={20} /> : r.type === 'project' ? <Code2 size={20} /> : <Command size={20} />}
              </span>
              <span className="sr-text"><strong>{r.name}</strong><small>{r.sub}</small></span>
              <span className="sr-kind">{r.kind}</span>
              {i === sel && <CornerDownLeft size={14} className="sr-enter" />}
            </button>
          ))}
          {needle && results.length === 0 && <div className="s-none">{indexing ? 'Still indexing your apps, try again in a moment…' : `Nothing matches “${q}”.`}</div>}
        </div>
        <div className="s-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> project folder</span>
          {hotkey && <span className="s-hk">{hotkey.replace('Control', 'Ctrl')}</span>}
        </div>
      </div>
    </div>
  );
}
