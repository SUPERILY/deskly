// Built-in categories and the rules that sort desktop items into them.

const BUILTIN = [
  { id: 'games',    name: 'Games',    icon: 'Gamepad2',      color: '#ff4d8d', blurb: 'Launchers and games' },
  { id: 'dev',      name: 'Dev',      icon: 'Code2',         color: '#38bdf8', blurb: 'Editors, Git and AI tooling' },
  { id: 'creative', name: 'Creative', icon: 'Palette',       color: '#a78bfa', blurb: 'Design, video and content' },
  { id: 'work',     name: 'Work',     icon: 'Briefcase',     color: '#34d399', blurb: 'Office, Google and notes' },
  { id: 'media',    name: 'Media',    icon: 'Clapperboard',  color: '#fb923c', blurb: 'Watch and listen' },
  { id: 'web',      name: 'Web',      icon: 'Globe',         color: '#60a5fa', blurb: 'Browsers and web apps' },
  { id: 'comms',    name: 'Comms',    icon: 'MessageCircle', color: '#2dd4bf', blurb: 'Chat, sharing and remote' },
  { id: 'system',   name: 'System',   icon: 'Wrench',        color: '#94a3b8', blurb: 'Hardware and utilities' },
  { id: 'folders',  name: 'Folders',  icon: 'Folder',        color: '#fbbf24', blurb: 'Projects and locations' },
  { id: 'files',    name: 'Files',    icon: 'FileText',      color: '#f472b6', blurb: 'Documents and loose files' },
  { id: 'other',    name: 'Other',    icon: 'Shapes',        color: '#a3a3a3', blurb: 'Everything else' },
];

const RULES = [
  {
    cat: 'games',
    name: /steam|epic games|rockstar|^ea( app| desktop)?$|alan wake|it takes two|riot|valorant|battle\.?net|ubisoft|uplay|gog galaxy|minecraft|fortnite|\bgta\b|fifa|ea sports|call of duty|cyberpunk|witcher|elden ring|league of legends|counter-?strike|\bcs2\b|roblox|genshin/i,
    target: /steamapps|\\Epic Games\\|\\Rockstar Games\\|\\Riot Games\\|\\EA Games\\|\\Electronic Arts\\|\\Ubisoft\\|\\GOG Galaxy\\|\\Battle\.net\\/i,
    url: /^(steam|com\.epicgames\.launcher|uplay|origin|origin2|rockstar|battlenet|ea):/i,
  },
  {
    cat: 'dev',
    name: /visual studio|vs ?code|antigravity|github|git bash|\bgit\b|terminal|powershell|docker|postman|cursor|android studio|intellij|pycharm|webstorm|node\.?js|lemonade|hermes|claude|codex|\bwsl\b|ubuntu|supabase|vercel/i,
  },
  {
    cat: 'creative',
    name: /gimp|\bobs\b|photoshop|illustrator|figma|blender|davinci|premiere|after effects|canva|audacity|effectcraft|pdfcraft|vectorcraft|artcraft|recordly|capcut|wallpaper|krita|inkscape|lightroom|filmora/i,
  },
  {
    cat: 'work',
    name: /excel|\bword\b|powerpoint|outlook|onenote|google (docs|sheets|slides|keep|drive|calendar)|obsidian|notion|metatrader|trello|marjane|seller|libreoffice|acrobat|\bpdf\b/i,
  },
  {
    cat: 'media',
    name: /netflix|stremio|\bvlc\b|spotify|youtube|plex|kodi|prime video|disney|twitch|potplayer|media player|deezer|anghami/i,
  },
  {
    cat: 'web',
    name: /chrome|edge|firefox|brave|opera|browser|vivaldi/i,
  },
  {
    cat: 'comms',
    name: /telegram|whatsapp|discord|signal|messenger|skype|zoom|teams|slack|localsend|rustdesk|anydesk|teamviewer/i,
  },
  {
    cat: 'system',
    name: /file explorer|wiztree|nvidia|logitech|g hub|attack ?shark|mouse|keyboard|frameview|control panel|settings|task manager|cleaner|7-?zip|winrar|driver|razer|corsair|afterburner|hwinfo|cpu-?z|geforce|radeon|this pc|recycle/i,
  },
];

const EXT_GROUPS = [
  ['media', /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|avif|mp4|mkv|mov|avi|webm|mp3|wav|flac|m4a|ogg)$/i],
  ['dev', /\.(js|ts|tsx|jsx|py|json|html|css|sh|ps1|bat|cmd|yml|yaml|toml|rs|go|java|cs|sql)$/i],
  ['files', /\.(md|txt|pdf|docx?|xlsx?|pptx?|csv|rtf|zip|rar|7z|tar|gz|iso)$/i],
  ['system', /\.(exe|msi|appref-ms)$/i],
];

const SENSITIVE = /client_secret|credential|\.env(\.|$)|\.pem$|\.key$|\.pfx$|id_rsa|api[-_ ]?key|secret|token|password|passwd|\.kdbx$|wallet|seed ?phrase/i;

function isSensitive(fileName) {
  return SENSITIVE.test(fileName);
}

function categorize(it) {
  if (it.kind === 'dir' || it.targetIsDir) return 'folders';
  const base = it.base || '';
  const target = it.target || '';
  const url = it.url || '';
  for (const r of RULES) {
    if (
      (r.name && r.name.test(base)) ||
      (r.target && target && r.target.test(target)) ||
      (r.url && url && r.url.test(url))
    ) {
      return r.cat;
    }
  }
  if (it.kind === 'url' && /^https?:/i.test(url)) return 'web';
  if (it.kind === 'shortcut' || it.kind === 'url') return 'other';
  for (const [cat, re] of EXT_GROUPS) if (re.test(it.file)) return cat;
  return 'files';
}

// ---- user-defined rules (Rules page). They run before the built-in ones. ----
// rule: { id, field: 'name' | 'path' | 'ext', op: 'contains' | 'startsWith' | 'equals' | 'regex', value, cat, enabled }
function matchRule(r, it) {
  if (!r || r.enabled === false || !r.value) return false;
  let hay;
  if (r.field === 'ext') hay = it.ext || '';
  else if (r.field === 'path') hay = [it.target, it.url, it.path].filter(Boolean).join(' | ');
  else hay = it.base || '';
  let v = String(r.value);
  if (r.op === 'regex') {
    try {
      return new RegExp(v, 'i').test(hay);
    } catch {
      return false;
    }
  }
  hay = hay.toLowerCase();
  v = v.toLowerCase();
  if (r.field === 'ext' && v && !v.startsWith('.')) v = '.' + v;
  if (r.op === 'equals') return hay === v;
  if (r.op === 'startsWith') return hay.startsWith(v);
  return hay.includes(v);
}

function userCategory(rules, it, validCats) {
  for (const r of rules || []) {
    if (validCats.has(r.cat) && matchRule(r, it)) return r.cat;
  }
  return null;
}

module.exports = { BUILTIN, categorize, isSensitive, matchRule, userCategory };
