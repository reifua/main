// The engine skin of a theme, read at build time.
//
// A theme is markup (themes/<name>.js) plus skin (themes/<name>.css). The
// markup is browser code and must stay free of Node APIs; the skin is only ever
// needed while baking a page, so it is read here and inlined by shell.js.
//
//   themeStyle('bootstrap4')  ->  the text of themes/bootstrap4.css (or '')

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cache = new Map();

export function themeStyle(name = 'bootstrap4') {
  if (cache.has(name)) return cache.get(name);
  const file = fileURLToPath(new URL(`./${name}.css`, import.meta.url));
  const css = existsSync(file) ? readFileSync(file, 'utf8') : '';
  cache.set(name, css);
  return css;
}

export default themeStyle;
