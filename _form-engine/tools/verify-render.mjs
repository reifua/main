#!/usr/bin/env node
// Render gate for the Eleventy side. The Jekyll twin keeps a captured baseline
// (`_form-engine/tools/verify-render.ps1`); here the source of truth is cheaper
// to reproduce: the adapter can bake the same fragment in memory from the
// current config and engine. So "verify" means: re-bake now, minify with the
// production transform, and compare byte-for-byte with what `dist/` ships.
//
//   node _form-engine/tools/verify-render.mjs
//
// The test in test/freshness.test.mjs uses the same helpers, so `npm test` and
// `npm run verify:render` can never disagree about what "fresh" means.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Pages whose whole form fragment is baked by the adapter. The notify form is
// different: its modal markup comes from the Nunjucks template and the adapter
// only supplies the two JSON islands, so it is checked island by island below.
export const FORM_PAGES = [
  { name: 'add-property', page: 'new/index.html' },
  { name: 'demo', page: 'demo/index.html' },
];

const PAGE_ISLAND_OPEN = (name) => `<script id="${name}-config" type="application/json">`;
const MODULE_OPEN = '<script type="module"';
const SCRIPT_CLOSE = '</script>';

/** The fragment from `<script id="{name}-config">` through the module loader. */
export function extractFragment(html, name) {
  const start = html.indexOf(PAGE_ISLAND_OPEN(name));
  if (start < 0) throw new Error(`no ${name}-config island`);
  const moduleStart = html.indexOf(MODULE_OPEN, start);
  if (moduleStart < 0) throw new Error(`no module loader after ${name}-config`);
  const end = html.indexOf(SCRIPT_CLOSE, moduleStart);
  if (end < 0) throw new Error(`module loader after ${name}-config is unclosed`);
  return html.slice(start, end + SCRIPT_CLOSE.length);
}

/** One `<script id="...">` island: its body and the whole tag. */
export function extractJsonIsland(html, id) {
  const open = `<script id="${id}" type="application/json">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`no ${id} island`);
  const bodyStart = start + open.length;
  const end = html.indexOf(SCRIPT_CLOSE, bodyStart);
  if (end < 0) throw new Error(`${id} island is unclosed`);
  return {
    body: html.slice(bodyStart, end),
    outer: html.slice(start, end + SCRIPT_CLOSE.length),
    start,
  };
}

/** The `?v=` token of the first module loader at or after `from`. */
export function extractModuleVersion(html, from = 0) {
  const start = html.indexOf(MODULE_OPEN, from);
  if (start < 0) return null;
  const tagEnd = html.indexOf('>', start);
  if (tagEnd < 0) return null;
  const match = /\?v=([^"&]+)/.exec(html.slice(start, tagEnd));
  return match ? match[1] : null;
}

/** Production minifier options live in lib/transforms/minifyHtml.js; use them. */
export function minifyBakedHtml(html, root = ROOT, outputPath = 'index.html') {
  const localRequire = createRequire(join(root, 'package.json'));
  const transform = localRequire(join(root, 'lib', 'transforms', 'minifyHtml.js'));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return transform(html, outputPath);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

/**
 * Boots the real Eleventy adapter against a stub config, exactly like
 * test/add-property-page.test.mjs and test/notify-page.test.mjs do.
 */
export async function bakeForms(root = ROOT) {
  const localRequire = createRequire(join(root, 'package.json'));
  const register = localRequire(join(root, 'lib', 'form-engine.js'));
  const hooks = {};
  const shortcodes = {};
  const globalData = {};
  register({
    on: (event, fn) => { hooks[event] = fn; },
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    addWatchTarget: () => {},
    globalData,
  });
  if (typeof hooks.beforeBuild !== 'function') {
    throw new Error('the adapter registered no beforeBuild hook');
  }
  await hooks.beforeBuild();
  return {
    formApp: (name) => shortcodes.formApp(name),
    shortcodes,
    globalData,
    engineVersion: globalData.formEngineVersion || '',
    site: localRequire(join(root, 'src', '_data', 'site.js')),
    configs: localRequire(join(root, 'src', '_data', 'site.js')) && null,
  };
}

/** Every built page that carries the notify modal, as dist-relative POSIX paths. */
export function notifyPages(distDir) {
  if (!existsSync(distDir)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html') && readFileSync(full, 'utf8').includes('id="notifyModal"')) {
        out.push(full.slice(distDir.length + 1).split(sep).join('/'));
      }
    }
  };
  walk(distDir);
  return out.sort();
}

export function firstDifference(expected, actual) {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) if (expected[i] !== actual[i]) return i;
  return expected.length === actual.length ? -1 : n;
}

function snippet(text, at, radius = 90) {
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + radius * 2);
  return JSON.stringify(text.slice(from, to));
}

/** Human-readable first difference for the long, minified lines in dist/. */
export function describeDifference(expected, actual) {
  const at = firstDifference(expected, actual);
  if (at < 0) return '';
  return `first difference at char ${at} (len ${expected.length} -> ${actual.length})\n` +
    `  expected: ...${snippet(expected, at)}...\n` +
    `  actual:   ...${snippet(actual, at)}...`;
}

function result(ok, label, detail = '') {
  return { ok, label, detail };
}

/**
 * Re-bakes every adapter-owned fragment and compares it with dist/.
 *
 * @param {{root?: string, distDir?: string}} [options]
 * @returns {Promise<Array<{ok: boolean, label: string, detail: string}>>}
 */
export async function verifyFreshness({ root = ROOT, distDir = join(root, 'dist') } = {}) {
  const results = [];

  if (!existsSync(distDir)) {
    results.push(result(false, 'dist/ exists', 'no dist/ yet - run npm run build'));
    return results;
  }

  const baked = await bakeForms(root);
  const staleHint = 'stale build - run npm run build';

  for (const { name, page } of FORM_PAGES) {
    const file = join(distDir, ...page.split('/'));
    if (!existsSync(file)) {
      results.push(result(false, `${name} fragment is fresh`, `${page} is missing - run npm run build`));
      continue;
    }
    try {
      const expected = minifyBakedHtml(baked.formApp(name), root);
      const actual = extractFragment(readFileSync(file, 'utf8'), name);
      const ok = expected === actual;
      results.push(result(ok, `${name} fragment is fresh (${page})`, ok ? '' : describeDifference(expected, actual) + `\n  ${staleHint}`));
    } catch (err) {
      results.push(result(false, `${name} fragment is fresh (${page})`, err.message));
    }
  }

  const pages = notifyPages(distDir);
  if (!pages.length) {
    results.push(result(false, 'a built page carries the notify modal', 'no dist page has id="notifyModal" - run npm run build'));
    return results;
  }

  const freshConfig = baked.shortcodes.notifyConfigIsland();
  const freshVersion = baked.engineVersion;
  const endpoint = baked.site && baked.site.notifyEndpoint;

  for (const rel of pages) {
    try {
      const html = readFileSync(join(distDir, ...rel.split('/')), 'utf8');

      const configIsland = extractJsonIsland(html, 'notify-config');
      const configOk = configIsland.body === freshConfig;
      results.push(result(configOk, `notify config island is fresh (${rel})`,
        configOk ? '' : describeDifference(freshConfig, configIsland.body) + `\n  ${staleHint}`));

      const pageIsland = extractJsonIsland(html, 'notify-page');
      let pageOk = false;
      let pageDetail = '';
      try {
        const pageData = JSON.parse(pageIsland.body);
        const expectedPage = baked.shortcodes.notifyPageJson(
          pageData.uid, pageData.property_url, pageData.property_email, pageData.property_title,
        );
        pageOk = pageIsland.body === expectedPage;
        if (!pageOk) pageDetail = describeDifference(expectedPage, pageIsland.body) + `\n  ${staleHint}`;
      } catch (err) {
        pageDetail = `notify-page is not valid JSON: ${err.message}`;
      }
      results.push(result(pageOk, `notify page island is fresh (${rel})`, pageDetail));

      const version = extractModuleVersion(html, configIsland.start);
      const versionOk = version === freshVersion;
      results.push(result(versionOk, `notify module version is fresh (${rel})`,
        versionOk ? '' : `dist has ?v=${version}, engine is ?v=${freshVersion}; ${staleHint}`));

      const endpointMatch = /id="notify-app" data-endpoint="([^"]*)"/.exec(html);
      const endpointOk = !!endpointMatch && endpointMatch[1] === endpoint;
      results.push(result(endpointOk, `notify endpoint is fresh (${rel})`,
        endpointOk ? '' : `dist has ${endpointMatch ? endpointMatch[1] : '(no endpoint)'}, site.js has ${endpoint}; ${staleHint}`));
    } catch (err) {
      results.push(result(false, `notify islands are fresh (${rel})`, err.message));
    }
  }

  return results;
}

export function formatResults(results) {
  const lines = results.map((item) => {
    const head = `${item.ok ? 'ok  ' : 'FAIL'}  ${item.label}`;
    return item.ok || !item.detail ? head : `${head}\n      ${item.detail.replace(/\n/g, '\n      ')}`;
  });
  const failed = results.filter((item) => !item.ok).length;
  lines.push('');
  lines.push(failed ? `FAIL: ${failed}/${results.length} freshness check(s)` : `PASS: all ${results.length} freshness check(s)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI ----

const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const mode = process.argv[2] || 'verify';
  if (mode !== 'verify') {
    console.error('usage: node _form-engine/tools/verify-render.mjs [verify]');
    process.exit(2);
  }
  const results = await verifyFreshness();
  console.log(formatResults(results));
  process.exit(results.every((item) => item.ok) ? 0 : 1);
}
