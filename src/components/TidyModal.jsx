import { useEffect, useState } from 'react';
import { Sparkles, ShieldCheck, X, ArrowRight, Check, Lock, Info } from 'lucide-react';
import { api } from '../api.js';
import { CatIcon } from '../icons.jsx';

const shortPath = (p = '') => p.split('\\').slice(-2).join('\\');

export default function TidyModal({ categories, onClose, onDone }) {
  const [phase, setPhase] = useState('loading');
  const [plan, setPlan] = useState(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let alive = true;
    api.tidyPreview().then((p) => {
      if (!alive) return;
      setPlan(p);
      setPhase('ready');
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && phase !== 'working' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, onClose]);

  const restartAdmin = async () => {
    const ok = await api.relaunchAdmin();
    if (!ok) setDeclined(true);
  };

  const run = async () => {
    setPhase('working');
    const result = await api.tidyApply();
    onDone(result);
  };

  const catOf = (id) => categories.find((c) => c.id === id) || { color: '#a3a3a3', icon: 'Shapes', name: id };
  const sk = plan?.skipped;

  return (
    <div className="modal-backdrop" onMouseDown={() => phase !== 'working' && onClose()}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Tidy desktop">
        <header className="modal-head">
          <span className="modal-badge"><Sparkles size={18} /></span>
          <div>
            <h2>Tidy your desktop</h2>
            <p>Preview first. Nothing moves until you say so.</p>
          </div>
          <button className="icon-btn close" onClick={onClose} disabled={phase === 'working'} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {phase === 'loading' && (
          <div className="modal-body center"><div className="spinner" /><span>Planning…</span></div>
        )}

        {phase !== 'loading' && plan && plan.total === 0 && (
          <div className="modal-body center">
            <span className="done-badge"><Check size={26} /></span>
            <h3>Your desktop is already tidy</h3>
            <p className="muted">There is nothing loose to move.</p>
          </div>
        )}

        {phase !== 'loading' && plan && plan.total > 0 && (
          <>
            <div className="modal-summary">
              <strong>{plan.total}</strong> shortcuts and files
              <ArrowRight size={15} />
              <strong>{plan.groups.length}</strong> folders on <code>{shortPath(plan.primary)}</code>
            </div>

            <div className="modal-body">
              {plan.groups.map((g) => {
                const c = catOf(g.cat);
                return (
                  <div className="group" key={g.cat} style={{ '--c': c.color }}>
                    <div className="group-head">
                      <span className="group-chip"><CatIcon name={c.icon} size={16} /></span>
                      <span className="group-name">{g.folder}</span>
                      <span className="group-count">{g.moves.length}</span>
                    </div>
                    <div className="stack">
                      {g.moves.slice(0, 9).map((m) => (
                        <img key={m.key} src={m.icon} alt="" title={m.name} />
                      ))}
                      {g.moves.length > 9 && <span className="more">+{g.moves.length - 9}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="notes">
              <div><ShieldCheck size={15} /> Nothing is deleted. You can undo the whole tidy in one click.</div>
              {sk.folders > 0 && <div><Info size={15} /> {sk.folders} folders stay where they are.</div>}
              {sk.sensitive.length > 0 && (
                <div><Lock size={15} /> {sk.sensitive.length} protected file left untouched ({sk.sensitive[0].slice(0, 28)}…).</div>
              )}
              {plan.elevated && <div><ShieldCheck size={15} /> Running as administrator, so shortcuts from the shared Public Desktop are included.</div>}
            </div>

            {!plan.elevated && sk.publicItems.length > 0 && (
              <div className="admin-card">
                <span className="admin-icon"><ShieldCheck size={18} /></span>
                <div>
                  <strong>{sk.publicItems.length} more shortcuts are in the shared Public Desktop</strong>
                  <small>
                    Windows only lets an administrator move these (Steam, Chrome, OBS…). Restart as administrator to tidy
                    everything in one go.{declined && ' The permission prompt was cancelled.'}
                  </small>
                </div>
                <button className="btn-ghost" onClick={restartAdmin} disabled={phase === 'working'}>Restart as admin</button>
              </div>
            )}
          </>
        )}

        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onClose} disabled={phase === 'working'}>Cancel</button>
          {plan && plan.total > 0 && (
            <button className="btn-primary" onClick={run} disabled={phase !== 'ready'}>
              {phase === 'working' ? <><span className="spinner sm" /> Tidying…</> : <><Sparkles size={16} /> Tidy {plan.total} items</>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
