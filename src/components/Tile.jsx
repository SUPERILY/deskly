import { Star, Lock, Folder } from 'lucide-react';

function Fallback({ name }) {
  const l = (name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase();
  return <div className="icon-fallback">{l}</div>;
}

export default function Tile({ item, color, index, launching, running, showCat, catName, onOpen, onMenu, onPin }) {
  return (
    <button
      className={'tile' + (launching ? ' launching' : '') + (item.pinned ? ' pinned' : '')}
      style={{ '--c': color, '--i': Math.min(index, 24) }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/deskly-key', item.key);
        e.dataTransfer.effectAllowed = 'move';
        document.body.classList.add('dragging');
      }}
      onDragEnd={() => document.body.classList.remove('dragging')}
      onClick={() => onOpen(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e, item);
      }}
      title={item.target || item.url || item.path}
    >
      <span
        className={'pin' + (item.pinned ? ' on' : '')}
        role="button"
        aria-label={item.pinned ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation();
          onPin(item);
        }}
      >
        <Star size={15} fill={item.pinned ? 'currentColor' : 'none'} />
      </span>

      {item.isNew && <span className="new-pill">NEW</span>}

      <span className="icon-wrap">
        {item.icon ? <img src={item.icon} alt="" draggable={false} /> : <Fallback name={item.name} />}
        {item.kind === 'dir' && <Folder className="badge-dir" size={14} />}
        {item.sensitive && <Lock className="badge-lock" size={12} />}
        {running && <i className="run-dot" title="Running" />}
      </span>

      <span className="tile-name">{item.name}</span>
      {showCat && <span className="tile-cat" style={{ color }}>{catName}</span>}
    </button>
  );
}
