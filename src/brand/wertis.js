// The WERTIS brand kit: the default palette, the company details and the logo colour
// presets. Every value here is only a starting point: the palette is edited in the app and
// saved with each project.
import { makeSwatch, TRANSPARENT } from './palette.js';

// Colours sampled from the brand files: the logo PDF (dark grey, orange, green), the
// W09-0414 box artwork (box orange, band black) and the foil mailer (pattern grey).
// The spot names are left for the printer's numbers.
export const WERTIS_PALETTE = [
  { id: 'boxOrange', name: 'Box Orange', hex: '#f68c1e', cmyk: [0, 55, 95, 0], spot: '' },
  { id: 'orangeTone', name: 'Orange Tone', hex: '#e27814', cmyk: [5, 62, 100, 0], spot: '' },
  { id: 'orange', name: 'WERTIS Orange', hex: '#ff9100', cmyk: [0, 50, 100, 0], spot: '' },
  { id: 'black', name: 'Band Black', hex: '#231f20', cmyk: [0, 0, 0, 100], spot: '' },
  { id: 'dark', name: 'WERTIS Dark Grey', hex: '#303030', cmyk: [0, 0, 0, 90], spot: '' },
  { id: 'patternGrey', name: 'Pattern Grey', hex: '#4a4a4a', cmyk: [0, 0, 0, 80], spot: '' },
  { id: 'silver', name: 'Silver', hex: '#a7a9ac', cmyk: [0, 0, 0, 40], spot: '' },
  { id: 'white', name: 'White', hex: '#ffffff', cmyk: [0, 0, 0, 0], spot: 'White ink' },
  { id: 'green', name: 'WERTIS Green', hex: '#67a80c', cmyk: [60, 0, 100, 0], spot: '' },
  { id: 'transparent', name: 'Transparent (window)', hex: '#cfe9f7', cmyk: [20, 0, 0, 0], spot: 'No ink', role: TRANSPARENT },
].map(makeSwatch);

export const WERTIS = {
  company: 'WERTIS Sp. z o.o.',
  address: 'Sienkiewicze 4, 16-070 Sienkiewicze',
  email: 'biuro@wertis.com.pl',
  url: 'www.wertis.com.pl',
  qr: 'https://www.wertis.com.pl',
  tagline: 'Quality You Can Trust',
  shopLine: 'SKLEP Z CZĘŚCIAMI',
};

// The logo has four colour roles: the gear, the arc inside it, the WERTIS word and the
// "SKLEP Z CZĘŚCIAMI" line. The presets match the pages of Logo_WERTIS.pdf, plus the
// ones the packaging uses on orange.
export const LOGO_PRESETS = {
  colour: { label: 'Colour', gear: 'dark', arc: 'orange', word: 'dark', line: 'orange' },
  onOrange: { label: 'On orange', gear: 'dark', arc: 'white', word: 'dark', line: 'white' },
  lid: { label: 'Box lid (white word)', gear: 'dark', arc: { none: true }, word: 'white', line: 'white' },
  green: { label: 'Green', gear: 'dark', arc: 'green', word: 'dark', line: 'green' },
  white: { label: 'White', gear: 'white', arc: { none: true }, word: 'white', line: 'white' },
  black: { label: 'Black', gear: 'black', arc: { none: true }, word: 'black', line: 'black' },
};

export const LOGO_ROLES = [['gear', 'Gear'], ['arc', 'Arc'], ['word', 'WERTIS'], ['line', 'SKLEP Z CZĘŚCIAMI']];

export const LANGS = [['pl', 'PL'], ['cz', 'CZ'], ['sk', 'SK'], ['en', 'EN'], ['hu', 'HU'], ['ro', 'RO']];

// The example product: the starter from the WERTIS box photo. (Its box label has the CZ and
// SK lines swapped; these are the right way round.)
export const EXAMPLE_CONTENT = {
  lang: 'pl',
  productName: {
    pl: 'Starter do kosiarki BS Classic Sprint',
    cz: 'Startér pro sekačku BS Classic Sprint',
    sk: 'Štartér pre kosačku na trávu BS Classic Sprint',
    en: 'Starter for the BS Classic Sprint lawnmower',
    hu: 'Indítómotor a BS Classic Sprint fűnyíróhoz',
    ro: 'Demaror pentru mașina de tuns iarba BS Classic Sprint',
  },
  subtitle: 'Do kosiarek Briggs & Stratton Classic / Sprint',
  sku: 'W43-0508',
  ean: '5905947596676',
  specsTitle: 'Dane techniczne:',
  specs: ['Mocowanie: 3 śruby', 'Linka w zestawie', 'Pasuje do silników Classic i Sprint'],
  badgeTop: 'QUALITY',
  badgeBottom: 'YOU CAN TRUST',
  note1: 'ZAMIENNIK WYSOKIEJ JAKOŚCI',
  note2: 'PRODUKT NIEORYGINALNY',
  category: 'CZĘŚCI ZAMIENNE',
  categoryEn: 'SPARE PARTS',
  producedFor: 'Produced for:',
  company: WERTIS.company,
  address: WERTIS.address,
  email: WERTIS.email,
  url: WERTIS.url,
  qr: WERTIS.qr,
  tagline: WERTIS.tagline,
};
