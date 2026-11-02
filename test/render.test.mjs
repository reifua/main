import test from 'node:test';
import assert from 'node:assert/strict';

import { FormRender } from '../src/assets/js/form-engine/render.js';

const form = (fields, { settings = {}, step, data, theme } = {}) =>
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

test('render needs a known theme and a config', () => {
  assert.throws(() => form([], { theme: 'nope' }), /unknown theme "nope"/);
  assert.throws(() => FormRender.render(null), /needs a parsed config object/);
  assert.ok(FormRender.themes.includes('bootstrap4'));
});

test('the form wrapper carries the submit contract', () => {
  const html = FormRender.render({
    version: 1,
    id: 'notify',
    submit: { action: 'https://example.test/hook', method: 'POST' },
    steps: [{ id: 's', rows: [{ fields: [] }] }],
  });

  assert.match(html, /^<form id="notify-form" method="POST"/);
  assert.match(html, /action="https:\/\/example\.test\/hook"/);
  assert.match(html, /novalidate autocomplete="off" data-form="notify">/);
});

test('a text field renders label, control, helper and feedback', () => {
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

  assert.match(html, /<label for="field_reason">Причина<\/label>/);
  assert.match(html, /<input type="text" class="form-control" id="field_reason" name="reason" data-field="reason"/);
  assert.match(html, /\brequired\b/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /aria-describedby="helper_reason"/);
  assert.match(html, /<small id="helper_reason" class="form-text text-muted">help<\/small>/);
  assert.match(html, /<div class="valid-feedback">/);
  assert.match(html, /<div class="invalid-feedback"><span data-error="reason"><\/span><\/div>/);
  assert.match(html, /data-required-marker="reason"[^>]*>\*</);
});

test('no Alpine reaches the output', () => {
  // The Eleventy site this has to run on has no Alpine, so the markup must be
  // usable on its own: hooks only, no framework attributes.
  const html = form([
    { name: 'a', type: 'text', label: 'A', required: true, helper: 'h' },
    { name: 'b', type: 'select', label: 'B', options: [{ value: 'x', label: 'X' }] },
    { name: 'c', type: 'checkbox_group', label: 'C', options: [{ value: 'x', label: 'X' }] },
    { name: 'd', type: 'heading', label: 'D' },
  ]);

  assert.ok(!ALPINE.test(html), `framework attribute leaked: ${html.match(ALPINE)?.[0]}`);
  assert.match(html, /data-field="a"/, 'the controller gets hooks instead');
  assert.match(html, /data-field-col="a"/);
});

test('select renders its placeholder and options', () => {
  const html = form([
    {
      name: 'reason',
      type: 'select',
      required: true,
      placeholder: 'Оберіть...',
      options: [{ value: 'a', label: 'Alpha' }, { value: 'b' }],
    },
  ]);

  assert.match(html, /<select class="form-control" id="field_reason" name="reason" data-field="reason" required>/);
  assert.match(html, /<option value="">Оберіть\.\.\.<\/option>/);
  assert.match(html, /<option value="a">Alpha<\/option>/);
  assert.match(html, /<option value="b">b<\/option>/, 'a bare value falls back to itself');
});

test('textarea keeps the four row default and the maxlength', () => {
  const html = form([{ name: 'details', type: 'textarea', maxlength: 256, label: 'Details' }]);

  assert.match(html, /<textarea class="form-control" id="field_details" name="details" data-field="details" maxlength="256" rows="4"/);
  assert.equal(html.match(/\brows="/g).length, 1, 'rows must not be emitted twice');
});

test('config copy is trusted, attribute values are escaped', () => {
  const html = form([
    { name: 'a', type: 'text', label: 'Say <b>hi</b>', helper: '<i>help</i>' },
    { name: 'b', type: 'text', placeholder: 'a"b', label: { text: '**bold**', markdown: true } },
  ]);

  assert.match(html, /label for="field_a">Say <b>hi<\/b><\/label>/, 'Liquid emits labels raw');
  assert.match(html, /<i>help<\/i>/, 'so do helpers');
  assert.match(html, /placeholder="a&quot;b"/, 'attribute values are escaped');
  assert.match(html, /<strong>bold<\/strong>/);
});

test('conditional labels resolve against the supplied data', () => {
  const field = {
    name: 'rooms',
    type: 'number',
    label: {
      text: 'Кімнати',
      depends: [{ field: 'property_type', values: ['commercial'], text: 'Приміщення' }],
    },
  };

  assert.match(form([field]), /label for="field_rooms">Кімнати</);
  assert.match(
    form([field], { data: { property_type: 'commercial' } }),
    /label for="field_rooms">Приміщення</,
    'the same config renders different copy for a different state',
  );
});

test('an explicit col wins, an auto row divides the width', () => {
  const explicit = form([{ name: 'a', type: 'text', col: 'col-md-4' }]);
  assert.match(explicit, /<div class="col-md-4" data-field-col="a">/);

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
  });

  assert.match(auto, /<div class="col-4" data-field-col="a">/);
  assert.match(auto, /<div class="col-4" data-field-col="b">/);
});

test('a hidden dependent field is in the document but not shown', () => {
  const html = form([
    { name: 'a', type: 'text', depends: [{ field: 'x', values: ['on'] }] },
  ]);

  assert.match(html, /data-depends="\[{&quot;field&quot;:&quot;x&quot;/);
  assert.ok(html.includes(' hidden'), 'a field whose condition does not hold starts hidden');
});

test('a dependent field whose condition holds paints open', () => {
  const html = form([
    { name: 'a', type: 'text', depends: [{ field: 'x', values: ['on'] }] },
  ], { data: { x: 'on' } });

  const wrapper = /<div[^>]*data-depends="[^"]*"[^>]*>/.exec(html);
  assert.ok(wrapper, 'the data-depends wrapper is rendered');
  assert.ok(!/\bhidden\b/.test(wrapper[0]), 'a held condition starts visible');
});

test('rows nest into cols the way the templates do', () => {
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
  });

  assert.match(html, /<div class="row"><div class="col-md-6"><div class="row"><div class="col-12"/);
  assert.match(html, /data-field-col="b"/, 'the second column is reached too');
});

test('only the active step is shown', () => {
  const cfg = {
    version: 1,
    id: 'demo',
    steps: [
      { id: 's1', rows: [{ fields: [{ name: 'a', type: 'text' }] }] },
      { id: 's2', rows: [{ fields: [{ name: 'b', type: 'text' }] }] },
    ],
  };

  const first = FormRender.render(cfg);
  assert.match(first, /<div data-step="1">/);
  assert.match(first, /<div data-step="2" hidden>/, 'step one is active by default');

  const second = FormRender.render(cfg, { step: 1 });
  assert.match(second, /<div data-step="1" hidden>/);
  assert.match(second, /<div data-step="2">/);
});

test('content types render outside the field chrome', () => {
  const html = form([
    { name: 'h', type: 'heading', label: 'Заголовок', level: 3, col: 'col-12' },
    { name: 'p', type: 'paragraph', label: '*Абзац*', markdown: true },
    { name: 'a', type: 'alert', label: 'Увага', variant: 'warning', dismissible: true },
    { name: 'b', type: 'badge', label: 'Нове', variant: 'success', pill: true },
    { name: 'r', type: 'raw', html: '<span>ok</span>' },
  ]);

  assert.match(html, /<h3>Заголовок<\/h3>/);
  assert.match(html, /<p><em>Абзац<\/em><\/p>/, 'markdown applies to content labels');
  assert.match(html, /<div class="alert alert-warning" role="alert">Увага<button type="button" class="close"/);
  assert.match(html, /<span class="badge badge-success badge-pill">Нове<\/span>/);
  assert.match(html, /<span>ok<\/span>/);
  assert.ok(!html.includes('data-field-col="h"'), 'content has no field chrome');
});

test('an unknown type renders nothing rather than half a field', () => {
  assert.equal(form([{ name: 'x', type: 'teleport' }]).includes('field_x'), false);
});

test('prepend and append become an input group', () => {
  const html = form([
    {
      name: 'surface',
      type: 'number',
      prepend: { text: 'м²' },
      append: { text: '≈', class: 'bg-light' },
    },
  ]);

  assert.match(html, /<div class="input-group"><div class="input-group-prepend"><span class="input-group-text" id="inputGroupSurfacePrepend">м²<\/span>/);
  assert.match(html, /input-group-text bg-light" id="inputGroupSurfaceAppend">≈</);
  assert.match(html, /<div class="input-group-append">/);
});

test('a required marker is hidden until its condition holds', () => {
  const field = { name: 'a', type: 'text', required: [{ field: 'x', values: ['on'] }] };

  assert.match(form([field]), /<span hidden data-required-marker="a">/);
  assert.match(
    form([field], { data: { x: 'on' } }),
    /<span data-required-marker="a">/,
    'once the condition holds the marker shows',
  );
});

test('a hidden field renders inside the form with no chrome', () => {
  const html = form([
    { name: 'a', type: 'text', label: 'Visible' },
    { name: 'uid', type: 'hidden' },
    { name: 'property_url', type: 'hidden', value: 'https://x.test/p' },
    { name: 'q', type: 'hidden', value: 'a"b' },
  ]);

  assert.match(html, /<input type="hidden" id="field_uid" name="uid" data-field="uid" autocomplete="off" value="">/);
  assert.match(html, /value="https:\/\/x\.test\/p"/);
  assert.match(html, /value="a&quot;b"/, 'hidden values are escaped too');
  assert.ok(!html.includes('data-field-col="uid"'), 'no column wrapper for hidden');
  assert.equal((html.match(/<div class="form-group" data-field-group>/g) || []).length, 1, 'only the visible field carries a form-group');
});

test('an autocomplete field mirrors the two-control partial', () => {
  const html = form([
    {
      name: 'district',
      type: 'autocomplete',
      required: true,
      placeholder: 'Введіть назву мікрорайону...',
      helper: 'Оберіть у списку',
    },
  ]);

  // Only the placeholder option is static; the list is built by the controller,
  // exactly as the Liquid partial leaves it to Alpine.
  assert.match(html, /<select class="form-control" id="field_district" aria-describedby="helper_district" data-field="district">/);
  assert.match(html, /<option value="">Введіть назву мікрорайону\.\.\.<\/option>/);
  assert.match(html, /<input type="text" class="form-control autocomplete-search" autocomplete="off" id="field_district_search"/);
  assert.match(html, /data-autocomplete-search="district"/);
  assert.match(html, /class="autocomplete-search-icon"/);
  assert.match(html, /data-autocomplete-dropdown="district"/);
  assert.match(html, /<button type="button" class="btn-clear autocomplete-clear" title="Очистити поле" data-autocomplete-clear="district" hidden>&times;<\/button>/);
  assert.ok(!html.includes('name="district"'), 'the raw select/search carry no name, like the partial');
  assert.match(html, /data-required-marker="district"/);
});

test('the file field keeps the custom-file contract and interpolates the info line', () => {
  const html = form([
    {
      name: 'images',
      type: 'file',
      required: true,
      accept: 'image/*',
      multiple: true,
      helper: 'Додайте фото',
      file: {
        minFiles: 1,
        maxFiles: 4,
        maxSize: '150KB',
        infoLine: 'від {min} до {max} файлів, до {limit}',
      },
    },
  ]);

  assert.match(html, /<input type="file" class="custom-file-input" id="field_images" name="images" data-field="images" required aria-describedby="helper_images" accept="image\/\*" multiple>/);
  assert.match(html, /<label class="custom-file-label" for="field_images"><\/label>/);
  assert.match(html, /<small class="form-text text-muted">від 1 до 4 файлів, до 150KB<\/small>/);
  assert.match(html, /title="Очистити файли"/);
  assert.match(html, /<div class="valid-feedback">/);
  assert.match(html, /class="file-previews mt-2"/);
  assert.doesNotMatch(html, /class="file-info"/);
  assert.match(html, /<div class="invalid-feedback"><span data-error="images">/);
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

  assert.match(html, /<div class="invalid-feedback">Будь ласка, додайте хоча б 1 фотознімок<\/div>/);
  assert.match(html, /<div class="valid-feedback">Виглядає наче все добре!<\/div>/);
});

test('the captcha widget renders the turnstile box, alerts and helper', () => {
  const html = form([
    {
      name: 'captcha',
      type: 'widgets',
      widget: 'captcha',
      element_id: 'captcha',
      class: 'col-12',
      required: true,
      theme: 'light',
      size: 'normal',
      appearance: 'always',
      label: 'Підтвердьте, що ви не робот',
      helper: 'Натисніть «Спробувати ще раз».',
    },
  ]);

  assert.match(html, /<div class="col-12" data-widget="captcha" data-widget-name="captcha">/);
  assert.match(html, /<div class="mb-2" id="label_captcha">Підтвердьте, що ви не робот/);
  assert.match(html, /<div id="captcha-widget" class="captcha-widget-box" tabindex="-1" data-captcha-field="captcha" data-captcha-theme="light" data-captcha-size="normal" data-captcha-appearance="always"><\/div>/);
  assert.match(html, /class="alert alert-warning mt-2 mb-0 py-2"/);
  assert.match(html, /data-captcha-retry="captcha">Спробувати ще раз/);
  assert.match(html, /<small class="form-text text-muted mt-1 d-block">/);
  assert.match(html, /<span data-error="captcha">/);
});

test('the map widget renders the picker shell with the partial CSS', () => {
  const html = form([
    { name: 'map_widget', type: 'widgets', widget: 'map', label: { text: 'Мапа' } },
  ]);

  assert.match(html, /\.map-picker-responsive \{ height: 280px; \}/);
  assert.match(html, /<div class="mb-2" id="label_map_widget">Мапа<\/div>/);
  assert.match(html, /<div class="map-marker-info" hidden>/);
  assert.match(html, /<div id="map-picker" class="border rounded map-picker-responsive" role="application" aria-labelledby="label_map_widget"><\/div>/);
  assert.match(html, /<span data-map-coords="map_widget"/);
});

test('the price_info widget is a dependency-hidden card', () => {
  const html = form([
    {
      name: 'price_info_widget',
      type: 'widgets',
      widget: 'price_info',
      depends: [{ field: 'action_type', value: '>0' }],
    },
  ]);

  assert.match(html, /data-widget="price_info" data-widget-name="price_info_widget"/);
  assert.match(html, /\bhidden\b/, 'a widget with depends starts hidden');
  assert.match(html, /<div class="card bg-light mb-3">/);
  assert.match(html, /<small class="text-muted d-block" data-price-info="price_info_widget"><\/small>/);
});

test('the location widget renders each subfield and its summary', () => {
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

  assert.match(html, /<h6 class="card-title">Пошук населеного пункту<\/h6>/);
  assert.match(html, /<small class="form-text text-muted mb-2">допоможе знайти<\/small>/);
  assert.match(html, /<select class="form-control" id="field_location_widget_oblast" name="location_widget\.oblast" aria-describedby="helper_location_widget_oblast" data-location-field="oblast"/);
  assert.match(html, /<option value="">Введіть назву області\.\.\.<\/option>/);
  assert.match(html, /<input type="text" class="form-control location-search" autocomplete="off" id="field_location_widget_oblast_search"/);
  assert.match(html, /class="location-search-icon"/);
  assert.match(html, /data-location-search="oblast"/);
  assert.match(html, /<small id="helper_location_widget_oblast" class="form-text text-muted">Оберіть у списку<\/small>/);
  assert.match(html, /<div class="valid-feedback">Виглядає добре!<\/div>/);
  assert.match(html, /<span data-error="location_widget\.oblast">/);
  assert.match(html, /data-location-summary="settlement"/);
});

test('the new field types emit no Alpine', () => {
  const html = form([
    { name: 'continent', type: 'autocomplete', placeholder: 'Введіть...' },
    { name: 'photo', type: 'file' },
    { name: 'cap', type: 'widgets', widget: 'captcha', element_id: 'cap' },
    { name: 'm', type: 'widgets', widget: 'map' },
    { name: 'pi', type: 'widgets', widget: 'price_info' },
    {
      name: 'loc',
      type: 'widgets',
      widget: 'location',
      fields: [{ name: 'region', label: 'Регіон' }],
    },
  ]);

  assert.ok(!ALPINE.test(html), `framework attribute leaked: ${html.match(ALPINE)?.[0]}`);
  assert.match(html, /data-field="continent"/);
  assert.match(html, /data-captcha-field="cap"/);
  assert.match(html, /data-location-field="region"/);
});
