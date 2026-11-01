const { contextBridge, ipcRenderer } = require('electron');

const call = (name, ...args) => ipcRenderer.invoke('deskly:' + name, ...args);
const listen = (channel, cb) => {
  const h = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('deskly', {
  scan: () => call('scan'),
  open: (p, key) => call('open', p, key),
  reveal: (p) => call('reveal', p),
  setCategory: (key, cat) => call('setCategory', key, cat),
  togglePin: (key) => call('togglePin', key),
  hide: (key) => call('hide', key),
  unhideAll: () => call('unhideAll'),
  addCategory: (c) => call('addCategory', c),
  deleteCategory: (id) => call('deleteCategory', id),
  setPrefs: (p) => call('setPrefs', p),
  setPanelPrefs: (id, patch) => call('setPanelPrefs', id, patch),
  addRule: (r) => call('addRule', r),
  deleteRule: (id) => call('deleteRule', id),
  toggleRule: (id) => call('toggleRule', id),
  moveRule: (id, delta) => call('moveRule', id, delta),
  tidyPreview: () => call('tidyPreview'),
  tidyApply: () => call('tidyApply'),
  tidyUndo: () => call('tidyUndo'),
  relaunchAdmin: () => call('relaunchAdmin'),

  // updates
  updateStatus: () => call('updateStatus'),
  updateCheck: () => call('updateCheck'),
  updateDownload: () => call('updateDownload'),
  updateInstall: () => call('updateInstall'),
  updateSetAuto: (on) => call('updateSetAuto', on),
  onUpdate: (cb) => listen('deskly:update', cb),

  // export / import
  setupSections: () => call('setupSections'),
  setupExport: (ids) => call('setupExport', ids),
  setupPick: () => call('setupPick'),
  setupImport: (ids) => call('setupImport', ids),
  setupUndo: () => call('setupUndo'),

  // health
  healthProbe: () => call('healthProbe'),
  healthReport: (span) => call('healthReport', span),

  // files
  filesDownloadsPlan: (o) => call('filesDownloadsPlan', o),
  filesScreenshotsPlan: (o) => call('filesScreenshotsPlan', o),
  filesApply: (kind, groups, exclude) => call('filesApply', kind, groups, exclude),
  filesHistory: () => call('filesHistory'),
  filesUndo: (id) => call('filesUndo', id),
  filesThumb: (id) => call('filesThumb', id),
  filesReveal: (id) => call('filesReveal', id),
  filesTrash: (ids) => call('filesTrash', ids),
  filesCancel: () => call('filesCancel'),
  filesScanBig: (o) => call('filesScanBig', o),
  filesScanDupes: (o) => call('filesScanDupes', o),
  onFilesProgress: (cb) => listen('deskly:filesProgress', cb),

  // automation
  addAutoRule: (r) => call('addAutoRule', r),
  deleteAutoRule: (id) => call('deleteAutoRule', id),
  toggleAutoRule: (id) => call('toggleAutoRule', id),
  runningNames: () => call('runningNames'),

  // workspaces, servers started from Deskly, node cleanup
  saveWorkspace: (key, ws) => call('saveWorkspace', key, ws),
  launchWorkspace: (key) => call('launchWorkspace', key),
  mgdList: () => call('mgdList'),
  mgdLog: (id) => call('mgdLog', id),
  mgdStop: (id) => call('mgdStop', id),
  mgdRemove: (id) => call('mgdRemove', id),
  mgdStart: (key) => call('mgdStart', key),
  procScan: () => call('procScan'),
  procEnd: (keys) => call('procEnd', keys),
  onMgd: (cb) => listen('deskly:mgd', cb),
  onMgdLog: (cb) => listen('deskly:mgdLog', cb),

  // tile toolbar, peek, dock
  runAsAdmin: (p) => call('runAsAdmin', p),
  closeApp: (key) => call('closeApp', key),
  peekFolder: (p) => call('peekFolder', p),
  startDrag: (p, icon) => ipcRenderer.send('deskly:startDrag', p, icon),
  togglePeekAll: () => call('togglePeekAll'),
  toggleSearch: () => call('toggleSearch'),
  dockData: () => call('dockData'),

  // library, scenes, performance, search
  getLibrary: (force) => call('getLibrary', !!force),
  getRecent: () => call('getRecent'),
  pinLib: (key, on) => call('pinLib', key, !!on),
  launchKey: (key, alt) => call('launchKey', key, !!alt),
  projectAction: (key, action) => call('projectAction', key, action),
  copyText: (t) => call('copyText', t),
  applyScene: (id) => call('applyScene', id),
  saveScene: (sc) => call('saveScene', sc),
  deleteScene: (id) => call('deleteScene', id),
  setWeatherCity: (city) => call('setWeatherCity', city),
  sysSubscribe: (detail) => call('sysSubscribe', !!detail),
  sysUnsubscribe: () => call('sysUnsubscribe'),
  killProcs: (pids) => call('killProcs', pids),
  openPort: (port) => call('openPort', port),
  startupList: () => call('startupList'),
  startupSet: (id, enabled) => call('startupSet', id, !!enabled),
  cleanScan: () => call('cleanScan'),
  cleanRemove: (ids) => call('cleanRemove', ids),
  searchData: () => call('searchData'),
  searchRun: (entry, alt) => call('searchRun', entry, !!alt),
  searchHide: () => call('searchHide'),

  // desktop panels
  setDesktopMode: (on) => call('setDesktopMode', on),
  setAutostart: (on) => call('setAutostart', on),
  resetPanels: () => call('resetPanels'),
  panelDrag: (phase, sx, sy) => ipcRenderer.send('deskly:panelDrag', phase, sx, sy),
  openMain: (catId) => ipcRenderer.send('deskly:openMain', catId),

  onChanged: (cb) => listen('deskly:changed', () => cb()),
  onNavigate: (cb) => listen('deskly:navigate', cb),
  onRunning: (cb) => listen('deskly:running', cb),
  onSys: (cb) => listen('deskly:sys', cb),
  onPeekShow: (cb) => listen('deskly:peekShow', cb),
  peekHide: () => call('peekHide'),
  onCleanProgress: (cb) => listen('deskly:cleanProgress', cb),
  onSearchShow: (cb) => listen('deskly:searchShow', cb),
});
