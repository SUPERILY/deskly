import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Square, Play, ScrollText, X } from 'lucide-react';
import { api } from '../api.js';
import { fmtUptime } from '../lib/format.js';

const STATUS = { starting: 'Starting…', running: 'Running', stopped: 'Stopped', crashed: 'Crashed' };

// Servers started from a project's workspace, with their live output.
export default function ManagedServers({ say }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null); // id whose log is showing
  const [logs, setLogs] = useState({});
  const pre = useRef(null);

  useEffect(() => {
    api.mgdList().then(setList);
    const off = api.onMgd?.(setList);
    const offLog = api.onMgdLog?.(({ id, lines }) => setLogs((l) => ({ ...l, [id]: [...(l[id] || []), ...lines].slice(-300) })));
    return () => { off?.(); offLog?.(); };
  }, []);

  useEffect(() => {
    if (open) api.mgdLog(open).then((lines) => setLogs((l) => ({ ...l, [open]: lines })));
  }, [open]);

  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [logs, open]);

  if (!list.length) return null;

  return (
    <section className="card">
      <h2 className="card-title"><Play size={15} /> Started from Deskly <em>{list.filter((s) => s.status === 'running' || s.status === 'starting').length} running</em></h2>
      <div className="mgd">
        {list.map((s) => (
          <div className="mgd-row" key={s.id}>
            <div className="mgd-top">
              <span className={'mgd-dot ' + s.status} />
              <div className="mgd-main">
                <strong>{s.name}</strong>
                <small>{STATUS[s.status]}{s.port ? ` · :${s.port}` : ''} · <code>{s.cmd}</code>{s.status === 'running' ? ` · up ${fmtUptime(s.startedAt)}` : ''}</small>
              </div>
              {s.port && s.status !== 'stopped' && <button className="btn-ghost" onClick={() => api.openPort(s.port)}><ExternalLink size={14} /> Open</button>}
              <button className={'btn-ghost' + (open === s.id ? ' on' : '')} onClick={() => setOpen(open === s.id ? null : s.id)}><ScrollText size={14} /> Logs</button>
              {(s.status === 'running' || s.status === 'starting') ? (
                <button className="btn-ghost danger" onClick={async () => { await api.mgdStop(s.id); say(`Stopped ${s.name}`); }}><Square size={13} fill="currentColor" /> Stop</button>
              ) : (
                <>
                  <button className="btn-ghost" onClick={async () => { const r = await api.mgdStart(s.key); if (!r.ok) say(r.error); }}><Play size={13} /> Start again</button>
                  <button className="icon-btn" aria-label="Remove" onClick={() => api.mgdRemove(s.id)}><X size={15} /></button>
                </>
              )}
            </div>
            {open === s.id && <pre className="mgd-log" ref={pre}>{(logs[s.id] || []).join('\n') || 'No output yet.'}</pre>}
          </div>
        ))}
      </div>
    </section>
  );
}
