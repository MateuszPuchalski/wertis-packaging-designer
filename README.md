# WERTIS Packaging Designer

A browser app for designing WERTIS packaging: window zip pouches like the KEULE 25 × 35 cm
bag, stand-up pouches and folding boxes, all in WERTIS branding. You pick a format and an
on-brand template, change sizes, texts and colours in the left panel, and drag the window,
logos, label and recycling marks on the preview. The editor speaks Polish or English
(see [Language](#language--język)). The **Export** menu in the top bar makes these files
(**Print PDF** also has its own button next to it):

- **Print PDF (PDF/X-1a:2001).** Real size in mm, with bleed.
  - **Colours:** CMYK only, using each swatch's own CMYK numbers, or a named spot ink when
    the swatch is ticked "Spot ink".
  - **Boxes and printing condition:** TrimBox and BleedBox are set, and the file declares
    a registered printing condition (FOGRA39 by default; also FOGRA51, FOGRA52, FOGRA47 or
    GRACoL 2013).
  - **Dieline:** in its own spot inks, "Dieline" (cuts) and "Crease" (folds), set to
    overprint.
  - **Gradients:** any band (header, black band, footer) can run into another swatch, top to bottom, bottom to top or sideways: pick the band, then "Gradient to" on its card. The print file draws it as thin flat strips, each an exact CMYK mix of the two swatches, so there are no gradient objects and every ink stays a plain process mix.
- **Marks:** crop marks in registration colour, and a slug line with the file's details.
  - **Pages:** page 2 is the dieline alone. For clear film, page 3 is the white underprint
    plate (spot "White"), which covers everything except the windows and holes.
  - **Text and transparency:** all text is outlines and nothing is transparent. A placed
    photo (RGB) turns the file into plain PDF, and preflight says so.
- **Print SVG.** The same artwork and dieline (groups `artwork` and `dieline`), for
  Illustrator.
- **Dieline DXF.** For the die maker: AutoCAD R12, in millimetres. Layers: CUT and CREASE,
  plus ZIP and WINDOW for information.
- **Preflight.** Runs the checks a printer's prepress would:
  - the EAN-13 is valid and at least 80 % size;
  - total ink stays within the printing condition's limit;
  - spot inks have names;
  - no text is under 5 pt;
  - elements stay inside the safe area (clear of seals and folds);
  - bleed, photos, and windows clear of the seals.

  The badge on the button shows the count. Print PDF asks before exporting a file with
  errors.
- **Barcodes (GS1).** EAN-13 with quiet zones, never below 80 %, with an optional bar width
  reduction for ink spread. QR codes keep the 4-module quiet zone that ISO/IEC 18004 asks
  for.
- **Proof PDF / PNG.** A factory-style proof sheet:
  - a header table (product, code, format and size, version, date, author, number of colours);
  - a chip for every colour the design uses, with hex, CMYK and spot names, plus
    "Transparent" for the window;
  - notes for the printer;
  - the artwork with its dieline and dimensions in mm;
  - a legend and a sign-off box.
- **Mockup PNG.** The finished bag (front, back or both) with your product photo behind the
  window film, at 96, 150 or 300 dpi.

- **3D tab.** The packs as real objects, printed with the design's own faces. It opens
  **in the shop**: a store gondola aisle like a parts shop's walls, with perforated steel back
  panels between uprights, base decks and lit WERTIS header signs, under ceiling LED strips
  (which the glossy film reflects). Pouches hang on a grid of scan hooks with label holders,
  one product per hook and more behind; boxes stand front out on the eye-level shelf, up to
  six across and three deep, over the price strips. The other scenes are the studio ones:
  - **Boxes** are rigid board under physics (cannon-es). They sit in a neat stack you can
    **Push** over, or drop into a pile.
  - **Pouches** are soft film, simulated as the real thing (position-based dynamics):
    - two printed films welded at the seals, with a little air sealed in by the zip;
    - the zip and top seal work as a stiff rail;
    - the bags hang from a peg hook by the hang hole, lie in stacks, or fall in a pile, and
      bend and drape over what they lie on.

  **The film.** It is a PET/PE laminate, and its stiffness comes from the material values:
  - PET: E ≈ 4.5 GPa, 1.39 g/cm³. PE: E ≈ 0.25 GPa, 0.925 g/cm³.
  - From these the app works out the bending stiffness and weight per m², and the bending
    length (Peirce).
  - Choose PET 12 / PE 80, 120, 150 or 200 µm. The default is the heavy PET 12 / PE 150,
    with a bending length of about 55 mm.
  - The simulation is calibrated with a cantilever bend test (in the tests), so the film
    bends as much as that laminate does.

  **What is in the pouch.** The pouch can hold a product, modelled in 3D at its real size:
  - **The kit:** the Stihl MS170 / MS180 clutch kit, after the shop's photos. It has the Ø69 mm
    drum with its 3/8" P 7-tooth rim sprocket, the clutch, a spare rim, the needle bearing,
    the cup washer and the E-clip.
  - **Sag:** the parts are loose inside the bag. On the hook they sag to the bottom and stretch
    the film into a pocket. Lying down, they stay where they are and the film swells over them.
  - **Window:** the window shows the parts through the film's sheen. Inside, the pouch is lined
    with the white of the underprint.

  Pick the product (or "Nothing") and the film in the 3D toolbar; the project remembers both.
  Without a product, a photo set for the mockup shows on the inside of the pouch. Up to ten
  pouches.

  **Moving things:** drag a pack to pull it about, and drag the background to orbit. **Push**
  shoves everything (hanging bags swing); a few seconds later it all comes to rest.

  **The look:**
  - the printed film is a glossy laminate and the board a satin varnish;
  - soft shadows; in the studio a key, a fill and a rim light with room reflections, in the
    shop the ceiling LEDs and the light from the aisle;
  - a photo-studio sweep, and for the hook a pegboard; the shop's tiled floor and back wall;
  - neutral tone mapping, so the brand orange stays as printed.

  **At rest the parts keep still.** Contacts hold by static friction (PET on PET μs ≈ 0.45),
  a part resting on its film is held where its film puts it, and a part that is all but still
  loses most of its speed, so nothing creeps or rattles; the tests check it.

  **Save PNG** takes a snapshot. Drag to orbit the camera; scroll to zoom.

"Quality You Can Trust" has its own size setting under **Format → Layout & window** (40 to 300 %). It stays right-aligned under the WERTIS word on the pouch back, the box front and the lid. On the pouch back it can also be moved and resized on the preview, like the logo: pull its corner, or type its height in the card.

The pouch back carries a QR code above the website line, at the right. It links to the link field under Texts, and can be moved and resized too.

The pattern of parts icons comes in two styles: solid silhouettes, or outlines. The recycling
marks (the triangle with the material code, plus the tidyman) are vector shapes; pick the
material under **Format → Layout & window**.

## The editor

- **Top bar:** the design's name and save state, undo and redo, the PL / EN switch,
  **Preflight** with its badge, the **Export** menu (grouped: for the printer, for approval,
  presentation) and **Print PDF**.
- **Left:** five tabs, which remember where you were: **Project** (name, new, duplicate, the
  `.wertis.json` file, the designs saved in this browser), **Format** (format, template, sizes,
  layout and window), **Colours** (swatches, presets and the parts pattern), **Print**
  (printing condition, spot inks, white plate, proof details) and **Mockup**.
- **Right:** the selected element's card (its texts, colours, position in mm, show/hide,
  reset) above the list of every element, grouped by panel, with a search, a show/hide eye per
  row and **Show all**. The card stays in view while the list scrolls.
- **Texts are edited on the element that shows them.** Select a text (or double-click it, or
  right-click → Edit the text) and its card offers exactly its words: the label its product
  name (the pack's main language first, the other languages folded under it), product code,
  EAN-13 (checked as you type), QR link and website; the pouch's address its company, street
  and e-mail (no heading); the box's address block the same, plus the country (Poland); the box's technical data
  its heading and one line per item; and so on. A box drops its barcode when the EAN is empty,
  so its product code offers the EAN too.

### Editing on the preview

- **Select, move, resize.** Click an element, drag it, pull a corner to resize. While you drag,
  a tag shows its position or size in mm.
- **Snapping.** Edges and centres catch on the panel's edges and centre lines, the safe area,
  a box's folds and the other elements, and a red guide shows the line. Hold **Alt** to
  place freely, or switch **Snap** off in the toolbar; away from every line it keeps to a
  0.5 mm grid.
- **Rulers** in mm along the top and left, from the trim's top left corner, shading the
  selected element. **Dieline**, **Guides**, **Rulers** and **Snap** are toggles in the
  toolbar, and the editor remembers them.
- **Zoom and pan.** Ctrl + wheel (or a trackpad pinch) zooms at the pointer; Space + drag or
  the middle button moves the view; **+** / **−** zoom, **0** fits, **1** is the real size
  (100 %). The status bar shows the selection in mm, the pointer's position and the zoom.
- **Hover and right-click.** Hovering names the element. Right-click for Hide, Reset position,
  Reset colours, Show all hidden, Fit and 100 %. **Delete** hides the selected element, **Esc**
  deselects, the arrow keys nudge it 1 mm (Shift: 10 mm). The keyboard button in the status
  bar lists every shortcut.

### Language / Język

The editor is in **Polish** or **English**. It starts in the language you chose last time, else
in Polish when the browser is Polish, else in English. **PL / EN** in the top bar switches; the
editor saves the design and reloads (the undo history starts over). Numbers in the editor use
the language's decimal mark (0,5 mm in Polish).

Only the editor changes language. Everything printed or sent to the factory stays as it is
whatever the editor's language: the print PDF and SVG, the proof, the DXF, the ink names and
the texts on the pack (those are in the pack's own languages, under **Texts**). The tests check
that the files are byte-for-byte the same in both languages.

## Example products

- **Pouches** start universal. The product's own details are hidden: its name, its product
  code and its label (the card's *Show this element* checkbox brings each back). There is no
  barcode, and the 3D pack starts empty (choose the Stihl clutch kit in the 3D toolbar).
  Preflight notes the missing EAN-13 until you type in the real one. The texts keep the
  example Stihl name, so a shown element has words to start from.
- **Boxes** start universal too: the generic "CZĘŚCI ZAMIENNE / SPARE PARTS" box at L95 × W65 × H50 mm, with no technical data, product name or PAP mark. The product box (W09-0414 style) is the other template and brings the carburettor, its technical data and its codes.

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

To open the editor from another device on your network (a phone, another computer), start it
with `HOST=0.0.0.0`:

```bash
HOST=0.0.0.0 npm start                       # macOS / Linux
set HOST=0.0.0.0 && npm start                # Windows cmd
$env:HOST="0.0.0.0"; npm start               # Windows PowerShell
```

The server prints the address to open, for example `http://192.168.1.23:8000`. If the firewall
asks, allow it on private networks only. Anyone on that network can open the editor while the
server runs, so use this on a network you trust, and press Ctrl+C when you're done.
Each device keeps its own library of projects; **Export file** moves a design between them.

The app is plain ES modules with no build step. It also runs from any static host (for
example GitHub Pages), because the browser libraries are vendored in `vendor/`. Projects save
themselves in the browser (IndexedDB). **Export file** writes a `.wertis.json` file that you
can open on another computer.

## Colours

Every colour is a swatch in the **Colours** tab: a name, a hex value, CMYK and a spot name
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
  shape. They are all editable on the **Format** tab.
- **Count the colours.** The proof counts the colours. The default design uses 8, so merge
  swatches if the printer quotes per colour.
- **Barcode size.** The EAN-13 is checked and never drawn below 80 % of its nominal size.

## Development

```bash
npm test          # unit tests (node:test): geometry, codes, colours, rendering, text,
                  # snapping, zoom, both languages (no missing or unused message)
npm run lint      # ESLint; the rendering core must stay DOM-free
npm run playtest  # headless Chromium uses the app in English and in Polish: drag and snap,
                  # zoom and pan, the right-click menu, colours, undo, every export, 3D
npm run ci        # all three
npm run vendor    # copy the browser libraries from node_modules into vendor/
```

## Licences

- **Fonts:** Barlow and Barlow Semi Condensed, SIL Open Font License (`assets/fonts/OFL.txt`).
- **Libraries:** jsPDF, svg2pdf.js, opentype.js, qrcode-generator, three.js and cannon-es,
  all MIT. Their licence files are in `vendor/`. three.js loads through the import map in
  `index.html`, and only when the 3D tab opens.
- **Brand assets:** the WERTIS logo and icons belong to WERTIS Sp. z o.o.
