// Which screen Deskly lives on. The desktop panels and the dock go on one screen (your choice, the main
// screen by default); if that screen is unplugged they fall back to the main one and come back to the
// chosen one when it returns. Search and the folder peek simply follow the mouse.
const { screen } = require('electron');

// `all` / `primary` are Electron Display objects; passed in so the logic can be tested with fakes.
function pick(wantedId, all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay()) {
  if (wantedId != null && wantedId !== '') {
    const d = all.find((x) => String(x.id) === String(wantedId));
    if (d) return d;
  }
  return primary;
}

// Left-to-right list for the settings page.
function describe(all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay()) {
  return [...all]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: String(d.id),
      number: i + 1,
      name: (d.label || '').trim() || `Screen ${i + 1}`,
      primary: d.id === primary.id,
      width: d.size.width,
      height: d.size.height,
      scale: d.scaleFactor,
    }));
}

const known = (id, all = screen.getAllDisplays()) => all.some((d) => String(d.id) === String(id));

module.exports = { pick, describe, known };
