import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2, Check, ShieldCheck, Info } from 'lucide-react';
import { api } from '../api.js';
import { fmtBytes, fmtAgo } from '../lib/format.js';

// Groups the many node.exe processes by the program that started them. Leftovers (the starter has
// exited) from helper tools are the safe wins; helpers of running apps are shown but never preselected.
export default function CleanupTab({ say }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(async () => {
    setData(null);
    const d = await api.procScan();
    setData(d);
    setSel(new Set(d.groups.filter((g) => g.safe).map((g) => g.key)));
  }, []);
  useEffect(() => { scan(); }, [scan]);

  const total = useMemo(() => (data ? data.groups.filter((g) => sel.has(g.key)).reduce((a, g) => a + g.ram, 0) : 0), [data, sel]);
  const procs = useMemo(() => (data ? data.groups.filter((g) => sel.has(g.key)).reduce((a, g) => a + g.count, 0) : 0), [data, sel]);
  const flip = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (!data) {
    return <section className="card"><div className="scan-run"><div className="spinner" /><div><strong>Looking at your node processes…</strong><small>This takes a second or two.</small></div></div></section>;
  }

  const safe = data.groups.filter((g) => g.safe);
  const safeRam = safe.reduce((a, g) => a + g.ram, 0);
  const safeCount = safe.reduce((a, g) => a + g.count, 0);

  const end = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setBusy(true);
    const r = await api.procEnd([...sel]);
    setBusy(false);
    setArmed(false);
    say(r.ok ? `Ended ${r.ended} processes and freed about ${fmtBytes(r.freed)}` : 'Nothing was ended');
    scan();
  };

  return (
    <>
      <section className={'card cleanup-hero' + (safeCount ? ' has' : '')}>
        <div>
          <h2 className="card-title">{safeCount ? <ShieldCheck size={16} /> : <Check size={16} />} {safeCount ? 'Leftovers you can safely end' : 'Nothing left over'}</h2>
          {safeCount ? (
            <p><b>{safeCount}</b> helper processes (MCP servers, language servers…) are still running after the app that started them closed. They use <b>{fmtBytes(safeRam)}</b> of memory and do nothing.</p>
          ) : (
            <p>Every node process still has a running app behind it. {data.total} processes, {fmtBytes(data.ram)} in total.</p>
          )}
        </div>
        <button className="btn-ghost" onClick={scan}><RefreshCw size={14} /> Rescan</button>
      </section>

      <section className="card">
        <h2 className="card-title">All node processes <em>{data.total} · {fmtBytes(data.ram)}</em></h2>
        <div className="pgroups">
          {data.groups.map((g) => (
            <label className={'pgroup' + (sel.has(g.key) ? ' on' : '')} key={g.key}>
              <input type="checkbox" checked={sel.has(g.key)} onChange={() => flip(g.key)} />
              <span className="cr-check"><Check size={13} /></span>
              <span className="pg-main">
                <strong>{g.tool}{g.projects.length ? <em> · {g.projects.join(', ')}</em> : null}</strong>
                <small>
                  {g.stale ? <b className="tag ok">leftover</b> : <b className="tag live">in use</b>}
                  started by {g.by} · {g.count} process{g.count === 1 ? '' : 'es'}{g.oldest ? ` · since ${fmtAgo(g.oldest)}` : ''}
                </small>
              </span>
              <span className="cr-size">{fmtBytes(g.ram)}</span>
            </label>
          ))}
        </div>
        {data.groups.some((g) => sel.has(g.key) && !g.stale) && (
          <p className="fine warn"><Info size={13} /> You selected helpers of apps that are still running. Ending them makes that app restart them, or that tool stops working until you restart the app.</p>
        )}
        <div className="clean-foot">
          <span className="clean-total">{procs} process{procs === 1 ? '' : 'es'} · {fmtBytes(total)} selected</span>
          <button className={'btn-primary' + (armed ? ' arm' : '')} disabled={!sel.size || busy} onClick={end}>
            <Trash2 size={15} /> {busy ? 'Ending…' : armed ? `Confirm: end ${procs} and free ${fmtBytes(total)}` : `End selected (${fmtBytes(total)})`}
          </button>
        </div>
      </section>
    </>
  );
}
