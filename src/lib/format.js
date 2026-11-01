export function fmtBytes(b, digits = 1) {
  if (b == null || isNaN(b)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return (i >= 3 ? v.toFixed(digits) : Math.round(v)) + ' ' + u[i];
}

export function fmtAgo(ms) {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = Math.floor(s / 86400);
  if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
  if (d < 365) return Math.floor(d / 30) + ' mo ago';
  return Math.floor(d / 365) + ' y ago';
}

export function fmtUptime(startMs) {
  if (!startMs) return '';
  const m = Math.floor((Date.now() - startMs) / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : Math.floor(h / 24) + ' days';
}

// Turn a server's command line into something human: "Vite · my-site".
const TOOLS = [
  [/vite/i, 'Vite'], [/next(\.js)?[\\/ ]|next dev|next start/i, 'Next.js'], [/webpack/i, 'webpack'], [/nuxt/i, 'Nuxt'],
  [/astro/i, 'Astro'], [/remix/i, 'Remix'], [/storybook/i, 'Storybook'], [/express|server\.js|index\.js/i, 'Node server'],
  [/uvicorn|fastapi/i, 'FastAPI'], [/flask/i, 'Flask'], [/django|manage\.py/i, 'Django'], [/http\.server/i, 'Python http.server'],
  [/jupyter/i, 'Jupyter'], [/streamlit/i, 'Streamlit'], [/php/i, 'PHP'], [/dotnet/i, '.NET'], [/hugo/i, 'Hugo'],
];

export function describeServer(s) {
  const cmd = s.cmd || '';
  const proj = /(?:my projects|projects|repos|code|dev|github|desktop|documents)[\\/]+([^\\/"']+)/i.exec(cmd);
  const tool = (TOOLS.find(([re]) => re.test(cmd)) || [null, s.name])[1];
  const project = proj ? proj[1] : '';
  return { tool, project, title: project ? `${tool} · ${project}` : tool };
}

export const pct = (n) => Math.round(n) + '%';
