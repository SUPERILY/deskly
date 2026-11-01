import { useEffect, useState } from 'react';
import { Clock, Cpu, MemoryStick, Thermometer, BatteryMedium, HardDrive, Copy, Lightbulb, MonitorPlay, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { Bar } from './charts.jsx';
import { fmtBytes } from '../lib/format.js';

// "This week": what your PC went through over the last days, in plain words.
export default function ReportTab({ say }) {
  const [r, setR] = useState(null);
  const [span, setSpan] = useState(7);
  const load = () => api.healthReport(span).then(setR);
  useEffect(() => { setR(null); load(); }, [span]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return <section className="card"><p className="fine">Reading your history…</p></section>;

  if (!r.have) {
    return (
      <section className="card empty-card">
        <Clock size={30} />
        <h3>Collecting your first day</h3>
        <p>While Deskly runs, it notes memory, processor, graphics temperature, battery and free space every 5 minutes. Check back tomorrow for the first report. Everything stays on this PC.</p>
      </section>
    );
  }

  const tiles = [
    { icon: Clock, label: 'Watched', value: `${r.hours} h`, sub: `${r.have} of ${r.span} days` },
    { icon: Cpu, label: 'Processor', value: `${r.cpuAvg}%`, sub: `average · peak ${r.cpuMax}%` },
    { icon: MemoryStick, label: 'Memory', value: `${r.ramAvg}%`, sub: `average · peak ${r.ramMax}%`, warn: r.ramHighHours >= 0.5 ? `${r.ramHighHours} h over 85%` : null },
    r.gpuMax != null && { icon: Thermometer, label: 'Graphics card', value: `${r.gpuMax}°C`, sub: 'hottest reading', warn: r.gpuHotHours >= 0.25 ? `${r.gpuHotHours} h over 80°C` : null },
    r.hasBattery && { icon: BatteryMedium, label: 'On battery', value: `${r.batteryHours} h`, sub: r.batteryMin != null ? `lowest ${r.batteryMin}%` : 'no unplugged time' },
  ].filter(Boolean);

  const maxRam = 100;
  return (
    <>
      <section className="card">
        <div className="files-head">
          <div>
            <h2 className="card-title"><Lightbulb size={15} /> What stands out</h2>
            {r.have < 3 && <p className="fine">Only {r.have} day{r.have === 1 ? '' : 's'} of data so far. The picture gets better after a few days.</p>}
          </div>
          <div className="files-tools">
            <label className="select-wrap">
              <span>Period</span>
              <select value={span} onChange={(e) => setSpan(Number(e.target.value))}>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </label>
            <button className="btn-ghost" onClick={() => { api.copyText(r.text); say('Report copied'); }}><Copy size={14} /> Copy report</button>
            <button className="btn-ghost" onClick={load}><RefreshCw size={14} /></button>
          </div>
        </div>
        <ul className="tips">
          {r.tips.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </section>

      <div className="stat-tiles">
        {tiles.map((t) => (
          <section className={'card stat' + (t.warn ? ' warn' : '')} key={t.label}>
            <h3><t.icon size={14} /> {t.label}</h3>
            <b>{t.value}</b>
            <small>{t.sub}</small>
            {t.warn && <em>{t.warn}</em>}
          </section>
        ))}
      </div>

      <section className="card">
        <h2 className="card-title"><MemoryStick size={15} /> Day by day <em>average use while Deskly was running</em></h2>
        <div className="daybars" style={{ '--n': r.days.length }}>
          {r.days.map((d) => (
            <div className={'daybar' + (d.hours ? '' : ' empty')} key={d.date} title={d.hours ? `${d.date}: memory ${d.ram}% (peak ${d.ramMax}%), processor ${d.cpu}%, ${d.hours} h watched` : `${d.date}: no data`}>
              <div className="col">
                <i className="ram" style={{ height: (d.ram != null ? (d.ram / maxRam) * 100 : 0) + '%' }} />
                <i className="cpu" style={{ height: (d.cpu != null ? (d.cpu / maxRam) * 100 : 0) + '%' }} />
              </div>
              <span>{r.days.length > 14 ? d.date.slice(8) : d.weekday}</span>
            </div>
          ))}
        </div>
        <p className="fine"><span className="dot ram" /> Memory <span className="dot cpu" /> Processor</p>
      </section>

      <div className="split">
        <section className="card">
          <h2 className="card-title"><MonitorPlay size={15} /> Biggest memory users</h2>
          {r.topApps.length === 0 && <p className="fine">Still learning. This fills in after a few readings.</p>}
          {r.topApps.map((a) => (
            <div className="app-use" key={a.name}>
              <span>{a.name}</span>
              <Bar value={a.avg} max={r.topApps[0].avg} color="#a78bfa" />
              <b>{fmtBytes(a.avg)}</b>
            </div>
          ))}
          <p className="fine">Average while the program was open, summed over all its processes.</p>
        </section>
        <section className="card">
          <h2 className="card-title"><HardDrive size={15} /> Free space</h2>
          {r.disks.length === 0 && <p className="fine">Needs two days of data to show a change.</p>}
          {r.disks.map((d) => (
            <div className="drive-change" key={d.drive}>
              <b>{d.drive}</b>
              <span>{fmtBytes(d.from, 0)} → {fmtBytes(d.to, 0)}</span>
              <em className={d.delta < 0 ? 'down' : 'up'}>{d.delta < 0 ? '−' : '+'}{fmtBytes(Math.abs(d.delta))}</em>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
