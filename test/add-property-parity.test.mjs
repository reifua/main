import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepFieldNames,
  findFieldInConfig,
  buildData,
  parseFileSize,
  formatFileSize,
  newFileName,
  collectPhotos,
  fileNoticeFor,
  priceUah,
  priceForeign,
  pricePerM2Uah,
  priceLabelOf,
  rentPriceFor,
  currencyRateLabel,
  optionLabel,
  fieldLabel,
  priceInfoHtml,
  asInlineData,
  resolveAutocompleteSource,
  autocompleteFilter,
  autocompleteMatch,
  locationFieldNames,
  locationMethod,
  locationParent,
  buildLocationIndex,
  locationOptions,
  buildLocationShowTypes,
  locationPreset,
  matchesValues,
  locationReadonly,
} from '../src/assets/js/form-engine/data.js';
import {
  buildPayload,
  toFormData,
  AP_ERROR_TEXTS,
  AP_ERROR_GENERIC,
} from '../src/assets/js/form-engine/submit.js';

const WIDGET = { name: 'location_widget', type: 'widgets', widget: 'location', settings: { method: 'two' }, fields: [
  { name: 'region', children: 'regions' },
  { name: 'locality', parent: 'region' },
  { name: 'street', parent: 'locality' },
] };

const FIELDS = [
  { name: 'action_type', type: 'select', options: [
    { value: 'sell', label: 'Продаж' },
    { value: 'rent', label: 'Оренда' },
  ] },
  { name: 'price', type: 'number' },
  { name: 'surface', type: 'number' },
  { name: 'currency', type: 'select', options: [
    { value: 'uah', label: 'гривня' },
    { value: 'usd', label: 'долар' },
  ] },
  { name: 'period_rent', type: 'select', label: 'Період оренди', options: [
    { value: 'month', label: 'місяць' },
  ] },
  { name: 'utility_bills_rent', type: 'select', options: [
    { value: 'inc', label: 'комунальні включені' },
  ] },
  { name: 'agreement', type: 'checkbox' },
  { name: 'comfort', type: 'checkbox_group', options: [
    { value: 'internet', label: 'інтернет' },
  ] },
  { name: 'district_object', widget: 'autocomplete', data: [
    { id: 'd1', name: 'Печерський' },
  ], populate: { price: '1' } },
  WIDGET,
];

const CONFIG = {
  settings: { method: 'one' },
  rates: { usd: 42.5, eur: 51.0, nbu: 43.2 },
  steps: [{ rows: [{ cols: [{ rows: [{ fields: FIELDS }] }] }] }],
};

test('stepFieldNames flattens nested rows and keeps fields', () => {
  const names = stepFieldNames(CONFIG.steps[0]);
  assert.ok(names.some((f) => f.name === 'price'));
  assert.ok(names.some((f) => f.widget === 'autocomplete'));
  assert.ok(names.some((f) => f.widget === 'location'));
});

test('findFieldInConfig walks all steps', () => {
  assert.equal(findFieldInConfig(CONFIG, 'price').type, 'number');
  assert.equal(findFieldInConfig(CONFIG, 'missing'), null);
});

test('buildData mirrors the legacy Alpine defaults', () => {
  const d = buildData(CONFIG);
  assert.equal(d.action_type, '');
  assert.equal(d.agreement, false);
  assert.deepEqual(d.comfort, []);
  assert.equal(d.lat, '');
  assert.equal(d.lng, '');
  assert.equal(d.address, '');
  assert.deepEqual(d.location_widget, {
    region: '', regionName: '', regionType: '',
    locality: '', localityName: '', localityType: '',
    street: '', streetName: '', streetType: '',
  });
});

test('file helpers', () => {
  assert.deepEqual(parseFileSize('5 MB'), { bytes: 5242880, display: '5 MB' });
  assert.deepEqual(parseFileSize('800 KB'), { bytes: 819200, display: '800 KB' });
  assert.equal(parseFileSize('5 MB').bytes, parseFileSize(5).bytes);
  assert.equal(formatFileSize(5242880), '5.0 MB');
  assert.equal(formatFileSize(1024), '1.0 KB');
  assert.equal(newFileName(0, 'sell', '123', 'jpg'), '1_sell_123.jpg');
  assert.equal(newFileName(2, 'rent', '99', 'png'), '3_rent_99.png');
});

test('collectPhotos stalls until every original has a processed file', () => {
  assert.deepEqual(collectPhotos(['a', 'b'], ['x']), {
    error: 'Фото ще обробляються. Зачекайте кілька секунд і спробуйте ще раз.',
  });
  assert.ok(collectPhotos([], []).list);
  const ok = collectPhotos(['a', 'b'], ['x', 'y']);
  assert.deepEqual(ok.list, ['x', 'y']);
});

test('fileNoticeFor names the limit each photo broke', () => {
  const tooBig = 6 * 1024 * 1024;
  const within = 200 * 1024;
  const cfg = { maxSize: '5 MB', resizeWidth: 800, resizeHeight: 600 };
  const big = { w: 1600, h: 1200 };
  const small = { w: 640, h: 480 };

  // Nothing broken - no notice at all.
  assert.equal(fileNoticeFor(within, within, small, cfg), null);

  // Over the byte limit only: the system squeezes it.
  const size = fileNoticeFor(tooBig, within, small, cfg);
  assert.match(size, /перевищує встановлений ліміт 5 MB/);
  assert.match(size, /стисне файл до 5 MB/);
  assert.doesNotMatch(size, /800×600/);

  // Over the resize box only: the system resizes it.
  const dims = fileNoticeFor(within, within, big, cfg);
  assert.match(dims, /перевищує встановлений ліміт 800×600/);
  assert.match(dims, /змінить розміри фотознімку до 800×600/);
  assert.doesNotMatch(dims, /5 MB/);

  // Over both: the notice names both limits.
  const both = fileNoticeFor(tooBig, within, big, cfg);
  assert.match(both, /розмір зображення 800×600/);
  assert.match(both, /кількість кілобайт у файлі 5 MB/);
  assert.match(both, /стисне файли до 5 MB/);
});

test('fileNoticeFor keeps the promise it cannot make', () => {
  const tooBig = 6 * 1024 * 1024;
  const within = 200 * 1024;
  const cfg = { maxSize: '5 MB', resizeWidth: 800, resizeHeight: 600 };
  const big = { w: 1600, h: 1200 };
  const small = { w: 640, h: 480 };

  // The squeeze did not help: no "it will be within the limit" promise.
  assert.equal(fileNoticeFor(tooBig, tooBig, small, cfg), null);
  // The resize still happens, so that part of the notice stays.
  const dims = fileNoticeFor(tooBig, tooBig, big, cfg);
  assert.match(dims, /800×600/);
  assert.doesNotMatch(dims, /5 MB/);
});

test('price helpers', () => {
  const sell = { action_type: 'sell', currency: 'usd', price: '100000', surface: '80' };
  assert.equal(priceLabelOf(sell), 'Ціна продажу');
  assert.equal(Number(priceUah(sell, CONFIG.rates).replace(/[^\d]/g, '')), 4250000);
  assert.equal(Number(priceForeign(sell).replace(/[^\d]/g, '')), 100000);
  assert.equal(Number(pricePerM2Uah(sell, CONFIG.rates).replace(/[^\d]/g, '')), 53125);
  assert.equal(Number(rentPriceFor({ action_type: 'rent', currency: 'uah', price: '3000', period_rent: 'month' }, 3).replace(/[^\d]/g, '')), 9000);
  assert.equal(currencyRateLabel({ currency: 'uah' }, { nbu: 43.2 }), '43.2 гривень за $1');
  assert.equal(currencyRateLabel({ currency: 'usd' }, { usd: 42.5 }), '42.5 гривень за $1');
  assert.equal(optionLabel(CONFIG, 'action_type', 'sell'), 'Продаж');
  assert.equal(fieldLabel(CONFIG, 'period_rent'), 'Період оренди');
});

test('priceInfoHtml renders the legacy partial blocks', () => {
  const rates = CONFIG.rates;
  const sellUsd = priceInfoHtml({ action_type: 'sell', currency: 'usd', price: '1000', surface: '50' }, CONFIG, rates);
  assert.match(sellUsd, /Ціна продажу .+ гривень за весь об'єкт нерухомості/);
  assert.match(sellUsd, /в іноземній валюті \$/);
  assert.match(sellUsd, /Конвертовано за курсом/);

  const sellUah = priceInfoHtml({ action_type: 'sell', currency: 'uah', price: '1000', surface: '50' }, CONFIG, rates);
  assert.match(sellUah, /Ціна продажу 1[\s\u00A0\u202F\u2009]*000 гривень за весь об'єкт нерухомості/);
  assert.ok(!sellUah.includes('в іноземній валюті'));

  const rent = priceInfoHtml({ action_type: 'rent', currency: 'usd', price: '500', surface: '30', period_rent: 'month', utility_bills_rent: 'inc' }, CONFIG, rates);
  assert.match(rent, /період оплати і оренди не менше ніж на один місяць/);
  assert.match(rent, /комунальні включені/);
  assert.match(rent, /Конвертовано за курсом/);

  const rentFree = priceInfoHtml({ action_type: 'rent_free', currency: 'uah', price: '2000' }, CONFIG, rates);
  assert.match(rentFree, /Ціна оренди 2[\s\u00A0\u202F\u2009]*000 гривень за весь об'єкт нерухомості на один рік/);

  assert.equal(priceInfoHtml({ action_type: '', price: '' }, CONFIG, rates), '');
});

test('autocomplete source resolution', () => {
  const inline = asInlineData([{ id: 1, name: 'Київ' }, { value: 'od', label: 'Одеса' }, 'Харків']);
  assert.equal(inline.length, 3);
  assert.deepEqual(inline[0], { id: 1, name: 'Київ' });
  assert.deepEqual(inline[1], { id: 'od', name: 'Одеса' });
  assert.deepEqual(inline[2], { id: 'Харків', name: 'Харків' });
  assert.equal(asInlineData('x'), null);

  const f = { name: 'district_object', data: [{ id: 'd1', name: 'Печерський' }], mode: '2', threshold: 3, minChars: 1, maxResults: 10 };
  const src = resolveAutocompleteSource(f, () => ({}));
  assert.equal(src.inline, true);
  assert.equal(src.url, null);

  const sourced = resolveAutocompleteSource(
    { name: 'district_object', data: '/api/base', datas: [{ field: 'action_type', value: 'rent', data: '/api/rent', mode: '2' }] },
    () => ({ action_type: 'rent' }),
  );
  assert.equal(sourced.url, '/api/rent');
  assert.equal(sourced.mode, '2');
  const fallbacked = resolveAutocompleteSource(
    { name: 'district_object', data: '/api/base', datas: [{ field: 'action_type', value: 'rent', data: '/api/rent', mode: '2' }] },
    () => ({ action_type: 'sell' }),
  );
  assert.equal(fallbacked.url, '/api/base');
});

test('autocomplete filter and match', () => {
  const cache = { '/api/x': [{ id: 1, name: 'Печерський', parent: 'd1' }, { id: 2, name: 'Голосіївський', parent: 'd2' }] };
  const filtered = autocompleteFilter({ filter: { field: 'city', key: 'parent' } }, { url: '/api/x' }, cache, () => ({ city: 'd1' }));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Печерський');
  assert.deepEqual(autocompleteFilter({}, { url: '/api/x' }, cache, () => ({})), cache['/api/x']);
  assert.deepEqual(autocompleteMatch([{ name: 'Київ' }, { name: 'Київська область' }, { name: 'Львів' }], 'київ', 10).map((o) => o.name), ['Київ', 'Київська область']);
});

test('location helpers', () => {
  assert.deepEqual(locationFieldNames(WIDGET), ['region', 'locality', 'street']);
  assert.equal(locationMethod(WIDGET), 'two');
  assert.equal(locationParent(WIDGET, 'locality'), 'region');
});

test('location options with flat data', () => {
  const flat = [
    { id: 1, name: 'Івано-Франківська', parentId: null, type: 'область' },
    { id: 2, name: 'Київська', parentId: null, type: 'область' },
    { id: 3, name: 'Івано-Франківськ', parentId: 1, type: 'місто' },
    { id: 4, name: 'Косів', parentId: 1, type: 'місто' },
    { id: 5, name: 'Львів', parentId: 2, type: 'місто' },
  ];
  const idx = buildLocationIndex(flat, { ...WIDGET, settings: {} });
  assert.deepEqual(locationOptions(idx, { ...WIDGET, settings: {} }, 'region', () => ({ region: 1 }), null).map((o) => o.id), [1, 2]);
  const opts = locationOptions(idx, { ...WIDGET, settings: {} }, 'locality', () => ({ region: 1 }), null);
  assert.deepEqual(opts.map((o) => o.id), [3, 4]);
  assert.equal(locationPreset(WIDGET, 'locality', () => undefined), null);
});

test('matchesValues mirrors legacy', () => {
  assert.equal(matchesValues('a', ['a', 'b'], []), true);
  assert.equal(matchesValues('c', ['a', 'b'], []), false);
  assert.equal(matchesValues('a', ['a'], ['a']), false);
  assert.equal(matchesValues('x', [], []), true);
  assert.equal(matchesValues('x', undefined, []), true);
});

test('buildPayload and toFormData', () => {
  const payload = buildPayload({ price: '1000' }, { 'cf-turnstile-response': 'tok' }, { list: [1, 2] });
  assert.equal(payload.data, JSON.stringify({ price: '1000' }));
  assert.deepEqual(payload.fields, [{ name: 'cf-turnstile-response', value: 'tok' }]);
  assert.deepEqual(payload.images, [1, 2]);
  const fd = toFormData(payload);
  assert.equal(fd.get('data'), payload.data);
  assert.equal(fd.get('cf-turnstile-response'), 'tok');
  assert.equal(fd.getAll('images').length, 2);
});

test('AP_ERROR_TEXTS matches uk.yml copy', () => {
  assert.equal(AP_ERROR_TEXTS.E_CAPTCHA, 'Не вдалося перевірити, що ви не робот. Оновіть сторінку та спробуйте ще раз.');
  assert.equal(AP_ERROR_TEXTS.E_CAPTCHA_REQUIRED, 'Підтвердьте, що ви не робот, щоб надіслати оголошення.');
  assert.equal(AP_ERROR_TEXTS.E_CAPTCHA_REUSED, 'Перевірка captcha вже була використана. Підтвердьте її ще раз і надішліть оголошення заново.');
  assert.equal(AP_ERROR_TEXTS.E_CONTENT_TOO_LARGE, 'Фото завеликі, щоб надіслати лист. Приклейте менше фото або спробуйте ще раз.');
  assert.equal(AP_ERROR_TEXTS.E_TOO_MANY_ATTACHMENTS, 'Забагато фото. Можна приклеїти не більше 4.');
  assert.equal(AP_ERROR_TEXTS.E_ATTACHMENT_TYPE_INVALID, 'Фото мають некоректний формат. Приклейте фото у форматі JPG або PNG.');
  assert.equal(AP_ERROR_TEXTS.E_RATE_LIMIT_EXCEEDED, 'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.');
  assert.equal(AP_ERROR_TEXTS.E_DAILY_LIMIT_EXCEEDED, AP_ERROR_TEXTS.E_RATE_LIMIT_EXCEEDED);
  assert.equal(AP_ERROR_GENERIC, 'Виникла несподівана помилка. Спробуйте ще раз.');
});