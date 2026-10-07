// Polish messages for the editor (src/i18n/index.js): the same keys as en.js. Plural
// messages have the forms one (1), few (2–4, 22–24…), many (0, 5–21…) and other (fractions).
// Print terms: wykrojnik (dieline), spad (bleed), zgrzew (seal), zamek strunowy (zip),
// fałda denna (bottom gusset), bigowanie (crease), kolor dodatkowy (spot ink),
// poddruk biały (white underprint), kontrola przed drukiem (preflight), makieta (mockup).
export default {
  'app.name': 'Projektant opakowań WERTIS',

  'ean.digits': 'EAN-13 składa się wyłącznie z cyfr.',
  'ean.length': { one: 'EAN-13 ma 13 cyfr (ten ma {n} cyfrę).', few: 'EAN-13 ma 13 cyfr (ten ma {n} cyfry).', many: 'EAN-13 ma 13 cyfr (ten ma {n} cyfr).', other: 'EAN-13 ma 13 cyfr (ten ma {n}).' },
  'ean.check': 'Błędna cyfra kontrolna: ostatnia cyfra powinna wynosić {check}.',

  'err.notProject': 'Ten plik nie jest projektem opakowania WERTIS.',
  'err.noVersion': 'Ten projekt nie ma prawidłowego numeru wersji.',
  'err.newer': 'Ten projekt zapisała nowsza wersja programu (v{version}); zaktualizuj program, aby go otworzyć.',
  'err.windowSwatch': 'Kolor okienka oznacza obszar przezroczysty: można go edytować, ale nie usunąć.',
  'err.pickReplacement': 'Wybierz inny kolor dla elementów, które używają tego.',

  'pf.ean.bad': 'EAN-13 „{code}”: {error}',
  'pf.ean.store': 'EAN {code} pochodzi z puli wewnątrzsklepowej (zaczyna się od 2): wystarczy jako zaślepka, nie do sprzedaży detalicznej.',
  'pf.ean.ok': 'EAN-13 {code} jest prawidłowy.',
  'pf.ean.none': 'Na tym opakowaniu nie ma kodu EAN-13.',
  'pf.ean.small': 'Kod kreskowy ma {pct} % rozmiaru nominalnego; GS1 wymaga co najmniej 80 %.',
  'pf.ean.bwr': 'Kreski są pocienione o {bwr} mm na rozlewanie farby (redukcja szerokości kresek).',
  'pf.colour.tac': '„{name}” ma {tac} % sumy farb, więcej niż {limit} %, na które pozwala {intent}; może odbijać lub długo schnąć.',
  'pf.colour.noSpot': '„{name}” drukuje się jako kolor dodatkowy, ale nie ma nazwy (np. PANTONE 151 C).',
  'pf.colour.namedSpot': '„{name}” nazywa się {spot}, ale drukuje się w CMYK; zaznacz „Kolor dodatkowy”, aby drukować go tą farbą.',
  'pf.colour.inks': 'Farby: {inks} (plus wykrojnik, który się nie drukuje).',
  'pf.colour.inksWhite': 'Farby: {inks}, poddruk biały (plus wykrojnik, który się nie drukuje).',
  'pf.colour.noInks': 'brak',
  'pf.colour.richBlack': '„{name}” to głęboka czerń (C{c} M{m} Y{y} K{k}); drobny tekst w tym kolorze wymaga idealnego pasowania.',
  'pf.text.small': '„{el}” ma {pt} pt; poniżej 5 pt druk może nie wyjść czysto.',
  'pf.layout.safe': '„{el}” ({panel}) wychodzi poza obszar bezpieczny (zgrzewy, bigi lub linię cięcia).',
  'pf.bleed.low': 'Spad wynosi {bleed} mm; większość drukarni wymaga 3 mm.',
  'pf.bleed.ok': 'Spad {bleed} mm na każdej zewnętrznej krawędzi.',
  'pf.images': 'W pliku do druku jest zdjęcie; zdjęcia są w RGB, więc PDF nie jest PDF/X-1a (drukarnia je przekonwertuje).',
  'pf.window.seal': 'Okienko wchodzi na zgrzewy lub zamek; w tym miejscu folii nie da się zgrzać.',
  'pf.summary.ok': 'Gotowe do druku: nie znaleziono problemów.',
};
