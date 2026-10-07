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

// Example content a new design starts with. Window pouches hold small parts; the example
// is a fuel filter with placeholder codes (SKU W00-0000, and an EAN from GS1's 200 range,
// which is for in-store use only, so it can never clash with a real product). Boxes start
// with the real W09-0414 carburettor from its box artwork.
const EXAMPLES = {
  pouch: {
    name: 'Filtr paliwa – torebka z okienkiem',
    productName: {
      pl: 'Filtr paliwa do kosy spalinowej i pilarki',
      cz: 'Palivový filtr pro křovinořez a motorovou pilu',
      sk: 'Palivový filter pre krovinorez a motorovú pílu',
      en: 'Fuel filter for brushcutters and chainsaws',
      hu: 'Üzemanyagszűrő fűkaszához és láncfűrészhez',
      ro: 'Filtru de combustibil pentru motocoasă și drujbă',
    },
    subtitle: 'Do silników dwusuwowych',
    sku: 'W00-0000',
    ean: '2000000000008',
    specs: ['Średnica przewodu: 3 mm', 'Opakowanie: 2 szt.'],
  },
  box: {
    name: 'W09-0414 gaźnik – pudełko',
    productName: {
      pl: 'Gaźnik do kosy spalinowej 15mm',
      cz: 'Karburátor pro křovinořez 15 mm',
      sk: 'Karburátor pre krovinorez 15 mm',
      en: 'Carburettor for brushcutters, 15 mm',
      hu: 'Karburátor fűkaszához, 15 mm',
      ro: 'Carburator pentru motocoasă, 15 mm',
    },
    subtitle: 'Do pojemności 52 cc',
    sku: 'W09-0414',
    ean: '5905947594658',
    specs: ['Otwór gaźnika: 15 mm', 'Rozstaw śrub: 31 mm', 'Wysokość całkowita: 90 mm', 'Występuje w silnikach o pojemności do 52cc'],
  },
};

const COMMON_CONTENT = {
  lang: 'pl',
  specsTitle: 'Dane techniczne:',
  note1: 'ZAMIENNIK WYSOKIEJ JAKOŚCI',
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

// The design name and content for a new design of this kind ('pouch' or 'box').
export function exampleContent(kind = 'pouch') {
  const { name, ...content } = EXAMPLES[kind] ?? EXAMPLES.pouch;
  return { name, content: JSON.parse(JSON.stringify({ ...COMMON_CONTENT, ...content })) };
}
