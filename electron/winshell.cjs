// Thin Win32 layer (via koffi) so Deskly panels can live on the desktop itself.
//
// Findings on Windows 11 (build 26300) that shape this file:
//  - The desktop is `Progman` holding SHELLDLL_DefView (the icons). A window re-parented
//    to Progman and kept at HWND_TOP among its children draws above the wallpaper, below every
//    normal window, survives Win+D, and still receives mouse input.
//  - A child of the desktop is positioned and sized in physical pixels (multiply DIPs by the
//    display scale factor).
const { spawnSync } = require('child_process');

let api = null;
let failed = false;

function load() {
  if (api) return api;
  if (failed || process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    const k32 = koffi.load('kernel32.dll');
    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const SYSTEM_POWER_STATUS = koffi.struct('SYSTEM_POWER_STATUS', {
      ACLineStatus: 'uint8',
      BatteryFlag: 'uint8',
      BatteryLifePercent: 'uint8',
      SystemStatusFlag: 'uint8',
      BatteryLifeTime: 'uint32',
      BatteryFullLifeTime: 'uint32',
    });
    api = {
      GetWindowRect: u.func('bool __stdcall GetWindowRect(uintptr_t h, _Out_ RECT *r)'),
      _RECT: RECT,
      FindWindowW: u.func('uintptr_t __stdcall FindWindowW(str16 c, str16 t)'),
      FindWindowExW: u.func('uintptr_t __stdcall FindWindowExW(uintptr_t p, uintptr_t a, str16 c, str16 t)'),
      SendMessageW: u.func('intptr_t __stdcall SendMessageW(uintptr_t h, uint32_t m, uintptr_t w, intptr_t l)'),
      RegisterWindowMessageW: u.func('uint32 __stdcall RegisterWindowMessageW(str16 s)'),
      SetParent: u.func('uintptr_t __stdcall SetParent(uintptr_t c, uintptr_t p)'),
      SetWindowPos: u.func('bool __stdcall SetWindowPos(uintptr_t h, uintptr_t a, int x, int y, int cx, int cy, uint32_t f)'),
      GetWindowLongPtrW: u.func('intptr_t __stdcall GetWindowLongPtrW(uintptr_t h, int i)'),
      SetWindowLongPtrW: u.func('intptr_t __stdcall SetWindowLongPtrW(uintptr_t h, int i, intptr_t v)'),
      IsWindow: u.func('bool __stdcall IsWindow(uintptr_t h)'),
      GetSystemPowerStatus: k32.func('bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *s)'),
      _SYSTEM_POWER_STATUS: SYSTEM_POWER_STATUS,
      GetFileAttributesW: k32.func('uint32 __stdcall GetFileAttributesW(str16 p)'),
    };
  } catch (e) {
    console.error('winshell unavailable:', e.message);
    failed = true;
    api = null;
  }
  return api;
}

const available = () => !!load();
const hwndOf = (win) => win.getNativeWindowHandle().readBigUInt64LE(0);
const progman = () => {
  const k = load();
  return k ? BigInt(k.FindWindowW('Progman', null)) : 0n;
};

const GWL_STYLE = -16;
const WS_POPUP = 0x80000000n;
const WS_CHILD = 0x40000000n;
const WS_VISIBLE = 0x10000000n;
const SWP_NOACTIVATE = 0x0010;
const SWP_SHOWWINDOW = 0x0040;

// Re-parent a BrowserWindow onto the desktop. Returns the Progman handle used.
function attach(win) {
  const k = load();
  const pm = progman();
  if (!k || !pm) return 0n;
  const h = hwndOf(win);
  const style = BigInt(k.GetWindowLongPtrW(h, GWL_STYLE));
  k.SetWindowLongPtrW(h, GWL_STYLE, BigInt.asIntN(64, (style & ~WS_POPUP) | WS_CHILD | WS_VISIBLE));
  k.SetParent(h, pm);
  return pm;
}

// Where the desktop window starts, in physical screen pixels. With several screens the desktop covers all
// of them, so its top-left can be negative (a screen to the left of or above the main one); children are
// positioned relative to it.
function desktopOrigin() {
  const k = load();
  const pm = progman();
  if (!k || !pm) return { left: 0, top: 0 };
  const r = {};
  try {
    if (k.GetWindowRect(pm, r) && Number.isFinite(r.left) && Number.isFinite(r.top)) return { left: r.left, top: r.top };
  } catch {}
  return { left: 0, top: 0 };
}

// DIP rectangle (virtual-screen coordinates, as Electron reports them) -> child-window rectangle in physical
// pixels. Pure, so it can be tested with fake screens. `scaleAt` gives the scale factor of the screen the
// rectangle is on (each screen can have its own).
function childRect(dip, origin, dipToScreen, scaleAt) {
  const p = dipToScreen({ x: Math.round(dip.x), y: Math.round(dip.y) });
  const sf = scaleAt({ x: Math.round(dip.x + dip.w / 2), y: Math.round(dip.y + dip.h / 2) });
  return { x: Math.round(p.x - origin.left), y: Math.round(p.y - origin.top), w: Math.round(dip.w * sf), h: Math.round(dip.h * sf) };
}

// Position and size given in DIPs. A window parented to the desktop is positioned in physical pixels
// relative to the desktop window, so convert. Also keeps it on top of the desktop's children.
function place(win, x, y, w, h) {
  const k = load();
  if (!k) return;
  const { screen } = require('electron');
  const r = childRect({ x, y, w, h }, desktopOrigin(), (pt) => screen.dipToScreenPoint(pt), (pt) => screen.getDisplayNearestPoint(pt).scaleFactor);
  k.SetWindowPos(hwndOf(win), 0n, r.x, r.y, r.w, r.h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

function isAlive(handle) {
  const k = load();
  return !!k && !!handle && k.IsWindow(handle);
}

// ---- desktop icons (Explorer's "Show desktop icons") ----
const ADV_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';

function iconsHidden() {
  const r = spawnSync('reg', ['query', ADV_KEY, '/v', 'HideIcons'], { windowsHide: true, encoding: 'utf8' });
  const m = /HideIcons\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(r.stdout || '');
  return m ? parseInt(m[1], 16) === 1 : false;
}

function findDefView() {
  const k = load();
  if (!k) return 0n;
  const pm = progman();
  if (pm) {
    const dv = BigInt(k.FindWindowExW(pm, 0n, 'SHELLDLL_DefView', null));
    if (dv) return dv;
  }
  // If Windows wallpaper slideshow, Spotlight, or Wallpaper Engine is active,
  // SHELLDLL_DefView is hosted inside a top-level WorkerW window instead of Progman.
  let worker = 0n;
  for (let i = 0; i < 20; i++) {
    worker = BigInt(k.FindWindowExW(0n, worker, 'WorkerW', null));
    if (!worker) break;
    const dv = BigInt(k.FindWindowExW(worker, 0n, 'SHELLDLL_DefView', null));
    if (dv) return dv;
  }
  return 0n;
}

// Toggles only when the current state differs. Returns true if it changed anything.
function setIconsHidden(hide) {
  const k = load();
  if (!k || iconsHidden() === hide) return false;
  const defView = findDefView();
  if (!defView) return false;
  k.SendMessageW(defView, 0x111 /* WM_COMMAND */, 0x7402n /* Show desktop icons */, 0n);
  return true;
}

let taskbarMsgCache = null;
function getTaskbarCreatedMsg() {
  if (taskbarMsgCache !== null) return taskbarMsgCache;
  const k = load();
  taskbarMsgCache = k ? k.RegisterWindowMessageW('TaskbarCreated') : 0;
  return taskbarMsgCache;
}

// Win32 native battery status: 0ms, zero background processes, 0% CPU.
function getPowerStatus() {
  const k = load();
  if (!k) return undefined;
  const s = {};
  try {
    if (!k.GetSystemPowerStatus(s)) return undefined;
    // BatteryFlag 128 = No system battery (e.g. desktop PC)
    if (s.BatteryFlag === 128 || s.BatteryLifePercent > 100) return null;
    return {
      pct: s.BatteryLifePercent,
      onBattery: s.ACLineStatus === 0,
    };
  } catch {
    return undefined;
  }
}

// Checks if a file path is a cloud-only placeholder (e.g. OneDrive placeholder/reparse point).
// Instant in-process Win32 call, replacing multi-second PowerShell script.
const CLOUD_ATTR_MASK = 0x400 | 0x1000 | 0x40000 | 0x400000;
function isCloudPlaceholder(filePath) {
  const k = load();
  if (!k) return false;
  try {
    const attr = k.GetFileAttributesW(filePath);
    if (attr === 0xffffffff || attr === -1) return false;
    return (attr & CLOUD_ATTR_MASK) !== 0;
  } catch {
    return false;
  }
}

module.exports = {
  available,
  attach,
  place,
  isAlive,
  progman,
  findDefView,
  iconsHidden,
  setIconsHidden,
  desktopOrigin,
  childRect,
  getTaskbarCreatedMsg,
  getPowerStatus,
  isCloudPlaceholder,
};
