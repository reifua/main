import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadYaml } from '../_form-engine/tools/yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// Boot the real Eleventy adapter against a stub config.
async function bakeNotifyModal() {
  const register = require('../lib/form-engine.js');
  const hooks = {};
  const shortcodes = {};
  const globalData = {};
  register({
    on: (event, fn) => { hooks[event] = fn; },
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    addWatchTarget: () => {},
    globalData,
  });
  await hooks.beforeBuild();
  // The notify modal partial is rendered in the layout, so we need to
  // simulate the template rendering with the shortcodes.
  // We'll call the shortcodes directly to get the config island and page JSON.
  const configIsland = shortcodes.notifyConfigIsland();
  const pageJson = shortcodes.notifyPageJson('test-uid', '/property/url/', 'test@example.com', 'Test Property');
  const version = shortcodes.formEngineVersion();
  return { configIsland, pageJson, version };
}

test('notify modal partial exists with Bootstrap 4 markup', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.match(modal, /<div class="modal fade" id="notifyModal"/);
  assert.match(modal, /class="modal-dialog modal-lg"/);
  assert.match(modal, /class="modal-content"/);
  assert.match(modal, /class="modal-header"/);
  assert.match(modal, /class="modal-title" id="notifyModalLabel"/);
  assert.match(modal, /class="close" data-dismiss="modal"/);
  assert.match(modal, /class="modal-body"/);
});

test('notify modal includes notify-app with endpoint from site data', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.match(modal, /id="notify-app" data-endpoint="\{\{ site\.notifyEndpoint \}\}"/);
});

test('notify modal includes config island via notifyConfigIsland shortcode', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.match(modal, /<script id="notify-config" type="application\/json">\{\% notifyConfigIsland \%\}<\/script>/);
});

test('notify modal includes page data via notifyPageJson shortcode', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.match(modal, /<script id="notify-page" type="application\/json">\{\% notifyPageJson uid, page\.url \| url, email, title \%\}<\/script>/);
});

test('notify modal includes app.js with version from formEngineVersion shortcode', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.match(modal, /<script type="module" src="\{\{ '\/assets\/js\/form-engine\/app\.js' \| url \}\}\?v=\{\% formEngineVersion \%\}"><\/script>/);
});

test('notify modal has no Alpine attributes', () => {
  const modal = read('src/_includes/partials/notify-modal.njk');
  assert.doesNotMatch(modal, /\bx-[a-z]+=/);
  assert.doesNotMatch(modal, /\b@[a-z]+/);
  assert.doesNotMatch(modal, /\b:[a-z-]+=/);
});

test('default layout includes notify modal conditionally on notify flag', () => {
  const layout = read('src/_includes/layouts/default.njk');
  assert.match(layout, /\{%\s*if notify\s*%\}/);
  assert.match(layout, /\{%\s*include "partials\/notify-modal\.njk"\s*%\}/);
  assert.match(layout, /\{%\s*endif\s*%\}/);
});

test('rental_entry layout enables notify and has correct front matter', () => {
  const layout = read('src/_includes/layouts/rental_entry.njk');
  assert.match(layout, /^notify:\s*true$/m);
  assert.doesNotMatch(layout, /notifyPage/); // notifyPage now handled in partial via shortcode
});

test('notify config validates against schema', () => {
  const config = loadYaml(join(ROOT, 'src/_data/notify.yml'));
  assert.ok(config, 'notify.yml should load');
  assert.equal(config.id, 'notify');
  assert.equal(config.version, 1);
  // Basic schema checks
  assert.ok(config.behavior && config.behavior.mode === 'modal');
  assert.ok(config.behavior.modal === '#notifyModal');
  assert.ok(config.steps && Array.isArray(config.steps) && config.steps.length > 0);
});

test('notify config has behavior.mode modal', () => {
  const notifyConfig = read('src/_data/notify.yml');
  assert.match(notifyConfig, /behavior:/);
  assert.match(notifyConfig, /mode:\s*modal/);
  assert.match(notifyConfig, /modal:\s*"#notifyModal"/);
});

test('notify config has captcha widget (turnstile_widget)', () => {
  const notifyConfig = read('src/_data/notify.yml');
  assert.match(notifyConfig, /turnstile_widget/);
  assert.match(notifyConfig, /id="turnstile-widget"/);
});

test('site data has notifyEndpoint', () => {
  const siteData = read('src/_data/site.js');
  assert.match(siteData, /notifyEndpoint:\s*['"]https:\/\/notify-worker\.sparkling-union-9e0a\.workers\.dev['"]/);
});

test('form-engine.js has notify endpoint in ENDPOINTS', () => {
  const formEngine = read('lib/form-engine.js');
  assert.match(formEngine, /'notify':\s*SITE\.notifyEndpoint/);
});

test('form-engine.js has notifyConfigIsland shortcode', () => {
  const formEngine = read('lib/form-engine.js');
  assert.match(formEngine, /notifyConfigIsland/);
});

test('form-engine.js has notifyPageJson shortcode', () => {
  const formEngine = read('lib/form-engine.js');
  assert.match(formEngine, /notifyPageJson/);
});

test('form-engine.js has formEngineVersion shortcode', () => {
  const formEngine = read('lib/form-engine.js');
  assert.match(formEngine, /formEngineVersion/);
});

test('notify modal baked config island has theme bootstrap4', async () => {
  const { configIsland } = await bakeNotifyModal();
  const config = JSON.parse(configIsland);
  assert.equal(config.theme, 'bootstrap4');
});

test('notify modal page JSON shortcode produces correct structure', async () => {
  const { pageJson } = await bakeNotifyModal();
  const page = JSON.parse(pageJson);
  assert.equal(page.uid, 'test-uid');
  assert.equal(page.property_url, '/property/url/');
  assert.equal(page.property_email, 'test@example.com');
  assert.equal(page.property_title, 'Test Property');
});

test('formEngineVersion shortcode returns version string', async () => {
  const { version } = await bakeNotifyModal();
  assert.match(version, /^[0-9a-f]{12}$/);
});

test('Bootstrap 4 page (new) still works after notify changes', async () => {
  const register = require('../lib/form-engine.js');
  const hooks = {};
  const shortcodes = {};
  register({
    on: (event, fn) => { hooks[event] = fn; },
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    addWatchTarget: () => {},
    globalData: {},
  });
  await hooks.beforeBuild();
  const html = shortcodes.formApp('add-property');
  assert.match(html, /<form id="add-property-form"/);
  assert.match(html, /"theme":"bootstrap4"/);
  assert.match(html, /data-endpoint="https:\/\/add-property-worker\.sparkling-union-9e0a\.workers\.dev"/);
});

test('Tailwind page (demo) still works after notify changes', async () => {
  const register = require('../lib/form-engine.js');
  const hooks = {};
  const shortcodes = {};
  register({
    on: (event, fn) => { hooks[event] = fn; },
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    addWatchTarget: () => {},
    globalData: {},
  });
  await hooks.beforeBuild();
  const html = shortcodes.formApp('demo');
  assert.match(html, /<form id="demo-form"/);
  assert.match(html, /"theme":"tailwind"/);
});