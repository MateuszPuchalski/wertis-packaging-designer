// The editor's language, set before anything else draws: the saved choice, else the
// browser's. Imported first by main.js. Switching saves the choice and reloads the page.
import { setLang, getLang, pickLang, t } from '../i18n/index.js';

const KEY = 'wertis-packaging:lang';

let stored = null;
try { stored = localStorage.getItem(KEY); } catch {}
setLang(pickLang(stored, navigator.languages ?? [navigator.language]));
document.documentElement.lang = getLang();

// Translates the page's static text: data-i18n (text), data-i18n-title, data-i18n-aria.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
applyStatic();
document.title = t('app.name');

// Saves the new language, lets `beforeReload` finish (the autosave), then reloads.
export async function switchLang(code, beforeReload) {
  if (code === getLang()) return;
  try { localStorage.setItem(KEY, code); } catch {}
  try { await beforeReload?.(); } catch {}
  location.reload();
}
