// The formats (dieline geometry) and templates (on-brand layouts) the app knows.
import { flatPouch } from './formats/flatPouch.js';
import { standUpPouch } from './formats/standUpPouch.js';
import { tuckBox } from './formats/tuckBox.js';
import { customDieline } from './formats/customDieline.js';
import { pouchWindow } from './templates/pouchWindow.js';
import { boxProduct, boxGeneric } from './templates/boxWertis.js';
import { customSheetTemplate } from './templates/customSheet.js';

export const FORMATS = { flatPouch, standUpPouch, tuckBox, customDieline };
export const TEMPLATES = { pouchWindow, boxProduct, boxGeneric, customSheet: customSheetTemplate };
