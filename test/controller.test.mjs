import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeController } from '../src/assets/js/form-engine/controller.js';

const config = {
  version: 1,
  id: 'test',
  settings: {
    required: { message: 'Заповніть поле' },
  },
  steps: [
    {
      id: 'a',
      rows: [
        {
          class: 'row',
          fields: [
            { name: 'property_type', type: 'select', label: 'Тип', options: [{ value: 'apartment' }, { value: 'commercial' }] },
            {
              name: 'rooms',
              type: 'number',
              label: {
                text: 'Кімнати',
                depends: [{ field: 'property_type', values: ['commercial'], text: 'Приміщення' }],
              },
              required: { depends: [{ field: 'property_type', values: ['commercial'] }] },
            },
            {
              name: 'address',
              type: 'text',
              label: 'Адреса',
              depends: [{ field: 'property_type', values: ['commercial'] }],
            },
            {
              name: 'annotation',
              type: 'text',
              label: 'Анотація',
              depends: [{ field: 'rooms', value: '>0', when: { field: 'property_type', values: ['commercial'] } }],
            },
          ],
        },
      ],
    },
    {
      id: 'b',
      rows: [
        {
          class: 'row',
          fields: [
            { name: 'price', type: 'number', label: 'Ціна', required: true },
          ],
        },
      ],
    },
  ],
};

test('two instances of the same config do not share data or pages state', () => {
  const a = makeController(config);
  const b = makeController(config);

  a.setData('property_type', 'commercial');
  assert.equal(b.getValue('property_type'), undefined, 'b must not see a write by its twin');
  assert.equal(a.getValue('property_type'), 'commercial');
  assert.equal(a.step(), 0, 'index lives in the instance');
});

test('required gated by a condition is re-evaluated when the condition field changes', () => {
  const c = makeController(config);

  assert.equal(c.isFieldRequired('rooms'), false, 'not required while apartment/unknown');

  c.setData('property_type', 'commercial');
  assert.equal(c.isFieldRequired('rooms'), true);
  assert.equal(c.fieldError('rooms'), 'Заповніть поле', 'conditional required fires');

  c.setData('rooms', '4');
  assert.equal(c.fieldError('rooms'), '');

  c.setData('property_type', 'apartment');
  assert.equal(c.isFieldRequired('rooms'), false);
  assert.equal(c.fieldError('rooms'), '', 'error from a no-longer-applicable rule is gone');
  assert.equal(c.getValue('rooms'), '4', 'the value itself is kept');
});

test('a cascade change keeps the dependent field neutral until it is engaged', () => {
  const c = makeController(config);

  c.setData('property_type', 'commercial');
  assert.equal(c.fieldError('rooms'), 'Заповніть поле', 'the rule has run for the logic layer');
  assert.equal(c.visibleError('rooms'), '',
    'the fresh required error stays off the page: the user has not touched rooms yet');
});

test('engaging a field, or validating its step, surfaces the client error', () => {
  const c = makeController(config);
  c.setData('property_type', 'commercial');

  c.engage('rooms');
  assert.equal(c.visibleError('rooms'), 'Заповніть поле', 'engage() unlocks the copy');

  const d = makeController(config);
  d.setData('property_type', 'commercial');
  d.validateStep(0);
  assert.equal(d.visibleError('rooms'), 'Заповніть поле',
    'an explicit step validation shows what is missing');
});

test('a non-blank value surfaces its error even before engage', () => {
  const local = {
    version: 1,
    id: 'min-rule',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'rooms', type: 'number', min: 1 },
    ] }] }],
  };
  const c = makeController(local);
  c.setData('rooms', '0');
  assert.ok(c.fieldError('rooms'), 'the min rule fired for logic');
  assert.equal(c.visibleError('rooms'), c.fieldError('rooms'),
    'content in the field means the verdict shows');
});

test('page-layer and server verdicts always surface, engaged or not', () => {
  const c = makeController(config);
  c.setGlueError('price', 'Ціна поза межами');
  assert.equal(c.visibleError('price'), 'Ціна поза межами', 'glue error is not gated');
  assert.equal(c.fieldError('price'), 'Ціна поза межами');

  const d = makeController(config);
  d.setServerErrors({ price: 'Сервер відхилив' });
  assert.equal(d.visibleError('price'), 'Сервер відхилив', 'server error is not gated');
});

test('depends-driven visibility follows the data', () => {
  const c = makeController(config);

  assert.equal(c.isFieldVisible('address'), false);
  c.setData('property_type', 'commercial');
  assert.equal(c.isFieldVisible('address'), true);
  c.setData('rooms', '2');
  assert.equal(c.isFieldVisible('annotation'), true, 'when-gated entry holds while rooms>0');
  c.setData('rooms', '0');
  assert.equal(c.isFieldVisible('annotation'), false);
});

test('labels resolve against supplied data', () => {
  const c = makeController(config);
  assert.equal(c.label('rooms'), 'Кімнати', 'falls back to the literal text');
  c.setData('property_type', 'commercial');
  assert.equal(c.label('rooms'), 'Приміщення');
});

test('a server error is not wiped by later client actions on other fields', () => {
  const c = makeController(config);
  c.setServerErrors({ price: 'Ціна недоступна в цьому районі' });

  assert.equal(c.fieldError('price'), 'Ціна недоступна в цьому районі');

  c.setData('property_type', 'commercial');
  assert.equal(c.fieldError('price'), 'Ціна недоступна в цьому районі',
    'editing an unrelated field must not clear a server error');

  c.validateAll();
  assert.equal(c.fieldError('price'), 'Ціна недоступна в цьому районі',
    'a client validation pass must not overwrite the server report');
});

test('editing the field itself clears its server error and keeps client errors apart', () => {
  const c = makeController(config);
  c.setServerErrors({ price: 'Сервер каже: ні' });

  c.setData('price', '');
  assert.equal(c.fieldError('price'), 'Заповніть поле',
    'after the touch, the freshly computed client error shows instead');

  const d = makeController(config);
  d.setServerErrors({ price: 'Сервер каже: ні', rooms: 'див. сервер' });
  d.setData('rooms', '3');
  assert.equal(d.fieldError('rooms'), '', 'rooms was cleared and is now valid');
  assert.equal(d.fieldError('price'), 'Сервер каже: ні', 'price untouched');
});

test('a fresh server report replaces the previous one', () => {
  const c = makeController(config);
  c.setServerErrors({ price: 'Сервер каже: ні', rooms: 'див. сервер' });

  c.setServerErrors({ price: 'Нова претензія' });
  assert.equal(c.fieldError('price'), 'Нова претензія', 'the reported field updates');
  assert.equal(c.fieldError('rooms'), '',
    'rooms is no longer reported, so its server error stops showing');

  c.setServerErrors({});
  assert.equal(c.fieldError('price'), '', 'an empty report clears the server side');
  assert.deepEqual(c.getServerErrors(), {}, 'the server map is left empty');
});

test('validateStep in isolation notifies the recomputed names', () => {
  const c = makeController(config);
  const events = [];
  c.subscribe((event, names) => events.push([event, [...names]]));

  c.setData('property_type', 'commercial');
  events.length = 0;

  assert.equal(c.validateStep(0), false, 'rooms is empty but required');
  assert.deepEqual(events.at(-1), ['validateStep', ['property_type', 'rooms', 'address', 'annotation']]);

  c.validateField('rooms');
  assert.deepEqual(events.at(-1), ['validateField', ['rooms']]);

  c.setData('rooms', '4');
  events.length = 0;
  assert.equal(c.validateStep(0), true);
  assert.deepEqual(events.at(-1), ['validateStep', ['property_type', 'rooms', 'address', 'annotation']],
    'a successful pass still announces the fields so the binder can clear them');
});

test('dependentsOf lists everything that reacts to a field', () => {
  const c = makeController(config);
  assert.deepEqual(c.dependentsOf('property_type'), new Set([
    'property_type', 'rooms', 'address', 'annotation',
  ]), 'rooms via required+label, address via depends, annotation via the when gate');
  assert.deepEqual(c.dependentsOf('rooms'), new Set(['rooms', 'annotation']));
});

test('validateAll jumps to the first step that has an error', () => {
  const c = makeController(config);
  c.setData('property_type', 'commercial');

  assert.equal(c.validateAll(), false);
  assert.equal(c.step(), 0, 'step a holds the rooms error');

  c.setData('rooms', '4');
  assert.equal(c.validateAll(), false);
  assert.equal(c.step(), 1, 'step b holds the price error');

  c.setData('price', '100');
  assert.equal(c.validateAll(), true);
});

test('next() refuses to leave a step while it is invalid', () => {
  const c = makeController(config);
  c.setData('property_type', 'commercial');

  assert.equal(c.next(), false, 'rooms is empty but required');
  assert.equal(c.step(), 0);

  c.setData('rooms', '4');
  assert.equal(c.next(), true);
  assert.equal(c.step(), 1);
  assert.equal(c.prev(), true);
  assert.equal(c.step(), 0);
  assert.equal(c.prev(), false, 'cannot go before the first step');
});

test('subscribe fires on mutations and can unsubscribe', () => {
  const c = makeController(config);
  const events = [];
  const off = c.subscribe((event, names) => events.push([event, [...names]]));

  c.setData('property_type', 'commercial');
  assert.deepEqual(events.at(-1)[0], 'setData');
  assert.deepEqual(events.at(-1)[1], ['property_type', 'rooms', 'address', 'annotation']);

  c.setStep(1);
  assert.equal(events.at(-1)[0], 'setStep');

  off();
  c.setData('price', '1');
  assert.equal(events.filter((e) => e[0] === 'setData').length, 1, 'no new event after unsubscribing');
});

test('field() exposes the model definition for page glue', () => {
  const c = makeController(config);
  assert.equal(c.field('rooms').type, 'number');
  assert.equal(c.field('rooms').name, 'rooms');
  assert.equal(c.field('missing'), null);
});

test('a glue error overrides client and server errors', () => {
  const c = makeController(config);
  c.setData('price', '');
  assert.equal(c.fieldError('price'), 'Заповніть поле');
  c.setGlueError('price', 'Домен не приймає пошту або не існує');
  assert.equal(c.fieldError('price'), 'Домен не приймає пошту або не існує');
  c.setServerErrors({ price: 'сервер' });
  assert.equal(c.fieldError('price'), 'Домен не приймає пошту або не існує', 'glue sits above the server map');
  c.setData('price', '100');
  assert.equal(c.fieldError('price'), '', 'editing clears the glue error');
});

test('an empty glue error clears instead of setting', () => {
  const c = makeController(config);
  c.setGlueError('price', 'Дещо');
  assert.equal(c.fieldError('price'), 'Дещо');
  c.setGlueError('price', '');
  assert.equal(c.fieldError('price'), '');
});