// The editor's language: Polish or English. t(key, params) looks a message up in the current
// language (falling back to English, then to the key itself); label(en) translates a label
// that lives in the core data (format fields, template options, element names), which stays
// English so the print files, tests and saved projects never depend on the language.
// Everything printed or sent to the factory stays English. DOM-free.
import EN from './en.js';
import PL from './pl.js';
import LABELS_PL from './labels.pl.js';

export const LANGUAGES = [['pl', 'Polski', 'PL'], ['en', 'English', 'EN']];
const CATALOGS = { en: EN, pl: PL };
const LABELS = { en: null, pl: LABELS_PL };

let lang = 'en';
const missed = new Set();

export function setLang(code) {
  lang = CATALOGS[code] ? code : 'en';
  return lang;
}

export const getLang = () => lang;

// The language to start in: the saved choice, else Polish for a Polish browser, else English.
export function pickLang(stored, browserLangs = []) {
  if (CATALOGS[stored]) return stored;
  return browserLangs.some((l) => /^pl\b/i.test(String(l))) ? 'pl' : 'en';
}

const rules = new Map();
// The plural form a count takes: English one/other; Polish one, few (2–4, 22–24…), many.
export function plural(n, code = lang) {
  if (!rules.has(code)) rules.set(code, new Intl.PluralRules(code));
  return rules.get(code).select(n);
}

// A number the way the language writes it: 0.5 mm in English, 0,5 mm in Polish. `digits`
// rounds to at most that many decimals. A string that is a decimal number ('4.0', from
// toFixed) keeps its digits and gets the comma too.
export function fmtNum(v, digits = null, code = lang) {
  if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) return code === 'pl' ? v.replace('.', ',') : v;
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '');
  const x = digits === null ? v : Number(v.toFixed(digits));
  const s = String(x);
  return code === 'pl' ? s.replace('.', ',') : s;
}

function pick(msg, params, code) {
  if (msg && typeof msg === 'object') {
    const n = params.n ?? params.count ?? 0;
    return msg[plural(n, code)] ?? msg.other;
  }
  return msg;
}

export function t(key, params = {}) {
  let msg = CATALOGS[lang][key], code = lang;
  if (msg === undefined) {
    missed.add(`${lang}:${key}`);
    msg = EN[key];
    code = 'en';
  }
  if (msg === undefined) return key;
  return pick(msg, params, code).replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : fmtNum(params[k], null, code)));
}

// True when the key exists (in English, which has every key).
export const hasKey = (key) => key in EN;

// A label from the core data, in the current language.
export function label(en) {
  const table = LABELS[lang];
  if (!table || en === undefined || en === null) return en;
  const v = table[en];
  if (v === undefined) {
    missed.add(`${lang}:label:${en}`);
    return en;
  }
  return v;
}

// A finding from the core (preflight, the EAN check, project import, a thrown Error): its
// i18n descriptor in the current language, else the English message it carries. A param
// can be a data label ({ label, lower }) or a nested finding ({ message, i18n }).
export function msgOf(item) {
  const d = item?.i18n;
  if (d && hasKey(d.key)) {
    const params = {};
    for (const [k, v] of Object.entries(d.params ?? {})) {
      if (v && typeof v === 'object' && 'label' in v) {
        const s = label(v.label);
        params[k] = v.lower ? s.toLowerCase() : s;
      } else if (v && typeof v === 'object') params[k] = msgOf(v);
      else params[k] = v;
    }
    return t(d.key, params);
  }
  return item?.message ?? String(item ?? '');
}

// Message keys and labels asked for but missing in the current language (the tests and the
// playtest check this stays empty).
export const misses = () => [...missed];
export const clearMisses = () => missed.clear();

export const catalogs = { en: EN, pl: PL, labels: LABELS };
