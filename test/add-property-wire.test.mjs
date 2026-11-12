import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

import { bootPage as wireAddPropertyImpl } from '../src/assets/js/form-engine/page-form.js';
import { renderPage } from '../src/assets/js/form-engine/shell.js';
import { loadYaml } from '../_form-engine/tools/yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The captcha watcher arms a real setInterval (500ms, ~30s before it gives up).
// Stub the timer seam so a booted remote-captcha form cannot keep the test
// process alive after the assertions finish.
const wireAddProperty = (document, opts = {}) => wireAddPropertyImpl(document, { setInterval: () => 0, ...opts });

const findLocationWidget = (node) => {
  if (Array.isArray(node)) {
    for (const v of node) {
      const w = findLocationWidget(v);
      if (w) return w;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    if (node.widget === 'location') return node;
    for (const v of Object.values(node)) {
      const w = findLocationWidget(v);
      if (w) return w;
    }
  }
  return null;
};

// The Eleventy bake is in-memory, so render the very fragment the page ships.
// The wire suite pins the location widget to method "one" (the shared semantics
// the Jekyll site ships) so it does not depend on this site's settings.method;
// mountMethodTwo flips the rendered island to "two" like the Jekyll suite.
const config = loadYaml(join(ROOT, 'src', '_data', 'add-property.yml'));
const withMethod = (method) => {
  const cfg = JSON.parse(JSON.stringify(config));
  const widget = findLocationWidget(cfg);
  if (widget && widget.settings) widget.settings.method = method;
  return cfg;
};
const baked = renderPage(withMethod('one'), { name: 'add-property', base: '', version: 'test' })
  .replace(/^<!--\s*form-bake\b[^>]*-->\s*\n?/, '');

function mount() {
  const { window } = parseHTML(`<!doctype html><html><body>${baked}</body></html>`);
  const { document } = window;
  globalThis.document = document;
  globalThis.window = window;

  for (const sel of document.querySelectorAll('select')) {
    const proto = Object.getPrototypeOf(sel);
    if (!Object.getOwnPropertyDescriptor(proto, 'value').set) {
      Object.defineProperty(proto, 'value', {
        configurable: true,
        get() {
          const o = (this.options || []).find((x) => x.selected) || (this.options || [])[this.selectedIndex] || null;
          return o ? o.getAttribute('value') : '';
        },
        set(v) {
          const opts = this.options || [];
          for (const o of opts) o.selected = o.getAttribute && o.getAttribute('value') === String(v);
        },
      });
    }
  }

  return { window, document };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = () => new Promise((r) => setTimeout(r, 0));
const fire = (window, el, type) => {
  const ev = new window.Event(type, { bubbles: true });
  el.dispatchEvent(ev);
};

function findSettlement(all, id) {
  for (const oblast of all) {
    for (const raion of (oblast.raions || [])) {
      for (const hromada of (raion.hromadas || [])) {
        for (const s of (hromada.settlements || [])) {
          if (String(s.id) === String(id)) return { s, raion, hromada, oblast };
        }
      }
    }
  }
  return null;
}

// A compact stand-in for /src/assets/data/all.json: the leaf has more than the
// field's threshold (6) of options, so it opens in search mode, and clearing
// it stays cheap (the real file renders tens of thousands of <option>s).
const ADDR = [
  { id: '0342', name: 'Івано-Франківська', type: 'область', raions: [
    { id: '1338', name: 'Івано-Франківський', type: 'район', hromadas: [
      { id: '3991', name: 'Івано-Франківська', type: 'громада', settlements: [
        { id: '30595', name: 'Івано-Франківськ', type: 'місто' },
        { id: '9001', name: 'Івано-Франківськ село', type: 'село' },
        { id: '9002', name: 'Вовчинець', type: 'село' },
        { id: '9003', name: 'Крихівці', type: 'село' },
        { id: '9006', name: 'Угорники', type: 'село' },
        { id: '9007', name: 'Микитинці', type: 'село' },
        { id: '9008', name: 'Хриплин', type: 'село' },
      ] },
      { id: '3992', name: 'Богородчанська', type: 'громада', settlements: [
        { id: '9009', name: 'Богородчани', type: 'смт' },
      ] },
    ] },
  ] },
];

const addrFetch = async (url) => {
  if (String(url).includes('all.json')) return { ok: true, json: async () => ADDR };
  return { ok: false, status: 404, json: async () => ({}) };
};

// The wire suite renders method "one" (see the bake above); the legacy method:
// two mode (Change #5239) is exercised by flipping the mounted island.
const mountMethodTwo = () => {
  const mounted = mount();
  const island = mounted.document.getElementById('add-property-config');
  const cfg = JSON.parse(island.textContent);
  const widget = findLocationWidget(cfg);
  if (!widget || !widget.settings) throw new Error('the mounted config must carry the location widget');
  widget.settings.method = 'two';
  island.textContent = JSON.stringify(cfg);
  return mounted;
};

// Pin the root ancestor (oblast) to a single-value preset the way the real
// config does (value.default.value / readonly), so a leaf clear must keep it.
const mountMethodTwoPresetOblast = (readonly) => {
  const mounted = mountMethodTwo();
  const island = mounted.document.getElementById('add-property-config');
  const cfg = JSON.parse(island.textContent);
  const widget = findLocationWidget(cfg);
  const oblast = widget.fields.find((f) => f.name === 'oblast');
  oblast.value = { default: { value: ['0342'], readonly } };
  island.textContent = JSON.stringify(cfg);
  return mounted;
};

const bootLocation = async (document, impl = addrFetch) => {
  globalThis.fetch = impl;
  const app = wireAddProperty(document, { fetch: impl, leaflet: null, Captcha: null });
  await flush(); await flush(); await flush(); await tick(30); await flush();
  return app;
};

const feedbackOf = (el) => el.closest('[data-field-group]').querySelector('.invalid-feedback');

const itemWith = (dropdown, text) =>
  Array.prototype.find.call(dropdown.querySelectorAll('.dropdown-item'), (it) => it.textContent.includes(text));

test('district autocomplete reacts to typing and switches to search mode once its settlement is chosen', async () => {
  const { window, document } = mount();

  globalThis.fetch = async (url) => {
    const abs = join(ROOT, 'src', String(url).replace(/^\//, ''));
    try {
      const txt = readFileSync(abs, 'utf8');
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };

  const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
  assert.ok(app, 'wireAddProperty must boot');
  const ctl = app.controller;

  await flush(); await flush(); await flush();

  const chain = findSettlement(JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'data', 'all.json'), 'utf8')), '30595');
  assert.ok(chain, 'settlement 30595 must exist in all.json');

  ctl.setData('location_widget', {
    oblast: '0342', oblastType: 'область', oblastName: 'Івано-Франківська область',
    raion: chain.raion.id, raionName: chain.s.raionName,
    hromada: chain.hromada.id, hromadaName: chain.s.hromadaName,
    settlement: chain.s.id, settlementType: chain.s.type, settlementName: chain.s.name,
  });
  await flush(); await flush(); await tick(30);
  await flush();

  const search = document.querySelector('[data-autocomplete-search="district_settlement"]');
  const dropdown = document.querySelector('[data-autocomplete-dropdown="district_settlement"]');
  const select = document.querySelector('select[data-field="district_settlement"]');
  assert.ok(search && dropdown && select, 'district autocomplete controls must be mounted');

  for (const ch of 'Пас') {
    search.focus();
    search.value += ch;
    fire(window, search, 'input');
    await flush(); await flush();
  }

  const items = dropdown.querySelectorAll('.dropdown-item');
  assert.ok(items.length >= 1, `expected Пасічна in the dropdown after char-by-char typing, got ${items.length}`);
  assert.ok(Array.prototype.some.call(items, (it) => it.textContent.trim() === 'Пасічна'),
    'dropdown must contain the exact "Пасічна" option');
  assert.equal(dropdown.style.display, 'block', 'dropdown must be visible while typing');

  assert.equal(select.hidden, true, 'select must be hidden in search mode');
  assert.equal(search.closest('.position-relative').hidden, false, 'search input must be visible in search mode');

  const target = Array.prototype.find.call(items, (it) => it.textContent.trim() === 'Пасічна');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  const chosen = ctl.getValue('district_settlement');
  assert.ok(chosen, `choosing Пасічна must store an id in the controller, got ${JSON.stringify(chosen)}`);
  assert.equal(search.value, 'Пасічна', 'search input must show the chosen name');

  search.dispatchEvent(new window.Event('blur', { bubbles: true }));
  await flush(); await flush(); await tick(20);
  assert.equal(ctl.getValue('district_settlement'), chosen, 'chosen autocomplete value must survive blur');
  assert.equal(search.value, 'Пасічна', 'chosen name must survive blur');
  assert.equal(search.classList.contains('is-valid'), true, 'a picked value stays valid after blur');
});

test('an unpicked autocomplete keeps its text and turns invalid on blur', async () => {
  const { window, document } = mount();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('[data-autocomplete-search="type_address"]');
  assert.ok(search, 'the type_address autocomplete must be mounted');

  search.focus();
  search.value = 'пррр';
  fire(window, search, 'input');
  await flush();

  assert.equal(app.controller.getValue('type_address'), '', 'typing alone stores no value');
  assert.equal(search.value, 'пррр', 'the typed query stays in the control');
  assert.equal(search.classList.contains('is-invalid'), true, 'a query with no matches is red while typing');
  assert.equal(search.classList.contains('is-valid'), false, 'an uncommitted query is never valid');

  fire(window, search, 'blur');
  await tick(20); await flush();

  assert.equal(search.value, 'пррр', 'blur keeps the uncommitted text');
  assert.equal(search.classList.contains('is-invalid'), true, 'blur keeps the invalid state');
  assert.equal(search.classList.contains('is-valid'), false, 'blur does not turn uncommitted text valid');
  assert.equal(feedbackOf(search).style.display, 'block', 'the required message shows after blur');
});

test('one click on the autocomplete clear button empties the field', async () => {
  const { window, document } = mount();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('[data-autocomplete-search="type_address"]');
  const dropdown = document.querySelector('[data-autocomplete-dropdown="type_address"]');
  const clearBtn = document.querySelector('[data-autocomplete-clear="type_address"]');
  assert.ok(search && dropdown && clearBtn, 'the type_address controls must be mounted');

  search.focus();
  search.value = 'пр';
  fire(window, search, 'input');
  await flush();

  const target = itemWith(dropdown, 'провулок');
  assert.ok(target, 'the dropdown must offer провулок');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(app.controller.getValue('type_address'), 'lane', 'the pick is stored');
  assert.equal(search.value, 'провулок', 'the pick fills the search input');
  assert.equal(search.classList.contains('is-valid'), true, 'the pick shows valid');
  assert.equal(clearBtn.hidden, false, 'the clear button shows once a value is picked');

  fire(window, search, 'blur');
  await tick(20); await flush();
  assert.equal(search.classList.contains('is-valid'), true, 'the green state survives blur');
  assert.equal(search.value, 'провулок', 'the picked name survives blur');

  fire(window, clearBtn, 'click');
  await flush();

  assert.equal(app.controller.getValue('type_address'), '', 'one click clears the stored value');
  assert.equal(search.value, '', 'one click clears the search input');
  assert.equal(clearBtn.hidden, true, 'the clear button hides again');
  assert.equal(search.classList.contains('is-invalid'), true, 'a cleared required field is red');
  assert.equal(search.classList.contains('is-valid'), false, 'a cleared field is not valid');
  const icon = search.parentElement.querySelector('.autocomplete-search-icon');
  assert.equal(icon.hidden, false, 'the magnifier comes back');
  assert.equal(feedbackOf(search).style.display, 'block', 'the required message shows');
});

test('clearing type_address keeps district_settlement invalid after a no-match query', async () => {
  const { window, document } = mount();

  globalThis.fetch = async (url) => {
    const abs = join(ROOT, 'src', String(url).replace(/^\//, ''));
    try {
      const txt = readFileSync(abs, 'utf8');
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };

  const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
  assert.ok(app, 'wireAddProperty must boot');
  const ctl = app.controller;

  await flush(); await flush(); await flush();

  const chain = findSettlement(JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'data', 'all.json'), 'utf8')), '30595');
  assert.ok(chain, 'settlement 30595 must exist in all.json');

  ctl.setData('location_widget', {
    oblast: '0342', oblastType: 'область', oblastName: 'Івано-Франківська область',
    raion: chain.raion.id, raionName: chain.s.raionName,
    hromada: chain.hromada.id, hromadaName: chain.s.hromadaName,
    settlement: chain.s.id, settlementType: chain.s.type, settlementName: chain.s.name,
  });
  await flush(); await flush(); await tick(30);
  await flush();

  const district = document.querySelector('[data-autocomplete-search="district_settlement"]');
  const address = document.querySelector('[data-autocomplete-search="type_address"]');
  const addressClear = document.querySelector('[data-autocomplete-clear="type_address"]');
  assert.ok(district && address && addressClear, 'both autocomplete controls must be mounted');

  district.focus();
  district.value = 'zzz';
  fire(window, district, 'input');
  await flush(); await flush();
  assert.equal(district.classList.contains('is-invalid'), true, 'a no-match query is red while typing');

  fire(window, district, 'blur');
  await tick(20); await flush();
  assert.equal(district.classList.contains('is-invalid'), true, 'the no-match state survives blur');

  address.focus();
  address.value = 'ву';
  fire(window, address, 'input');
  await flush();
  assert.equal(addressClear.hidden, false, 'typing in type_address shows its clear button');

  fire(window, addressClear, 'click');
  await flush();

  assert.equal(district.value, 'zzz', 'clearing type_address leaves the district query alone');
  assert.equal(district.classList.contains('is-invalid'), true,
    'clearing type_address must not neutralize district_settlement');
  assert.equal(address.classList.contains('is-invalid'), true, 'the cleared required type_address is red');
});

test('validateStep paints an uncommitted autocomplete red without a blur', async () => {
  const { window, document } = mount();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('[data-autocomplete-search="type_address"]');
  assert.ok(search, 'the type_address autocomplete must be mounted');

  search.focus();
  search.value = 'ву';
  fire(window, search, 'input');
  await flush();

  assert.equal(search.classList.contains('is-invalid'), false,
    'matching but unpicked text stays neutral while typing');

  const cfg = JSON.parse(document.getElementById('add-property-config').textContent);
  const stepIndex = cfg.steps.findIndex((step) => JSON.stringify(step).includes('"type_address"'));
  assert.ok(stepIndex >= 0, 'type_address must live in a configured step');

  app.controller.validateStep(stepIndex);
  await flush();

  assert.equal(search.classList.contains('is-invalid'), true,
    'validateStep must paint the uncommitted required field red');
  assert.equal(feedbackOf(search).style.display, 'block', 'the required feedback block is shown');
});

test('server errors still paint autocomplete search inputs after the binder hand-off', async () => {
  const { window, document } = mount();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('[data-autocomplete-search="type_address"]');
  assert.ok(search, 'the type_address autocomplete must be mounted');

  app.controller.setServerErrors({ type_address: 'Серверна помилка' });
  await flush();

  assert.equal(search.classList.contains('is-invalid'), true, 'a server error turns the search input red');
  assert.equal(search.title, 'Серверна помилка', 'the server message reaches the title');

  app.controller.setServerErrors({});
  await flush();

  assert.equal(search.classList.contains('is-invalid'), false, 'clearing the server report restores the neutral state');
});

test('autocomplete datas switch when the dependent location settlement changes', async () => {
  const { window, document } = mount();

  globalThis.fetch = async (url) => {
    const abs = join(ROOT, 'src', String(url).replace(/^\//, ''));
    try {
      const txt = readFileSync(abs, 'utf8');
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };

  const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
  assert.ok(app, 'wireAddProperty must boot');
  const ctl = app.controller;

  await flush(); await flush(); await flush();

  ctl.setData('location_widget', {
    oblast: '0812', oblastType: 'область', oblastName: 'Київська область',
    raion: '', hromada: '', settlement: '30559', settlementType: 'місто', settlementName: 'Єзупіль',
  });
  await flush(); await flush(); await flush(); await tick(30); await flush();

  const search = document.querySelector('[data-autocomplete-search="district_settlement"]');
  const dropdown = document.querySelector('[data-autocomplete-dropdown="district_settlement"]');
  assert.ok(search && dropdown, 'district autocomplete controls must be mounted');

  for (const ch of 'Центр') {
    search.focus();
    search.value += ch;
    fire(window, search, 'input');
    await flush(); await flush();
  }

  const items = dropdown.querySelectorAll('.dropdown-item');
  assert.ok(items.length >= 1, `expected Центр in districts-30559.json, got ${items.length}`);
  assert.ok(Array.prototype.some.call(items, (it) => it.textContent.trim() === 'Центр'),
    'dropdown must serve the second datas entry after the settlement change');

  const target = Array.prototype.find.call(items, (it) => it.textContent.trim() === 'Центр');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(ctl.getValue('district_settlement'), 'ezupil-01', 'id from districts-30559.json must be stored');
});

test('location widget toggles between select and search per field according to the old engine semantics', async () => {
  const { window, document } = mount();

  globalThis.fetch = async (url) => {
    const abs = join(ROOT, 'src', String(url).replace(/^\//, ''));
    try {
      const txt = readFileSync(abs, 'utf8');
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };

  const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
  assert.ok(app, 'wireAddProperty must boot');
  const ctl = app.controller;

  await flush(); await flush(); await flush();

  const vis = (fieldName) => {
    const sel = document.querySelector(`select[data-location-field="${fieldName}"]`);
    const search = document.querySelector(`input[data-location-search="${fieldName}"]`);
    const wrap = search ? search.closest('.position-relative') : null;
    return {
      select: sel ? { hidden: sel.hidden, value: sel.value, disabled: sel.disabled } : null,
      search: search ? { hidden: wrap ? wrap.hidden : null, readOnly: search.readOnly } : null,
    };
  };

  const oblast = vis('oblast');
  assert.equal(oblast.select.hidden, false, 'oblast is select-mode with a preset, its select must be visible');
  assert.equal(oblast.select.value, '0342', 'oblast preset must be applied');
  assert.equal(oblast.search.hidden, true, 'oblast search must be hidden in select mode');

  assert.equal(vis('raion').select.hidden, false, 'raion is select-mode (few children), select must be visible');

  ctl.setData('location_widget', {
    oblast: '0342', oblastType: 'область', oblastName: 'Івано-Франківська область',
    raion: '1338', hromada: '3991', settlement: '30595', settlementType: 'місто', settlementName: 'Івано-Франківськ',
  });
  await flush(); await flush(); await tick(30); await flush();

  assert.equal(ctl.getValue('location_widget.settlement'), '30595', 'the programmatic location value is stored');

  assert.equal(vis('raion').select.hidden, false, 'raion stays select-mode once its parent is set');
  assert.equal(vis('hromada').select.hidden, true, 'hromada flips to search-mode once its parent chain is set');
  assert.equal(vis('hromada').search.hidden, false, 'hromada search must be visible in search mode');
  assert.equal(vis('settlement').select.hidden, true, 'settlement flips to search-mode once its parent chain is set');
  assert.equal(vis('settlement').search.hidden, false, 'settlement search must be visible');

  const search = document.querySelector('input[data-location-search="settlement"]');
  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush(); await flush();

  const drop = document.querySelector('[data-location-dropdown="settlement"]');
  const items = drop.querySelectorAll('.dropdown-item');
  assert.ok(items.length >= 1, `expected settlement option in the dropdown, got ${items.length}`);
  assert.ok(Array.prototype.some.call(items, (it) => it.textContent.trim().includes('Івано-Франківськ')),
    'milestone: settlement search must offer Івано-Франківськ');

  assert.equal(ctl.getValue('location_widget.settlement'), '', 'typing a partial query drops the uncommitted value');
});

test('captcha is skipped without a CaptchaSite or in local mode, and gates the form when remote', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

  const boot = (Captcha) => {
    const { document } = mount();
    const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha });
    return { document, ctl: app.controller };
  };
  const stub = (over) => ({ isLocal: () => false, enabled: () => true, solved: () => false, token: () => '', mount() {}, reset() {}, ...over });

  const absent = boot(null);
  await flush(); await flush(); await flush();
  assert.ok(!absent.ctl.rawFieldError('captcha'), 'a build without CaptchaSite (Turnstile disabled) must not block the form');

  const local = boot(stub({ isLocal: () => true, enabled: () => false, solved: () => true }));
  await flush(); await flush(); await flush();
  assert.ok(!local.ctl.rawFieldError('captcha'), 'local mode counts as solved, so it must not block the form');
  const localCard = local.document.querySelector('[data-captcha-field="captcha"]').closest('.captcha-widget');
  assert.equal(localCard.querySelector('.alert-info').hidden, false, 'local mode must reveal the local notice');

  const remote = boot(stub());
  await flush(); await flush(); await flush();
  assert.ok(remote.ctl.rawFieldError('captcha'), 'a remote, unsolved captcha stays required');
  const remoteCard = remote.document.querySelector('[data-captcha-field="captcha"]').closest('.captcha-widget');
  assert.equal(remoteCard.querySelector('.alert-info').hidden, true, 'remote mode must hide the local notice');

  remote.ctl.setCaptchaToken('captcha', 'TOK');
  assert.ok(!remote.ctl.rawFieldError('captcha'), 'a token reported by the watch satisfies the required captcha');
});

test('method "two" fills the ancestors when the leaf settlement is picked, and clearing it wipes them', async () => {
  const { window, document } = mountMethodTwo();
  globalThis.fetch = addrFetch;

  const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
  const ctl = app.controller;
  await flush(); await flush(); await flush(); await tick(30); await flush();

  const search = document.querySelector('input[data-location-search="settlement"]');
  assert.ok(search, 'the settlement search control must be mounted');

  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush();

  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  const items = dropdown.querySelectorAll('.dropdown-item');
  const target = Array.prototype.find.call(items, (it) => it.textContent.includes('Івано-Франківськ'));
  assert.ok(target, 'the settlement dropdown must offer an Івано-Франківськ option');
  assert.ok(target.classList.contains('searchable-dropdown-item'),
    'parent-info items must carry the wrapping class (white-space: normal) so the ancestor tail does not force a horizontal scrollbar');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(ctl.getValue('location_widget.settlement'), '30595', 'the chosen leaf value must be stored');
  assert.equal(ctl.getValue('location_widget.raion'), '1338', 'method two must fill the raion ancestor');
  assert.equal(ctl.getValue('location_widget.hromada'), '3991', 'method two must fill the hromada ancestor');
  assert.equal(ctl.getValue('location_widget.oblast'), '0342', 'method two must fill the oblast ancestor');

  const raionSelect = document.querySelector('select[data-location-field="raion"]');
  assert.equal(raionSelect.closest('.form-group').hidden, false, 'a filled middle field must become visible');
  assert.equal(raionSelect.disabled, true, 'a filled middle field is locked in method two');

  fire(window, document.querySelector('[data-location-clear="settlement"]'), 'click');
  await flush(); await flush();
  assert.equal(ctl.getValue('location_widget.settlement'), '', 'clearing the leaf wipes the leaf');
  assert.equal(ctl.getValue('location_widget.raion'), '', 'clearing the leaf wipes the raion ancestor');
  assert.equal(ctl.getValue('location_widget.hromada'), '', 'clearing the leaf wipes the hromada ancestor');
});

for (const readonly of [true, false]) {
  test(`method "two" keeps a preset (readonly: ${readonly}) ancestor when the leaf is cleared`, async () => {
    const { window, document } = mountMethodTwoPresetOblast(readonly);
    globalThis.fetch = addrFetch;

    const app = wireAddProperty(document, { fetch: globalThis.fetch, leaflet: null, Captcha: null });
    const ctl = app.controller;
    await flush(); await flush(); await flush(); await tick(30); await flush();

    const search = document.querySelector('input[data-location-search="settlement"]');
    search.value = 'Івано-Франківськ';
    fire(window, search, 'input');
    await flush();

    const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
    const target = Array.prototype.find.call(
      dropdown.querySelectorAll('.dropdown-item'),
      (it) => it.textContent.includes('Івано-Франківськ'),
    );
    assert.ok(target, 'the settlement dropdown must offer an Івано-Франківськ option');
    target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
    await flush(); await flush();

    assert.equal(ctl.getValue('location_widget.oblast'), '0342', 'the preset oblast must be auto-filled');
    assert.equal(ctl.getValue('location_widget.hromada'), '3991', 'method two must fill the hromada ancestor');

    fire(window, document.querySelector('[data-location-clear="settlement"]'), 'click');
    await flush(); await flush();

    assert.equal(ctl.getValue('location_widget.settlement'), '', 'clearing the leaf still wipes the leaf');
    assert.equal(ctl.getValue('location_widget.hromada'), '', 'a non-preset ancestor is still wiped');
    assert.equal(ctl.getValue('location_widget.raion'), '', 'a non-preset ancestor is still wiped');
    assert.equal(ctl.getValue('location_widget.oblast'), '0342',
      'a preset ancestor must survive the leaf clear (readonly or not)');
    assert.equal(ctl.getValue('location_widget.oblastName'), 'Івано-Франківська',
      'the preset ancestor label must survive too');
  });
}
test('location chrome follows typing: «-» is invalid, «ів» searches while uncommitted', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  const clearBtn = document.querySelector('[data-location-clear="settlement"]');
  const icon = search.parentElement.querySelector('.location-search-icon');
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  const label = document.querySelector('label[for^="field_location_widget_settlement"]');
  assert.ok(search && clearBtn && icon && dropdown && label, 'the settlement chrome must be mounted');

  assert.equal(clearBtn.hidden, true, 'no clear button before anything is typed');
  assert.equal(icon.hidden, false, 'the magnifier shows while the field is empty');
  assert.equal(label.getAttribute('for'), 'field_location_widget_settlement_search',
    'the label must point at the search input while the field is in search mode');

  search.value = '-';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.classList.contains('is-invalid'), true,
    '«-» matches the pattern but sits below minChars, so it is not a pick and the field is invalid');
  assert.equal(feedbackOf(search).textContent, 'Будь ласка, заповніть це поле',
    'a short uncommitted query reports the required message');
  assert.equal(feedbackOf(search).style.display, 'block', 'the uncommitted feedback shows');
  assert.equal(search.classList.contains('is-valid'), false, 'an uncommitted query is never valid');
  assert.equal(dropdown.style.display, 'none', 'a one-character query keeps the dropdown closed');
  assert.equal(clearBtn.hidden, false, 'any typed text shows the clear button (legacy x-show)');
  assert.equal(icon.hidden, true, 'typed text hides the magnifier');

  search.value = 'ів';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.classList.contains('is-invalid'), false, '«ів» reaches minChars with matches and stays neutral');
  assert.equal(search.classList.contains('is-valid'), false, 'a partial query is not a committed pick');
  assert.equal(feedbackOf(search).style.display, 'none', 'a live query shows no feedback');
  assert.equal(dropdown.style.display, 'block', '«ів» reaches minChars and must open the dropdown');
  assert.ok(dropdown.querySelectorAll('.dropdown-item').length >= 1, '«ів» must offer settlement matches');
  assert.equal(clearBtn.hidden, false, 'the clear button stays while text is typed');
});

test('a query above minChars with no matches reports the no-results message', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  search.value = 'ььь';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.classList.contains('is-invalid'), true, 'a query with no matches is invalid');
  assert.equal(feedbackOf(search).textContent, 'Запис "ььь" відсутній у списку',
    'the no-results message names the query');
});

test('editing the picked label drops the stored value and the field stops being valid', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  const ctl = app.controller;
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush();
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  const target = itemWith(dropdown, 'Івано-Франківськ');
  assert.ok(target, 'the settlement dropdown must offer Івано-Франківськ');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();
  assert.equal(ctl.getValue('location_widget.settlement'), '30595', 'the pick is stored');
  assert.equal(search.classList.contains('is-valid'), true, 'a committed pick is valid');

  search.value = '-';
  fire(window, search, 'input');
  await flush();
  assert.equal(ctl.getValue('location_widget.settlement'), '', 'overwriting the label drops the stored id');
  assert.equal(search.classList.contains('is-valid'), false, 'the field must not stay valid');
  assert.equal(search.classList.contains('is-invalid'), true, 'the mismatching text is invalid');
  assert.equal(feedbackOf(search).textContent, 'Будь ласка, заповніть це поле', 'the required message returns');
});

test('blur keeps the typed query and its pattern state (legacy only validated)', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  const ctl = app.controller;
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  const clearBtn = document.querySelector('[data-location-clear="settlement"]');
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  assert.ok(search && clearBtn && dropdown, 'the settlement chrome must be mounted');

  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush();
  const target = itemWith(dropdown, 'Івано-Франківськ');
  assert.ok(target, 'the settlement dropdown must offer Івано-Франківськ');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();
  assert.equal(ctl.getValue('location_widget.settlement'), '30595', 'the leaf must be stored');

  search.value = '12';
  fire(window, search, 'input');
  await flush();
  assert.equal(ctl.getValue('location_widget.settlement'), '', 'overwriting the label drops the stored id');
  assert.equal(search.classList.contains('is-invalid'), true, 'digits fail the Ukrainian-only pattern');
  assert.equal(feedbackOf(search).textContent, 'Тільки українські літери', 'the field-level pattern message wins');
  assert.equal(feedbackOf(search).style.display, 'block', 'the pattern feedback shows while typing');

  fire(window, search, 'blur');
  await tick(20); await flush();

  assert.equal(search.value, '12', 'blur must not wipe the typed query');
  assert.equal(search.classList.contains('is-invalid'), true, 'the pattern error survives the blur');
  assert.equal(feedbackOf(search).textContent, 'Тільки українські літери', 'the pattern message survives the blur');
  assert.equal(feedbackOf(search).style.display, 'block', 'the feedback block stays open');
  assert.equal(clearBtn.hidden, false, 'the clear button stays while text is typed');
  assert.equal(dropdown.style.display, 'none', 'the dropdown is closed');
});

test('picking a parent wipes the child’s query, pattern error and dropdown', async () => {
  const { window, document } = mountMethodTwo();
  const all = JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'data', 'all.json'), 'utf8'));
  const chain = findSettlement(all, '30595');
  assert.ok(chain, 'settlement 30595 must exist in all.json');
  const realFetch = async (url) => {
    if (String(url).includes('all.json')) return { ok: true, json: async () => all };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const app = await bootLocation(document, realFetch);
  const ctl = app.controller;
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  const clearBtn = document.querySelector('[data-location-clear="settlement"]');
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  assert.ok(search && clearBtn && dropdown, 'the settlement chrome must be mounted');

  search.value = '12';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.classList.contains('is-invalid'), true, 'digits make the child red');
  assert.equal(feedbackOf(search).style.display, 'block', 'the child shows the pattern feedback');

  const hsearch = document.querySelector('input[data-location-search="hromada"]');
  assert.ok(hsearch, 'the hromada search control must be mounted');
  hsearch.value = chain.hromada.name;
  fire(window, hsearch, 'input');
  await flush();
  const hdropdown = document.querySelector('[data-location-dropdown="hromada"]');
  const hitems = hdropdown.querySelectorAll('.dropdown-item');
  assert.ok(hitems.length >= 1, `the hromada dropdown must offer ${chain.hromada.name}`);
  hitems[0].dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.ok(String(ctl.getValue('location_widget.hromada')), 'the parent pick must be stored');
  assert.equal(search.value, '', 'the cascade drops the child’s typed query');
  assert.equal(search.classList.contains('is-invalid'), false, 'the cascade clears the child’s pattern error');
  assert.equal(feedbackOf(search).style.display, 'none', 'the child’s feedback closes');
  assert.equal(clearBtn.hidden, true, 'the child’s clear button hides with the empty query');
  assert.equal(dropdown.style.display, 'none', 'the child’s dropdown is closed');
});

test('a blurred empty location sub-field reports the required message in the legacy order', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  fire(window, search, 'blur');
  await tick(20); await flush();
  assert.equal(search.classList.contains('is-invalid'), true, 'an empty required sub-field errors on blur');
  assert.equal(feedbackOf(search).style.display, 'block', 'the message shows');
  assert.equal(feedbackOf(search).textContent, 'Будь ласка, заповніть це поле',
    'without a field-level message the form-wide settings.required.message wins');

  const hselect = document.querySelector('select[data-location-field="hromada"]');
  fire(window, hselect, 'blur');
  await flush();
  assert.equal(hselect.classList.contains('is-invalid'), true, 'an empty required hromada errors on blur');
  assert.equal(feedbackOf(hselect).textContent, 'Оберіть громаду',
    'field.message outranks the form-wide settings.required.message');

  const oselect = document.querySelector('select[data-location-field="oblast"]');
  fire(window, oselect, 'blur');
  await flush();
  assert.equal(oselect.classList.contains('is-invalid'), false, 'a filled sub-field never errors on blur');
  assert.equal(feedbackOf(oselect).style.display, 'none', 'a filled sub-field shows no feedback');
});

test('blurring a live query without a pick marks the required field invalid', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  assert.ok(search, 'the settlement search control must be mounted');

  search.value = 'ів';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.classList.contains('is-invalid'), false, 'a live query with matches stays neutral while typing');
  assert.equal(feedbackOf(search).style.display, 'none', 'no feedback while a query with candidates is typed');

  fire(window, search, 'blur');
  await tick(20); await flush();
  assert.equal(search.classList.contains('is-invalid'), true, 'blur without a pick marks the required sub-field invalid');
  assert.equal(search.classList.contains('is-valid'), false, 'an uncommitted query is never valid');
  assert.equal(feedbackOf(search).textContent, 'Будь ласка, заповніть це поле', 'the blur reports the required message');
  assert.equal(feedbackOf(search).style.display, 'block', 'the required feedback shows after blur');
});

test('an unpicked required location sub-field keeps Next disabled until the chain is complete', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  const ctl = app.controller;
  assert.ok(app, 'wireAddProperty must boot');

  const nextBtn = document.querySelector('[data-step-next]');
  assert.ok(nextBtn, 'the next button must be mounted');

  ctl.setStep(3);
  await flush();
  ctl.setData('type_address', 'street');
  ctl.setData('name_address', 'Бандери');
  ctl.setData('house_address', '16');
  await flush(); await flush();
  assert.equal(ctl.getValue('type_address'), 'street', 'the step address fields must be filled for the test');
  assert.equal(nextBtn.disabled, true, 'a filled step still cannot advance past an unpicked required location');

  const search = document.querySelector('input[data-location-search="settlement"]');
  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush();
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  const target = itemWith(dropdown, 'Івано-Франківськ');
  assert.ok(target, 'the settlement dropdown must offer Івано-Франківськ');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush(); await flush();
  assert.ok(String(ctl.getValue('location_widget.settlement')), 'the leaf pick is stored');
  assert.equal(nextBtn.disabled, false, 'completing the location enables Next');
});

test('the summary renders the legacy locationSummary format', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const box = document.querySelector('[data-location-summary]');
  const panel = box.closest('.mt-2');
  assert.ok(box && panel, 'the summary panel must be mounted');
  assert.equal(panel.hidden, true, 'the panel stays hidden without a leaf value');

  const search = document.querySelector('input[data-location-search="settlement"]');
  search.value = 'Івано-Франківськ';
  fire(window, search, 'input');
  await flush();
  const dropdown = document.querySelector('[data-location-dropdown="settlement"]');
  const target = itemWith(dropdown, 'Івано-Франківськ');
  assert.ok(target, 'the settlement dropdown must offer Івано-Франківськ');
  target.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(panel.hidden, false, 'the panel shows once the leaf is set');
  assert.equal(box.textContent,
    'Івано-Франківська, Івано-Франківський, Івано-Франківська громада територіальна громада, місто Івано-Франківськ, Україна',
    'leaf as "type name", the hromada row cleaned like legacy, the country pinned at the end');
});

test('an unrelated controller change keeps an in-progress location query', async () => {
  const { window, document } = mountMethodTwo();
  const app = await bootLocation(document);
  assert.ok(app, 'wireAddProperty must boot');

  const search = document.querySelector('input[data-location-search="settlement"]');
  const clearBtn = document.querySelector('[data-location-clear="settlement"]');
  assert.ok(search && clearBtn, 'the settlement chrome must be mounted');

  search.value = 'Івано';
  fire(window, search, 'input');
  await flush();
  assert.equal(search.value, 'Івано', 'the typed query is in place');

  app.controller.setData('action_type', 'rent');
  await flush();
  assert.equal(search.value, 'Івано', 'an unrelated controller change must not wipe the typed query');
  assert.equal(clearBtn.hidden, false, 'the clear button follows the surviving text');
});