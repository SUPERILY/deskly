// Live widget panels (they sit on the desktop next to the category panels).
// w/h are the window size in DIPs, including the 8px transparent margin; the content scrolls if needed.
const WIDGETS = [
  { id: 'w_sys', name: 'System', icon: 'Activity', color: '#38bdf8', w: 316, h: 408, blurb: 'CPU, RAM, GPU, disk and what is using them' },
  { id: 'w_dev', name: 'Dev servers', icon: 'Server', color: '#34d399', w: 348, h: 372, blurb: 'Local servers that are running right now' },
  { id: 'w_projects', name: 'Projects', icon: 'GitBranch', color: '#fb923c', w: 344, h: 396, blurb: 'Your git projects, newest first' },
  { id: 'w_recent', name: 'Recent', icon: 'History', color: '#f472b6', w: 324, h: 360, blurb: 'Files you opened lately' },
  { id: 'w_clock', name: 'Clock', icon: 'Clock', color: '#a78bfa', w: 264, h: 204, blurb: 'Time, date and weather' },
];

const byId = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));

module.exports = { WIDGETS, byId, isWidget: (id) => !!byId[id] };
