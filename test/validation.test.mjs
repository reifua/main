import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateDepends, getDataValue } from '../src/assets/js/form-engine/conditions.js';
import { fieldError, isFieldRequired, validationMessage } from '../src/assets/js/form-engine/validation.js';

function ctxOf({ data = {}, config = {}, hidden = [], files = {}, fileValid = {}, captcha = false, ...extra } = {}) {
  const ctx = {
    data,
    config,
    files,
    fileValid,
    ...extra,
    isVisible: (name) => !hidden.includes(name),
    captchaSolved: () => captcha,
    evaluateDepends: (deps) => evaluateDepends(deps, (p) => getDataValue(ctx.data, p)),
  };
  return ctx;
}

const message = (field, key, ctx) => validationMessage(field, key, key, 'HARDCODED', ctx);

// ---------------------------------------------------------------- required ---

test('isFieldRequired accepts the three shapes the DSL allows', () => {
  assert.equal(isFieldRequired({ required: true }, ctxOf()), true);
  assert.equal(isFieldRequired({ required: false }, ctxOf()), false);
  assert.equal(isFieldRequired({}, ctxOf()), false);
  assert.equal(isFieldRequired({ required: 'yes' }, ctxOf()), false, 'only booleans and conditions count');
});

test('a conditional required is evaluated against current data', () => {
  const field = { required: [{ field: 'type', values: ['rent'] }] };

  assert.equal(isFieldRequired(field, ctxOf({ data: { type: 'rent' } })), true);
  assert.equal(isFieldRequired(field, ctxOf({ data: { type: 'sale' } })), false);

  const wrapped = { required: { depends: [{ field: 'type', values: ['rent'] }] } };
  assert.equal(isFieldRequired(wrapped, ctxOf({ data: { type: 'rent' } })), true, '{depends} form');
});

// ----------------------------------------------------------------- messages ---

test('required message precedence follows the original order', () => {
  assert.equal(
    message({ required: { message: 'own message' } }, 'required', ctxOf()),
    'own message',
    '1. an inline message on required',
  );
  assert.equal(
    message({ required: { depends: [{ field: 'x', values: ['1'], message: 'from condition' }] } },
      'required', ctxOf({ data: { x: '1' } })),
    'from condition',
    '2. a message attached to the matching condition',
  );
  assert.equal(
    message({ validation: { required: 'from validation' } }, 'required', ctxOf()),
    'from validation',
    '3. field.validation.required',
  );
  assert.equal(
    message({ message: 'field level' }, 'required', ctxOf()),
    'field level',
    '4. field.message',
  );
  assert.equal(
    message({}, 'required', ctxOf({ config: { settings: { required: { message: 'form level' } } } })),
    'form level',
    '5. settings.required.message',
  );
  assert.equal(message({}, 'required', ctxOf()), 'HARDCODED', '6. hardcoded default');
});

test('a required condition without its own message keeps scanning', () => {
  // Regression: the scan used to stop at the first matching entry, so a
  // partially specified condition set swallowed the message of a later one.
  const field = {
    required: {
      depends: [
        { field: 'kind', values: ['house'] },
        { field: 'kind', values: ['house'], message: 'second entry' },
      ],
    },
  };

  assert.equal(message(field, 'required', ctxOf({ data: { kind: 'house' } })), 'second entry');
});

test('a non-required key reads field.validation first', () => {
  assert.equal(message({ validation: { min: 'too small' } }, 'min', ctxOf()), 'too small');
  assert.equal(message({}, 'min', ctxOf()), 'HARDCODED');
});

// ---------------------------------------------------------------- fieldError ---

test('a hidden field never errors', () => {
  const ctx = ctxOf({ hidden: ['a'], data: { a: '' } });
  assert.equal(fieldError({ name: 'a', required: true }, ctx), null);
});

test('an empty required field reports the type specific default', () => {
  assert.equal(fieldError({ name: 'a', type: 'text', required: true }, ctxOf()), "Це поле обов'язкове");
  assert.equal(fieldError({ name: 'a', type: 'checkbox', required: true }, ctxOf()), 'Підтвердіть згоду');
  assert.equal(
    fieldError({ name: 'a', type: 'checkbox_group', required: true }, ctxOf({ data: { a: [] } })),
    'Оберіть хоча б один варіант',
  );
  assert.equal(
    fieldError({ name: 'a', type: 'text', required: true }, ctxOf({ data: { a: 'x' } })),
    null,
    'a filled field is valid',
  );
  assert.equal(
    fieldError({ name: 'a', type: 'text' }, ctxOf({ data: { a: '' } })),
    null,
    'an optional empty field is valid',
  );
});

test('numeric bounds are checked only for numbers', () => {
  const field = { name: 'a', type: 'number', min: 10, max: 100 };

  assert.equal(fieldError(field, ctxOf({ data: { a: '5' } })), 'Мінімальне значення: 10');
  assert.equal(fieldError(field, ctxOf({ data: { a: '200' } })), 'Максимальне значення: 100');
  assert.equal(fieldError(field, ctxOf({ data: { a: '50' } })), null);
  assert.equal(fieldError(field, ctxOf({ data: { a: 'abc' } })), null, 'not a number, no bounds');
  assert.equal(
    fieldError({ ...field, validation: { min: 'below range' } }, ctxOf({ data: { a: '5' } })),
    'below range',
  );
});

test('the pattern applies to text-like fields and can come from settings', () => {
  const config = { settings: { pattern: '^[0-9]+$', feedback: { pattern: 'digits only' } } };

  assert.equal(
    fieldError({ name: 'a', type: 'text' }, ctxOf({ config, data: { a: 'abc' } })),
    'digits only',
  );
  assert.equal(fieldError({ name: 'a', type: 'text' }, ctxOf({ config, data: { a: '12' } })), null);
  assert.equal(
    fieldError({ name: 'a', type: 'text', pattern: '^[a-z]+$', validation: { pattern: 'letters only' } },
      ctxOf({ config, data: { a: '12' } })),
    'letters only',
    'a field pattern wins over the form one',
  );
  assert.equal(
    fieldError({ name: 'a', type: 'text', pattern: '(' }, ctxOf({ data: { a: 'anything' } })),
    null,
    'a pattern the config author got wrong must not block the form',
  );
});

test('an email is exempt from the form wide pattern', () => {
  // Every email would fail a Ukrainian-letters pattern otherwise.
  const config = { settings: { pattern: '^[а-яА-Яіїєґ]+$' } };
  const field = { name: 'a', type: 'email' };

  assert.equal(fieldError(field, ctxOf({ config, data: { a: 'user@example.test' } })), null);
  assert.equal(fieldError(field, ctxOf({ config, data: { a: 'нет-пошти' } })),
    'Введіть дійсну електронну адресу');
});

test('length bounds apply to text-like fields', () => {
  const field = { name: 'a', type: 'text', minlength: 3, maxlength: 5 };

  assert.equal(fieldError(field, ctxOf({ data: { a: 'ab' } })), 'Мінімальна довжина: 3 символів');
  assert.equal(fieldError(field, ctxOf({ data: { a: 'abcdef' } })), 'Максимальна довжина: 5 символів');
  assert.equal(fieldError(field, ctxOf({ data: { a: 'abcd' } })), null);
  assert.equal(
    fieldError({ ...field, validation: { minlength: 'too short' } }, ctxOf({ data: { a: 'ab' } })),
    'too short',
  );
});

test('compare rejects a total that is not bigger than the sum of its parts', () => {
  const field = {
    name: 'total',
    type: 'number',
    validation: { compare: [{ field: ['living', 'kitchen'], operator: '>', message: 'too small' }] },
  };

  assert.equal(
    fieldError(field, ctxOf({ data: { total: '10', living: '6', kitchen: '5' } })),
    'too small',
    '10 is not greater than 11',
  );
  assert.equal(fieldError(field, ctxOf({ data: { total: '20', living: '6', kitchen: '5' } })), null);
  assert.equal(
    fieldError(field, ctxOf({ data: { total: '20' } })),
    null,
    'no part is set, so there is nothing to compare against',
  );
  assert.equal(
    fieldError({ ...field, validation: { compare: [{ field: 'living', operator: '>', message: 'x' }] } },
      ctxOf({ data: { total: '' } })),
    null,
    'an empty total skips compare entirely',
  );
});

test('compare message falls back through the same chain', () => {
  const base = { name: 'total', type: 'number', validation: { compare: [{ field: 'a', operator: '<' }] } };
  const data = { total: '10', a: '5' };

  assert.equal(fieldError(base, ctxOf({ data })), 'Некоректне значення', 'hardcoded');
  assert.equal(
    fieldError({ ...base, validation: { ...base.validation, compareMessage: 'from field' } }, ctxOf({ data })),
    'from field',
  );
  assert.equal(
    fieldError(base, ctxOf({ data, config: { settings: { feedback: { compare: 'from settings' } } } })),
    'from settings',
  );
  assert.equal(
    fieldError({ ...base, validation: { ...base.validation, compare: [{ field: 'a', operator: '<', message: 'from rule' }] } },
      ctxOf({ data })),
    'from rule',
    'the rule beats everything',
  );
});

test('an unknown compare operator blocks rather than passing', () => {
  // Matches form-engine.js:399, which starts from `pass = false` and has no
  // default branch - a typo in an operator must not let the value through.
  const field = { name: 'total', type: 'number', validation: { compare: [{ field: 'a', operator: '??' }] } };
  assert.equal(fieldError(field, ctxOf({ data: { total: '1', a: '99' } })), 'Некоректне значення');
});

test('settings.validation supplies per-key defaults for the whole form', () => {
  // The legacy engine reads this layer; the renderer has to honour it so a
  // config written for that engine keeps working unchanged.
  const config = { settings: { validation: { minlength: 'too short, form wide' } } };
  const field = { name: 'a', type: 'text', minlength: 5 };

  assert.equal(
    fieldError(field, ctxOf({ config, data: { a: 'ab' } })),
    'too short, form wide',
    'below the field level and the hardcoded default',
  );
  assert.equal(
    fieldError({ ...field, validation: { minlength: 'wins' } }, ctxOf({ config, data: { a: 'ab' } })),
    'wins',
    'the field copy still wins',
  );
});

// ------------------------------------------------------------------ widgets ---

test('the map widget is required through its latitude', () => {
  const field = { name: 'm', type: 'widgets', widget: 'map', required: true };

  assert.equal(fieldError(field, ctxOf()), 'Поставте маркер на карті');
  assert.equal(fieldError(field, ctxOf({ data: { lat: '50.45' } })), null);
  assert.equal(
    fieldError(field, ctxOf({ data: { m: 'ignored', lat: '50.45' } })),
    null,
    'the marker lives in data.lat, not in the field name',
  );
});

test('the captcha widget is required until solved, then always valid', () => {
  const field = { name: 'c', type: 'widgets', widget: 'captcha', required: true };

  assert.equal(fieldError(field, ctxOf()), 'Підтвердьте, що ви не робот');
  assert.equal(fieldError(field, ctxOf({ captcha: true })), null);
  assert.equal(
    fieldError({ ...field, required: false }, ctxOf({ data: { c: 'x' }, config: { settings: { pattern: '^[0-9]+$' } } })),
    null,
    'a solved captcha is not run through the text pattern',
  );
});

test('file limits are checked against the file list', () => {
  const field = { name: 'f', type: 'file', required: true, file: { maxFiles: 2, minFiles: 1 } };

  assert.equal(fieldError(field, ctxOf()), 'Мінімум 1 файл');
  assert.equal(
    fieldError(field, ctxOf({ files: { f: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } })),
    'Максимум 2 файлів',
  );
  assert.equal(fieldError(field, ctxOf({ files: { f: [{ name: 'a' }] } })), null);
  assert.equal(
    fieldError({ ...field, required: false }, ctxOf({ files: { f: [] } })),
    'Мінімум 1 файл',
    'minFiles is enforced without `required`',
  );
  assert.equal(
    fieldError({ ...field, required: false }, ctxOf({ files: { f: [] }, pluralizeFile: (n) => (n === 1 ? 'файл' : 'файлів') })),
    'Мінімум 1 файл',
    'the form supplies its own Ukrainian plural',
  );
});

test('a file that fails validation is reported by name', () => {
  const field = { name: 'f', type: 'file', file: { maxFiles: 10, maxSize: '1MB' } };
  const ctx = ctxOf({
    files: { f: [{ name: 'big.zip' }, { name: 'ok.txt' }] },
    fileValid: { f: [false, true] },
    parseFileSize: (s) => ({ display: s }),
  });

  assert.equal(fieldError(field, ctx), 'Файл "big.zip" перевищує 1MB');
});

test('the file rules speak with the copy of the config', () => {
  const field = {
    name: 'f',
    type: 'file',
    required: false,
    file: { minFiles: 1, maxFiles: 4, maxSize: '150KB' },
    validation: {
      minFiles: 'Ви маєте додати як мінімум {min} фотознімок',
      maxFiles: 'Ви можете додати як максимум {max} фотознімків',
      maxSize: 'В одному файлі не може бути більше ніж {limit}',
    },
  };

  assert.equal(
    fieldError(field, ctxOf({ files: { f: [] } })),
    'Ви маєте додати як мінімум 1 фотознімок',
    'minFiles reads its own copy and fills {min}',
  );
  assert.equal(
    fieldError(field, ctxOf({ files: { f: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }] } })),
    'Ви можете додати як максимум 4 фотознімків',
    'maxFiles reads its own copy and fills {max}',
  );
  assert.equal(
    fieldError(
      field,
      ctxOf({
        files: { f: [{ name: 'big.jpg' }] },
        fileValid: { f: [false] },
        parseFileSize: (s) => ({ display: s }),
      }),
    ),
    'В одному файлі не може бути більше ніж 150KB',
    'maxSize reads its own copy and fills {limit}',
  );
});
