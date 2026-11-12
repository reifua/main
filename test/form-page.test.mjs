import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import { FormRender } from '../src/assets/js/form-engine/render.js';
import { buildData } from '../src/assets/js/form-engine/data.js';
import { bootPage as wireFormPageImpl } from '../src/assets/js/form-engine/page-form.js';

// Stub the captcha watcher's timer seam so no real interval outlives the test.
const wireFormPage = (document, opts = {}) => wireFormPageImpl(document, { setInterval: () => 0, ...opts });

// A brand-new form, nothing to do with add-property: proves the same glue
// drives every config the engine renders (generic discovery + submit).
const config = {
  version: 1,
  id: 'demo',
  settings: { title: 'Демо' },
  submit: { action: '/api/demo' },
  steps: [
    { id: 's1', title: 'Крок 1', rows: [{ class: 'row', fields: [
      { name: 'full_name', type: 'text', label: 'Імʼя' },
      { name: 'email', type: 'email', label: 'Email' },
    ] }] },
  ],
};

function mount() {
  const island = JSON.stringify({ settings: config.settings, steps: config.steps, rates: {} })
    .replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
  const baked = FormRender.render(config, { data: buildData(config) });

  const html = `<!doctype html><html><body>
    <script id="demo-config" type="application/json">${island}</script>
    <div id="demo-app" data-endpoint="/api/demo">${baked}</div>
    <div class="step-indicator"></div>
    <button data-step-prev hidden></button><button data-step-next></button><button data-submit hidden></button>
    <div data-submitted-block hidden></div><div data-error-block hidden></div>
    <p data-error-text></p><p data-error-code-wrap hidden><span data-error-code></span></p>
  </body></html>`;

  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return { window, document: window.document };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('a non-add-property config boots through the same page glue', () => {
  const { document } = mount();
  const app = wireFormPage(document, { name: 'demo' });
  assert.ok(app, 'wireFormPage must boot a generic form');
  assert.ok(app.controller, 'the controller must be exposed');
  assert.equal(document.getElementById('demo-form') !== null, true);
});

test('discovery without an explicit name finds the config island', () => {
  const { document } = mount();
  const app = wireFormPage(document, {});
  assert.ok(app, 'wireFormPage must discover the *-config island on its own');
});

test('the generic submit posts the form data as FormData to the endpoint', async () => {
  const { window, document } = mount();
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };

  const app = wireFormPage(document, { name: 'demo', fetch: fetchImpl, leaflet: null, Captcha: null });
  app.controller.setData('full_name', 'Іван');

  const submit = document.querySelector('[data-submit]');
  submit.dispatchEvent(new window.Event('click', { bubbles: true }));
  await flush(); await flush();

  assert.equal(calls.length, 1, 'exactly one submit request');
  assert.equal(calls[0].url, '/api/demo');
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.body instanceof window.FormData, 'body is FormData');
  assert.match(calls[0].init.body.get('data') || '', /Іван/);
});
