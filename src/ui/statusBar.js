// The line under the preview: what is selected and where (mm, from its panel's top left),
// where the pointer is, the zoom with its buttons, and the keyboard shortcuts.
import { h, dialog } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/index.js';

export function statusBar({ zoomIn, zoomOut, fit, actual }) {
  const selection = h('span', { class: 'sb-sel', id: 'status-selection' });
  const cursor = h('span', { class: 'sb-cursor', id: 'status-cursor' });
  const pct = h('button', { class: 'ghost tiny sb-pct', id: 'zoom-pct', title: t('zoom.actualTip'), onclick: () => actual() });
  const zoom = h('div', { class: 'sb-zoom', role: 'group', 'aria-label': t('zoom.label') },
    h('button', { class: 'ghost tiny', id: 'zoom-out', title: t('zoom.outTip'), 'aria-label': t('zoom.out'), onclick: () => zoomOut() }, icon('minus', 15)),
    pct,
    h('button', { class: 'ghost tiny', id: 'zoom-in', title: t('zoom.inTip'), 'aria-label': t('zoom.in'), onclick: () => zoomIn() }, icon('plus', 15)),
    h('button', { class: 'ghost tiny', id: 'zoom-fit', title: t('zoom.fitTip'), onclick: () => fit() }, icon('fit', 15), h('span', {}, t('zoom.fit'))));
  const keys = h('button', { class: 'ghost tiny', id: 'shortcuts', title: t('keys.title'), 'aria-label': t('keys.title'), onclick: () => showShortcuts() }, icon('keyboard', 16));
  const hint = h('span', { class: 'sb-hint' });
  const el = h('div', { class: 'status-bar' }, selection, cursor, hint, zoom, keys);
  return {
    el,
    setSelection(text) { selection.textContent = text; selection.hidden = !text; },
    setCursor(text) { cursor.textContent = text; },
    setZoom(percent, isFit) { pct.textContent = `${percent} %`; pct.classList.toggle('fit', isFit); },
    setMode(tab) {
      zoom.hidden = tab === '3d';
      hint.textContent = tab === '3d' ? t('stage.hint3d') : tab === 'design' ? t('stage.hintDesign') : '';
      if (tab !== 'design') { selection.hidden = true; cursor.textContent = ''; }
    },
  };
}

export function showShortcuts() {
  const rows = [
    [t('keys.undoKeys'), t('keys.undo')],
    [t('keys.arrows'), t('keys.nudge')],
    [t('keys.altDrag'), t('keys.noSnap')],
    [t('keys.delete'), t('keys.hide')],
    ['Esc', t('keys.deselect')],
    [t('keys.rightClick'), t('keys.more')],
    [t('keys.wheel'), t('keys.zoomAt')],
    ['+ / −', t('keys.zoom')],
    ['0', t('zoom.fitTip')],
    ['1', t('zoom.actualTip')],
    [t('keys.spaceDrag'), t('keys.pan')],
  ];
  const table = h('table', { class: 'keys' }, h('tbody', {}, rows.map(([k, what]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, what)))));
  return dialog(t('keys.title'), table, [[t('common.close'), null, 'primary']]);
}
