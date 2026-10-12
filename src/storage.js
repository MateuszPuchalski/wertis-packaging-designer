// Projects and colour presets in the browser's IndexedDB (designs can hold product photos,
// which are too big for localStorage). Everything stays on this computer; the JSON export
// is how a project moves to another one.
import { migrate } from './design.js';

const DB_NAME = 'wertis-packaging';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('presets')) db.createObjectStore('presets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function listProjects() {
  const all = (await tx('projects', 'readonly', (s) => s.getAll())) ?? [];
  return all.map((p) => ({ id: p.id, name: p.design?.name ?? 'Untitled', format: p.design?.format, updated: p.updated }))
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
}

export async function saveProject(id, design) {
  await tx('projects', 'readwrite', (s) => s.put({ id, design, updated: new Date().toISOString() }));
  return id;
}

export async function loadProject(id) {
  const rec = await tx('projects', 'readonly', (s) => s.get(id));
  return rec ? migrate(rec.design) : null;
}

export async function deleteProject(id) {
  await tx('projects', 'readwrite', (s) => s.delete(id));
}

export async function listPresets() {
  return ((await tx('presets', 'readonly', (s) => s.getAll())) ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function savePreset(preset) {
  await tx('presets', 'readwrite', (s) => s.put(preset));
}

export async function deletePreset(id) {
  await tx('presets', 'readwrite', (s) => s.delete(id));
}

// Font files the person supplied (Century Gothic, Myriad Pro...): licensed, so they are never in the
// project or the repository, only here in this browser.
export async function listFonts() {
  return (await tx('fonts', 'readonly', (s) => s.getAll())) ?? [];
}

export async function saveFont(key, name, data) {
  await tx('fonts', 'readwrite', (s) => s.put({ key, name, data }));
}

export async function deleteFont(key) {
  await tx('fonts', 'readwrite', (s) => s.delete(key));
}

// The project open in the editor, remembered between visits.
export function rememberCurrent(id) {
  try { localStorage.setItem('wertis-packaging:current', id); } catch {}
}

export function currentId() {
  try { return localStorage.getItem('wertis-packaging:current'); } catch { return null; }
}
