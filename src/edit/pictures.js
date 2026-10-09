// Pictures placed on a panel: an image file or the page of an .ai / PDF, kept in the project as a data
// URL. The picture is an element like the logo (move, resize, hide); these are the project changes.
import { FORMATS } from '../registry.js';

export const MAX_PICTURES = 20;
const MAX_SRC = 12_000_000; // characters of data URL

// What a project may carry as `pictures`.
export function cleanPictures(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  for (const [id, v] of Object.entries(p).slice(0, MAX_PICTURES)) {
    if (!/^[a-z0-9]{1,12}$/.test(id) || !v || typeof v.src !== 'string' || !v.src.startsWith('data:image/') || v.src.length > MAX_SRC) continue;
    const ratio = Number(v.ratio);
    out[id] = { panel: String(v.panel ?? ''), src: v.src, name: String(v.name ?? '').slice(0, 120), ratio: Number.isFinite(ratio) && ratio > 0.01 && ratio < 100 ? ratio : 1 };
  }
  return out;
}

// The panel a new picture goes on: the front of a pouch, the walls of a box, the sheet of an imported dieline.
export function defaultPanelId(design) {
  const geo = FORMATS[design.format].layout(design.dims, design);
  return (geo.panels.find((p) => p.role === 'front') ?? geo.panels[0]).id;
}

export function panelIds(design) {
  return FORMATS[design.format].layout(design.dims, design).panels.map((p) => ({ id: p.id, label: p.label }));
}

export function addPicture(design, { src, name = '', ratio = 1, panel }) {
  const have = Object.keys(design.pictures ?? {});
  if (have.length >= MAX_PICTURES) throw Object.assign(new Error(`At most ${MAX_PICTURES} pictures.`), { i18n: { key: 'err.tooManyPictures', params: { n: MAX_PICTURES } } });
  let n = have.length + 1;
  while (have.includes(`p${n}`)) n++;
  const id = `p${n}`;
  return { design: { ...design, pictures: { ...design.pictures, [id]: { panel: panel ?? defaultPanelId(design), src, name, ratio } } }, id };
}

export function removePicture(design, id) {
  const pictures = { ...design.pictures };
  delete pictures[id];
  const key = `pic.${id}`;
  const layout = { ...design.layout }, hidden = { ...design.hidden };
  delete layout[key];
  delete hidden[key];
  return { ...design, pictures, layout, hidden };
}

// Moves a picture to another panel; where it sat on the old one means nothing on the new one.
export function movePicture(design, id, panel) {
  if (!design.pictures?.[id]) return design;
  const layout = { ...design.layout };
  delete layout[`pic.${id}`];
  return { ...design, pictures: { ...design.pictures, [id]: { ...design.pictures[id], panel } }, layout };
}
