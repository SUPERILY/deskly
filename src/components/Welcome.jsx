import { useState } from 'react';
import { LayoutGrid, Sparkles, Gauge, Workflow, FolderDown, ArrowRight, ArrowLeft, Check, Keyboard, MonitorUp, X } from 'lucide-react';
import { api } from '../api.js';
import Switch from './Switch.jsx';

// First-run tour: five short steps, each one a real choice you can change later in Panels.
export default function Welcome({ state, patchPrefs, onToggleDesktop, onToggleAutostart, onDone }) {
  const [step, setStep] = useState(0);
  const prefs = state.prefs;
  const last = 4;
  const set = async (patch) => patchPrefs(await api.setPrefs(patch));
  const finish = async () => {
    patchPrefs(await api.setPrefs({ onboarded: true }));
    onDone?.();
  };

  const steps = [
    {
      title: 'Welcome to Deskly',
      body: (
        <>
          <p className="wl-lead">A calm, organised desktop. Deskly sorts everything you have into categories and shows it on your desktop as glass panels, with a dock for what you use most.</p>
          <ul className="wl-points">
            <li><LayoutGrid size={16} /> <span><b>Panels on your desktop</b> for apps, games, projects and folders</span></li>
            <li><Gauge size={16} /> <span><b>See what slows your PC</b>: memory, processor, graphics, startup programs, a weekly report</span></li>
            <li><Workflow size={16} /> <span><b>Scenes and automation</b>: Gaming when Steam opens, Light mode on low battery</span></li>
            <li><FolderDown size={16} /> <span><b>File cleanup</b> for Downloads, screenshots and duplicates, always undoable</span></li>
          </ul>
          <p className="fine">Nothing is moved or deleted unless you ask. This takes about a minute.</p>
        </>
      ),
    },
    {
      title: 'How should it look?',
      body: (
        <>
          <div className="layout-opts">
            {[['hub', 'Hub', 'One tabbed card for everything. The most compact.'], ['classic', 'Classic', 'A separate panel for every category.']].map(([id, title, desc]) => (
              <button key={id} className={'layout-opt' + ((prefs.layoutMode || 'hub') === id ? ' on' : '')} onClick={() => set({ layoutMode: id })}>
                <span className={'layout-art ' + id}><i /><i /><i /><i /></span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </button>
            ))}
          </div>
          <div className="opt-row">
            <span>Tile size</span>
            <div className="seg wide" role="group" aria-label="Tile size">
              {[['comfortable', 'Comfortable'], ['compact', 'Compact'], ['mini', 'Mini']].map(([id, label]) => (
                <button key={id} className={(prefs.density || 'compact') === id ? 'on' : ''} onClick={() => set({ density: id })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="switch-list">
            <Switch on={prefs.dock !== 'off'} onChange={(v) => set({ dock: v ? 'float' : 'off' })} label="Dock" hint="A floating bar with search, your top apps and shortcuts" />
          </div>
        </>
      ),
    },
    {
      title: 'Put it on your desktop?',
      body: (
        <>
          <div className="switch-list">
            <Switch
              on={!!prefs.desktopMode}
              onChange={onToggleDesktop}
              label="Show panels on my desktop"
              hint={state.panelsBlocked ? 'Not while running as administrator' : 'Your usual desktop icons are hidden while Deskly runs, and come back when you turn this off or quit'}
              disabled={state.panelsBlocked && !prefs.desktopMode}
            />
            <Switch
              on={!!prefs.autostart}
              onChange={onToggleAutostart}
              label="Start with Windows"
              hint={state.canAutostart ? 'Panels are there when you sign in' : 'Available in the installed app'}
              disabled={!state.canAutostart || !prefs.desktopMode}
            />
          </div>
          <p className="fine">Not sure yet? Leave it off and use Deskly as a normal window. Switch it on any time from the sidebar.</p>
          {(state.displays || []).length > 1 && <p className="fine"><MonitorUp size={14} /> You have {state.displays.length} screens. Choose which one hosts the panels in Panels → General.</p>}
        </>
      ),
    },
    {
      title: 'Handy to know',
      body: (
        <ul className="wl-points">
          <li><Keyboard size={16} /> <span>Search anything from anywhere with <kbd>{(state.hotkey || 'Alt+Space').replace('Control', 'Ctrl')}</kbd></span></li>
          <li><Keyboard size={16} /> <span>Hide or show every panel with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>H</kbd>; switch scenes with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>9</kbd></span></li>
          <li><Sparkles size={16} /> <span><b>Tidy desktop</b> (bottom of the sidebar) previews first, then files loose shortcuts into folders. One click undoes it</span></li>
          <li><Gauge size={16} /> <span><b>Performance</b> shows what is using memory and what starts with Windows</span></li>
        </ul>
      ),
    },
    {
      title: 'You are all set',
      body: (
        <>
          <p className="wl-lead">Everything you chose can be changed later in <b>Panels</b>. You can also save your whole setup to a file there and load it on another PC.</p>
          <p className="fine">Closing the window keeps Deskly running in the tray, so search and panels stay available.</p>
        </>
      ),
    },
  ];
  const s = steps[step];

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Deskly">
      <div className="welcome-card">
        <button className="wl-skip" onClick={finish} aria-label="Skip the tour"><X size={16} /> Skip</button>
        <div className="wl-dots">{steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}</div>
        <h1>{s.title}</h1>
        <div className="wl-body">{s.body}</div>
        <div className="wl-foot">
          {step > 0 ? <button className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</button> : <span />}
          {step < last ? (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>Next <ArrowRight size={15} /></button>
          ) : (
            <button className="btn-primary" onClick={finish}><Check size={15} /> Start using Deskly</button>
          )}
        </div>
      </div>
    </div>
  );
}
