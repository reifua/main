import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateDepends,
  getDataValue,
  matchesCondition,
  matchesValueCondition,
  matchesValues,
  resolveConditionalText,
} from '../src/assets/js/form-engine/conditions.js';

const read = (data) => (path) => getDataValue(data, path);

test('getDataValue walks dotted paths and stops at missing links', () => {
  const data = { a: { b: { c: 'x' } }, plain: 'y' };

  assert.equal(getDataValue(data, 'a.b.c'), 'x');
  assert.equal(getDataValue(data, 'plain'), 'y');
  assert.equal(getDataValue(data, 'a.missing.c'), undefined);
  assert.equal(getDataValue(null, 'plain'), undefined);
  assert.equal(getDataValue({ 'a.b': 'keyed' }, 'a.b'), undefined, 'plain keys take priority only when there is no dot');
});

test('matchesValues: vacuous, equality, negation and the both-set case', () => {
  assert.equal(matchesValues('x', undefined, undefined), true, 'no lists means unconditional');
  assert.equal(matchesValues('x', [], []), true);

  assert.equal(matchesValues('land', ['land'], undefined), true);
  assert.equal(matchesValues('land', ['house', 'land'], undefined), true);
  assert.equal(matchesValues('room', ['house', 'land'], undefined), false);

  assert.equal(matchesValues('land', undefined, ['land']), false);
  assert.equal(matchesValues('house', undefined, ['land']), true);
  assert.equal(matchesValues('', undefined, ['land']), false, 'an empty value is never a real value');

  // Behaviour that matters in practice: `depends: [{field: x, except: [land]}]`
  // must keep the row visible before x has been answered at all.
  assert.equal(matchesValues(undefined, undefined, ['land']), true, 'unset means "not excluded yet"');

  assert.equal(matchesValues('land', ['land'], ['land']), false, 'values and except combine as AND');
  assert.equal(matchesValues('house', ['house', 'land'], ['land']), true);
});

test('matchesValueCondition parses comparison expressions', () => {
  assert.equal(matchesValueCondition('5', '>0'), true);
  assert.equal(matchesValueCondition('0', '>0'), false);
  assert.equal(matchesValueCondition('', '>0'), false);

  // A non-numeric value passes `>0`, which is how free-text widgets stay visible.
  assert.equal(matchesValueCondition('abc', '>0'), true);
  assert.equal(matchesValueCondition('abc', '>=5'), false);

  assert.equal(matchesValueCondition('10', '>=10'), true);
  assert.equal(matchesValueCondition('10', '>10'), false);
  assert.equal(matchesValueCondition('4', '<5'), true);
  assert.equal(matchesValueCondition('4', '!=4'), false);

  assert.equal(matchesValueCondition(4, 4), true);
  assert.equal(matchesValueCondition('4', 4), true, 'numeric literal coerces like the original');

  // Entities survive, because the YAML can arrive HTML-escaped.
  assert.equal(matchesValueCondition('4', '&gt;0'), true);
  assert.equal(matchesValueCondition('4', 'not a comparison'), false);
});

test('evaluateDepends defaults to AND', () => {
  const data = { type: 'house', has_land: 'yes' };
  const deps = [
    { field: 'type', values: ['house'] },
    { field: 'has_land', values: ['yes'] },
  ];

  assert.equal(evaluateDepends(deps, read(data)), true);

  data.has_land = 'no';
  assert.equal(evaluateDepends(deps, read(data)), false, 'one failing entry fails the group');
});

test('a single logic: or anywhere switches the whole group to OR', () => {
  const data = { a: 'no', b: 'yes' };
  const deps = [
    { field: 'a', values: ['yes'] },
    { field: 'b', values: ['yes'], logic: 'or' },
  ];

  assert.equal(evaluateDepends(deps, read(data)), true, 'OR is group-wide, not per entry');

  data.b = 'no';
  assert.equal(evaluateDepends(deps, read(data)), false, 'no entry matches');
});

test('an inactive when gate passes instead of blocking', () => {
  const data = { action_type: 'sale', period_rent: '' };

  // Gate does not hold, so the entry is treated as satisfied even though its
  // own value rule would fail. Documented quirk of form-engine.js:575-580.
  const deps = [
    { field: 'period_rent', value: '>0', when: { field: 'action_type', values: ['rent'] } },
  ];
  assert.equal(evaluateDepends(deps, read(data)), true);

  data.action_type = 'rent';
  assert.equal(evaluateDepends(deps, read(data)), false, 'once the gate holds the entry is live');
});

test('a missing depends group is unconditional', () => {
  assert.equal(evaluateDepends(undefined, read({})), true);
  assert.equal(evaluateDepends([], read({})), true);
  assert.equal(evaluateDepends({ field: 'x', values: ['y'] }, read({})), false, 'single object is accepted');
});

test('matchesCondition handles except on a live gate', () => {
  const data = { property_type: 'land' };

  assert.equal(matchesCondition({ field: 'property_type', except: ['land'] }, read(data)), false);
  assert.equal(matchesCondition({ field: 'property_type', except: ['house'] }, read(data)), true);

  assert.equal(
    matchesCondition({ field: 'property_type', except: ['land'], when: { field: 'type', values: ['x'] } }, read(data)),
    true,
    'inactive gate still passes',
  );
});

test('resolveConditionalText picks the first matching branch', () => {
  const data = { property_type: 'commercial' };
  const spec = {
    text: 'Максимум 99 кімнат',
    depends: [
      { field: 'property_type', values: ['commercial', 'garage'], text: 'Максимум 500 приміщень' },
    ],
  };

  assert.equal(resolveConditionalText(spec, read(data)), 'Максимум 500 приміщень');

  data.property_type = 'house';
  assert.equal(resolveConditionalText(spec, read(data)), 'Максимум 99 кімнат', 'falls back to the default');
});

test('resolveConditionalText accepts every DSL shape', () => {
  const get = read({ a: 'x' });

  assert.equal(resolveConditionalText('plain', get), 'plain');
  assert.equal(resolveConditionalText(undefined, get, 'fallback'), 'fallback');
  assert.equal(resolveConditionalText(null, get, 'fallback'), 'fallback');
  assert.equal(resolveConditionalText({ text: 'no depends' }, get), 'no depends', 'bare text is honoured');
  assert.equal(
    resolveConditionalText([{ field: 'a', values: ['x'], text: 'from list' }], get),
    'from list',
    'a bare condition list is honoured',
  );
  assert.equal(resolveConditionalText([{ field: 'a', values: ['other'], text: 'never' }], get, 'none'), 'none');
});
