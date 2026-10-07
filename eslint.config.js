// `npm run lint`. Besides the usual mistakes it keeps the rendering core DOM-free, so the
// preview, the exports and the Node tests all run the same code.
import js from '@eslint/js';
import globals from 'globals';

// Everything that turns a design into SVG: no DOM, no browser APIs.
const CORE = ['src/{design,registry,store}.js', 'src/{brand,codes,formats,templates,render,util}/**/*.js', 'src/three/scenes.js', 'src/export/pdfx.js', 'src/export/dxf.js', 'src/preflight.js', 'src/text/textEngine.js', 'src/export/documents.js'];

const DOM = ['document', 'window', 'navigator', 'localStorage', 'indexedDB', 'Image', 'fetch', 'DOMParser', 'Blob', 'URL', 'HTMLElement', 'requestAnimationFrame']
  .map((name) => ({ name, message: 'The rendering core is DOM-free: pass what it needs in.' }));

const rules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['node_modules/**', 'vendor/**', 'docs/**', 'assets/**'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }, rules },
  { files: ['scripts/**/*.js', 'test/**/*.js', 'eslint.config.js', 'src/text/nodeFonts.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } }, rules },
  // page.evaluate() callbacks run in the browser.
  { files: ['scripts/playtest.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: CORE, rules: { 'no-restricted-globals': ['error', ...DOM], 'no-restricted-syntax': ['error', { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Patterns use the seeded rng (src/util/rng.js) so a design always looks the same.' }] } },
];
