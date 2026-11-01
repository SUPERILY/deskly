import { useState } from 'react';
import { LayoutGrid, Star, Plus, Sparkles, Undo2, Trash2, Eye, SlidersHorizontal, ListChecks, AppWindow, Gauge, Layers, Workflow, FolderDown } from 'lucide-react';
import { CatIcon } from '../icons.jsx';
import Switch from './Switch.jsx';

const SWATCHES = ['#ff4d8d', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#38bdf8', '#8b5cf6', '#f472b6'];

function NavItem({ active, color, icon, label, count, onClick, onDropKey, onDelete }) {
  const [over, setOver] = useState(false);
  return (
    <button
      className={'nav-item' + (active ? ' active' : '') + (over ? ' drop' : '')}
      style={{ '--c': color }}
      onClick={onClick}
      onDragOver={(e) => {
        if (!onDropKey) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const key = e.dataTransfer.getData('text/deskly-key');
        if (key && onDropKey) onDropKey(key);
      }}
    >
      <span className="nav-chip">{icon}</span>
      <span className="nav-label-text">{label}</span>
      {onDelete && (
        <span
          className="nav-del"
          role="button"
          aria-label={`Delete ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} />
        </span>
      )}
      <span className="nav-count">{count}</span>
    </button>
  );
}

export default function Sidebar({
  categories, counts, active, onSelect, total, favCount, onDropKey, onAddCategory, onDeleteCategory,
  onTidy, onUndo, canUndo, hiddenCount, onUnhide,
  prefs = {}, panelsAvailable, panelsBlocked, onToggleDesktop, onToggleAutostart, onResetPanels, canAutostart, sceneName,
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[6]);

  const submit = () => {
    if (!name.trim()) return;
    onAddCategory({ name: name.trim(), color });
    setName('');
    setAdding(false);
  };

  return (
    <aside className="sidebar">
      <div className="brand drag">
        <span className="logo"><LayoutGrid size={18} strokeWidth={2.4} /></span>
        <span className="brand-name">Deskly</span>
      </div>

      <nav className="nav">
        <NavItem
          active={active === 'all'} color="#8b5cf6" label="Everything" count={total} onClick={() => onSelect('all')}
          icon={<LayoutGrid size={16} />}
        />
        <NavItem
          active={active === 'fav'} color="#fbbf24" label="Favorites" count={favCount} onClick={() => onSelect('fav')}
          icon={<Star size={16} />}
        />

        <div className="nav-section">
          <span>Categories</span>
          <button className="icon-btn" aria-label="New category" onClick={() => setAdding((v) => !v)}>
            <Plus size={15} />
          </button>
        </div>

        {adding && (
          <div className="add-cat">
            <input
              autoFocus
              value={name}
              maxLength={24}
              placeholder="Category name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className={'swatch' + (c === color ? ' on' : '')}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button className="btn-small" onClick={submit} disabled={!name.trim()}>Add category</button>
          </div>
        )}

        {categories.map((c) => (
          <NavItem
            key={c.id}
            active={active === c.id}
            color={c.color}
            label={c.name}
            count={counts[c.id] || 0}
            icon={<CatIcon name={c.icon} size={16} />}
            onClick={() => onSelect(c.id)}
            onDropKey={(key) => onDropKey(key, c)}
            onDelete={c.custom ? () => onDeleteCategory(c) : null}
          />
        ))}

        <div className="nav-section"><span>Tools</span></div>
        <NavItem active={active === 'apps'} color="#8b5cf6" label="All apps" onClick={() => onSelect('apps')} icon={<AppWindow size={16} />} />
        <NavItem active={active === 'performance'} color="#38bdf8" label="Performance" onClick={() => onSelect('performance')} icon={<Gauge size={16} />} />
        <NavItem active={active === 'scenes'} color="#f472b6" label="Scenes" count={sceneName || ''} onClick={() => onSelect('scenes')} icon={<Layers size={16} />} />

        <NavItem active={active === 'automation'} color="#fb923c" label="Automation" onClick={() => onSelect('automation')} icon={<Workflow size={16} />} />
        <NavItem active={active === 'filetools'} color="#2dd4bf" label="File cleanup" onClick={() => onSelect('filetools')} icon={<FolderDown size={16} />} />

        <div className="nav-section"><span>Customize</span></div>
        <NavItem active={active === 'panels'} color="#8b5cf6" label="Panels" onClick={() => onSelect('panels')} icon={<SlidersHorizontal size={16} />} />
        <NavItem active={active === 'rules'} color="#34d399" label="Rules" onClick={() => onSelect('rules')} icon={<ListChecks size={16} />} />
      </nav>

      <div className="side-foot">
        {panelsAvailable && (
          <div className="switches">
            <Switch
              on={!!prefs.desktopMode}
              onChange={onToggleDesktop}
              label="Desktop panels"
              hint={panelsBlocked ? 'Not while running as administrator' : 'Show sections on your desktop'}
              disabled={panelsBlocked && !prefs.desktopMode}
            />
            {prefs.desktopMode && (
              <>
                <Switch
                  on={!!prefs.autostart}
                  onChange={onToggleAutostart}
                  label="Start with Windows"
                  hint={canAutostart ? 'Panels appear at sign-in' : 'Available in the installed app'}
                  disabled={!canAutostart}
                />
                <button className="link-btn" onClick={onResetPanels}>Reset panel layout</button>
              </>
            )}
          </div>
        )}
        <button className="btn-primary" onClick={onTidy}>
          <Sparkles size={16} /> Tidy desktop
        </button>
        {canUndo && (
          <button className="btn-ghost" onClick={onUndo}>
            <Undo2 size={15} /> Undo last tidy
          </button>
        )}
        {hiddenCount > 0 && (
          <button className="link-btn" onClick={onUnhide}>
            <Eye size={13} /> {hiddenCount} hidden · restore
          </button>
        )}
      </div>
    </aside>
  );
}
