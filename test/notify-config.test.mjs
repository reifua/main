import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadYaml } from '../_form-engine/tools/yaml.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

import { FormRender } from '../src/assets/js/form-engine/render.js';

// The page glue injects the endpoint into the config; the YAML itself stays
// free of it so the same file runs on other hosts.
const config = {
  ...loadYaml(join(ROOT, 'src', '_data', 'notify.yml')),
  submit: { action: 'https://notify-worker.test/hook', method: 'POST' },
};

const html = FormRender.render(config);

const attrOf = (tag, name) => {
  const m = html.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`));
  assert.ok(m, `missing ${name} on <${tag}>`);
  return m[1];
};

const patternOf = (id) => {
  const m = html.match(new RegExp(`<input[^>]*id="field_${id}"[^>]*\\bpattern="([^"]*)"`));
  assert.ok(m, `missing pattern on input#field_${id}`);
  return m[1];
};

const ALPINE = /\b(x-[a-z]+|@[a-z]+(\.[a-z0-9]+)*|:[a-z-]+)=/;

test('notify config is version 1 and matches schema', () => {
  assert.equal(config.version, 1);
  assert.equal(config.id, 'notify');
});

test('the form carries the old id, method, novalidate and data-form', () => {
  assert.match(html, /^<form id="notify-form" method="POST"/);
  assert.match(html, /action="https:\/\/notify-worker\.test\/hook"/);
  assert.match(html, /novalidate autocomplete="off" data-form="notify">/);
  assert.ok(!ALPINE.test(html), `framework attribute leaked: ${html.match(ALPINE)?.[0]}`);
});

test('hidden fields match the old names and stay bare', () => {
  for (const name of ['timestamp', 'uid', 'property_url', 'property_email', 'property_title']) {
    const re = new RegExp(`<input type="hidden" id="field_${name}" name="${name}"[^>]*>`);
    assert.match(html, re, `hidden ${name}`);
  }
  assert.ok(!html.includes('data-field-col="timestamp"'));
});

test('the honeypot block is carried over verbatim', () => {
  assert.match(html, /<div class="sr-only" aria-hidden="true" style="position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden;">/);
  assert.match(html, /<input type="text" id="notify-honeypot" name="honeypot" tabindex="-1" autocomplete="off" value="" spellcheck="false">/);
});

test('reason is a required select with the old options and copy', () => {
  assert.match(html, /<select class="form-control" id="field_reason" name="reason"[^>]*required/);
  assert.match(html, /<option value="">Оберіть причину<\/option>/);
  for (const [value, label] of [
    ['not_actual', 'Оголошення вже не актуальне (продано/здано)'],
    ['moved_to_archive', 'Помилково переміщено в архів'],
    ['wrong_price', 'Ціна вказана неправильно'],
    ['wrong_info', 'Інформація в описі неточна'],
    ['error', 'Помилка в оголошенні (адреса, контакти тощо)'],
    ['duplicate', 'Це дублікат іншого оголошення'],
    ['other', 'Інше (напишіть нижче)'],
  ]) {
    assert.match(html, new RegExp(`<option value="${value}">${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/option>`));
  }
  assert.match(html, /class="invalid-feedback">Оберіть причину<\/div>/);
  assert.match(html, /class="valid-feedback">Причину обрано<\/div>/);
});

test('details keeps maxlength, rows and the counter inside the helper', () => {
  assert.match(html, /<textarea class="form-control" id="field_details" name="details"[^>]*maxlength="256"/);
  assert.match(html, /rows="4"/);
  assert.match(html, /placeholder="Опишіть, що саме не так з оголошенням\.\.\."/);
  assert.match(html, /<span id="notify-counter" data-countdown="details">256<\/span> символів залишилось/);
  assert.match(html, /class="invalid-feedback">Тільки українська кирилиця, цифри, пробіли та розділові знаки<\/div>/);
});

test('contact fields keep the old patterns and limits', () => {
  assert.match(html, /<input type="text" class="form-control" id="field_contact_name" name="contact_name"[^>]*minlength="2"/);
  assert.match(html, /maxlength="50"/);
  assert.equal(patternOf('contact_name'), '^[а-яА-ЯіїєґІЇЄҐ0-9\\s\\-\\.@_]+$');

  assert.match(html, /<input type="tel" class="form-control" id="field_contact_phone" name="contact_phone"[^>]*minlength="5"/);
  assert.match(html, /maxlength="20"/);
  assert.equal(patternOf('contact_phone'), '^[\\+\\d\\s\\-\\(\\)]+$');

  assert.match(html, /<input type="email" class="form-control" id="field_contact_email" name="contact_email"[^>]*minlength="3"/);
  assert.match(html, /maxlength="254"/);
  assert.equal(patternOf('contact_email'), '^[a-zA-Z0-9@\\.\\-_]+$');

  for (const name of ['contact_name', 'contact_phone', 'contact_email']) {
    assert.match(html, new RegExp(`<div class="col-md-4" data-field-col="${name}">`), `${name} keeps its md-4 column`);
  }
});

test('feedback copy matches the old invalid/valid texts', () => {
  assert.match(html, /class="invalid-feedback">Тільки українська кирилиця, цифри, пробіли та розділові знаки<\/div>/);
  assert.match(html, /class="invalid-feedback">Тільки цифри, \+, -, пробіли та дужки<\/div>/);
  assert.match(html, /class="invalid-feedback">Введіть коректну електронну пошту<\/div>/);
  assert.equal((html.match(/class="valid-feedback">Текст введено правильно<\/div>/g) || []).length, 4);
});

test('the bespoke status blocks keep their ids', () => {
  assert.match(html, /<div id="notify-error" class="alert alert-danger d-none" role="alert">/);
  assert.match(html, /<div id="notify-success" class="d-none">/);
  assert.match(html, /<div id="turnstile-widget" class="mb-3"><\/div>/);
  assert.match(html, /id="notify-local-notice"/);
  assert.match(html, /id="notify-captcha-retry-btn" class="btn btn-link btn-sm">Спробувати ще раз<\/button>/);
  assert.match(html, /<button type="submit" id="notify-submit" class="btn btn-primary">Надіслати<\/button>/);
});

test('details gates on the old JS ukrainian pattern, with no html attribute', () => {
  // The textarea partial never emitted a pattern attribute (the check was JS
  // only); the renderer keeps that parity, and the config carries the rule so
  // the controller enforces exactly the same characters at submit time.
  assert.ok(!/textarea[^>]*\bpattern=/.test(html), 'no pattern attribute on textarea');
  const details = config.steps[0].rows[0].fields.find((f) => f.name === 'details');
  assert.equal(details.pattern, '^[а-яА-ЯіїєґІЇЄҐ0-9\\s\\-–—,\\.!?\\(\\)«»@_#\\+:;\'"]*$');
});