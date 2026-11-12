import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JEKYLL_ROOT = process.env.FORM_ENGINE_JEKYLL_ROOT || 'C:/Users/Vasyl/Documents/GitHub/realtyua/main';
const JEKYLL_INC = join(JEKYLL_ROOT, '_includes', 'form', 'app');
const JEKYLL_BASELINE = join(JEKYLL_ROOT, '_form-engine', 'baseline');
const DIST = join(ROOT, 'dist');

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** Extract the form fragment from a full HTML page. */
function extractFragment(html, name) {
  const start = html.indexOf(`<script id="${name}-config" type="application/json">`);
  if (start < 0) throw new Error(`no ${name}-config island`);
  const moduleStart = html.indexOf('<script type="module"', start);
  if (moduleStart < 0) throw new Error(`no module loader after ${name}-config`);
  const end = html.indexOf('</script>', moduleStart) + '</script>'.length;
  return html.slice(start, end);
}

/** Extract one JSON island from HTML. */
function extractJsonIsland(html, id) {
  const open = `<script id="${id}" type="application/json">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`no ${id} island`);
  const bodyStart = start + open.length;
  const end = html.indexOf('</script>', bodyStart);
  if (end < 0) throw new Error(`${id} island is unclosed`);
  return {
    body: html.slice(bodyStart, end),
    outer: html.slice(start, end + '</script>'.length),
  };
}

/** Normalize a fragment for parity comparison:
 * - remove data-endpoint values
 * - normalize ?v= tokens to ?v=TOKEN
 * - remove notify-page body (page-specific data)
 * - strip EOL differences
 */
function normalizeParity(html) {
  return html
    .replace(/data-endpoint="[^"]*"/g, 'data-endpoint="ENDPOINT"')
    .replace(/\?v=[0-9a-f]+/g, '?v=TOKEN')
    .replace(/<script id="notify-page" type="application\/json">[\s\S]*?<\/script>/g,
      '<script id="notify-page" type="application/json">{"uid":"","property_url":"","property_email":"","property_title":""}</script>');
}

/** Find a reifua dist page that has the notify modal. */
function findDistNotifyPage() {
  const pages = [];
  const find = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) find(f);
      else if (e.name.endsWith('.html') && readFileSync(f, 'utf8').includes('id="notifyModal"')) pages.push(f);
    }
  };
  if (!existsSync(DIST)) return null;
  find(DIST);
  return pages[0] || null;
}

// Load Jekyll's renderPage and siteOpts for fresh baking from the SAME config
const { loadYaml: jekyllLoadYaml } = await import('file:///' + JEKYLL_ROOT + '/_form-engine/tools/yaml.mjs');
const { loadSiteOpts: jekyllLoadSiteOpts } = await import('file:///' + JEKYLL_ROOT + '/_form-engine/tools/site-opts.mjs');
const { renderPage: jekyllRender } = await import('file:///' + JEKYLL_ROOT + '/assets/js/form-engine/shell.js');

// Load reifua's renderPage for fresh baking from the SAME config
const { renderPage: reifuaRender } = await import('file:///' + ROOT + '/src/assets/js/form-engine/shell.js');

async function testParity(name, jekyllConfig, reifuaOpts = {}) {
  // Bake fresh from the SAME config on both stacks
  const jekyllOptsRaw = jekyllLoadSiteOpts(JEKYLL_ROOT, jekyllConfig, { endpoint: 'https://endpoint.invalid/parity', version: 'parity' });
  // Normalize EOL in mapCss/mapJs so both renderers get identical inputs
  const normalizeEol = (s) => s.replace(/\r\n/g, '\n');
  const jekyllOpts = { ...jekyllOptsRaw, mapCss: normalizeEol(jekyllOptsRaw.mapCss || ''), mapJs: normalizeEol(jekyllOptsRaw.mapJs || '') };
  const reifuaOptsFull = {
    ...jekyllOpts,
    mapCss: read(ROOT + '/src/assets/vendor/leaflet.css').replace(/\r\n/g, '\n'),
    mapJs: read(ROOT + '/src/assets/vendor/leaflet.js').replace(/\r\n/g, '\n'),
    ...reifuaOpts,
  };
  const a = jekyllRender(jekyllConfig, { ...jekyllOpts, name });
  const b = reifuaRender(jekyllConfig, { ...reifuaOptsFull, name });
  return { a, b };
}

test('add-property fragment parity (both stacks from same config)', async () => {
  try {
    const jekyllConfig = jekyllLoadYaml(join(JEKYLL_ROOT, '_data', 'add-property.yml'));
    const { a, b } = await testParity('add-property', jekyllConfig);
    assert.equal(normalizeParity(a), normalizeParity(b),
      'add-property fragments differ after normalization (both stacks from same config)');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`SKIP: ${err.message} (set FORM_ENGINE_JEKYLL_ROOT to test parity)`);
      return;
    }
    throw err;
  }
});

test('demo fragment parity (both stacks from same config)', async () => {
  try {
    const jekyllConfig = jekyllLoadYaml(join(JEKYLL_ROOT, '_data', 'demo.yml'));
    const { a, b } = await testParity('demo', jekyllConfig);
    assert.equal(normalizeParity(a), normalizeParity(b),
      'demo fragments differ after normalization (both stacks from same config)');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`SKIP: ${err.message} (set FORM_ENGINE_JEKYLL_ROOT to test parity)`);
      return;
    }
    throw err;
  }
});

test('notify config island parity (Jekyll baseline modal vs reifua dist modal)', async () => {
  try {
    const distFile = findDistNotifyPage();
    if (!distFile) throw new Error('no dist page has notifyModal - run npm run build');
    const distHtml = read(distFile);
    const distConfig = extractJsonIsland(distHtml, 'notify-config').body;

    // Load Jekyll baseline notify config
    const jekyllBaseline = join(JEKYLL_BASELINE, '.render-baseline.json');
    if (!existsSync(jekyllBaseline)) throw new Error('Jekyll baseline not captured');
    const manifest = JSON.parse(read(jekyllBaseline));
    if (!manifest.propertyPages?.length) throw new Error('no property page in baseline');
    const jekyllPage = join(JEKYLL_ROOT, '_site', manifest.propertyPages[0]);
    if (!existsSync(jekyllPage)) throw new Error('Jekyll _site/ not built - run jekyll build --limit_posts 1');
    const jekyllHtml = read(jekyllPage);
    const jekyllConfig = extractJsonIsland(jekyllHtml, 'notify-config').body;

    // Both should be valid JSON and deep-equal (full config, not page data)
    const j = JSON.parse(jekyllConfig);
    const d = JSON.parse(distConfig);
    assert.deepEqual(j, d, 'notify config island JSON differs (Jekyll baseline vs reifua dist)');
  } catch (err) {
    if (err.code === 'ENOENT' || err.message.includes('not built') || err.message.includes('not captured')) {
      console.log(`SKIP: ${err.message} (set FORM_ENGINE_JEKYLL_ROOT and build Jekyll to test parity)`);
      return;
    }
    throw err;
  }
});