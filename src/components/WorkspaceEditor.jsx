import { useEffect, useState } from 'react';
import { X, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import Switch from './Switch.jsx';

// What "Launch workspace" does for one project. Saved once, reused every time.
export default function WorkspaceEditor({ project, onClose, onSaved }) {
  const ws = project.workspace || {};
  const [editor, setEditor] = useState(ws.editor !== false);
  const [terminal, setTerminal] = useState(!!ws.terminal);
  const [urls, setUrls] = useState((ws.urls || []).join('\n'));
  const [start, setStart] = useState(ws.start || '');

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const save = async () => {
    const clean = await api.saveWorkspace(project.key, {
      editor, terminal, start,
      urls: urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean),
    });
    onSaved(clean);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal scene-editor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Project workspace">
        <header className="modal-head">
          <span className="modal-badge"><Wand2 size={20} /></span>
          <div><h2>{project.name}</h2><p>What should open when you launch this project?</p></div>
          <button className="icon-btn close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="editor-body">
          <div className="switch-list">
            <Switch on={editor} onChange={setEditor} label="Open in VS Code" hint={project.path} />
            <Switch on={terminal} onChange={setTerminal} label="Open a terminal in the project folder" />
          </div>

          <label className="field">
            <span>Start command <small>(runs in the project folder when you launch)</small></span>
            <input value={start} placeholder={project.suggest || 'npm run dev'} onChange={(e) => setStart(e.target.value)} spellCheck={false} />
            {project.suggest && start !== project.suggest && (
              <button className="link-btn left" onClick={() => setStart(project.suggest)}>Use “{project.suggest}” (from package.json)</button>
            )}
          </label>

          <label className="field">
            <span>Links to open <small>(one per line, http or https)</small></span>
            <textarea rows={3} value={urls} placeholder={'http://localhost:5173\nhttps://github.com/you/repo'} onChange={(e) => setUrls(e.target.value)} spellCheck={false} />
          </label>
          <p className="fine">Deskly only runs the command you type here, only when you click Launch, and only in this project's folder. Its output shows under Performance → Dev servers.</p>
        </div>

        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save workspace</button>
        </footer>
      </div>
    </div>
  );
}
