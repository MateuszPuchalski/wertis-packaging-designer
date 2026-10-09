// The artwork on an imported dieline (formats/customDieline.js): the board colour and the parts pattern
// over the whole sheet, and the WERTIS logo, tagline and website as movable pieces to start from. Add
// pictures (an .ai page or an image) and move everything where the printer's lines call for it.
import { fitLogo, partBox, taglineUnder } from '../brand/logo.js';

export const OPTIONS = [];

export function customSheet(ctx) {
  const { w: W, h: H } = ctx.panel;
  const S = ctx.panel.info.safe;
  const c = ctx.design.content;
  const els = [
    { id: 'sheet.fill', label: 'Board colour', type: 'rect', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: H }, colors: { fill: 'boxOrange' } },
    { id: 'sheet.pattern', label: 'Pattern', type: 'pattern', layer: 'bg', bleed: true, box: { x: 0, y: 0, w: W, h: H }, colors: { ink: 'orangeTone' } },
  ];
  const lw = Math.min(S.w * 0.5, S.h * 0.5 * 3.2);
  const logo = ctx.box('sheet.logo', { x: S.x + (S.w - lw) / 2, y: S.y + S.h * 0.4, w: lw, h: lw / 3.2 });
  els.push({ id: 'sheet.logo', label: 'Logo', type: 'logo', layer: 'fg', layout: 'markWord', movable: true, resizable: true, keepAspect: true, box: logo,
    colors: { gear: 'dark', arc: 'white', word: 'dark', line: 'white' } });
  const tag = taglineUnder(partBox(fitLogo(logo, 'markWord'), 'word'), { gap: 0.55 });
  const tagBox = ctx.box('sheet.tagline', tag.box);
  els.push({ id: 'sheet.tagline', label: 'Tagline', edits: ['tagline'], type: 'text', layer: 'fg', movable: true, resizable: true, keepAspect: true,
    text: c.tagline, font: 'condSemibold', align: 'right', valign: 'top', spacing: 0.02, box: tagBox, size: tagBox.h / 0.7, minSize: 1.4, colors: { fill: 'white' } });
  const urlBox = ctx.box('sheet.url', { x: S.x + (S.w - lw) / 2, y: S.y + S.h * 0.4 + lw / 3.2 + tagBox.h * 3, w: lw, h: Math.max(lw / 3.2 * 0.22, 2) });
  els.push({ id: 'sheet.url', label: 'Website', edits: ['url'], type: 'text', layer: 'fg', movable: true, resizable: true, text: c.url, font: 'regular', align: 'center', valign: 'middle',
    box: urlBox, size: urlBox.h / 0.7, minSize: 1.2, colors: { fill: 'white' } });
  return els;
}

export const customSheetTemplate = { id: 'customSheet', label: 'Free canvas on the imported dieline', options: OPTIONS, panels: { customSheet } };
