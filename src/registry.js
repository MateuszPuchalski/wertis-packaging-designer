// The formats (dieline geometry) and templates (on-brand layouts) the app knows.
import { flatPouch } from './formats/flatPouch.js';
import { standUpPouch } from './formats/standUpPouch.js';
import { tuckBox } from './formats/tuckBox.js';
import { pouchWindow } from './templates/pouchWindow.js';
import { boxProduct, boxGeneric } from './templates/boxWertis.js';

export const FORMATS = { flatPouch, standUpPouch, tuckBox };
export const TEMPLATES = { pouchWindow, boxProduct, boxGeneric };
