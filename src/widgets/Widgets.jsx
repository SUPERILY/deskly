import { useCallback, useEffect, useState } from 'react';
import {
  Cpu, MemoryStick, MonitorPlay, HardDrive, BatteryMedium, BatteryCharging, ExternalLink, Square, Code2, Terminal, FolderOpen,
  GitBranch, Copy, Play, Scissors, Camera, Pipette, Check, Music, SkipBack, SkipForward, Pause,
} from 'lucide-react';
import { api } from '../api.js';
import { Spark, Bar } from '../components/charts.jsx';
import { useSys, useBattery } from '../lib/useSys.js';
import { fmtBytes, fmtAgo, fmtUptime, describeServer } from '../lib/format.js';

const Empty = ({ children }) => <div className="w-empty">{children}</div>;

/* ---------------- Ring Gauge Component ---------------- */
function RingGauge({ value, max = 100, color = '#38bdf8', label, unit = '%' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const strokeDash = `${pct}, 100`;
  return (
    <div className="w-gauge">
      <div className="w-gauge-ring">
        <svg viewBox="0 0 36 36" className="w-gauge-svg">
          <path className="w-gauge-bg" strokeWidth="3.6" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path className="w-gauge-val" stroke={color} strokeDasharray={strokeDash} strokeWidth="3.6" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
        </svg>
        <span className="w-gauge-val-text" style={{ color }}>{Math.round(value)}<small>{unit}</small></span>
      </div>
      <span className="w-gauge-lbl">{label}</span>
    </div>
  );
}

/* ---------------- System / Performance HUD ---------------- */
export function SysWidget({ onOpen }) {
  const { sample: s, hist } = useSys(false);
  const bat = useBattery();
  if (!s) return <Empty>Reading sensors…</Empty>;
  const ramPct = (s.ram.used / s.ram.total) * 100;
  const ramColor = ramPct > 85 ? '#f43f5e' : ramPct > 70 ? '#fbbf24' : '#a78bfa';
  const cpuColor = s.cpu > 80 ? '#f43f5e' : s.cpu > 50 ? '#fbbf24' : '#38bdf8';
  const gpuColor = s.gpu && s.gpu.temp > 80 ? '#f43f5e' : '#34d399';
  const topRam = (s.hogs.ram || []).slice(0, 3);

  return (
    <div className="w-sys">
      {/* Circular Gauge Meter Trio */}
      <div className="w-gauges-row">
        <RingGauge value={s.cpu} color={cpuColor} label="CPU" />
        <RingGauge value={ramPct} color={ramColor} label="RAM" />
        {s.gpu ? (
          <RingGauge value={s.gpu.temp || s.gpu.util || 0} max={100} color={gpuColor} label="GPU" unit="°C" />
        ) : (
          <RingGauge value={0} color="#34d399" label="GPU" unit="°C" />
        )}
      </div>

      <div className="w-row">
        <div className="w-head"><Cpu size={14} /> <span>CPU Activity</span><strong>{Math.round(s.cpu)}%</strong></div>
        <Spark data={hist.cpu} color={cpuColor} height={26} />
      </div>

      <div className="w-row">
        <div className="w-head"><MemoryStick size={14} /> <span>Memory</span><strong>{fmtBytes(s.ram.used)} <em>/ {fmtBytes(s.ram.total, 0)}</em></strong></div>
        <Bar value={ramPct} color={ramColor} />
      </div>

      {s.gpu && (
        <div className="w-row">
          <div className="w-head"><MonitorPlay size={14} /> <span>GPU ({Math.round(s.gpu.temp)}°C)</span><strong>{Math.round(s.gpu.util)}%</strong></div>
          <div className="w-sub">{fmtBytes(s.gpu.memUsed)} / {fmtBytes(s.gpu.memTotal, 0)} VRAM{s.gpu.apps && s.gpu.apps.length ? ` · ${s.gpu.apps.slice(0, 2).join(', ')}` : ''}</div>
        </div>
      )}

      {(s.disks || []).map((d) => (
        <div className="w-row" key={d.drive}>
          <div className="w-head"><HardDrive size={14} /> <span>{d.drive}</span><strong>{fmtBytes(d.free, 0)} <em>free of {fmtBytes(d.total, 0)}</em></strong></div>
          <Bar value={d.total - d.free} max={d.total} color="#fbbf24" warn={92} />
        </div>
      ))}

      {bat && (
        <div className="w-head solo">{bat.charging ? <BatteryCharging size={14} /> : <BatteryMedium size={14} />} <span>Battery</span><strong>{bat.level}%{bat.charging ? ' ⚡' : ''}</strong></div>
      )}

      <div className="w-hogs">
        <div className="w-sub">Top memory consumers</div>
        {topRam.map((h) => (
          <button key={h.name} className="w-hog" onClick={onOpen} title="Open Performance in Deskly">
            <span>{h.name}{h.count > 1 ? ` ×${h.count}` : ''}</span><b>{fmtBytes(h.ram)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Screen Capture & Tools ---------------- */
export function CaptureWidget() {
  const [shots, setShots] = useState([]);
  const [copied, setCopied] = useState(null);
  const [eyedropMsg, setEyedropMsg] = useState(null);

  const loadShots = useCallback(async () => {
    try {
      const list = await api.recentScreenshots?.(4);
      setShots(list || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadShots();
    const id = setInterval(loadShots, 15000);
    return () => clearInterval(id);
  }, [loadShots]);

  const snip = async () => {
    await api.triggerSnip?.();
    setTimeout(loadShots, 2500);
  };

  const copyShot = async (s) => {
    await api.copyScreenshot?.(s.path);
    setCopied(s.path);
    setTimeout(() => setCopied(null), 2000);
  };

  const pickColor = async () => {
    if (window.EyeDropper) {
      try {
        const dropper = new window.EyeDropper();
        const res = await dropper.open();
        if (res && res.sRGBHex) {
          await api.copyText(res.sRGBHex);
          setEyedropMsg(res.sRGBHex);
          setTimeout(() => setEyedropMsg(null), 2500);
        }
      } catch {}
    } else {
      await api.copyText('#38bdf8');
      setEyedropMsg('#38bdf8 copied');
      setTimeout(() => setEyedropMsg(null), 2000);
    }
  };

  return (
    <div className="w-capture">
      <div className="capture-actions">
        <button className="cap-btn primary" onClick={snip} title="Open Snipping Tool (Win+Shift+S)">
          <Scissors size={15} />
          <span>Snip Area</span>
        </button>
        <button className="cap-btn" onClick={snip} title="Full Screen Capture">
          <Camera size={15} />
          <span>Full Screen</span>
        </button>
        <button className="cap-btn" onClick={pickColor} title="Sample any pixel color on screen">
          <Pipette size={15} />
          <span>{eyedropMsg || 'Eyedropper'}</span>
        </button>
      </div>

      <div className="capture-reel">
        <div className="capture-reel-head">
          <span>Recent Screenshots</span>
          <button className="cap-link" onClick={() => api.openMain('filetools')}>File to Month ↗</button>
        </div>
        {shots.length === 0 ? (
          <div className="cap-empty">No recent screenshots found in Pictures\Screenshots</div>
        ) : (
          <div className="cap-grid">
            {shots.map((st) => (
              <div className="cap-thumb-card" key={st.path} onClick={() => copyShot(st)} title={`Click to copy: ${st.name}`}>
                {st.thumb ? (
                  <img src={st.thumb} alt={st.name} className="cap-img" />
                ) : (
                  <div className="cap-placeholder"><Camera size={16} /></div>
                )}
                <div className="cap-overlay">
                  {copied === st.path ? (
                    <span className="cap-tag copied"><Check size={11} /> Copied!</span>
                  ) : (
                    <span className="cap-tag"><Copy size={11} /> Copy</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Dev servers ---------------- */
export function DevWidget() {
  const { sample: s } = useSys(false);
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState('');
  if (!s) return <Empty>Looking for servers…</Empty>;
  const servers = (s.servers || []).slice().sort((a, b) => a.port - b.port);
  if (!servers.length) return <Empty>No dev servers running.<br /><small>Start one (vite, next, python…) and it shows up here.</small></Empty>;

  const stop = async (sv) => {
    if (confirm !== sv.pid) {
      setConfirm(sv.pid);
      setTimeout(() => setConfirm((c) => (c === sv.pid ? null : c)), 3500);
      return;
    }
    const r = await api.killProcs([sv.pid]);
    setConfirm(null);
    setMsg(r.ok ? '' : r.error || 'Could not stop it');
  };

  return (
    <div className="w-dev">
      {servers.map((sv) => {
        const d = describeServer(sv);
        const old = sv.start && Date.now() - sv.start > 6 * 3600 * 1000;
        return (
          <div className="dev-row" key={sv.pid + ':' + sv.port}>
            <div className="dev-main">
              <strong>{d.title}</strong>
              <small>:{sv.port} · {fmtBytes(sv.ram, 0)} · up {fmtUptime(sv.start)}{old ? ' · forgotten?' : ''}</small>
            </div>
            <button className="w-ico" title={`Open localhost:${sv.port}`} onClick={() => api.openPort(sv.port)}><ExternalLink size={15} /></button>
            <button className="w-ico" title="Copy URL" onClick={() => api.copyText(`http://localhost:${sv.port}`)}><Copy size={14} /></button>
            <button className={'w-ico stop' + (confirm === sv.pid ? ' arm' : '')} title="Stop server" onClick={() => stop(sv)}>
              {confirm === sv.pid ? 'Stop?' : <Square size={13} fill="currentColor" />}
            </button>
          </div>
        );
      })}
      {msg && <div className="w-sub err">{msg}</div>}
    </div>
  );
}

/* ---------------- Projects ---------------- */
export function ProjectsWidget() {
  const [lib, setLib] = useState(null);
  const refresh = useCallback(() => api.getLibrary().then(setLib), []);
  useEffect(() => {
    refresh();
    const off = api.onChanged?.(refresh);
    return () => off?.();
  }, [refresh]);
  if (!lib) return <Empty>Indexing your projects…</Empty>;
  const list = lib.projects.slice(0, 6);
  if (!list.length) return <Empty>No git projects found.<br /><small>Deskly looks in "My projects", Documents\GitHub and source\repos.</small></Empty>;
  return (
    <div className="w-proj">
      {list.map((p) => (
        <div className="proj-row" key={p.key}>
          <button className="proj-main" onClick={() => api.projectAction(p.key, 'code')} title={`Open ${p.name} in VS Code`}>
            <strong>{p.name}</strong>
            <small>
              {p.branch && <span className="chip"><GitBranch size={11} /> {p.branch}</span>}
              {p.dirty > 0 && <span className="chip warn">{p.dirty} changed</span>}
              {p.ahead > 0 && <span className="chip warn" title={`${p.ahead} commits not pushed`}>↑{p.ahead}</span>}
              <span>{fmtAgo(p.last)}</span>
            </small>
          </button>
          {p.workspace && <button className="w-ico" title="Launch workspace" onClick={() => api.launchWorkspace(p.key)}><Play size={14} fill="currentColor" /></button>}
          <button className="w-ico" title="Open in VS Code" onClick={() => api.projectAction(p.key, 'code')}><Code2 size={15} /></button>
          <button className="w-ico" title="Open a terminal here" onClick={() => api.projectAction(p.key, 'terminal')}><Terminal size={15} /></button>
          <button className="w-ico" title="Show folder" onClick={() => api.projectAction(p.key, 'folder')}><FolderOpen size={15} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Recent ---------------- */
export function RecentWidget() {
  const [items, setItems] = useState(null);
  const refresh = useCallback(() => api.getRecent().then(setItems), []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);
  if (!items) return <Empty>Looking at your recent files…</Empty>;
  if (!items.length) return <Empty>Nothing opened recently.</Empty>;
  return (
    <div className="w-recent">
      {items.slice(0, 6).map((r) => (
        <button className="recent-row" key={r.key} onClick={() => api.open(r.path, r.key)} title={r.path}>
          <span className="p-icon sm">{r.icon ? <img src={r.icon} alt="" draggable={false} /> : <span className="p-fallback">{r.name[0]}</span>}</span>
          <span className="recent-text"><strong>{r.name}</strong><small>{r.source.split('\\').slice(-2).join('\\')}</small></span>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Clock + Ambient Media ---------------- */
export function ClockWidget() {
  const [now, setNow] = useState(new Date());
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-clock">
      <div className="clock-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</div>
      <div className="clock-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      
      {/* Ambient Music / Media Strip */}
      <div className="clock-ambient">
        <div className="ambient-ico"><Music size={13} /></div>
        <div className="ambient-meta">
          <strong>Now Playing</strong>
          <small>Spotify · System Audio</small>
        </div>
        <div className="ambient-controls">
          <button className="amb-btn" title="Previous"><SkipBack size={12} /></button>
          <button className="amb-btn play" title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button className="amb-btn" title="Next"><SkipForward size={12} /></button>
        </div>
      </div>
    </div>
  );
}
