// English messages for the editor (src/i18n/index.js). A message is a string with {name}
// placeholders, or { one, other } where the count is params.n.
export default {
  'app.name': 'WERTIS Packaging Designer',

  // The EAN-13 check (codes/ean13.js).
  'ean.digits': 'An EAN-13 has only digits.',
  'ean.length': 'An EAN-13 has 13 digits (this has {n}).',
  'ean.check': 'Wrong check digit: the last digit should be {check}.',

  // Errors from the core (design.js).
  'err.notProject': 'This file is not a WERTIS packaging project.',
  'err.noVersion': 'This project has no valid version number.',
  'err.newer': 'This project was saved by a newer version of the app (v{version}); update the app to open it.',
  'err.windowSwatch': 'The window colour marks the transparent area; it can be edited but not deleted.',
  'err.pickReplacement': 'Pick another colour for the elements that use this one.',

  // Preflight findings (preflight.js).
  'pf.ean.bad': 'EAN-13 “{code}”: {error}',
  'pf.ean.store': 'EAN {code} is from the in-store range (it starts with 2): fine as a placeholder, not for retail.',
  'pf.ean.ok': 'EAN-13 {code} is valid.',
  'pf.ean.none': 'There is no EAN-13 on this pack.',
  'pf.ean.small': 'The barcode is {pct} % of nominal size; GS1 asks for at least 80 %.',
  'pf.ean.bwr': 'Bars are thinned by {bwr} mm for ink spread (bar width reduction).',
  'pf.colour.tac': '“{name}” has {tac} % total ink, over the {limit} % {intent} allows; it may set off or dry slowly.',
  'pf.colour.noSpot': '“{name}” prints as a spot ink but has no spot name (e.g. PANTONE 151 C).',
  'pf.colour.namedSpot': '“{name}” is named {spot} but prints as CMYK; tick “Spot ink” to print it as that ink.',
  'pf.colour.inks': 'Inks: {inks} (plus the dieline, which does not print).',
  'pf.colour.inksWhite': 'Inks: {inks}, White underprint (plus the dieline, which does not print).',
  'pf.colour.noInks': 'none',
  'pf.colour.richBlack': '“{name}” is a rich black (C{c} M{m} Y{y} K{k}); small text in it needs perfect registration.',
  'pf.text.small': '“{el}” is {pt} pt; under 5 pt may not print cleanly.',
  'pf.layout.safe': '“{el}” on the {panel} runs outside the safe area (seals, folds or the cut).',
  'pf.bleed.low': 'Bleed is {bleed} mm; most printers ask for 3 mm.',
  'pf.bleed.ok': 'Bleed {bleed} mm on every outer edge.',
  'pf.images': 'A photo is placed in the print file; photos are RGB, so the PDF is not PDF/X-1a (the printer will convert it).',
  'pf.window.seal': 'A window reaches into the seals or the zip; the film cannot be sealed there.',
  'pf.summary.ok': 'Ready to print: no problems found.',
};
