import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderDown, Camera, Copy, HardDriveDownload, Check, Undo2, Trash2, ScanSearch, RefreshCw, FolderOpen, Info, X, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { Bar } from './charts.jsx';
import { fmtBytes, fmtAgo } from '../lib/format.js';

const TABS = [
  ['downloads', 'Downloads', FolderDown],
  ['screenshots', 'Screenshots', Camera],
  ['dupes', 'Duplicates', Copy],
  ['big', 'Big and old', HardDriveDownload],
];

export default function FilesPage({ say }) {
  const [tab, setTab] = useState('downloads');
  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">File cleanup</span></h1>
          <p>Keep Downloads and screenshots tidy, and find what is wasting space. Nothing is deleted: files are moved (and can be moved back) or sent to the Recycle Bin.</p>
        </div>
      </section>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'downloads' && (
        <MoveTab
          key="d" kind="downloads" say={say}
          ages={[[1, 'older than 1 hour'], [24, 'older than 1 day'], [24 * 7, 'older than 1 week']]} defaultAge={24}
          plan={(o) => api.filesDownloadsPlan(o)}
          empty="Downloads is already tidy."
          intro={(p) => `${p.total} loose files in ${p.dir}`}
          note="Files go into folders inside Downloads (Installers, Documents, Images…). Half-finished downloads, files with secret-looking names and recent files stay where they are."
          actionLabel="Sort"
        />
      )}
      {tab === 'screenshots' && (
        <MoveTab
          key="s" kind="screenshots" say={say} thumbs
          ages={[[0, 'any age'], [1, 'older than 1 hour'], [24, 'older than 1 day']]} defaultAge={1}
          plan={(o) => api.filesScreenshotsPlan(o)}
          empty="No loose screenshots found on your Desktop, Downloads or Pictures."
          intro={(p) => `Filing into ${p.dir}, one folder per month`}
          note="Looks for files named Screenshot…, Capture d’écran…, Snip…, in Desktop, Downloads and Pictures. Other pictures are never touched."
          actionLabel="File"
        />
      )}
      {tab === 'dupes' && <DupesTab say={say} />}
      {tab === 'big' && <BigTab say={say} />}
    </div>
  );
}

/* ---------- shared bits ---------- */
function useProgress() {
  const [prog, setProg] = useState(null);
  useEffect(() => api.onFilesProgress?.(setProg), []);
  return [prog, setProg];
}

function Check2({ on }) {
  return <span className={'cr-check' + (on ? ' on' : '')}><Check size={13} /></span>;
}

function ProgressCard({ prog, onCancel, what }) {
  const pct = prog && prog.total ? Math.min(100, Math.round((prog.done / prog.total) * 100)) : null;
  return (
    <section className="card">
      <div className="scan-run">
        <div className="spinner" />
        <div>
          <strong>{prog ? prog.phase : what}{pct != null ? ` · ${pct}%` : ''}</strong>
          <small>{prog && prog.bytes ? `${fmtBytes(prog.done)} of ${fmtBytes(prog.total)}` : prog && prog.done ? `${prog.done.toLocaleString()} files seen` : 'Starting…'}{prog && prog.current ? ` · ${prog.current}` : ''}</small>
          {pct != null && <Bar value={prog.done} max={prog.total} color="#a78bfa" />}
        </div>
        <button className="btn-ghost" onClick={onCancel}><X size={14} /> Cancel</button>
      </div>
    </section>
  );
}

function History({ history, onUndo }) {
  if (!history.length) return null;
  return (
    <section className="card">
      <h2 className="card-title"><Undo2 size={15} /> Recent moves</h2>
      <div className="hist">
        {history.slice(0, 4).map((h, i) => (
          <div className="hist-row" key={h.id}>
            <span><b>{h.label}</b> · {h.count} file{h.count === 1 ? '' : 's'} · {fmtAgo(h.ts)}</span>
            <button className="btn-ghost" onClick={() => onUndo(h)}>{i === 0 ? 'Undo' : 'Move back'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Downloads / Screenshots: preview, then move ---------- */
function MoveTab({ kind, say, ages, defaultAge, plan, empty, intro, note, actionLabel, thumbs }) {
  const [age, setAge] = useState(defaultAge);
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState(new Set());
  const [skip, setSkip] = useState(new Set());
  const [open, setOpen] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setData(null);
    const [p, h] = await Promise.all([plan({ minAgeHours: age }), api.filesHistory()]);
    setData(p);
    const mine = kind === 'downloads' ? 'Sorted Downloads' : 'Filed screenshots';
    setHistory(h.filter((x) => x.label === mine));
    setGroups(new Set(p.groups.filter((g) => g.selected).map((g) => g.id)));
    setSkip(new Set());
    setOpen(new Set());
  }, [age]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const chosen = useMemo(() => {
    if (!data) return { files: 0, size: 0 };
    let files = 0;
    let size = 0;
    for (const g of data.groups) {
      if (!groups.has(g.id)) continue;
      const skipped = g.moves.filter((m) => skip.has(m.id));
      files += g.count - skipped.length;
      size += g.size - skipped.reduce((a, m) => a + m.size, 0);
    }
    return { files, size };
  }, [data, groups, skip]);

  const flip = (set, setter, k) => setter((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const apply = async () => {
    setBusy(true);
    const r = await api.filesApply(kind, [...groups], [...skip]);
    setBusy(false);
    say(r.moved ? `Moved ${r.moved} file${r.moved === 1 ? '' : 's'}. You can undo this below.${r.failed.length ? ` ${r.failed.length} could not be moved (${r.failed[0].error}).` : ''}` : r.failed.length ? `Nothing moved: ${r.failed[0].name} ${r.failed[0].error}` : 'Nothing to move');
    load();
  };

  const undo = async (h) => {
    const r = await api.filesUndo(h.id);
    say(r.restored ? `Moved ${r.restored} file${r.restored === 1 ? '' : 's'} back${r.failed ? `, ${r.failed} could not be moved back` : ''}` : 'Nothing to move back');
    load();
  };

  if (!data) return <section className="card"><div className="scan-run"><div className="spinner" /><div><strong>Looking at your files…</strong><small>Only reads names and dates, nothing is moved yet.</small></div></div></section>;

  const sk = data.skipped || {};
  const skippedBits = [sk.recent && `${sk.recent} too recent`, sk.partial && `${sk.partial} still downloading`, sk.secret && `${sk.secret} with secret-looking names`].filter(Boolean);

  return (
    <>
      <section className="card">
        <div className="files-head">
          <div>
            <h2 className="card-title">{data.groups.length ? `${data.groups.reduce((a, g) => a + g.count, 0)} files ready to ${actionLabel.toLowerCase()}` : 'Nothing to do'}</h2>
            <p className="fine">{intro(data)}{skippedBits.length ? ` · left alone: ${skippedBits.join(', ')}` : ''}</p>
          </div>
          <div className="files-tools">
            <label className="select-wrap">
              <span>Only files</span>
              <select value={age} onChange={(e) => setAge(Number(e.target.value))}>
                {ages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <button className="btn-ghost" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>

        {!data.groups.length && <p className="fine">{empty}</p>}

        {data.groups.map((g) => {
          const isOpen = open.has(g.id);
          return (
            <div className="move-group" key={g.id}>
              <div className={'clean-row' + (groups.has(g.id) ? ' on' : '')} onClick={() => flip(groups, setGroups, g.id)}>
                <Check2 on={groups.has(g.id)} />
                <span className="cr-name"><strong>{g.label}</strong><em>{g.count} file{g.count === 1 ? '' : 's'}</em></span>
                <span className="cr-size">{fmtBytes(g.size)}</span>
                <button className="chev" aria-label={isOpen ? 'Hide files' : 'Show files'} onClick={(e) => { e.stopPropagation(); flip(open, setOpen, g.id); }}>
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              {thumbs && <Thumbs moves={g.moves.slice(0, 6)} />}
              {isOpen && (
                <div className="move-files">
                  {g.moves.map((m) => (
                    <label className={'mf' + (groups.has(g.id) && !skip.has(m.id) ? '' : ' off')} key={m.id} title={m.from}>
                      <input type="checkbox" checked={!skip.has(m.id)} onChange={() => flip(skip, setSkip, m.id)} />
                      <span className="mf-box"><Check size={11} /></span>
                      <span className="mf-name">{m.name}</span>
                      <span className="mf-meta">{fmtBytes(m.size)} · {fmtAgo(m.mtime)}</span>
                    </label>
                  ))}
                  {g.count > g.moves.length && <p className="fine">…and {g.count - g.moves.length} more. They move with the group.</p>}
                </div>
              )}
            </div>
          );
        })}

        {data.groups.length > 0 && (
          <div className="clean-foot">
            <span className="clean-total">{chosen.files} file{chosen.files === 1 ? '' : 's'} · {fmtBytes(chosen.size)} selected</span>
            <button className="btn-primary" disabled={!chosen.files || busy} onClick={apply}>
              <FolderOpen size={15} /> {busy ? 'Moving…' : `${actionLabel} ${chosen.files} file${chosen.files === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
        <p className="fine"><Info size={13} /> {note}</p>
      </section>
      <History history={history} onUndo={undo} />
    </>
  );
}

function Thumbs({ moves }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let live = true;
    moves.forEach((m) => api.filesThumb(m.id).then((u) => live && u && setUrls((p) => ({ ...p, [m.id]: u }))));
    return () => { live = false; };
  }, [moves.map((m) => m.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!Object.keys(urls).length) return null;
  return <div className="thumbs">{moves.map((m) => urls[m.id] && <img key={m.id} src={urls[m.id]} alt="" title={m.name} />)}</div>;
}

/* ---------- Duplicates ---------- */
function DupesTab({ say }) {
  const [phase, setPhase] = useState('idle'); // idle | scanning | done
  const [prog, setProg] = useProgress();
  const [res, setRes] = useState(null);
  const [keeper, setKeeper] = useState({}); // group id -> file id kept
  const [off, setOff] = useState(new Set()); // groups left alone
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const scanning = useRef(false);
  useEffect(() => () => { if (scanning.current) api.filesCancel(); }, []);

  const scan = async () => {
    setPhase('scanning');
    setProg(null);
    scanning.current = true;
    const r = await api.filesScanDupes({});
    scanning.current = false;
    if (!r || r.busy) return setPhase('idle');
    setRes(r);
    setKeeper(Object.fromEntries(r.groups.map((g) => [g.id, (g.files.find((f) => f.keep) || g.files[0]).id])));
    setOff(new Set());
    setPhase('done');
  };

  const picked = useMemo(() => {
    if (!res) return { ids: [], bytes: 0 };
    const ids = [];
    let bytes = 0;
    for (const g of res.groups) {
      if (off.has(g.id)) continue;
      for (const f of g.files) if (f.id !== keeper[g.id]) { ids.push(f.id); bytes += g.size; }
    }
    return { ids, bytes };
  }, [res, keeper, off]);

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setBusy(true);
    const r = await api.filesTrash(picked.ids);
    setBusy(false);
    setArmed(false);
    say(`Sent ${r.count} file${r.count === 1 ? '' : 's'} to the Recycle Bin (${fmtBytes(r.freed)})${r.failed.length ? ` · ${r.failed.length} skipped: ${r.failed[0].error}` : ''}`);
    scan();
  };

  if (phase === 'scanning') return <ProgressCard prog={prog} what="Looking through your folders" onCancel={() => api.filesCancel()} />;

  if (phase === 'idle') {
    return (
      <section className="card">
        <h2 className="card-title"><Copy size={15} /> Find duplicate files</h2>
        <div className="scan-intro">
          <p>Looks through Desktop, Downloads, Documents, Pictures, Videos and Music for files that are byte-for-byte identical (files under 64 KB are ignored). It reads files, so a first scan of a big library can take a few minutes. Files that only exist in the cloud (OneDrive) are never opened.</p>
          <button className="btn-primary" onClick={scan}><ScanSearch size={16} /> Scan for duplicates</button>
        </div>
      </section>
    );
  }

  if (res.error) return <section className="card"><p className="fine warn">{res.error}</p><button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Try again</button></section>;

  return (
    <section className="card">
      <div className="files-head">
        <div>
          <h2 className="card-title">{res.groups.length ? `${res.totalGroups} sets of duplicates · ${fmtBytes(res.wasted)} wasted` : 'No duplicates found'}</h2>
          <p className="fine">{res.scanned.toLocaleString()} files checked{res.truncated ? ' (stopped early: very large library)' : ''}{res.cloudSkipped ? ` · ${res.cloudSkipped} cloud-only files skipped` : ''}{res.totalGroups > res.groups.length ? ` · showing the biggest ${res.groups.length}` : ''}</p>
        </div>
        <button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Rescan</button>
      </div>
      {res.groups.map((g) => {
        const ignored = off.has(g.id);
        return (
          <div className={'dup' + (ignored ? ' off' : '')} key={g.id}>
            <div className="dup-head">
              <label className="dup-inc">
                <input type="checkbox" checked={!ignored} onChange={() => setOff((p) => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })} />
                <Check2 on={!ignored} />
              </label>
              <strong>{g.name}</strong>
              <em>{g.copies} copies · {fmtBytes(g.size)} each</em>
              <b>{fmtBytes(g.wasted)}</b>
            </div>
            {g.files.map((f) => {
              const keep = keeper[g.id] === f.id;
              return (
                <div className={'dup-file' + (keep ? ' keep' : '')} key={f.id}>
                  <button className={'dup-pill' + (keep ? ' keep' : '')} onClick={() => setKeeper((k) => ({ ...k, [g.id]: f.id }))} title={keep ? 'This copy stays' : 'Keep this one instead'}>
                    {keep ? 'Keep' : 'Remove'}
                  </button>
                  <span className="dup-path" title={f.path}>{f.name !== g.name && <b>{f.name} </b>}<span>{f.dir}</span> <i>{fmtAgo(f.mtime)}</i></span>
                  <button className="mini-btn" onClick={() => api.filesReveal(f.id)} title="Show in folder"><FolderOpen size={13} /></button>
                </div>
              );
            })}
          </div>
        );
      })}
      {res.groups.length > 0 && (
        <div className="clean-foot">
          <span className="clean-total">{picked.ids.length} copies · {fmtBytes(picked.bytes)} to free</span>
          <button className={'btn-primary' + (armed ? ' arm' : '')} disabled={!picked.ids.length || busy} onClick={remove}>
            <Trash2 size={15} /> {busy ? 'Removing…' : armed ? `Confirm: Recycle Bin ${picked.ids.length}` : `Send ${picked.ids.length} to Recycle Bin`}
          </button>
        </div>
      )}
      <p className="fine"><Info size={13} /> One copy of every set always stays. Removed copies go to the Recycle Bin, so you can restore them. The suggested copy to keep is the oldest one outside Downloads and Desktop; click a row to keep a different one.</p>
    </section>
  );
}

/* ---------- Big and old ---------- */
function BigTab({ say }) {
  const [phase, setPhase] = useState('idle');
  const [prog, setProg] = useProgress();
  const [minMB, setMinMB] = useState(250);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const scanning = useRef(false);
  useEffect(() => () => { if (scanning.current) api.filesCancel(); }, []);

  const scan = async () => {
    setPhase('scanning');
    setProg(null);
    scanning.current = true;
    const r = await api.filesScanBig({ minMB, oldDays: 365, oldMinMB: 20 });
    scanning.current = false;
    if (!r || r.busy) return setPhase('idle');
    setRes(r);
    setSel(new Set());
    setPhase('done');
  };

  const total = useMemo(() => (res ? res.files.filter((f) => sel.has(f.id)).reduce((a, f) => a + f.size, 0) : 0), [res, sel]);
  const flip = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setBusy(true);
    const r = await api.filesTrash([...sel]);
    setBusy(false);
    setArmed(false);
    say(`Sent ${r.count} file${r.count === 1 ? '' : 's'} to the Recycle Bin (${fmtBytes(r.freed)})${r.failed.length ? ` · ${r.failed.length} skipped: ${r.failed[0].error}` : ''}`);
    scan();
  };

  if (phase === 'scanning') return <ProgressCard prog={prog} what="Looking through your folders" onCancel={() => api.filesCancel()} />;

  if (phase === 'idle') {
    return (
      <section className="card">
        <h2 className="card-title"><HardDriveDownload size={15} /> Big and old files</h2>
        <div className="scan-intro">
          <p>Lists the largest files in Desktop, Downloads, Documents, Pictures, Videos and Music, plus anything over 20 MB that has not changed for a year. It only reads sizes and dates.</p>
          <label className="select-wrap">
            <span>Bigger than</span>
            <select value={minMB} onChange={(e) => setMinMB(Number(e.target.value))}>
              {[[100, '100 MB'], [250, '250 MB'], [500, '500 MB'], [1024, '1 GB']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={scan}><ScanSearch size={16} /> Scan for big and old files</button>
        </div>
      </section>
    );
  }

  if (res.error) return <section className="card"><p className="fine warn">{res.error}</p><button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Try again</button></section>;

  return (
    <section className="card">
      <div className="files-head">
        <div>
          <h2 className="card-title">{res.files.length ? `${res.files.length} files · ${fmtBytes(res.files.reduce((a, f) => a + f.size, 0))}` : 'Nothing that big or old'}</h2>
          <p className="fine">{res.scanned.toLocaleString()} files checked{res.truncated ? ' (stopped early: very large library)' : ''}{res.cloudSkipped ? ` · ${res.cloudSkipped} cloud-only files not listed` : ''}</p>
        </div>
        <button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Rescan</button>
      </div>
      {res.files.map((f) => (
        <label className={'clean-row big' + (sel.has(f.id) ? ' on' : '')} key={f.id} title={f.path}>
          <input type="checkbox" checked={sel.has(f.id)} onChange={() => flip(f.id)} />
          <Check2 on={sel.has(f.id)} />
          <span className="cr-name"><strong>{f.name}</strong><em>{f.dir}</em></span>
          <span className={'tag-kind' + (f.program ? ' warn' : '')} title={f.program ? 'Looks like part of a program. Removing it can break that program.' : ''}>{f.program ? 'part of a program' : f.kind}</span>
          <span className="cr-age">{f.old ? <b className="tag old">over a year</b> : null}{fmtAgo(f.mtime)}</span>
          <span className="cr-size">{fmtBytes(f.size)}</span>
          <button className="mini-btn" onClick={(e) => { e.preventDefault(); api.filesReveal(f.id); }} title="Show in folder"><FolderOpen size={13} /></button>
        </label>
      ))}
      {res.files.length > 0 && (
        <div className="clean-foot">
          <span className="clean-total">{sel.size} selected · {fmtBytes(total)}</span>
          <button className={'btn-primary' + (armed ? ' arm' : '')} disabled={!sel.size || busy} onClick={remove}>
            <Trash2 size={15} /> {busy ? 'Removing…' : armed ? `Confirm: Recycle Bin ${sel.size}` : `Send ${sel.size} to Recycle Bin`}
          </button>
        </div>
      )}
      <p className="fine"><Info size={13} /> Nothing is preselected: you choose. Files go to the Recycle Bin, so you can restore them.</p>
    </section>
  );
}
