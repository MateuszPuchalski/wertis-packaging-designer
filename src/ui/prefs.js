// The editor's own settings in this browser, apart from any project: the sidebar tab and
// the preview's toggles. One localStorage key with a version; anything unreadable or from
// another version falls back to the defaults.
const KEY = 'wertis-packaging:ui';
const VERSION = 1;
const DEFAULTS = { sideTab: 'format', dieline: true, guides: true, rulers: true, snap: true };

let prefs = load();

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY));
    if (j?.version === VERSION && j.prefs && typeof j.prefs === 'object') return { ...DEFAULTS, ...j.prefs };
  } catch {}
  return { ...DEFAULTS };
}

export const getPref = (key) => prefs[key];

export function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify({ version: VERSION, prefs })); } catch {}
}
