import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Same detector the render suite uses: the Eleventy site has no Alpine, so the
// baked page must carry hooks only.
const ALPINE = /\b(x-[a-z]+|@[a-z]+(\.[a-z0-9]+)*|:[a-z-]+)=/;

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// Boot the real Eleventy adapter against a stub config so the test sees the
// exact fragment the /new/ page ships, endpoint included.
async function bake() {
  const register = require('../lib/form-engine.js');
  const hooks = {};
  const shortcodes = {};
  register({
    on: (event, fn) => { hooks[event] = fn; },
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    addWatchTarget: () => {},
  });
  await hooks.beforeBuild();
  return shortcodes.formApp;
}

test('src/new.njk renders add-property, not the demo, and asks for Bootstrap', () => {
  const page = read('src/new.njk');

  assert.match(page, /\{%\s*formApp\s+"add-property"\s*%\}/);
  assert.doesNotMatch(page, /\{%\s*formApp\s+"demo"\s*%\}/);
  assert.match(page, /^bootstrap:\s*true$/m);
});

test('the default layout loads Bootstrap 4 only for flagged pages', () => {
  const layout = read('src/_includes/layouts/default.njk');
  const block = layout.match(/\{%\s*if bootstrap\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/);

  assert.ok(block, 'default.njk must gate the vendor stylesheet on `bootstrap`');
  assert.match(block[1], /\/assets\/vendor\/bootstrap4\.css/);
});

test('the adapter bakes add-property with the worker endpoint and theme bootstrap4', async () => {
  const formApp = await bake();
  const html = formApp('add-property');

  assert.match(html, /<form id="add-property-form" method="POST"/);
  assert.match(html, /<script id="add-property-config" type="application\/json">/);
  assert.match(html, /"theme":"bootstrap4"/);
  assert.match(html, /<script type="module" src="\/assets\/js\/form-engine\/app\.js\?v=[0-9a-f]+"><\/script>/);
  assert.match(
    html,
    /<div id="add-property-app" data-endpoint="https:\/\/add-property-worker\.sparkling-union-9e0a\.workers\.dev">/,
  );

  // The inlined Leaflet blob and the JSON island are script bodies, not
  // attributes; the form markup between them must carry no Alpine directives.
  assert.doesNotMatch(html.replace(/<script\b[\s\S]*?<\/script>/g, ''), ALPINE);
});
