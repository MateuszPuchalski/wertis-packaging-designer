// Form controls bound to a path in the design. Each returns { el, sync(design) }; sync
// refreshes the shown value (and visibility) after any change, without disturbing a field
// the user is typing in.
import { h, syncValue } from './dom.js';
import { getIn } from '../design.js';

function visibleFor(field, obj) {
  if (field.when && !obj?.[field.when]) return false;
  if (field.whenNot && obj?.[field.whenNot[0]] === field.whenNot[1]) return false;
  return true;
}

// A field spec from formats/common.js, stored at basePath + key.
export function fieldControl(store, basePath, field) {
  const path = [...basePath, field.key];
  const id = `f-${path.join('-')}`;
  let input;
  if (field.type === 'select') {
    input = h('select', { id, onchange: () => { store.set(path, input.value); store.settle(); } },
      field.options.map(([v, label]) => h('option', { value: v }, label)));
  } else if (field.type === 'checkbox') {
    input = h('input', { id, type: 'checkbox', onchange: () => { store.set(path, input.checked); store.settle(); } });
  } else {
    input = h('input', {
      id, type: 'number', min: field.min, max: field.max, step: field.step ?? 1,
      oninput: () => { if (input.value !== '' && Number.isFinite(Number(input.value))) store.set(path, Number(input.value), { coalesce: id }); },
      onchange: () => store.settle(),
    });
  }
  const row = field.type === 'checkbox'
    ? h('label', { class: 'row check', for: id }, input, h('span', {}, field.label))
    : h('label', { class: 'row', for: id }, h('span', { class: 'lbl' }, field.label), h('span', { class: 'ctl' }, input, field.unit ? h('span', { class: 'unit' }, field.unit) : null));
  return {
    el: row,
    sync(design) {
      const obj = getIn(design, basePath);
      row.hidden = !visibleFor(field, obj);
      syncValue(input, obj?.[field.key]);
    },
  };
}

export function textControl(store, path, label, { multiline = false, placeholder = '', hint = null, validate = null, parse = null, format = null } = {}) {
  const id = `t-${path.join('-')}`;
  const put = () => store.set(path, parse ? parse(input.value) : input.value, { coalesce: id });
  const input = multiline
    ? h('textarea', { id, rows: 3, placeholder, oninput: put, onchange: () => store.settle() })
    : h('input', { id, type: 'text', placeholder, oninput: put, onchange: () => store.settle() });
  const msg = h('span', { class: 'hint' }, hint ?? '');
  const row = h('label', { class: 'row stack', for: id }, h('span', { class: 'lbl' }, label), input, msg);
  return {
    el: row,
    sync(design) {
      const v = getIn(design, path);
      syncValue(input, format ? format(v) : v);
      if (validate) {
        const r = validate(v);
        msg.textContent = r ?? hint ?? '';
        row.classList.toggle('invalid', !!r && !r.startsWith('✓'));
      }
    },
  };
}

// A collapsible sidebar section.
export function section(title, { open = false, id } = {}) {
  const body = h('div', { class: 'section-body' });
  const el = h('details', { class: 'section', open, id }, h('summary', {}, title), body);
  return { el, body };
}
