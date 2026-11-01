import { useEffect, useState } from 'react';
import { Folder, FolderOpen, X } from 'lucide-react';
import { api } from './api.js';

// A small window that shows what is inside a folder, so you do not have to open Explorer.
export default function Peek() {
  const [d, setD] = useState(null);

  useEffect(() => {
    const off = api.onPeekShow?.(setD);
    const h = (e) => e.key === 'Escape' && api.peekHide();
    window.addEventListener('keydown', h);
    return () => { off?.(); window.removeEventListener('keydown', h); };
  }, []);

  if (!d) return null;
  const open = (e) => { api.open(e.path); api.peekHide(); };

  return (
    <div className="pk-win">
      <div className="pk-card">
        <header className="pk-head">
          <Folder size={17} />
          <strong title={d.dir}>{d.name}</strong>
          <span>{d.total} item{d.total === 1 ? '' : 's'}</span>
          <button className="pk-btn" title="Open this folder" onClick={() => { api.open(d.dir); api.peekHide(); }}><FolderOpen size={15} /> Open</button>
          <button className="pk-btn icon" aria-label="Close" onClick={() => api.peekHide()}><X size={15} /></button>
        </header>
        {d.entries.length === 0 ? (
          <div className="pk-empty">This folder is empty.</div>
        ) : (
          <div className="pk-grid">
            {d.entries.map((e) => (
              <button key={e.path} className="pk-item" title={e.path} onClick={() => open(e)}>
                <span className="pk-icon">{e.icon ? <img src={e.icon} alt="" draggable={false} /> : <Folder size={26} />}</span>
                <span className="pk-name">{e.name}</span>
              </button>
            ))}
          </div>
        )}
        {d.total > d.entries.length && <div className="pk-more">+ {d.total - d.entries.length} more in the folder</div>}
      </div>
    </div>
  );
}
