import { useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Star, EyeOff, RotateCcw } from 'lucide-react';

export default function ContextMenu({ menu, categories, onClose, onOpen, onReveal, onPin, onHide, onMove }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 12),
      y: Math.min(menu.y, window.innerHeight - r.height - 12),
    });
  }, [menu.x, menu.y]);

  const { item } = menu;
  const hasOverride = item.category !== item.auto;

  return (
    <div className="menu-backdrop" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        className="menu"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="menu-title">{item.name}</div>
        <button onClick={() => { onOpen(item); onClose(); }}><ExternalLink size={15} /> Open</button>
        <button onClick={() => { onReveal(item); onClose(); }}><FolderOpen size={15} /> Show in folder</button>
        <button onClick={() => { onPin(item); onClose(); }}>
          <Star size={15} fill={item.pinned ? 'currentColor' : 'none'} /> {item.pinned ? 'Remove from favorites' : 'Add to favorites'}
        </button>

        <div className="menu-sep" />
        <div className="menu-label">Move to</div>
        <div className="menu-cats">
          {categories.map((c) => (
            <button
              key={c.id}
              className={c.id === item.category ? 'on' : ''}
              onClick={() => { onMove(item, c); onClose(); }}
            >
              <i style={{ background: c.color }} /> {c.name}
            </button>
          ))}
        </div>
        {hasOverride && (
          <button onClick={() => { onMove(item, null); onClose(); }}>
            <RotateCcw size={15} /> Reset to automatic
          </button>
        )}

        <div className="menu-sep" />
        <button className="danger" onClick={() => { onHide(item); onClose(); }}>
          <EyeOff size={15} /> Hide from Deskly
        </button>
      </div>
    </div>
  );
}
