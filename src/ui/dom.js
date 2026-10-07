// Small DOM helpers for the editor UI.

// h('div', { class: 'x', onclick: fn }, child, 'text', [more]) → element
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'innerHTML') el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// Sets an input's value unless the user is typing in it.
export function syncValue(input, value) {
  if (document.activeElement === input) return;
  if (input.type === 'checkbox') input.checked = !!value;
  else {
    const v = value ?? '';
    if (input.value !== String(v)) input.value = v;
  }
}

export function toast(message, kind = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'error' ? 6000 : 2800);
  setTimeout(() => t.remove(), kind === 'error' ? 6600 : 3400);
}

// A small modal with a body and buttons; resolves with the clicked button's value, or null
// for Esc and a click outside. Enter in a text field presses the last (main) button.
// `wide` makes room for lists.
export function dialog(title, body, buttons, { wide = false } = {}) {
  return new Promise((resolve) => {
    const back0 = document.activeElement;
    const close = (v) => { back.remove(); back0?.focus?.({ preventScroll: true }); resolve(v); };
    const btns = buttons.map(([label, value, cls]) => h('button', { class: cls ?? '', onclick: () => close(typeof value === 'function' ? value() : value) }, label));
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
        onkeydown: (e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
          else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); btns.at(-1)?.click(); }
        } },
      h('h3', {}, title), body,
      h('div', { class: 'modal-buttons' }, btns)));
    document.body.append(back);
    (back.querySelector('input,select') ?? btns.at(-1))?.focus();
  });
}
