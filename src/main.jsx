import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Panel from './Panel.jsx';
import Search from './Search.jsx';
import Dock from './Dock.jsx';
import Peek from './Peek.jsx';
import './styles.css';
import './panel.css';
import './extras.css';

// Extra windows load the same bundle: ?panel=<id> (desktop panel), ?mode=search (Alt+Space),
// ?mode=dock (the floating dock) or ?mode=peek (folder peek).
const params = new URLSearchParams(window.location.search);
const panelId = params.get('panel');
const mode = params.get('mode');
if (panelId || mode) document.documentElement.classList.add('panel-root');
if (mode === 'search') document.documentElement.classList.add('search-root');

const view = mode === 'search' ? <Search /> : mode === 'dock' ? <Dock /> : mode === 'peek' ? <Peek /> : panelId ? <Panel catId={panelId} /> : <App />;
createRoot(document.getElementById('root')).render(view);
