import { useCallback, useEffect, useState } from 'react';
import {
  Cpu, MemoryStick, MonitorPlay, HardDrive, BatteryMedium, BatteryCharging, ExternalLink, Square, Code2, Terminal, FolderOpen,
  Sun, Moon, Cloud, CloudSun, CloudMoon, CloudFog, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, GitBranch, Copy, Play,
} from 'lucide-react';
import { api } from '../api.js';
import { Spark, Bar } from '../components/charts.jsx';
import { useSys, useBattery } from '../lib/useSys.js';
import { fmtBytes, fmtAgo, fmtUptime, describeServer } from '../lib/format.js';

const Empty = ({ children }) => <div className="w-empty">{children}</div>;

/* ---------------- System ---------------- */
export function SysWidget({ onOpen }) {
  const { sample: s, hist } = useSys(false);
  const bat = useBattery();
  if (!s) return <Empty>Reading sensors…</Empty>;
  const ramPct = (s.ram.used / s.ram.total) * 100;
  const topRam = (s.hogs.ram || []).slice(0, 3);
  return (
    <div className="w-sys">
      <div className="w-row">
        <div className="w-head"><Cpu size={14} /> <span>CPU</span><strong>{Math.round(s.cpu)}%</strong></div>
        <Spark data={hist.cpu} color="#38bdf8" height={30} />
      </div>
      <div className="w-row">
        <div className="w-head"><MemoryStick size={14} /> <span>Memory</span><strong>{fmtBytes(s.ram.used)} <em>/ {fmtBytes(s.ram.total, 0)}</em></strong></div>
        <Bar value={ramPct} color="#a78bfa" />
      </div>
      {s.gpu && (
        <div className="w-row">
          <div className="w-head"><MonitorPlay size={14} /> <span>GPU</span><strong>{Math.round(s.gpu.util)}% <em>{s.gpu.temp}°C</em></strong></div>
          <Bar value={s.gpu.util} color="#34d399" />
          <div className="w-sub">{fmtBytes(s.gpu.memUsed)} / {fmtBytes(s.gpu.memTotal, 0)} VRAM{s.gpu.apps && s.gpu.apps.length ? ` · ${s.gpu.apps.slice(0, 3).join(', ')}` : ''}</div>
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
        <div className="w-sub">Using the most memory</div>
        {topRam.map((h) => (
          <button key={h.name} className="w-hog" onClick={onOpen} title="Open Performance">
            <span>{h.name}{h.count > 1 ? ` ×${h.count}` : ''}</span><b>{fmtBytes(h.ram)}</b>
          </button>
        ))}
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

/* ---------------- Clock + weather ---------------- */
const weatherIcon = (code, day) => {
  if (code === 0) return day ? Sun : Moon;
  if (code <= 2) return day ? CloudSun : CloudMoon;
  if (code === 3) return Cloud;
  if (code <= 48) return CloudFog;
  if (code <= 57) return CloudDrizzle;
  if (code <= 67 || (code >= 80 && code <= 82)) return CloudRain;
  if (code <= 77 || code === 85 || code === 86) return CloudSnow;
  return CloudLightning;
};

export function ClockWidget({ state }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);
  const w = state.weather;
  const WI = w && !w.error ? weatherIcon(w.code, w.isDay) : null;
  return (
    <div className="w-clock">
      <div className="clock-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      <div className="clock-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {WI && (
        <div className="clock-weather"><WI size={18} /> <strong>{w.temp}°</strong> <span>{w.city}</span></div>
      )}
      {w && w.error && <div className="w-sub err">{w.error}</div>}
    </div>
  );
}
