// Auto-scenes: switch scene when something happens (an app starts, you unplug, the evening begins).
//
// Rules act on the moment a condition BECOMES true ("edge"), not continuously, so you can still
// change the scene by hand afterwards. If a rule has "switch back", the scene before it is restored
// when the condition ends (only if the scene is still the one the rule set).
const { powerMonitor } = require('electron');

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function inWindow(w, now = new Date()) {
  const [fh, fm] = String(w.from || '00:00').split(':').map(Number);
  const [th, tm] = String(w.to || '00:00').split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const f = fh * 60 + fm;
  const t = th * 60 + tm;
  const inside = f === t ? true : f < t ? mins >= f && mins < t : mins >= f || mins < t;
  return inside && (w.days || DAYS).includes(now.getDay());
}

// `before`: was this rule true last time? Heat uses it as hysteresis so a reading flickering around the
// limit does not flip the scene back and forth.
function condition(rule, ctx, before = false) {
  const w = rule.when || {};
  if (w.kind === 'app') return ctx.running.has(String(w.exe || '').toLowerCase());
  if (w.kind === 'power') return w.state === 'battery' ? ctx.onBattery : !ctx.onBattery;
  if (w.kind === 'time') return inWindow(w);
  const h = ctx.health || {};
  if (w.kind === 'lowbat') {
    // on battery and at or under the level; unknown charge never triggers
    const pct = h.battery && h.battery.pct;
    return !!ctx.onBattery && typeof pct === 'number' && pct <= Number(w.below);
  }
  if (w.kind === 'hot') {
    const t = h.temps || [];
    const limit = Number(w.above);
    if (before) return t.length > 0 && t[t.length - 1] >= limit - 5; // stays on until it has cooled 5° below the limit
    return t.length >= 3 && t.slice(-3).every((x) => x >= limit); // starts after three hot readings in a row (about 90 s)
  }
  return false;
}

// One place that decides what a valid trigger looks like (used when adding a rule and when importing a setup).
function sanitizeWhen(w) {
  w = w && typeof w === 'object' ? w : {};
  if (w.kind === 'app' && /^[\w .()\-]{1,80}\.exe$/i.test(String(w.exe || '').trim())) {
    return { kind: 'app', exe: String(w.exe).trim().toLowerCase(), label: String(w.label || w.exe).slice(0, 40) };
  }
  if (w.kind === 'power' && ['battery', 'plugged'].includes(w.state)) return { kind: 'power', state: w.state };
  if (w.kind === 'time') {
    const hhmm = (v) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
      return m && +m[1] <= 23 && +m[2] <= 59 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
    };
    const from = hhmm(w.from);
    const to = hhmm(w.to);
    if (!from || !to) return null;
    const days = (Array.isArray(w.days) ? w.days : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter((d) => d >= 0 && d <= 6);
    return { kind: 'time', from, to, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] };
  }
  if (w.kind === 'lowbat' && Number.isInteger(Number(w.below)) && Number(w.below) >= 5 && Number(w.below) <= 90) return { kind: 'lowbat', below: Number(w.below) };
  if (w.kind === 'hot' && Number.isInteger(Number(w.above)) && Number(w.above) >= 50 && Number(w.above) <= 95) return { kind: 'hot', above: Number(w.above) };
  return null;
}

function describe(rule, sceneName) {
  const w = rule.when || {};
  const when =
    w.kind === 'app' ? `${w.label || w.exe} is running`
    : w.kind === 'power' ? (w.state === 'battery' ? 'you are on battery' : 'you are plugged in')
    : w.kind === 'lowbat' ? `the battery is at ${w.below}% or less`
    : w.kind === 'hot' ? `the graphics card is at ${w.above}°C or more`
    : `it is ${w.from}–${w.to}`;
  return `When ${when}, switch to ${sceneName}`;
}

function createAutomation({ getStore, save, getRunning, applyScene, onChange, getHealth = () => ({}) }) {
  const was = new Map(); // rule id -> condition last time
  const holds = new Map(); // rule id -> scene to go back to
  let timer = null;
  let busy = false;

  const state = () => {
    const s = getStore();
    s.automation ||= { rules: [], log: [] };
    return s.automation;
  };

  function log(text) {
    const a = state();
    a.log.unshift({ t: Date.now(), text });
    a.log.length = Math.min(a.log.length, 30);
    save();
    onChange();
  }

  async function evaluate() {
    if (busy) return;
    busy = true;
    try {
      const s = getStore();
      const ctx = { running: getRunning(), onBattery: !!powerMonitor.isOnBatteryPower(), health: getHealth() };
      for (const rule of state().rules) {
        if (rule.enabled === false) {
          was.set(rule.id, false);
          continue;
        }
        const before = was.get(rule.id) === true;
        const now = condition(rule, ctx, before);
        was.set(rule.id, now);
        const scene = s.scenes && s.scenes.find((x) => x.id === rule.scene);
        if (!scene) continue;

        if (now && !before) {
          if (rule.restore !== false) holds.set(rule.id, s.prefs.scene || null);
          if (s.prefs.scene !== rule.scene) {
            await applyScene(rule.scene);
            log(describe(rule, scene.name));
          }
        } else if (!now && before && rule.restore !== false && holds.has(rule.id)) {
          // only go back if nobody changed the scene since this rule set it
          if (s.prefs.scene === rule.scene) {
            const back = holds.get(rule.id);
            await applyScene(back);
            const name = back ? (s.scenes.find((x) => x.id === back) || {}).name : 'no scene';
            const w = rule.when || {};
            const why = w.kind === 'app' ? `${w.label || w.exe} closed` : w.kind === 'power' ? 'the power state changed' : w.kind === 'lowbat' ? 'the battery is no longer low' : w.kind === 'hot' ? 'the graphics card cooled down' : 'the time window ended';
            log(`Back to ${name || 'no scene'} because ${why}`);
          }
          holds.delete(rule.id);
        }
      }
    } catch (e) {
      console.error('automation failed', e);
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      clearInterval(timer);
      timer = setInterval(evaluate, 6000);
      powerMonitor.on('on-ac', evaluate);
      powerMonitor.on('on-battery', evaluate);
      setTimeout(evaluate, 4000);
    },
    stop() {
      clearInterval(timer);
    },
    evaluate,
    condition,
    inWindow,
  };
}

module.exports = { createAutomation, condition, inWindow, describe, sanitizeWhen };
