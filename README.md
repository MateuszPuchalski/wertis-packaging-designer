# WERTIS Packaging Designer

A browser app for designing WERTIS packaging: window zip pouches like the KEULE 25 × 35 cm
bag, stand-up pouches and folding boxes, all in WERTIS branding. You pick a format and an
on-brand template, change sizes, texts and colours in the left panel, and drag the window,
logos, label and recycling marks on the preview. It exports:

- **Print PDF / Print SVG.** Real size in mm, with bleed. The artwork sits in the group
  `artwork` and the dieline (cut, zip, holes, notches, window outline) in a separate,
  non-printing magenta group `dieline`. Windows carry no ink, and all text is converted to
  outlines, so no fonts are needed at the printer.
- **Proof PDF / PNG.** A factory-style proof sheet:
  - a header table (product, code, format and size, version, date, author, number of colours);
  - a chip for every colour the design uses, with hex, CMYK and spot names, plus
    "Transparent" for the window;
  - notes for the printer;
  - the artwork with its dieline and dimensions in mm;
  - a legend and a sign-off box.
- **Mockup PNG.** The finished bag (front, back or both) with your product photo behind the
  window film, at 96, 150 or 300 dpi.

- **3D tab.** The packs as real objects under physics (three.js + cannon-es), textured
  with the design's own faces:
  - boxes in a neat stack you can **Push** over, or dropped into a pile;
  - pouches hanging on a peg hook through their hang holes (and swinging when pushed),
    in a pile, or lying in stacks.

  **Save PNG** takes a snapshot. Drag to orbit the camera; scroll to zoom.

The pattern of parts icons comes in two styles: solid silhouettes, or outlines. The recycling
marks (the triangle with the material code, plus the tidyman) are vector shapes; pick the
material under *Layout*.

## Example products

- **Pouches** start with a fuel filter. It has placeholder codes: the SKU W00-0000, and the
  EAN 2000000000008 from GS1's in-store-only range, so it can never match a real product.
  Type in the real codes.
- **Boxes** start with the W09-0414 carburettor from its box artwork.

## Formats

- **Flat zip pouch.** Front and back side by side, as on the factory proof. Seals, zip, hang
  hole (euro slot, sombrero or round), tear notches and rounded corners are all editable.
- **Stand-up pouch (doypack, W × H + G).** Front and back, plus the bottom gusset as its own
  strip with its fold line. K-seal, round or plain bottom. Text stays above the part of the
  face that folds under.
- **Folding box (L × W × H).** Laid out like the WERTIS boxes:
  - Pieces: glue flap, back, side, front, side. The lid with its tuck flap hangs on the back,
    the dust flaps sit on the sides, and the thumb notch is cut into the front.
  - Bottom: a snap-lock (1-2-3) bottom as on W09-0414, or a tuck end (reverse tuck end).
  - Cut lines are cyan and folds red, as in the printer's files. The tuck and bottom flaps
    stay unprinted.
  - Two templates: the product box (W09-0414 style) and the generic "CZĘŚCI ZAMIENNE /
    SPARE PARTS" box.
  - The flap shapes are scaled from the W09-0414 dieline. Note that this file is named
    "L95 W65 H50", but its walls measure about 95 × 75 × 49 mm. The generic box proof
    matches 95 × 65 × 50, which is the default.

## Run it

```bash
npm install     # dev tools only (ESLint, Playwright, the libraries' sources)
npm start       # http://localhost:8000  (PORT=xxxx to change)
```

The app is plain ES modules with no build step. It also runs from any static host (for
example GitHub Pages), because the browser libraries are vendored in `vendor/`. Projects save
themselves in the browser (IndexedDB). **Export file** writes a `.wertis.json` file that you
can open on another computer.

## Colours

Every colour is a swatch in the **Colours** panel: a name, a hex value, CMYK and a spot name
(for example a Pantone number).

- **Elements point at swatches.** Change a swatch and every element that uses it follows.
  Click an element on the preview to give it another swatch, a one-off custom colour or no
  colour.
- **Deleting a swatch** that is in use asks which swatch those elements should switch to.
- **Presets.** Palettes can be saved as named presets, exported and imported as JSON.
  **WERTIS default** restores the brand colours.
- **Logo colours.** The logo has four colour roles: gear, arc, WERTIS and the "SKLEP Z
  CZĘŚCIAMI" line. Presets match the pages of `Logo_WERTIS.pdf` (colour, green, white,
  black), plus "on orange" and "box lid".

The default spot names are empty on purpose. Ask the printer for the numbers they match and
type them in, so they appear on the proof.

## Brand sources

- **Logo.** `assets/brand/source/Logo_WERTIS.pdf` is the original Illustrator logo.
  `npm run import-logo` turns its first page into `src/brand/logoPaths.js` (the steps are in
  `scripts/import-logo.js`).
- **Pattern icons.** They come from the foil-mailer artwork `Foliopak.pdf`. Run
  `pdftocairo -svg Foliopak.pdf foliopak.svg && npm run import-icons -- foliopak.svg`, then
  choose the icons in `scripts/import-icons.js`. The PDF itself is not committed (13 MB).

## Before a real print run

- **Check the construction numbers with the factory:** seal widths, zip position and hole
  shape. They are all editable under *Format & size*.
- **Count the colours.** The proof counts the colours. The default design uses 8, so merge
  swatches if the printer quotes per colour.
- **Barcode size.** The EAN-13 is checked and never drawn below 80 % of its nominal size.

## Development

```bash
npm test          # unit tests (node:test): geometry, codes, colours, rendering, text
npm run lint      # ESLint; the rendering core must stay DOM-free
npm run playtest  # headless Chromium uses the app: drag, edit colours, undo, every export
npm run ci        # all three
npm run vendor    # copy the browser libraries from node_modules into vendor/
```

## Licences

- **Fonts:** Barlow and Barlow Semi Condensed, SIL Open Font License (`assets/fonts/OFL.txt`).
- **Libraries:** jsPDF, svg2pdf.js, opentype.js, qrcode-generator, three.js and cannon-es,
  all MIT. Their licence files are in `vendor/`. three.js loads through the import map in
  `index.html`, and only when the 3D tab opens.
- **Brand assets:** the WERTIS logo and icons belong to WERTIS Sp. z o.o.
