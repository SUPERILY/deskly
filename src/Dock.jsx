import { useCallback, useEffect, useState } from 'react';
import { Search, Gauge, AppWindow, Layers, EyeOff, Eye } from 'lucide-react';
import { api } from './api.js';

export default function Dock() {
  const [d, setD] = useState({ apps: [], scene: null, hidden: false, running: [] });
  const [launching, setLaunching] = useState(null);

  const load = useCallback(async () => setD(await api.dockData()), []);
  useEffect(() => {
    load();
    const off = api.onChanged?.(load);
    const offRun = api.onRunning?.((keys) => setD((s) => ({ ...s, running: keys })));
    return () => { off?.(); offRun?.(); };
  }, [load]);

  const run = new Set(d.running || []);
  const open = async (a) => {
    setLaunching(a.key);
    setTimeout(() => setLaunching(null), 500);
    await api.open(a.path, a.key);
  };

  return (
    <div className="dock-win">
      <div className="dock-card">
        <button className="dock-btn plain" title="Search (Ctrl+Shift+Space)" onClick={() => api.toggleSearch()}><Search size={19} /></button>
        <i className="dock-sep" />
        {d.apps.map((a) => (
          <button key={a.key} className={'dock-btn dapp' + (launching === a.key ? ' launching' : '')} title={a.name} onClick={() => open(a)}>
            {a.icon ? <img src={a.icon} alt="" draggable={false} /> : <span className="dock-fb">{a.name[0]}</span>}
            {run.has(a.key) && <b className="dock-run" />}
          </button>
        ))}
        {d.apps.length > 0 && <i className="dock-sep" />}
        <button className="dock-btn plain" title="Performance" onClick={() => api.openMain('performance')}><Gauge size={19} /></button>
        <button className="dock-btn plain" title="All apps" onClick={() => api.openMain('apps')}><AppWindow size={19} /></button>
        <button className="dock-btn plain" title={d.scene ? `Scene: ${d.scene.name}` : 'Scenes'} onClick={() => api.openMain('scenes')} style={d.scene ? { '--sc': d.scene.color } : null}>
          <Layers size={19} />{d.scene && <b className="dock-scene" />}
        </button>
        <button className={'dock-btn plain' + (d.hidden ? ' on' : '')} title={d.hidden ? 'Show the desktop panels' : 'Hide the desktop panels'} onClick={() => api.togglePeekAll()}>
          {d.hidden ? <Eye size={19} /> : <EyeOff size={19} />}
        </button>
      </div>
    </div>
  );
}
