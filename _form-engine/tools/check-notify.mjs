#!/usr/bin/env node
// Post-build gate for the config-driven Notify modal (Eleventy twin).
//
//   node _form-engine/tools/check-notify.mjs [dist]
//
// Ported from the Jekyll _form-engine/tools/check-notify.mjs: same
// assertions, only the platform paths differ - the built site lives in dist/
// (Eleventy) instead of _site/ (Jekyll), and the engine is imported from
// src/assets/js/form-engine/. Like the Jekyll original the tool is
// post-agnostic: it finds every built page that carries the modal and runs
// the same assertions on each. Pages are located by their content, never by
// a hardcoded path, so a full build checks all of them.
//
// What it asserts per page:
//   - the mount element, endpoint and both JSON islands are present
//   - the islands parse; config says id=notify, version=1, has steps, and the
//     page island carries uid/url/email/title, and the uid matches the built
//     filename when it has one
//   - the module include is form-engine/app.js and the legacy notify.js is gone
//   - the config renders (in node, via the same FormRender the browser uses)
//     into the legacy form contract: id, novalidate, data-form, action,
//     honeypot, hidden fields - and no Alpine attributes

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FormRender } from '../../src/assets/js/form-engine/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteDir = process.argv[2] || join(ROOT, 'dist');

const ALPINE = /\b(x-[a-z]+|@[a-z]+(\.[a-z0-9]+)*|:[a-z-]+)=/;

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

function htmlFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) out.push(path);
    }
  };
  walk(dir);
  return out;
}

function island(html, id) {
  const m = html.match(
    new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`),
  );
  return m ? m[1] : null;
}

function checkPage(file) {
  const rel = relative(siteDir, file).split(sep).join('/');
  const html = readFileSync(file, 'utf8');

  const endpointM = html.match(/<div id="notify-app" data-endpoint="([^"]*)"/);
  if (!endpointM) {
    fail(rel, 'missing #notify-app with data-endpoint');
    return;
  }
  const endpoint = endpointM[1];
  if (!endpoint) fail(rel, 'data-endpoint is empty');
  else if (!endpoint.includes('notify-worker')) fail(rel, `unexpected endpoint: ${endpoint}`);

  const configRaw = island(html, 'notify-config');
  if (!configRaw) {
    fail(rel, 'missing #notify-config JSON island');
    return;
  }
  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (error) {
    fail(rel, `#notify-config is not JSON: ${error.message}`);
    return;
  }
  if (config.id !== 'notify') fail(rel, `config.id is ${JSON.stringify(config.id)}, expected "notify"`);
  if (config.version !== 1) fail(rel, `config.version is ${JSON.stringify(config.version)}, expected 1`);
  if (!Array.isArray(config.steps) || !config.steps.length) fail(rel, 'config has no steps');

  const pageRaw = island(html, 'notify-page');
  if (!pageRaw) {
    fail(rel, 'missing #notify-page JSON island');
    return;
  }
  let page;
  try {
    page = JSON.parse(pageRaw);
  } catch (error) {
    fail(rel, `#notify-page is not JSON: ${error.message}`);
    return;
  }
  for (const key of ['uid', 'property_url', 'property_email', 'property_title']) {
    if (!(key in page)) fail(rel, `#notify-page is missing "${key}"`);
  }
  if (page.property_url === '' || page.property_url === null) fail(rel, 'property_url is empty');

  const uid = page.uid === null || page.uid === undefined ? '' : String(page.uid);
  if (uid && !uid.includes('"') && !rel.includes(uid)) {
    fail(rel, `uid ${uid} does not appear in the built path`);
  }

  if (!/<script type="module"[^>]*src="[^"]*form-engine\/app\.js/.test(html)) {
    fail(rel, 'missing the form-engine/app.js module include');
  }
  if (html.includes('/assets/js/notify.js')) {
    fail(rel, 'the legacy notify.js is still included');
  }

  // Render the config exactly as the browser glue does: endpoint merged into
  // submit.action first, then the theme's form contract. The 11ty glue mounts
  // with the island's theme (bootPage/bootModal), so the check renders with
  // it too instead of relying on the bootstrap4 default.
  const rendered = FormRender.render(
    {
      ...config,
      submit: { ...(config.submit || {}), action: endpoint, method: 'POST' },
    },
    { theme: config.theme || 'bootstrap4' },
  );

  if (!/^<form id="notify-form" method="POST"/.test(rendered)) {
    fail(rel, 'rendered form lost id="notify-form" method="POST"');
  }
  if (!rendered.includes(`action="${endpoint}"`)) {
    fail(rel, 'rendered form action does not carry the endpoint');
  }
  if (!rendered.includes('novalidate autocomplete="off" data-form="notify">')) {
    fail(rel, 'rendered form lost novalidate/data-form="notify"');
  }
  if (!rendered.includes('id="notify-honeypot"')) fail(rel, 'rendered form lost the honeypot');
  for (const name of ['timestamp', 'uid', 'property_url', 'property_email', 'property_title']) {
    if (!rendered.includes(`name="${name}"`)) fail(rel, `rendered form lost the ${name} hidden input`);
  }
  if (!rendered.includes('id="field_reason"')) fail(rel, 'rendered form lost the reason select');
  const alpine = rendered.match(ALPINE);
  if (alpine) fail(rel, `framework attribute leaked into the rendered form: ${alpine[0]}`);
}

if (!existsSync(siteDir) || !statSync(siteDir).isDirectory()) {
  console.error(`check-notify: no such site directory: ${siteDir}`);
  process.exit(1);
}

const pages = htmlFiles(siteDir).filter((file) => readFileSync(file, 'utf8').includes('id="notifyModal"'));

if (!pages.length) {
  console.error(
    'check-notify: no built page carries the notify modal.\n' +
      '  A property page (rental_entry layout, notify: true) must be in dist/.',
  );
  process.exit(1);
}

for (const file of pages) checkPage(file);

if (failures.length) {
  console.error(`check-notify: ${failures.length} failure(s) across ${pages.length} page(s):`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`check-notify: ok (${pages.length} page(s) checked)`);
