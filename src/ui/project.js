// The Project section: name, new, open from this browser's library, duplicate, delete,
// and the .json project file that moves a design between computers.
import { h, clear, syncValue, toast, dialog } from './dom.js';
import { t, label, msgOf } from '../i18n/index.js';
import { createDesign, migrate, serialize } from '../design.js';
import { FORMATS } from '../registry.js';
import { listProjects, saveProject, loadProject, deleteProject, newId, rememberCurrent } from '../storage.js';
import { download, slug } from '../export/files.js';

export function projectSection(store, { getId, setId, today }) {
  const name = h('input', { type: 'text', id: 'project-name', oninput: () => store.set(['name'], name.value, { coalesce: 'name' }), onchange: () => store.settle() });
  const list = h('div', { class: 'library' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importFile });

  async function refresh() {
    const items = await listProjects().catch(() => []);
    clear(list);
    if (!items.length) list.append(h('p', { class: 'help' }, t('project.empty')));
    for (const p of items) {
      const current = p.id === getId();
      list.append(h('div', { class: `lib-row${current ? ' current' : ''}` },
        h('button', { class: 'link', disabled: current, onclick: () => open(p.id) }, p.name || t('project.untitled')),
        h('span', { class: 'lib-meta' }, `${label(FORMATS[p.format]?.label) ?? p.format} · ${(p.updated ?? '').slice(0, 10)}`),
        current ? h('span', { class: 'lib-meta current' }, t('project.open')) : h('button', { class: 'ghost tiny danger', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => remove(p.id, p.name) }, '✕')));
    }
  }

  async function open(id) {
    try {
      const d = await loadProject(id);
      if (!d) throw new Error(t('project.gone'));
      setId(id);
      store.replace(d);
      refresh();
    } catch (err) { toast(msgOf(err), 'error'); }
  }

  async function remove(id, name) {
    const ok = await dialog(t('project.deleteTitle', { name }), h('p', {}, t('project.deleteText')), [[t('common.cancel'), false, 'ghost'], [t('common.delete'), true, 'danger']]);
    if (!ok) return;
    await deleteProject(id);
    refresh();
  }

  async function startNew() {
    const fmt = h('select', { 'aria-label': t('side.format') }, Object.values(FORMATS).map((f) => h('option', { value: f.id }, label(f.label))));
    const format = await dialog(t('project.newTitle'), h('div', {}, h('p', {}, t('project.newText')), fmt),
      [[t('common.cancel'), null, 'ghost'], [t('project.create'), () => fmt.value, 'primary']]);
    if (!format) return;
    const id = newId('project');
    const d = createDesign({ format, date: today() });
    d.name = t('project.newName');
    await saveProject(id, d);
    setId(id);
    store.replace(d);
    refresh();
  }

  async function duplicate() {
    const id = newId('project');
    const d = { ...store.get(), name: t('project.copyName', { name: store.get().name }) };
    await saveProject(id, d);
    setId(id);
    store.replace(d);
    refresh();
    toast(t('project.openedCopy'));
  }

  async function importFile() {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    try {
      const d = migrate(await file.text());
      const id = newId('project');
      await saveProject(id, d);
      setId(id);
      store.replace(d);
      refresh();
      toast(t('project.opened', { name: d.name }));
    } catch (err) { toast(msgOf(err), 'error'); }
  }

  const el = h('div', { class: 'project' },
    h('label', { class: 'row stack' }, h('span', { class: 'lbl' }, t('project.name')), name),
    h('div', { class: 'btn-row' },
      h('button', { class: 'secondary', onclick: startNew }, t('project.new')),
      h('button', { class: 'secondary', onclick: duplicate }, t('project.duplicate')),
      h('button', { class: 'secondary', title: t('project.exportFileTip'), onclick: () => download(new Blob([serialize(store.get())], { type: 'application/json' }), `${slug(store.get().name)}.wertis.json`) }, t('project.exportFile')),
      h('button', { class: 'secondary', title: t('project.openFileTip'), onclick: () => fileIn.click() }, t('project.openFile')), fileIn),
    h('h4', {}, t('project.library')), list);
  refresh();

  return { el, sync: (d) => syncValue(name, d.name), refresh };
}

export { rememberCurrent };
