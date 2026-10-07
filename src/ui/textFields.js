// The texts an element shows, as fields on its card in the inspector: each template element
// names the design.content keys it reads (`edits`), so selecting the label offers its name,
// code, EAN, QR link and website, selecting "Produced for" offers the address, and so on.
import { h, clear, syncValue } from './dom.js';
import { textControl } from './controls.js';
import { t, msgOf } from '../i18n/index.js';
import { LANGS } from '../brand/wertis.js';
import { validateEan13 } from '../codes/ean13.js';

const ean = (v) => {
  if (!v) return { ok: true, text: t('texts.eanNone') };
  const r = validateEan13(v);
  return r.ok ? { ok: true, text: `✓ ${r.code}${r.added ? t('texts.eanAdded') : ''}` } : { ok: false, text: msgOf({ message: r.error, i18n: r.i18n }) };
};

const lines = { multiline: true, parse: (v) => v.split('\n'), format: (v) => (Array.isArray(v) ? v.join('\n') : v ?? '') };

// One control per content key; the product name is the main language's name, with the
// pack's main language and the other languages folded away under it.
function field(store, key) {
  const C = (k, text, opts) => textControl(store, ['content', k], text, opts);
  switch (key) {
    case 'productName': return productName(store);
    case 'sku': return C('sku', t('texts.sku'));
    case 'ean': return C('ean', t('texts.ean'), { validate: ean });
    case 'qr': return C('qr', t('texts.qr'));
    case 'url': return C('url', t('texts.url'));
    case 'tagline': return C('tagline', t('texts.tagline'));
    case 'note1': return C('note1', t('texts.note'));
    case 'producedFor': return C('producedFor', t('texts.producedFor'));
    case 'company': return C('company', t('texts.company'));
    case 'address': return C('address', t('texts.address'));
    case 'email': return C('email', t('texts.email'));
    case 'subtitle': return C('subtitle', t('texts.subtitle'));
    case 'specsTitle': return C('specsTitle', t('texts.specsTitle'));
    case 'specs': return C('specs', t('texts.specs'), lines);
    case 'category': return C('category', t('texts.category'));
    case 'categoryEn': return C('categoryEn', t('texts.categoryEn'));
    default: return C(key, key);
  }
}

function productName(store) {
  const langSel = h('select', { id: 'lang', 'aria-label': t('texts.mainLang'), onchange: () => { store.set(['content', 'lang'], langSel.value); store.settle(); } },
    LANGS.map(([k, code]) => h('option', { value: k }, code)));
  const names = Object.fromEntries(LANGS.map(([k, code]) => [k, textControl(store, ['content', 'productName', k], t('texts.productName', { code }))]));
  const main = h('div', { class: 'fields' });
  const others = h('div', { class: 'fields' });
  const more = h('details', { class: 'more-langs' }, h('summary', {}, t('texts.otherLangs', { n: LANGS.length - 1 })), others);
  let shown = null;
  const el = h('div', { class: 'fields' },
    h('label', { class: 'row', title: t('texts.help') }, h('span', { class: 'lbl' }, t('texts.mainLang')), h('span', { class: 'ctl' }, langSel)), main, more);
  return {
    el,
    sync(d) {
      syncValue(langSel, d.content.lang);
      // The main language's field comes first; the rest fold away.
      if (shown !== d.content.lang) {
        shown = d.content.lang;
        clear(main);
        clear(others);
        for (const [k] of LANGS) (k === shown ? main : others).append(names[k].el);
      }
      for (const c of Object.values(names)) c.sync(d);
    },
  };
}

// The fields for an element's `edits`, or null when it shows no text of its own.
export function textFields(store, keys) {
  if (!keys?.length) return null;
  const controls = keys.map((k) => field(store, k));
  const el = h('div', { class: 'fields text-fields' }, controls.map((c) => c.el));
  return {
    el,
    sync: (d) => { for (const c of controls) c.sync(d); },
    focus() {
      const input = el.querySelector('input[type="text"], textarea');
      input?.focus();
      input?.select?.();
    },
  };
}
