import { useEffect, useState } from 'react';
import { RefreshCw, Download, RotateCw, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { api } from '../api.js';
import { Bar } from './charts.jsx';
import Switch from './Switch.jsx';
import { fmtAgo } from '../lib/format.js';

// Updates for the installed build. The portable exe cannot replace itself, so it only explains that.
export default function UpdateCard({ say }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    api.updateStatus().then(setSt);
    return api.onUpdate?.(setSt);
  }, []);
  if (!st) return null;

  const check = async () => setSt(await api.updateCheck());
  const download = async () => setSt(await api.updateDownload());
  const restart = async () => { await api.updateInstall(); say('Restarting to install the update…'); };

  return (
    <section className="card">
      <h2 className="card-title">Updates <em>Deskly {st.current}</em></h2>

      {!st.installed ? (
        <p className="fine" style={{ marginTop: 0 }}><Info size={14} /> This is the portable version, which cannot update itself. Install Deskly with the setup file to get automatic updates; your settings carry over.</p>
      ) : (
        <>
          <div className="upd-row">
            {st.state === 'checking' && <span className="upd-msg"><span className="spinner sm" /> Checking…</span>}
            {st.state === 'idle' && <span className="upd-msg">Not checked yet.</span>}
            {st.state === 'current' && <span className="upd-msg ok"><CheckCircle2 size={16} /> You are up to date{st.checkedAt ? ` · checked ${fmtAgo(st.checkedAt)}` : ''}</span>}
            {st.state === 'available' && <span className="upd-msg new"><Download size={16} /> Version <b>{st.version}</b> is available</span>}
            {st.state === 'downloading' && <span className="upd-msg">Downloading {st.version}… {st.progress}%</span>}
            {st.state === 'ready' && <span className="upd-msg new"><RotateCw size={16} /> Version <b>{st.version}</b> is ready to install</span>}
            {st.state === 'error' && <span className="upd-msg err"><AlertCircle size={16} /> {st.error}</span>}

            {['idle', 'current', 'error'].includes(st.state) && <button className="btn-ghost" onClick={check}><RefreshCw size={14} /> Check now</button>}
            {st.state === 'available' && <button className="btn-primary" onClick={download}><Download size={15} /> Download</button>}
            {st.state === 'ready' && <button className="btn-primary" onClick={restart}><RotateCw size={15} /> Restart and install</button>}
          </div>
          {st.state === 'downloading' && <Bar value={st.progress} max={100} color="#a78bfa" />}
          {st.state === 'available' && st.error && <p className="fine warn">{st.error}</p>}
          {st.notes && ['available', 'ready'].includes(st.state) && <p className="upd-notes">{st.notes}</p>}
          <div className="switch-list">
            <Switch
              on={st.auto}
              onChange={async (v) => setSt(await api.updateSetAuto(v))}
              label="Check for updates automatically"
              hint="Twice a day, and only to read which version is newest on GitHub. Nothing downloads or installs until you click."
            />
          </div>
        </>
      )}
    </section>
  );
}
