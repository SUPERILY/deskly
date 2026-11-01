import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Subscribes this window to the live system sampler and keeps ~2 minutes of history for the charts.
// The sampler only runs while at least one window is subscribed.
export function useSys(detail = false) {
  const [sample, setSample] = useState(null);
  const [hist, setHist] = useState({ cpu: [], ram: [], gpu: [] });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const push = (s) => {
      if (!alive.current || !s) return;
      setSample(s);
      setHist((h) => ({
        cpu: [...h.cpu.slice(-59), s.cpu],
        ram: [...h.ram.slice(-59), (s.ram.used / s.ram.total) * 100],
        gpu: [...h.gpu.slice(-59), s.gpu ? s.gpu.util : 0],
      }));
    };
    Promise.resolve(api.sysSubscribe(detail)).then(push);
    const off = api.onSys?.(push);
    return () => {
      alive.current = false;
      off?.();
      api.sysUnsubscribe?.();
    };
  }, [detail]);

  return { sample, hist };
}

// Battery via the browser API (no cost, no extra process).
export function useBattery() {
  const [b, setB] = useState(null);
  useEffect(() => {
    let battery;
    const update = () => battery && setB({ level: Math.round(battery.level * 100), charging: battery.charging });
    if (navigator.getBattery) {
      navigator.getBattery().then((x) => {
        battery = x;
        update();
        x.addEventListener('levelchange', update);
        x.addEventListener('chargingchange', update);
      }).catch(() => {});
    }
    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', update);
        battery.removeEventListener('chargingchange', update);
      }
    };
  }, []);
  return b;
}
