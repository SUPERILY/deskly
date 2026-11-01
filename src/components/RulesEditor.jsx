import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { CatIcon } from '../icons.jsx';
import Switch from './Switch.jsx';

const FIELDS = [['name', 'name'], ['path', 'target / address'], ['ext', 'file type']];
const OPS = [['contains', 'contains'], ['startsWith', 'starts with'], ['equals', 'is exactly'], ['regex', 'matches pattern']];
const label = (list, v) => (list.find(([k]) => k === v) || [v, v])[1];

export default function RulesEditor({ state, setState, say }) {
  const cats = state.categories;
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const rules = state.rules || [];
  const [form, setForm] = useState({ field: 'name', op: 'contains', value: '', cat: 'games' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const add = async () => {
    if (!form.value.trim()) return;
    setState(await api.addRule(form));
    set({ value: '' });
    say('Rule added. It applies to everything on your desktop right away.');
  };

  const setAutoSort = async (v) => {
    const p = await api.setPrefs({ autoSort: v });
    setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));
    say(v ? 'New shortcuts will be filed into folders automatically' : 'Auto-sort is off');
  };

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1><span className="grad">Rules</span></h1>
          <p>Teach Deskly how you like things sorted. Your rules run before the built-in ones.</p>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">New rule</h2>
        <div className="rule-form">
          <span className="rf-word">If</span>
          <select value={form.field} onChange={(e) => set({ field: e.target.value })} aria-label="Field">
            {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={form.op} onChange={(e) => set({ op: e.target.value })} aria-label="Condition">
            {OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input
            value={form.value}
            placeholder={form.field === 'ext' ? '.pdf' : form.field === 'path' ? 'steamapps' : 'craft'}
            onChange={(e) => set({ value: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label="Text to match"
          />
          <span className="rf-word">→</span>
          <select value={form.cat} onChange={(e) => set({ cat: e.target.value })} aria-label="Category">
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-small add" onClick={add} disabled={!form.value.trim()}><Plus size={15} /> Add</button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Your rules <em>{rules.length}</em></h2>
        {rules.length === 0 ? (
          <p className="fine">No rules yet. Try: if <b>name</b> contains <b>craft</b> → Creative.</p>
        ) : (
          <div className="rules">
            {rules.map((r, i) => {
              const c = catById[r.cat];
              return (
                <div className={'rule' + (r.enabled === false ? ' off' : '')} key={r.id} style={{ '--c': c?.color || '#8b5cf6' }}>
                  <span className="rule-n">{i + 1}</span>
                  <span className="rule-text">
                    If <b>{label(FIELDS, r.field)}</b> {label(OPS, r.op)} <code>{r.value}</code> →
                    <span className="rule-cat"><CatIcon name={c?.icon} size={13} /> {c?.name || 'Unknown'}</span>
                  </span>
                  <span className="rule-matches" title="Items on your desktop this rule matches">{r.matches} match{r.matches === 1 ? '' : 'es'}</span>
                  <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={async () => setState(await api.moveRule(r.id, -1))}><ArrowUp size={15} /></button>
                  <button className="icon-btn" aria-label="Move down" disabled={i === rules.length - 1} onClick={async () => setState(await api.moveRule(r.id, 1))}><ArrowDown size={15} /></button>
                  <button className={'mini-switch' + (r.enabled === false ? '' : ' on')} role="switch" aria-checked={r.enabled !== false} aria-label="Enabled" onClick={async () => setState(await api.toggleRule(r.id))}><i /></button>
                  <button className="icon-btn danger" aria-label="Delete rule" onClick={async () => { setState(await api.deleteRule(r.id)); say('Rule deleted'); }}><Trash2 size={15} /></button>
                </div>
              );
            })}
          </div>
        )}
        <p className="fine">Rules are checked from top to bottom and the first match wins. Dragging a tile to another category always beats a rule.</p>
      </section>

      <section className="card">
        <h2 className="card-title"><Wand2 size={16} /> Automation</h2>
        <div className="switch-list">
          <Switch
            on={state.prefs.autoSort}
            onChange={setAutoSort}
            label="Auto-sort new shortcuts"
            hint="When an installer drops a new shortcut on your desktop, file it into its category folder. Undo any time with “Undo last tidy”."
          />
        </div>
      </section>
    </div>
  );
}
