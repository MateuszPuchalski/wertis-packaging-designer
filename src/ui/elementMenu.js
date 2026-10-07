// The right-click menu on the preview: what can be done to the element under the pointer,
// and the view. Every item has a data-action, so the playtest can find it.
import { t, label } from '../i18n/index.js';
import { hide, resetLayout, resetColors, hasOwnColors, showAll, hiddenCount } from '../edit/actions.js';

export function elementMenuEntries({ store, hit, design, view, editText }) {
  const commit = (fn) => { store.commit(fn(store.get())); store.settle(); };
  const n = hiddenCount(design);
  const out = [];
  if (hit) {
    out.push({ heading: label(hit.label) });
    out.push({ id: 'hide', label: t('menu.hide'), hint: t('keys.delete'), action: () => commit((d) => hide(d, hit.id)) });
    if (hit.movable) out.push({ id: 'reset-position', label: t('menu.resetPos'), disabled: !design.layout?.[hit.id], action: () => commit((d) => resetLayout(d, hit.id)) });
    if (hit.slots?.length) out.push({ id: 'reset-colours', label: t('menu.resetColours'), disabled: !hasOwnColors(design, hit.id), action: () => commit((d) => resetColors(d, hit.id)) });
    if (hit.edits?.length) out.push({ id: 'edit-text', label: t('menu.editText'), hint: t('keys.dblClick'), action: () => editText(hit.id) });
    out.push('sep');
  }
  out.push({ id: 'show-all', label: t('menu.showAll', { n }), disabled: !n, action: () => commit(showAll) });
  out.push('sep');
  out.push({ id: 'fit', label: t('zoom.fitTip'), hint: '0', action: () => view.fit() });
  out.push({ id: 'actual', label: t('zoom.actualTip'), hint: '1', action: () => view.actual() });
  return out;
}
