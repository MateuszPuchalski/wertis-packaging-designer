// The Project section: name, new, open from this browser's library, duplicate, delete,
// and the .json project file that moves a design between computers.
import { h, clear, syncValue, toast, dialog } from './dom.js';
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
    if (!items.length) list.append(h('p', { class: 'help' }, 'Nothing saved yet. Designs save themselves here as you work.'));
    for (const p of items) {
      const current = p.id === getId();
      list.append(h('div', { class: `lib-row${current ? ' current' : ''}` },
        h('button', { class: 'link', disabled: current, onclick: () => open(p.id) }, p.name || 'Untitled'),
        h('span', { class: 'lib-meta' }, `${FORMATS[p.format]?.label ?? p.format} · ${(p.updated ?? '').slice(0, 10)}`),
        current ? h('span', { class: 'lib-meta' }, 'open') : h('button', { class: 'ghost tiny danger', title: 'Delete', onclick: () => remove(p.id, p.name) }, '✕')));
    }
  }

  async function open(id) {
    try {
      const d = await loadProject(id);
      if (!d) throw new Error('That project is gone.');
      setId(id);
      store.replace(d);
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(id, label) {
    const ok = await dialog(`Delete “${label}”?`, h('p', {}, 'It is removed from this browser. Export it first if you want to keep a copy.'), [['Cancel', false, 'ghost'], ['Delete', true, 'danger']]);
    if (!ok) return;
    await deleteProject(id);
    refresh();
  }

  async function startNew() {
    const fmt = h('select', {}, Object.values(FORMATS).map((f) => h('option', { value: f.id }, f.label)));
    const format = await dialog('New design', h('div', {}, h('p', {}, 'Starts from the WERTIS template with the example texts. The current design stays in the library.'), fmt),
      [['Cancel', null, 'ghost'], ['Create', () => fmt.value, 'primary']]);
    if (!format) return;
    const id = newId('project');
    const d = createDesign({ format, date: today() });
    d.name = 'New design';
    await saveProject(id, d);
    setId(id);
    store.replace(d);
    refresh();
  }

  async function duplicate() {
    const id = newId('project');
    const d = { ...store.get(), name: `${store.get().name} (copy)` };
    await saveProject(id, d);
    setId(id);
    store.replace(d);
    refresh();
    toast('Opened a copy.');
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
      toast(`Opened “${d.name}”.`);
    } catch (err) { toast(err.message, 'error'); }
  }

  const el = h('div', { class: 'project' },
    h('label', { class: 'row stack' }, h('span', { class: 'lbl' }, 'Design name'), name),
    h('div', { class: 'btn-row' },
      h('button', { class: 'secondary', onclick: startNew }, 'New'),
      h('button', { class: 'secondary', onclick: duplicate }, 'Duplicate'),
      h('button', { class: 'secondary', onclick: () => download(new Blob([serialize(store.get())], { type: 'application/json' }), `${slug(store.get().name)}.wertis.json`) }, 'Export file'),
      h('button', { class: 'secondary', onclick: () => fileIn.click() }, 'Open file'), fileIn),
    h('h4', {}, 'Saved in this browser'), list);
  refresh();

  return { el, sync: (d) => syncValue(name, d.name), refresh };
}

export { rememberCurrent };
