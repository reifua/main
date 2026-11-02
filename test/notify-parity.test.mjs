import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadYaml } from '../_form-engine/tools/yaml.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

import { makeController } from '../src/assets/js/form-engine/controller.js';
import {
  NOTIFY_ERROR_TEXTS,
  CAPTCHA_REQUIRED_TEXT,
  SUBMIT_LABEL,
  SPINNER_HTML,
  notifyErrorText,
  captchaBlocked,
  counterRemaining,
} from '../src/assets/js/form-engine/data.js';
import { buildJsonPayload as buildPayload } from '../src/assets/js/form-engine/submit.js';

const config = loadYaml(join(ROOT, 'src', '_data', 'notify.yml'));

// ------------------------------------------------------------ element shim ---

function el(tag, attrs = {}) {
  return {
    tagName: tag.toUpperCase(),
    name: attrs.name,
    value: attrs.value !== undefined ? String(attrs.value) : '',
    checked: !!attrs.checked,
    _attrs: { ...attrs },
    getAttribute(name) {
      return name in this._attrs ? String(this._attrs[name]) : null;
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
  };
}

function matches(node, part) {
  const m = /^([a-z]+)?((?:\[[^\]]*\])*)$/i.exec(part.trim());
  if (!m) return false;
  const tag = (m[1] || '').toUpperCase();
  if (tag && node.tagName !== tag) return false;
  for (const token of (m[2].match(/\[[^\]]*\]/g) || [])) {
    const body = token.slice(1, -1);
    const eq = body.indexOf('=');
    const name = eq === -1 ? body : body.slice(0, eq).trim();
    const current = node.getAttribute(name);
    if (eq === -1) {
      if (current === null) return false;
    } else if (current !== body.slice(eq + 2, -1)) {
      return false;
    }
  }
  return true;
}

function formOf(nodes) {
  return {
    querySelectorAll(selector) {
      const parts = selector.split(',').map((s) => s.trim());
      const found = [];
      for (const node of nodes) {
        if (parts.some((part) => matches(node, part)) && !found.includes(node)) found.push(node);
      }
      return found;
    },
  };
}

// A rendered notify form: hidden page fields, the honeypot, the bound controls.
function notifyDom() {
  return [
    el('input', { type: 'hidden', name: 'timestamp', value: '1759700000000' }),
    el('input', { type: 'hidden', name: 'uid', value: '1789988154' }),
    el('input', { type: 'hidden', name: 'property_url', value: 'https://example.test/lot' }),
    el('input', { type: 'hidden', name: 'property_email', value: 'owner@example.test' }),
    el('input', { type: 'hidden', name: 'property_title', value: 'Квартира Львів' }),
    el('input', { type: 'text', name: 'honeypot', value: '' }),
    el('select', { name: 'reason', value: 'wrong_price' }),
    el('textarea', { name: 'details', value: 'Ціна не збігається' }),
    el('input', { type: 'text', name: 'contact_name', value: '' }),
    el('input', { type: 'tel', name: 'contact_phone', value: '' }),
    el('input', { type: 'email', name: 'contact_email', value: '' }),
    el('button', { type: 'submit', name: 'send', value: 'x' }),
  ];
}

// ------------------------------------------------------------- error map ----

test('every worker code from notify.js keeps its exact Ukrainian message', () => {
  assert.deepEqual(Object.keys(NOTIFY_ERROR_TEXTS).sort(), [
    'E_CAPTCHA',
    'E_CAPTCHA_ACTION',
    'E_CAPTCHA_HOSTNAME',
    'E_CAPTCHA_INVALID',
    'E_CAPTCHA_MALFORMED',
    'E_CAPTCHA_REQUIRED',
    'E_CAPTCHA_REUSED',
    'E_CAPTCHA_UNAVAILABLE',
    'E_DAILY_LIMIT_EXCEEDED',
    'E_INVALID_PAYLOAD',
    'E_MAIL_UNAVAILABLE',
    'E_RATE_LIMIT_EXCEEDED',
    'E_SPAM',
  ]);
  assert.equal(
    NOTIFY_ERROR_TEXTS.E_CAPTCHA_REUSED,
    'Перевірка captcha вже була використана. Натисніть «Спробувати ще раз» і надішліть заново.',
  );
  assert.equal(NOTIFY_ERROR_TEXTS.E_SPAM, 'Запит відхилено. Спробуйте ще раз.');
  assert.equal(
    NOTIFY_ERROR_TEXTS.E_RATE_LIMIT_EXCEEDED,
    'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.',
  );
});

test('an unknown code falls back to the generic markup copy', () => {
  assert.equal(notifyErrorText('E_SOMETHING_NEW'), '');
  assert.equal(notifyErrorText(undefined), '');
  assert.equal(notifyErrorText('E_CAPTCHA_REQUIRED'), CAPTCHA_REQUIRED_TEXT);
});

// ------------------------------------------------------------ captcha gate --

test('the captcha gate matches the legacy solved()/enabled() check', () => {
  const on = { enabled: () => true, solved: () => false };
  const solved = { enabled: () => true, solved: () => true };
  const off = { enabled: () => false, solved: () => false };

  assert.equal(captchaBlocked(on), true);
  assert.equal(captchaBlocked(solved), false);
  assert.equal(captchaBlocked(off), false);
  assert.equal(captchaBlocked(null), false);
  assert.equal(captchaBlocked(undefined), false);
});

// --------------------------------------------------------------- counter ----

test('the helper counter counts down from the field maxlength', () => {
  const textarea = el('textarea', { maxlength: '256' });
  assert.equal(counterRemaining(textarea, ''), 256);
  assert.equal(counterRemaining(textarea, 'аб'.repeat(100)), 56);
  assert.equal(counterRemaining(textarea, 'x'.repeat(300)), 0, 'never goes negative');
});

test('a field without maxlength skips the counter instead of guessing', () => {
  assert.equal(counterRemaining(el('input', {}), 'що завгодно'), null);
});

// -------------------------------------------------------------- payload -----

test('the payload mirrors the legacy FormData walk plus the token', () => {
  const controller = makeController(config);
  // what bindForm would hold after the user typed into the name field
  controller.setData('contact_name', 'Олена');
  // the DOM wins where they disagree: the legacy FormData walk read inputs,
  // not controller state (uid is a hidden input the glue fills from JSON)
  controller.setData('uid', 'старий_значення');

  const dom = notifyDom();
  dom.find((node) => node.name === 'contact_name').value = 'Олена';

  const payload = buildPayload(formOf(dom), controller, 'token-abc');

  assert.deepEqual(payload, {
    contact_name: 'Олена',
    timestamp: '1759700000000',
    uid: '1789988154',
    property_url: 'https://example.test/lot',
    property_email: 'owner@example.test',
    property_title: 'Квартира Львів',
    honeypot: '',
    reason: 'wrong_price',
    details: 'Ціна не збігається',
    contact_phone: '',
    contact_email: '',
    'cf-turnstile-response': 'token-abc',
  });
});

test('a missing token serialises as an empty string, like the old code', () => {
  const controller = makeController(config);
  const payload = buildPayload(formOf(notifyDom()), controller, '');
  assert.equal(payload['cf-turnstile-response'], '');
});

test('submit buttons never enter the payload', () => {
  const controller = makeController(config);
  const payload = buildPayload(formOf(notifyDom()), controller, 't');
  assert.ok(!('send' in payload), 'the button has a name and must still be dropped');
});

test('checkboxes and radio groups behave like FormData', () => {
  const controller = makeController(config);
  const box = el('input', { type: 'checkbox', name: 'agree', value: 'yes' });
  const radioA = el('input', { type: 'radio', name: 'kind', value: 'a', checked: true });
  const radioB = el('input', { type: 'radio', name: 'kind', value: 'b' });

  const off = buildPayload(formOf([box, radioA, radioB]), controller, 't');
  assert.ok(!('agree' in off), 'unchecked checkbox is absent');
  assert.equal(off.kind, 'a', 'checked radio wins');

  box.checked = true;
  radioA.checked = false;
  const on = buildPayload(formOf([box, radioA, radioB]), controller, 't');
  assert.equal(on.agree, 'yes');
  assert.ok(!('kind' in on), 'all-unchecked radio group is absent');
});

// ---------------------------------------------------------- submit copy -----

test('the spinner and label match the legacy button states', () => {
  assert.equal(SUBMIT_LABEL, 'Надіслати');
  assert.match(SPINNER_HTML, /class="spinner-border spinner-border-sm ml-2"/);
  assert.match(SPINNER_HTML, /<span class="sr-only">Надсилаю\.\.\.<\/span>/);
  assert.match(SPINNER_HTML, /^Надсилаю<span/);
});
