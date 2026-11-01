import { useEffect, useState } from 'react';
import { Download, Upload, Undo2, Check, ShieldAlert, Info, PlayCircle } from 'lucide-react';
import { api } from '../api.js';

// Export and import your whole setup as one file, so a new PC (or a fresh install) can look like this one.
export default function SetupCard({ state, setState, say }) {
  const [sections, setSections] = useState([]);
  const [expSel, setExpSel] = useState(new Set());
  const [pick, setPick] = useState(null); // { file, summary }
  const [impSel, setImpSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(false);

  useEffect(() => {
    api.setupSections().then((s) => {
      setSections(s);
      setExpSel(new Set(s.filter((x) => !x.risky).map((x) => x.id)));
    });
  }, []);

  const flip = (set, setter, id) => setter((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const doExport = async () => {
    const r = await api.setupExport([...expSel]);
    if (r.ok) say(`Setup saved to ${r.path}`);
    else if (!r.canceled) say(r.error || 'Could not export');
  };

  const choose = async () => {
    const r = await api.setupPick();
    if (!r.ok) {
      if (!r.canceled) say(r.error || 'Could not read that file');
      return;
    }
    setPick(r);
    setImpSel(new Set(r.summary.sections.filter((x) => !x.risky).map((x) => x.id)));
  };

  const doImport = async () => {
    setBusy(true);
    const r = await api.setupImport([...impSel]);
    setBusy(false);
    if (!r.ok) return say(r.error || 'Import failed');
    setPick(null);
    setUndo(true);
    setState(await api.scan());
    say(`Imported ${r.done.length} part${r.done.length === 1 ? '' : 's'} of the setup. A copy of your old setup was saved, so you can undo this.`);
  };

  const doUndo = async () => {
    const r = await api.setupUndo();
    if (!r.ok) return say(r.error || 'Could not undo');
    setUndo(false);
    setState(await api.scan());
    say('Your previous setup is back');
  };

  return (
    <section className="card setup-card">
      <h2 className="card-title">Your setup</h2>
      <p className="fine" style={{ marginTop: 0 }}>Save how Deskly looks and behaves in one file, then load it on another PC or after reinstalling.</p>

      <div className="split">
        <div>
          <h3 className="sub-title"><Download size={14} /> Export</h3>
          <div className="check-list">
            {sections.map((s) => (
              <label key={s.id} className={'chk' + (expSel.has(s.id) ? ' on' : '')}>
                <input type="checkbox" checked={expSel.has(s.id)} onChange={() => flip(expSel, setExpSel, s.id)} />
                <span className="cr-check"><Check size={12} /></span>
                <span><strong>{s.label}</strong><small>{s.hint}</small></span>
              </label>
            ))}
          </div>
          <button className="btn-primary" disabled={!expSel.size} onClick={doExport}><Download size={15} /> Export to a file…</button>
        </div>

        <div>
          <h3 className="sub-title"><Upload size={14} /> Import</h3>
          {!pick ? (
            <>
              <p className="fine" style={{ marginTop: 0 }}>Pick a file made by Deskly. You choose what to load, and a copy of your current setup is saved first.</p>
              <button className="btn-ghost" onClick={choose}><Upload size={15} /> Choose a file…</button>
            </>
          ) : (
            <>
              <p className="fine" style={{ marginTop: 0 }}><b>{pick.file}</b>{pick.summary.version ? ` · made with Deskly ${pick.summary.version}` : ''}. Ticked parts replace what you have now.</p>
              <div className="check-list">
                {pick.summary.sections.map((s) => (
                  <label key={s.id} className={'chk' + (impSel.has(s.id) ? ' on' : '')}>
                    <input type="checkbox" checked={impSel.has(s.id)} onChange={() => flip(impSel, setImpSel, s.id)} />
                    <span className="cr-check"><Check size={12} /></span>
                    <span><strong>{s.label}</strong> <em>{s.count} item{s.count === 1 ? '' : 's'}</em><small>{s.hint}</small></span>
                  </label>
                ))}
              </div>
              {pick.summary.sections.some((s) => s.risky && impSel.has(s.id)) && (
                <p className="fine warn"><ShieldAlert size={14} /> Project workspaces contain commands that Deskly runs when you click Launch. Only keep this ticked for a file you made yourself.</p>
              )}
              <div className="clean-foot" style={{ marginTop: 10 }}>
                <button className="btn-ghost" onClick={() => setPick(null)}>Cancel</button>
                <button className="btn-primary" disabled={!impSel.size || busy} onClick={doImport}>{busy ? 'Importing…' : `Import ${impSel.size} part${impSel.size === 1 ? '' : 's'}`}</button>
              </div>
            </>
          )}
          {undo && <button className="btn-ghost" style={{ marginTop: 10 }} onClick={doUndo}><Undo2 size={15} /> Undo the import</button>}
        </div>
      </div>

      <div className="clean-foot">
        <button className="btn-ghost" onClick={async () => { const p = await api.setPrefs({ onboarded: false }); setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } })); }}>
          <PlayCircle size={15} /> Show the welcome tour again
        </button>
        <span className="fine" style={{ margin: 0 }}><Info size={13} /> Exports never include your usage history, file moves, or screen positions.</span>
      </div>
    </section>
  );
}
