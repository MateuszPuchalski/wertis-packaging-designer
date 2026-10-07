// Menus: a button that opens a list of actions (the Export menu), and the right-click menu
// on the preview. Both work from the keyboard: arrow keys, Home/End, Enter, Esc closes and
// gives the focus back; a click outside closes them.
import { h } from './dom.js';

const items = (menu) => [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];

function keyNav(menu, e, close) {
  const list = items(menu);
  const i = list.indexOf(document.activeElement);
  const go = (k) => { e.preventDefault(); list[(k + list.length) % list.length]?.focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(list.length - 1);
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
  else if (e.key === 'Tab') close(false);
}

// Wires `button` to open and close `menu` (an element with role="menu").
export function menuButton(button, menu) {
  let open = false;
  const outside = (e) => { if (!menu.contains(e.target) && !button.contains(e.target)) close(false); };
  function close(focusButton) {
    if (!open) return;
    open = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focusButton) button.focus();
  }
  function show(focus = 'none') {
    open = true;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    const list = items(menu);
    if (focus === 'first') list[0]?.focus();
    else if (focus === 'last') list.at(-1)?.focus();
  }
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => (open ? close(false) : show('first')));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); show('first'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); show('last'); }
  });
  menu.addEventListener('keydown', (e) => keyNav(menu, e, close));
  // Choosing an item closes the menu first, so a dialog the action opens gets the focus.
  menu.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) close(false); });
  return { close: () => close(false), isOpen: () => open };
}

// A menu at (x, y) on the page. `entries`: { label, hint, action, disabled, danger, id } or
// 'sep' or { heading }. Returns close().
let current = null;
export function contextMenu(entries, x, y, { label = '' } = {}) {
  current?.(false);
  const menu = h('div', { class: 'menu context', role: 'menu', 'aria-label': label, tabindex: -1 });
  for (const it of entries) {
    if (!it) continue;
    if (it === 'sep') menu.append(h('div', { class: 'menu-sep', role: 'separator' }));
    else if (it.heading) menu.append(h('div', { class: 'menu-heading' }, it.heading));
    else {
      menu.append(h('button', { role: 'menuitem', class: it.danger ? 'danger' : null, disabled: !!it.disabled, dataset: it.id ? { action: it.id } : undefined,
        onclick: () => { close(false); it.action?.(); } },
      h('span', { class: 'mi-label' }, it.label), it.hint ? h('kbd', { class: 'mi-key' }, it.hint) : null));
    }
  }
  const back = document.activeElement;
  const outside = (e) => { if (!menu.contains(e.target)) close(false); };
  function close(restore) {
    if (current !== close) return;
    current = null;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('blur', onBlur);
    if (restore) back?.focus?.({ preventScroll: true });
  }
  const onBlur = () => close(false);
  current = close;
  document.body.append(menu);
  // Keep it on screen.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  menu.addEventListener('keydown', (e) => keyNav(menu, e, close));
  setTimeout(() => { if (current === close) document.addEventListener('pointerdown', outside, true); });
  window.addEventListener('blur', onBlur);
  (items(menu)[0] ?? menu).focus({ preventScroll: true });
  return () => close(false);
}
