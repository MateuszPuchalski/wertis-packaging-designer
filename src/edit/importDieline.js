// Puts a dieline read from a file (import/dieline.js) into the project: the format becomes the imported
// dieline, whose lines live in `design.custom`. Texts, colours and the palette stay.
import { switchFormat } from '../design.js';
import { cleanCustom } from '../formats/customDieline.js';

export function applyDieline(design, dieline, name = '') {
  const custom = cleanCustom({ name: name || 'Imported dieline', ...dieline });
  return { ...switchFormat({ ...design, custom }, 'customDieline'), custom };
}
