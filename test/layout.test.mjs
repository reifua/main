import test from 'node:test';
import assert from 'node:assert/strict';

import { autoCol, colFor, parseGridClasses } from '../src/assets/js/form-engine/layout.js';
import { buildModel } from '../src/assets/js/form-engine/model.js';

/** Builds the layout context for one row of fields. */
function contextOf(fields, { auto = true, hidden = [] } = {}) {
  const model = buildModel({
    steps: [{ id: 's', rows: [{ class: 'row', auto, fields }] }],
  });
  return {
    rowInfo: model.rowInfo,
    byName: model.byName,
    isVisible: (name) => !hidden.includes(name),
  };
}

test('parseGridClasses reads explicit spans only', () => {
  assert.deepEqual(parseGridClasses('col-6 col-md-4'), { xs: 6, md: 4 });
  assert.deepEqual(parseGridClasses('col-12'), { xs: 12 });
  assert.deepEqual(parseGridClasses('col-md-4 col-lg-3'), { md: 4, lg: 3 });
  assert.deepEqual(parseGridClasses(''), {});
  assert.deepEqual(parseGridClasses(null), {});
  assert.deepEqual(parseGridClasses('col-md-12 col-md-6'), { md: 6 }, 'later class wins');
});

test('a non-auto row falls back to the field col or col-12', () => {
  const ctx = contextOf([{ name: 'a', col: 'col-6' }, { name: 'b' }], { auto: false });

  assert.equal(colFor('a', ctx), 'col-6');
  assert.equal(colFor('b', ctx), 'col-12');
  assert.equal(colFor('missing', ctx), 'col-12');
});

test('auto rows collapse to col-12 when they cannot be split', () => {
  const ctx = contextOf([{ name: 'a' }]);

  assert.equal(autoCol('a', ctx), 'col-12', 'a lone field keeps the full width');

  const two = contextOf([{ name: 'a' }, { name: 'b' }], { hidden: ['b'] });
  assert.equal(autoCol('a', two), 'col-12', 'only one sibling is visible');
});

test('an explicit col on the field wins over the distribution', () => {
  const ctx = contextOf([{ name: 'a', col: 'col-md-4' }, { name: 'b' }, { name: 'c' }]);

  assert.equal(autoCol('a', ctx), 'col-md-4');
  // The fixed sibling only pins md, so xs stays full width while md splits
  // what is left: 12 - 4 = 8 across two fields.
  assert.equal(autoCol('b', ctx), 'col-12 col-md-4');
});

test('an explicit col collapses with the row until a sibling is revealed', () => {
  const col = 'col-6 col-md-4';
  const hiddenAll = contextOf(
    [{ name: 'a', col }, { name: 'b', col }, { name: 'c', col }],
    { hidden: ['a', 'b', 'c'] },
  );
  assert.equal(autoCol('a', hiddenAll), 'col-12',
    'nothing is shown yet, so the row keeps the full width (form-engine.js:433)');

  // The parking/parking_surface row: parking pins nothing, the surface field
  // pins col-12 col-md-4 and starts hidden.
  const fixed = 'col-12 col-md-4';
  const fields = [{ name: 'parking' }, { name: 'parking_surface', col: fixed }];

  const alone = contextOf(fields, { hidden: ['parking_surface'] });
  assert.equal(autoCol('parking', alone), 'col-12', 'alone the field spans the row');
  assert.equal(autoCol('parking_surface', alone), 'col-12', 'a hidden field counts for nothing');

  const shown = contextOf(fields);
  assert.equal(autoCol('parking', shown), 'col-12 col-md-8',
    'xs has a full-width fixed sibling, md splits what it leaves');
  assert.equal(autoCol('parking_surface', shown), fixed, 'the explicit col wins');
});

test('an all-auto row divides twelve evenly', () => {
  assert.equal(autoCol('a', contextOf([{ name: 'a' }, { name: 'b' }, { name: 'c' }])), 'col-4');
  assert.equal(
    autoCol('a', contextOf([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }])),
    'col-3',
  );
  assert.equal(
    autoCol('a', contextOf([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }])),
    'col-2',
    'the remainder is dropped at the smallest breakpoint, as in the original',
  );
});

test('fixed siblings at a breakpoint leave the rest to share', () => {
  const ctx = contextOf([
    { name: 'fixed', col: 'col-md-7' },
    { name: 'a' },
    { name: 'b' },
  ]);

  // No fixed width at xs, but a fixed sibling exists, so the row does not
  // collapse - it takes the full width and the split happens at md.
  assert.equal(autoCol('a', ctx), 'col-12 col-md-3');
  assert.equal(autoCol('b', ctx), 'col-12 col-md-2');
});

test('an odd remainder is spread across breakpoints above xs', () => {
  const ctx = contextOf([
    { name: 'fixed', col: 'col-md-6' },
    { name: 'a' },
    { name: 'b' },
    { name: 'c' },
  ]);

  // 12 - 6 = 6 across 3 fields = 2 each, no remainder.
  assert.equal(autoCol('a', ctx), 'col-12 col-md-2');
  assert.equal(autoCol('c', ctx), 'col-12 col-md-2');

  const uneven = contextOf([
    { name: 'fixed', col: 'col-md-7' },
    { name: 'a' },
    { name: 'b' },
    { name: 'c' },
  ]);

  // 5 across 3 = base 1, extra 2 -> the first two fields get 2.
  assert.equal(autoCol('a', uneven), 'col-12 col-md-2');
  assert.equal(autoCol('c', uneven), 'col-12 col-md-1');
});

test('hidden siblings are excluded before anything is counted', () => {
  const ctx = contextOf(
    [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
    { hidden: ['c', 'd'] },
  );

  assert.equal(autoCol('a', ctx), 'col-6', 'four fields but two hidden, so two share 12');
});

test('cascading keeps a width for every active breakpoint', () => {
  const ctx = contextOf([
    { name: 'fixed', col: 'col-6 col-md-4' },
    { name: 'a' },
    { name: 'b' },
  ]);

  // xs: 12 - 6 = 6 / 2 = 3, md: 12 - 4 = 8 / 2 = 4.
  assert.equal(autoCol('a', ctx), 'col-3 col-md-4');
});
