import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModel,
  collectStepFields,
  eachField,
  hasWidget,
  stepFields,
} from '../src/assets/js/form-engine/model.js';

// Four levels deep, the shape confirmed against add-property.yml:
// steps[] -> rows[] -> cols[] -> rows[] -> fields[]
const CONFIG = {
  id: 'demo',
  steps: [
    {
      id: 's1',
      rows: [
        { class: 'row', auto: true, fields: [{ name: 'a' }, { name: 'b' }] },
        {
          class: 'row',
          cols: [
            {
              class: 'col-md-6',
              rows: [{ class: 'row', auto: true, fields: [{ name: 'c' }] }],
            },
            {
              class: 'col-md-6',
              rows: [{ class: 'row', fields: [{ name: 'd' }, { name: '' }] }],
            },
          ],
        },
      ],
    },
    { id: 's2', rows: [{ fields: [{ name: 'e' }] }] },
  ],
};

test('eachField reaches fields at both nesting depths', () => {
  const seen = [];
  eachField(CONFIG.steps[0].rows, (field, row) => seen.push([field.name, row.fields.length]));

  assert.deepEqual(seen, [
    ['a', 2],
    ['b', 2],
    ['c', 1],
    ['d', 2],
    ['', 2],
  ]);
});

test('eachField tolerates a missing rows array', () => {
  const seen = [];
  eachField(undefined, (f) => seen.push(f));
  eachField(null, (f) => seen.push(f));
  assert.deepEqual(seen, []);
});

test('collectStepFields preserves document order', () => {
  assert.deepEqual(
    collectStepFields(CONFIG.steps[0]).map((f) => f.name),
    ['a', 'b', 'c', 'd', ''],
    'the nested row comes after the flat one',
  );
  assert.deepEqual(
    collectStepFields(CONFIG.steps[1]).map((f) => f.name),
    ['e'],
  );
  assert.deepEqual(collectStepFields(undefined), []);
});

test('buildModel indexes every field once, in order', () => {
  const model = buildModel(CONFIG);

  assert.equal(model.config, CONFIG, 'the config is kept for settings lookups');
  assert.equal(model.steps.length, 2);
  assert.deepEqual(
    model.fields.map((f) => f.name),
    ['a', 'b', 'c', 'd', '', 'e'],
  );
  assert.equal(model.byName.get('c').name, 'c');
  assert.ok(!model.byName.has(''), 'a field with no name is not addressable');
});

test('buildModel keeps the first definition when a name repeats', () => {
  const model = buildModel({
    steps: [
      { rows: [{ fields: [{ name: 'dup', type: 'text' }, { name: 'dup', type: 'tel' }] }] },
    ],
  });

  assert.equal(model.byName.get('dup').type, 'text', 'first wins, so lookups are stable');
  assert.equal(model.fields.length, 2, 'the index is a lookup, not a filter');
});

test('rowInfo records the row each field sits in', () => {
  const model = buildModel(CONFIG);

  assert.deepEqual(model.rowInfo.get('a'), { auto: true, siblings: ['a', 'b'] });
  assert.deepEqual(
    model.rowInfo.get('c').siblings,
    ['c'],
    'siblings are that row only, not the whole step',
  );
  assert.equal(model.rowInfo.get('d').auto, false, 'a row without auto: true is static');
  assert.deepEqual(
    model.rowInfo.get('e').siblings,
    ['e'],
    'a second step does not inherit the first step rows',
  );
});

test('rowInfo does not record fields without a name', () => {
  const model = buildModel(CONFIG);
  assert.ok(!model.rowInfo.has(''));
});

test('hasWidget and stepFields work off the index', () => {
  const model = buildModel({
    steps: [
      { rows: [{ fields: [{ name: 'x', type: 'widgets', widget: 'map' }] }] },
      { rows: [{ fields: [{ name: 'y', type: 'text' }] }] },
    ],
  });

  assert.equal(hasWidget(model, 'map'), true);
  assert.equal(hasWidget(model, 'captcha'), false);
  assert.deepEqual(stepFields(model, 1).map((f) => f.name), ['y']);
  assert.deepEqual(stepFields(model, 99), [], 'an out of range step is empty, not a crash');
});

test('two models over the same config do not share state', () => {
  const first = buildModel(CONFIG);
  const second = buildModel(CONFIG);

  assert.notEqual(first.byName, second.byName, 'no shared cache between instances');
  assert.notEqual(first.rowInfo, second.rowInfo);
  assert.deepEqual(first.byName.get('a'), second.byName.get('a'));
});
