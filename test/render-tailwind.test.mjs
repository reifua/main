import test from 'node:test';
import assert from 'node:assert/strict';

import { FormRender } from '../src/assets/js/form-engine/render.js';

// The Tailwind theme is the functional sibling of bootstrap4: same config in,
// same ids and data-* hooks out, different presentation classes. These tests
// assert the contract (what the controller/binder/page glue depend on) for
// theme: 'tailwind', and that no Bootstrap utility survived into the output.

const form = (fields, { settings = {}, step, data, theme = 'tailwind' } = {}) =>
  FormRender.render(
    {
      version: 1,
      id: 'demo',
      settings,
      steps: [{ id: 's1', title: 'One', rows: [{ class: 'row', fields }] }],
    },
    { step, data, theme },
  );

const ALPINE = /\b(x-[a-z]+|@[a-z]+(\.[a-z0-9]+)*|:[a-z-]+)=/;

// Bootstrap presentation tokens a Tailwind render must never emit. The hook
// classes the page scripts select are NOT listed here - they are intentional
// and asserted positive below.
const BOOTSTRAP_TOKENS = [
  'form-control', 'form-group', 'custom-control', 'custom-radio', 'custom-checkbox',
  'input-group-text', 'input-group-prepend', 'input-group-append', 'input-group',
  'btn btn-', 'btn-primary', 'btn-outline-', 'alert-info', 'badge-',
  'text-danger', 'text-muted', 'form-text',
  'spinner-border',
  'card-title', 'img-fluid', 'figure-caption', ' row ',
  'bg-warning', 'bg-light', 'text-warning', 'text-success', 'text-info',
];

// The hook tokens the glue and page CSS select by class name; they must be
// present next to the Tailwind utilities. `valid-feedback`/`invalid-feedback`
// are the names binder.js toggles, and `position-relative` is the nearest
// ancestor page-form.js walks to (`closest('.position-relative')`), so both
// survive on the Tailwind theme as neutral JS hooks - the styling comes from
// the theme's own skin, themes/tailwind.css, not from Bootstrap.
const HOOK_TOKENS = [
  'custom-file', 'custom-file-label', 'file-previews',
  'dropdown-menu', 'dropdown-item', 'valid-feedback', 'invalid-feedback',
  'position-relative',
];

test('the tailwind theme is registered and unknown themes still fail', () => {
  assert.ok(FormRender.themes.includes('tailwind'));
  assert.throws(() => form([], { theme: 'nope' }), /unknown theme "nope"/);
});

test('the form wrapper carries the same submit contract', () => {
  const html = FormRender.render({
    version: 1,
    id: 'notify',
    submit: { action: 'https://example.test/hook', method: 'POST' },
    steps: [{ id: 's', rows: [{ fields: [] }] }],
  }, { theme: 'tailwind' });

  assert.match(html, /^<form id="notify-form" method="POST"/);
  assert.match(html, /action="https:\/\/example\.test\/hook"/);
  assert.match(html, /novalidate autocomplete="off" data-form="notify">/);
});

test('a text field keeps the control contract, restyled', () => {
  const html = form([
    {
      name: 'reason',
      type: 'text',
      required: true,
      label: 'Причина',
      helper: 'help',
      placeholder: 'pick',
      autocomplete: 'off',
    },
  ]);

  assert.match(html, /<label for="field_reason" class="mb-1 inline-block text-base font-medium text-gray-700">Причина<\/label>/);
  assert.match(html, /<input type="text" class="block w-full rounded border border-gray-500 bg-white px-3 py-1\.5 text-base text-gray-700[^"]*" id="field_reason" name="reason" data-field="reason"/);
  assert.match(html, /\brequired\b/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /aria-describedby="helper_reason"/);
  assert.match(html, /<small id="helper_reason" class="mt-1 block text-xs text-gray-600">help<\/small>/);
  assert.match(html, /class="valid-feedback mt-1 text-xs text-green-600" hidden>✓<\/div>/);
  assert.match(html, /class="invalid-feedback mt-1 text-xs text-red-600" hidden><span data-error="reason"><\/span><\/div>/);
  assert.match(html, /data-required-marker="reason"[^>]*>\*</);
  assert.match(html, /data-clear="reason" hidden>/);
  assert.ok(!/form-control/.test(html));
});

test('no Bootstrap utility or Alpine attribute reaches a tailwind render', () => {
  const html = form([
    { name: 'a', type: 'text', label: 'A', required: true, helper: 'h' },
    { name: 'b', type: 'select', label: 'B', options: [{ value: 'x', label: 'X' }] },
    { name: 'c', type: 'checkbox_group', label: 'C', options: [{ value: 'x', label: 'X' }] },
    { name: 'd', type: 'radio', label: 'D' },
    { name: 'e', type: 'file', label: 'E' },
    { name: 'f', type: 'heading', label: 'F' },
    { name: 'g', type: 'alert', label: 'G', variant: 'warning', dismissible: true },
    { name: 'h', type: 'badge', label: 'H', variant: 'success', pill: true },
    {
      name: 'loc_widget',
      type: 'widgets',
      widget: 'location',
      label: 'Локація',
      fields: [{ name: 'settlement', label: 'НП' }],
    },
  ]);

  assert.ok(!ALPINE.test(html), `framework attribute leaked: ${html.match(ALPINE)?.[0]}`);
  const token = BOOTSTRAP_TOKENS.find((t) => html.includes(t));
  assert.equal(token, undefined, `bootstrap class leaked in tailwind output: ${token || ''}`);

  // the hook tokens survive intentionally
  for (const hook of HOOK_TOKENS) assert.ok(html.includes(hook), `hook class kept: ${hook}`);

  assert.match(html, /data-field="a"/);
  assert.match(html, /data-field-col="a"/);
  assert.match(html, /data-widget="location" data-widget-name="loc_widget"/);
});

test('grid classes translate to tailwind widths, other tokens pass through', () => {
  const explicit = form([{ name: 'a', type: 'text', col: 'col-md-4' }]);
  assert.match(explicit, /<div class="md:col-span-4" data-field-col="a">/);

  const two = form([{ name: 'a', type: 'text', col: 'col-12 col-md-6' }]);
  assert.match(two, /<div class="col-span-12 md:col-span-6" data-field-col="a">/);

  const offset = form([{ name: 'b', type: 'text', col: 'col-12 offset-md-3' }]);
  assert.match(offset, /<div class="md:ml-1\/4 col-span-12" data-field-col="b">/);

  const auto = FormRender.render({
    version: 1,
    id: 'demo',
    steps: [{
      id: 's',
      rows: [{ class: 'row', auto: true, fields: [
        { name: 'a', type: 'text' },
        { name: 'b', type: 'text' },
        { name: 'c', type: 'text' },
      ] }],
    }],
  }, { theme: 'tailwind' });

  assert.match(auto, /<div class="col-span-4" data-field-col="a">/);
  assert.match(auto, /<div class="col-span-4" data-field-col="b">/);
  assert.match(auto, /data-field-col="c"/);
});

test('rows become flex wrap and nested columns keep their widths', () => {
  const html = FormRender.render({
    version: 1,
    id: 'demo',
    steps: [{
      id: 's',
      rows: [{
        class: 'row',
        cols: [
          { class: 'col-md-6', rows: [{ class: 'row', fields: [{ name: 'a', type: 'text' }] }] },
          { class: 'col-md-6', rows: [{ class: 'row', fields: [{ name: 'b', type: 'text' }] }] },
        ],
      }],
    }],
  }, { theme: 'tailwind' });

  assert.match(html, /<div class="grid grid-cols-12 gap-4"><div class="md:col-span-6"><div class="grid grid-cols-12 gap-4"/);
  assert.match(html, /data-field-col="b"/);
});

test('select, textarea and hidden keep their contracts', () => {
  const selectHtml = form([
    { name: 'reason', type: 'select', required: true, placeholder: 'Оберіть...', options: [{ value: 'a', label: 'Alpha' }, { value: 'b' }] },
  ]);
  assert.match(selectHtml, /<select class="block w-full rounded border[^"]*" id="field_reason" name="reason" data-field="reason" required>/);
  assert.match(selectHtml, /<option value="">Оберіть\.\.\.<\/option>/);
  assert.match(selectHtml, /<option value="a">Alpha<\/option>/);

  const ta = form([{ name: 'details', type: 'textarea', maxlength: 256, label: 'Details' }]);
  assert.match(ta, /<textarea class="block w-full rounded border[^"]* resize-y" id="field_details" name="details" data-field="details" maxlength="256" rows="4"/);
  assert.equal(ta.match(/\brows="/g).length, 1);

  const hiddenHtml = form([
    { name: 'a', type: 'text' },
    { name: 'uid', type: 'hidden' },
  ]);
  assert.match(hiddenHtml, /<input type="hidden" id="field_uid" name="uid" data-field="uid" autocomplete="off" value="">/);
  assert.ok(!hiddenHtml.includes('data-field-col="uid"'));
});

test('input groups render with tailwind addons', () => {
  const html = form([
    {
      name: 'surface',
      type: 'number',
      prepend: { text: 'м²' },
      append: { text: '≈' },
    },
  ]);

  assert.match(html, /<div class="flex w-full items-stretch">/);
  assert.match(html, /id="inputGroupSurfacePrepend">м²<\/span>/);
  assert.match(html, /class="inline-flex items-center border border-gray-500 bg-gray-50 px-3 text-base text-gray-600 rounded-l border-r-0"[^>]*id="inputGroupSurfacePrepend"/);
  assert.match(html, /class="inline-flex items-center border border-gray-500 bg-gray-50 px-3 text-base text-gray-600 rounded-r border-l-0"[^>]*id="inputGroupSurfaceAppend"/);
  assert.match(html, /class="block w-full rounded border[^"]* rounded-r rounded-l-none" id="field_surface"/);
  assert.ok(!html.includes('input-group'));
});

test('an autocomplete field mirrors the two-control partial, tailwind chrome', () => {
  const html = form([
    { name: 'district', type: 'autocomplete', required: true, placeholder: 'Введіть назву мікрорайону...', helper: 'Оберіть у списку' },
  ]);

  assert.match(html, /<select class="block w-full rounded border[^"]*" id="field_district" aria-describedby="helper_district" data-field="district">/);
  assert.match(html, /<option value="">Введіть назву мікрорайону\.\.\.<\/option>/);
  assert.match(html, /id="field_district_search"/);
  assert.match(html, /data-autocomplete-search="district"/);
  assert.match(html, /autocomplete-search-icon/);
  assert.match(html, /data-autocomplete-dropdown="district"/);
  assert.match(html, /data-autocomplete-noresults="district"/);
  assert.match(html, /data-autocomplete-clear="district"/);
  assert.match(html, /dropdown-menu absolute z-10 mt-1 w-full rounded-md/);
  assert.ok(!html.includes('name="district"'));
  assert.match(html, /data-required-marker="district"/);
});

test('the file field keeps the custom-file hooks and trims the info line', () => {
  const html = form([
    {
      name: 'images',
      type: 'file',
      required: true,
      accept: 'image/*',
      multiple: true,
      helper: 'Додайте фото',
      file: { minFiles: 1, maxFiles: 4, maxSize: '150KB', infoLine: 'від {min} до {max} файлів, до {limit}' },
    },
  ]);

  assert.match(html, /<input type="file" class="form-file block w-full cursor-pointer text-sm[^"]*" id="field_images" name="images" data-field="images" required aria-describedby="helper_images" accept="image\/\*" multiple>/);
  assert.match(html, /class="custom-file-label mt-1 block text-xs text-gray-600" for="field_images"><\/label>/);
  assert.match(html, /<span class="custom-file-actions">\s*<button type="button" class="btn-clear" title="Очистити файли" data-clear="images" hidden>&times;<\/button>\s*<span class="custom-file-icon" aria-hidden="true"><\/span>/);
  assert.match(html, /<small class="mt-1 block text-xs text-gray-600">від 1 до 4 файлів, до 150KB<\/small>/);
  assert.match(html, /title="Очистити файли"/);
  assert.match(html, /class="file-previews mt-2"/);
  assert.doesNotMatch(html, /class="file-info"/);
  assert.match(html, /<span data-error="images">/);
});

test('the file field spells its limits into the copy of the field', () => {
  const html = form([
    {
      name: 'images',
      type: 'file',
      required: true,
      multiple: true,
      file: { minFiles: 1, maxFiles: 4, maxSize: '150KB' },
      feedback: {
        valid: 'Виглядає наче все добре!',
        invalid: 'Будь ласка, додайте хоча б {min} фотознімок',
      },
    },
  ]);

  assert.match(html, /class="invalid-feedback[^"]*" hidden>Будь ласка, додайте хоча б 1 фотознімок<\/div>/);
  assert.match(html, /class="valid-feedback[^"]*" hidden>Виглядає наче все добре!<\/div>/);
});

test('the captcha widget keeps the turnstile box and retry, tailwind alerts', () => {
  const html = form([
    {
      name: 'captcha',
      type: 'widgets',
      widget: 'captcha',
      element_id: 'captcha',
      required: true,
      theme: 'light',
      size: 'normal',
      appearance: 'always',
      label: 'Підтвердьте, що ви не робот',
      helper: 'Натисніть «Спробувати ще раз».',
    },
  ]);

  assert.match(html, /<div id="captcha-widget" class="captcha-widget-box" tabindex="-1" data-captcha-field="captcha" data-captcha-theme="light" data-captcha-size="normal" data-captcha-appearance="always"><\/div>/);
  assert.match(html, /class="alert alert-info mt-2 mb-0 rounded-md border border-blue-200 bg-blue-50 px-5 py-2 text-base text-blue-800" hidden>/);
  assert.match(html, /class="alert alert-warning mt-2 mb-0 rounded-md border border-amber-300 bg-amber-50 px-5 py-2 text-base text-amber-800"/);
  assert.match(html, /data-captcha-retry="captcha">Спробувати ще раз/);
  assert.match(html, /<span data-error="captcha">/);
});

test('the map and price_info widgets keep their shells tailwind-styled', () => {
  const mapHtml = form([
    { name: 'map_widget', type: 'widgets', widget: 'map', label: { text: 'Мапа' } },
  ]);

  assert.match(mapHtml, /\.map-picker-responsive \{ height: 280px; \}/);
  assert.match(mapHtml, /<div id="map-picker" class="map-picker-responsive relative w-full rounded-md border border-gray-300"/);
  assert.match(mapHtml, /<span data-map-coords="map_widget"/);
  assert.match(mapHtml, /class="map-marker-info" hidden/);

  const priceHtml = form([
    { name: 'price_info_widget', type: 'widgets', widget: 'price_info', depends: [{ field: 'action_type', value: '>0' }] },
  ]);

  assert.match(priceHtml, /data-widget="price_info" data-widget-name="price_info_widget"/);
  assert.match(priceHtml, /\bhidden\b/);
  assert.match(priceHtml, /class="mb-3 rounded-md bg-gray-50"/);
  assert.match(priceHtml, /data-price-info="price_info_widget"/);
});

test('the location widget renders every subfield and the summary', () => {
  const html = form([
    {
      name: 'location_widget',
      type: 'widgets',
      widget: 'location',
      label: 'Пошук населеного пункту',
      helper: 'допоможе знайти',
      fields: [
        { name: 'oblast', label: 'Область', required: true, placeholder: 'Введіть назву області...', helper: 'Оберіть у списку', feedback: { valid: 'Виглядає добре!' } },
        { name: 'settlement', label: 'Населений пункт', required: true },
      ],
    },
  ]);

  assert.match(html, /<h6 class="mb-2 text-base font-semibold leading-tight text-gray-900">Пошук населеного пункту<\/h6>/);
  assert.match(html, /<select class="block w-full rounded border[^"]*" id="field_location_widget_oblast" name="location_widget\.oblast" aria-describedby="helper_location_widget_oblast" data-location-field="oblast"/);
  assert.match(html, /<option value="">Введіть назву області\.\.\.<\/option>/);
  assert.match(html, /id="field_location_widget_oblast_search"/);
  assert.match(html, /data-location-search="oblast"/);
  assert.match(html, /<small id="helper_location_widget_oblast" class="mt-1 block text-xs text-gray-600">Оберіть у списку<\/small>/);
  assert.match(html, /class="valid-feedback mt-1 text-xs text-green-600" hidden>Виглядає добре!<\/div>/);
  assert.match(html, /<span data-error="location_widget\.oblast">/);
  assert.match(html, /data-location-summary="settlement"/);
  assert.match(html, /class="mt-2"/, 'the summary panel hook the glue wraps stays');
});

test('content types render with tailwind variants, no bootstrap classes', () => {
  const html = form([
    { name: 'h', type: 'heading', label: 'Заголовок', level: 3 },
    { name: 'a', type: 'alert', label: 'Увага', variant: 'warning', dismissible: true },
    { name: 'b', type: 'badge', label: 'Нове', variant: 'success', pill: true },
    { name: 'p', type: 'paragraph', label: '*Абзац*', markdown: true },
    { name: 'i', type: 'image', src: '/x.jpg', alt: 'X', caption: 'Підпис' },
    { name: 'raw', type: 'raw', html: '<span>ok</span>' },
  ]);

  assert.match(html, /<h3 class="leading-tight text-3xl">Заголовок<\/h3>/);
  assert.match(html, /<p><em>Абзац<\/em><\/p>/);
  assert.match(html, /<div class="rounded-md border py-3 px-5 text-base border-amber-300 bg-amber-50 text-amber-900" role="alert">/);
  assert.match(html, /<span class="inline-flex items-center rounded px-1\.5 py-1 text-xs font-semibold leading-none bg-green-100 text-green-800 rounded-full">Нове<\/span>/);
  assert.match(html, /<img src="\/x\.jpg" alt="X" class="max-w-full h-auto">/);
  assert.match(html, /<figcaption class="mt-1 text-center text-sm text-gray-600">Підпис<\/figcaption>/);
  assert.match(html, /<span>ok<\/span>/);
});

test('the same config renders the same ids and hooks in both themes', () => {
  const config = {
    version: 1,
    id: 'demo',
    steps: [{
      id: 's',
      rows: [{ class: 'row', fields: [
        { name: 'a', type: 'text', label: 'A', required: true },
        { name: 'b', type: 'select', label: 'B', options: [{ value: 'x', label: 'X' }] },
        { name: 'c', type: 'checkbox', label: 'C' },
        { name: 'd', type: 'file', label: 'D' },
        { name: 'ac', type: 'autocomplete', label: 'Ac' },
        { name: 'cap', type: 'widgets', widget: 'captcha', element_id: 'cap' },
        { name: 'm', type: 'widgets', widget: 'map', label: 'M' },
        { name: 'pi', type: 'widgets', widget: 'price_info' },
        {
          name: 'loc',
          type: 'widgets',
          widget: 'location',
          label: 'Loc',
          fields: [{ name: 'settlement', label: 'НП' }],
        },
      ] }],
    }],
  };

  const ids = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const hooks = (html) => {
    const out = [];
    for (const m of html.matchAll(/data-(?:field|field-group|field-col|widget|widget-name|captcha-field|location-field|location-search|autocomplete-search|autocomplete-clear|price-info|location-summary|map-coords|required-marker|clear|group)="([^"]+)"/g)) {
      out.push(`${m[0].split('=')[0]}=${m[1]}`);
    }
    return out.sort();
  };

  const bs = FormRender.render(config, { theme: 'bootstrap4' });
  const tw = FormRender.render(config, { theme: 'tailwind' });

  assert.deepEqual([...ids(bs)].sort(), [...ids(tw)].sort(), 'every id matches');
  assert.deepEqual(hooks(bs), hooks(tw), 'every data hook matches');
});