import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeController } from '../src/assets/js/form-engine/controller.js';
import { bindForm } from '../src/assets/js/form-engine/binder.js';
import { bootstrap4 } from '../src/assets/js/form-engine/themes/bootstrap4.js';
import { tailwind } from '../src/assets/js/form-engine/themes/tailwind.js';

// ----------------------------------------------------------- element shim ----

/** A stub element: the small DOM surface binder.js depends on. */
function el(tag, attrs = {}) {
  const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
  return {
    tagName: tag.toUpperCase(),
    value: attrs.value !== undefined ? String(attrs.value) : '',
    checked: !!attrs.checked,
    textContent: '',
    style: {},
    children: [],
    hidden: attrs.hidden !== undefined ? !!attrs.hidden : false,
    _attrs: { ...attrs },
    handlers: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    getAttribute(name) {
      return name in this._attrs ? String(this._attrs[name]) : null;
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this._attrs[name];
    },
    addEventListener(type, fn) {
      (this.handlers[type] = this.handlers[type] || []).push(fn);
    },
    fire(type) {
      for (const fn of this.handlers[type] || []) fn();
    },
  };
}

/** Parser for the small selector subset the binder uses. */
function parseSelector(selector) {
  const m = /^([a-z]*)((?:(?:\[[^\]]*\])|(?:\.[\w-]+))*)$/i.exec(selector);
  assert.ok(m, `unsupported selector in shim: ${selector}`);
  const attrs = [];
  const classes = [];
  for (const token of (m[2].match(/\[[^\]]*\]|\.[\w-]+/g) || [])) {
    if (token[0] === '.') {
      classes.push(token.slice(1));
      continue;
    }
    const body = token.slice(1, -1);
    const eq = body.indexOf('=');
    if (eq === -1) attrs.push({ name: body, op: null, value: '' });
    else attrs.push({ name: body.slice(0, eq).trim(), op: '=', value: body.slice(eq + 2, -1) });
  }
  return { tag: (m[1] || '').toUpperCase(), classes, attrs };
}

function matches(node, { tag, classes, attrs }) {
  if (tag && (node.tagName || '').toUpperCase() !== tag) return false;
  if (!classes.every((c) => node.classList && node.classList.contains(c))) return false;
  return attrs.every(({ name, op, value }) => {
    const current = node.getAttribute(name);
    return op === null ? current !== null : current === value;
  });
}

/** An element that knows its children, so querySelectorAll actually works. */
function tree(tag, attrs = {}) {
  const node = el(tag, attrs);
  node.querySelectorAll = function querySelectorAll(selector) {
    const parsed = parseSelector(selector);
    const found = [];
    const walk = (n) => {
      for (const child of n.children) {
        if (matches(child, parsed)) found.push(child);
        walk(child);
      }
    };
    walk(node);
    return found;
  };
  node.appendChild = (child) => node.children.push(child);
  return node;
}

const wrap = (...nodes) => {
  const form = tree('form', { class: 'row' });
  for (const n of nodes) form.appendChild(n);
  return form;
};

// ------------------------------------------------------------- notify form ---

function makeNotifyForm() {
  const reason = tree('select', { class: 'form-control', 'data-field': 'reason', required: true });
  const reasonMarker = tree('span', { 'data-required-marker': 'reason', class: 'text-danger' });
  const details = tree('textarea', { class: 'form-control', 'data-field': 'details' });
  const detailsClear = tree('button', { 'data-clear': 'details', hidden: true });
  const contactName = tree('input', { type: 'text', class: 'form-control', 'data-field': 'contact_name' });
  const contactNameClear = tree('button', { 'data-clear': 'contact_name', hidden: true });
  const tag = tree('input', { type: 'text', class: 'form-control', 'data-field': 'tag' });
  const tagError = tree('span', { 'data-error': 'tag' });
  const timestamp = tree('input', { type: 'hidden', 'data-field': 'timestamp' });

  const form = wrap(reason, reasonMarker, details, detailsClear, contactName, contactNameClear, tag, tagError, timestamp);
  return { form, reason, reasonMarker, details, detailsClear, contactName, contactNameClear, tag, tagError, timestamp };
}

const config = {
  version: 1,
  id: 'demo',
  steps: [{
    id: 'one',
    rows: [{
      class: 'row',
      fields: [
        { name: 'reason', type: 'select', required: true },
        { name: 'details', type: 'textarea', pattern: '^[а-яА-ЯіїєґІЇЄҐ]+$', validation: { pattern: 'Тільки кирилиця' } },
        { name: 'contact_name', type: 'text', pattern: '^[а-яА-ЯіїєґІЇЄҐ]+$', validation: { pattern: 'Тільки кирилиця' } },
        { name: 'tag', type: 'text', pattern: '^[а-яА-ЯіїєґІЇЄҐ]+$', validation: { pattern: 'Тільки кирилиця' } },
        { name: 'timestamp', type: 'hidden' },
      ],
    }],
  }],
};

function attach(parts) {
  const controller = makeController(config);
  bindForm(parts.form, controller);
  return controller;
}

// ---------------------------------------------------------------- tests ----

test('a wrong character turns details red through the controller', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  parts.details.value = '123';
  parts.details.fire('input');

  assert.equal(controller.fieldError('details'), 'Тільки кирилиця');
  assert.ok(parts.details.classList.contains('is-invalid'));
  assert.ok(!parts.details.classList.contains('is-valid'));

  parts.details.value = 'Добро';
  parts.details.fire('input');
  assert.equal(controller.fieldError('details'), '');
  assert.ok(parts.details.classList.contains('is-valid'));
});

test('an empty optional field collects no validity class', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  controller.validateAll();
  assert.equal(controller.fieldError('contact_name'), '');
  assert.ok(!parts.contactName.classList.contains('is-invalid'));
  assert.ok(!parts.contactName.classList.contains('is-valid'));
});

test('reason blocks the submit until a value is picked', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  assert.equal(controller.validateAll(), false);
  assert.ok(parts.reason.classList.contains('is-invalid'), 'required select is flagged');

  parts.reason.value = 'duplicate';
  parts.reason.fire('change');
  assert.equal(controller.validateAll(), true);
  assert.ok(parts.reason.classList.contains('is-valid'));
  assert.ok(!parts.reason.classList.contains('is-invalid'));
});

test('the data-error span receives the resolved message', () => {
  const parts = makeNotifyForm();
  attach(parts);

  parts.tag.value = 'abc123';
  parts.tag.fire('input');
  assert.equal(parts.tagError.textContent, 'Тільки кирилиця');
});

test('a valid value fills the error span back to empty', () => {
  const parts = makeNotifyForm();
  attach(parts);

  parts.tag.value = 'abc123';
  parts.tag.fire('input');
  parts.tag.value = 'Вентиль';
  parts.tag.fire('input');

  assert.equal(parts.tagError.textContent, '');
  assert.ok(parts.tag.classList.contains('is-valid'));
});

test('the clear button appears with content and empties the field', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  assert.ok(parts.detailsClear.hidden, 'starts hidden');

  parts.details.value = 'Опис';
  parts.details.fire('input');
  assert.ok(!parts.detailsClear.hidden, 'shows once there is content');

  parts.detailsClear.fire('click');
  assert.equal(parts.details.value, '');
  assert.equal(controller.getValue('details'), '');
  assert.ok(parts.detailsClear.hidden, 'hides again after clearing');
});

test('hidden inputs never get validity classes', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  controller.setData('timestamp', Date.now());
  assert.ok(!parts.timestamp.classList.contains('is-valid'));
  assert.ok(!parts.timestamp.classList.contains('is-invalid'));
});

test('the required marker stays visible for a statically required field', () => {
  const parts = makeNotifyForm();
  attach(parts);

  assert.equal(parts.reasonMarker.hidden, false);
});

test('a checkbox_group collects its checked values into an array', () => {
  const cfg = {
    version: 1,
    id: 'group',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'comms', type: 'checkbox_group', options: [{ value: 'phone' }, { value: 'email' }, { value: 'post' }] },
    ] }] }],
  };
  const a = tree('input', { type: 'checkbox', value: 'phone', name: 'comms', 'data-group': 'comms', 'data-field': 'comms' });
  const b = tree('input', { type: 'checkbox', value: 'email', name: 'comms', 'data-group': 'comms', 'data-field': 'comms' });
  const c = tree('input', { type: 'checkbox', value: 'post', name: 'comms', 'data-group': 'comms', 'data-field': 'comms' });
  const form = wrap(a, b, c);
  const controller = makeController(cfg);
  bindForm(form, controller);

  b.checked = true;
  c.checked = true;
  b.fire('change');
  assert.deepEqual(controller.getValue('comms'), ['email', 'post']);

  b.checked = false;
  b.fire('change');
  assert.deepEqual(controller.getValue('comms'), ['post'], 'unchecking a box drops that value');

  c.checked = false;
  c.fire('change');
  assert.deepEqual(controller.getValue('comms'), [], 'an empty group is an empty array, not a boolean');
});

test('steps toggle with the wizard', () => {
  const twoStep = {
    version: 1,
    id: 'wizard',
    steps: [
      { id: 'a', rows: [{ class: 'row', fields: [{ name: 'x', type: 'text' }] }] },
      { id: 'b', rows: [{ class: 'row', fields: [{ name: 'y', type: 'text' }] }] },
    ],
  };

  const step1 = tree('div', { 'data-step': '1' });
  const step2 = tree('div', { 'data-step': '2' });
  const form = wrap(step1, step2);
  const controller = makeController(twoStep);
  bindForm(form, controller);

  assert.equal(step1.hidden, false, 'first step shows');
  assert.equal(step2.hidden, true, 'second step is hidden initially');

  controller.next();
  assert.equal(step1.hidden, true, 'first step hides after next()');
  assert.equal(step2.hidden, false, 'second step shows');

  controller.prev();
  assert.equal(step1.hidden, false);
});

test('a failed next() draws the step errors instead of failing silently', () => {
  const twoStep = {
    version: 1,
    id: 'wizard',
    settings: { required: { message: 'Заповніть поле' } },
    steps: [
      { id: 'a', rows: [{ class: 'row', fields: [{ name: 'x', type: 'text', required: true }] }] },
      { id: 'b', rows: [{ class: 'row', fields: [{ name: 'y', type: 'text' }] }] },
    ],
  };

  const step1 = tree('div', { 'data-step': '1' });
  const step2 = tree('div', { 'data-step': '2' });
  const x = tree('input', { type: 'text', class: 'form-control', 'data-field': 'x' });
  const xError = tree('span', { 'data-error': 'x' });
  const y = tree('input', { type: 'text', class: 'form-control', 'data-field': 'y' });
  step1.appendChild(x);
  step1.appendChild(xError);
  step2.appendChild(y);
  const form = wrap(step1, step2);

  const controller = makeController(twoStep);
  bindForm(form, controller);

  assert.equal(controller.next(), false, 'x is required and empty');
  assert.equal(controller.step(), 0, 'still on the first step');
  assert.ok(x.classList.contains('is-invalid'), 'the empty required input turns red');
  assert.equal(xError.textContent, 'Заповніть поле', 'the error text reaches the span');
  assert.equal(y.classList.contains('is-invalid'), false, 'nothing on the second step');

  x.value = 'Готово';
  x.fire('input');
  assert.equal(controller.next(), true, 'a filled field lets the wizard move on');
  assert.equal(step1.hidden, true);
  assert.equal(step2.hidden, false);
});

test('a server error renders and survives a client validation pass', () => {
  const parts = makeNotifyForm();
  const controller = attach(parts);

  parts.tag.value = 'Вентиль';
  parts.tag.fire('input');
  assert.ok(parts.tag.classList.contains('is-valid'));

  controller.setServerErrors({ tag: 'Тег уже зайнятий' });
  assert.ok(parts.tag.classList.contains('is-invalid'), 'server error paints the control red');
  assert.equal(parts.tagError.textContent, 'Тег уже зайнятий');

  controller.validateAll();
  assert.equal(parts.tagError.textContent, 'Тег уже зайнятий',
    'a client validation pass must not overwrite the server report (legacy: 688,710)');
  assert.ok(parts.tag.classList.contains('is-invalid'));

  parts.tag.value = 'Капуста';
  parts.tag.fire('input');
  assert.equal(parts.tagError.textContent, '', 'editing the field clears its own server error');
  assert.ok(!parts.tag.classList.contains('is-invalid'));
  assert.ok(parts.tag.classList.contains('is-valid'));
});

test('two forms bound on one page stay completely separate', () => {
  const a = makeNotifyForm();
  const b = makeNotifyForm();
  const ca = attach(a);
  const cb = attach(b);

  a.tag.value = 'abc123';
  a.tag.fire('input');
  assert.equal(ca.fieldError('tag'), 'Тільки кирилиця');
  assert.equal(cb.fieldError('tag'), '', 'the twin form does not see the write');
  assert.ok(a.tag.classList.contains('is-invalid'));
  assert.ok(!b.tag.classList.contains('is-invalid'), 'classes stay on the owning form');

  ca.validateAll();
  assert.ok(a.reason.classList.contains('is-invalid'), 'form a flags its own empty required select');
  assert.ok(!b.reason.classList.contains('is-invalid'), 'form b is not flagged');

  cb.setServerErrors({ tag: 'зайнято на формі b' });
  assert.equal(b.tagError.textContent, 'зайнято на формі b');
  assert.equal(a.tagError.textContent, 'Тільки кирилиця',
    'the other form keeps its own error text in its own span');
});

test('the invalid/valid classes are theme-configurable, bootstrap by default', () => {
  const parts = makeNotifyForm();
  const form = parts.form;
  const controller = makeController(config);
  bindForm(form, controller, {
    classes: { invalid: 'border-red-500', valid: 'border-green-500' },
  });

  controller.validateAll();
  assert.ok(parts.reason.classList.contains('border-red-500'));
  assert.ok(!parts.reason.classList.contains('is-invalid'),
    'the bootstrap default is not touched when classes are given');

  for (const control of form.querySelectorAll('[data-field]')) {
    if (control.getAttribute('type') === 'hidden') continue;
    if (control === parts.reason) continue;
    assert.equal(control.classList.contains('border-red-500'), false);
  }
});

test('both built-in themes expose the same validation class vocabulary', () => {
  assert.deepEqual(bootstrap4.validationClasses, { invalid: 'is-invalid', valid: 'is-valid' });
  assert.deepEqual(tailwind.validationClasses, bootstrap4.validationClasses,
    'the glue passes theme.validationClasses to bindForm, so the themes must agree');
});

test('a data-depends column hides and shows with its trigger', () => {
  const cfg = {
    version: 1,
    id: 'dep',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'role', type: 'select', options: [{ value: 'owner' }, { value: 'tenant' }] },
      { name: 'extra', type: 'text', depends: [{ field: 'role', values: ['owner'] }] },
    ] }] }],
  };
  const dependsAttr = JSON.stringify([{ field: 'role', values: ['owner'] }]);

  // The theme emits the dependency on the column that owns the field, not on
  // the control (renderField: data-field-col + data-depends + hidden).
  const trigger = tree('select', { 'data-field': 'role' });
  const col = tree('div', { 'data-field-col': 'extra', 'data-depends': dependsAttr, hidden: true });
  const input = tree('input', { type: 'text', class: 'form-control', 'data-field': 'extra' });
  col.appendChild(input);
  const form = wrap(trigger, col);

  const controller = makeController(cfg);
  bindForm(form, controller);

  assert.equal(col.hidden, true, 'an empty trigger leaves the column hidden');

  trigger.value = 'owner';
  trigger.fire('change');
  assert.equal(col.hidden, false, 'matching the trigger reveals the column');

  trigger.value = 'tenant';
  trigger.fire('change');
  assert.equal(col.hidden, true, 'a non-matching trigger hides it again');
});

test('auto row columns recompute as the sibling fields are revealed', () => {
  const cfg = {
    version: 1,
    id: 'auto',
    steps: [{ id: 'a', rows: [{ class: 'row', auto: true, fields: [
      { name: 'kind', type: 'select', options: [{ value: 'flat' }, { value: 'land' }] },
      { name: 'rooms', type: 'number', col: 'col-6 col-md-4',
        depends: [{ field: 'kind', values: ['flat'] }] },
      { name: 'floor', type: 'number', col: 'col-6 col-md-4',
        depends: [{ field: 'kind', values: ['flat'] }] },
    ] }] }],
  };
  const dependsAttr = JSON.stringify([{ field: 'kind', values: ['flat'] }]);

  const trigger = tree('select', { 'data-field': 'kind' });
  const roomsCol = tree('div', {
    'data-field-col': 'rooms', 'data-depends': dependsAttr, class: 'col-6 col-md-4', hidden: true,
  });
  const floorCol = tree('div', {
    'data-field-col': 'floor', 'data-depends': dependsAttr, class: 'col-6 col-md-4', hidden: true,
  });
  const form = wrap(trigger, roomsCol, floorCol);

  const controller = makeController(cfg);
  bindForm(form, controller);

  assert.equal(roomsCol.className, 'col-12',
    'nothing else is visible, so the row collapses on the first paint');
  assert.equal(floorCol.className, 'col-12');

  trigger.value = 'flat';
  trigger.fire('change');

  assert.equal(roomsCol.hidden, false, 'the trigger reveals the columns');
  assert.equal(roomsCol.className, 'col-6 col-md-4',
    'two or more visible siblings hand the configured width back');
  assert.equal(floorCol.className, 'col-6 col-md-4');

  trigger.value = 'land';
  trigger.fire('change');
  assert.equal(roomsCol.className, 'col-12', 'hiding them again collapses the row');
});

test('a theme col mapper translates the auto-row classes it injects', () => {
  const cfg = {
    version: 1,
    id: 'auto-tw',
    steps: [{ id: 'a', rows: [{ class: 'grid grid-cols-12 gap-4', auto: true, fields: [
      { name: 'kind', type: 'select', options: [{ value: 'flat' }, { value: 'land' }] },
      { name: 'rooms', type: 'number', col: 'col-6 col-md-4',
        depends: [{ field: 'kind', values: ['flat'] }] },
      { name: 'floor', type: 'number', col: 'col-6 col-md-4',
        depends: [{ field: 'kind', values: ['flat'] }] },
    ] }] }],
  };
  const dependsAttr = JSON.stringify([{ field: 'kind', values: ['flat'] }]);

  const trigger = tree('select', { 'data-field': 'kind' });
  const roomsCol = tree('div', {
    'data-field-col': 'rooms', 'data-depends': dependsAttr, class: 'col-span-12', hidden: true,
  });
  const floorCol = tree('div', {
    'data-field-col': 'floor', 'data-depends': dependsAttr, class: 'col-span-12', hidden: true,
  });
  const form = wrap(trigger, roomsCol, floorCol);

  const controller = makeController(cfg);
  bindForm(form, controller, { colClass: tailwind.colClass });

  assert.equal(roomsCol.className, 'col-span-12',
    'the Bootstrap col-12 collapses to the Tailwind full-width span');

  trigger.value = 'flat';
  trigger.fire('change');

  assert.equal(roomsCol.className, 'col-span-6 md:col-span-4',
    'the configured width comes back in Tailwind vocabulary');
  assert.equal(floorCol.className, 'col-span-6 md:col-span-4');
});

test('invalid and valid feedback blocks follow the field state', () => {
  const cfg = {
    version: 1,
    id: 'fb',
    settings: { feedback: { pattern: 'Тільки кирилиця' } },
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'note', type: 'text', pattern: '^[а-яА-ЯіїєґІЇЄҐ]+$' },
    ] }] }],
  };

  const col = tree('div', { 'data-field-col': 'note' });
  const input = tree('input', { type: 'text', class: 'form-control', 'data-field': 'note' });
  const invalid = tree('div', { class: 'invalid-feedback' });
  const valid = tree('div', { class: 'valid-feedback' });
  col.appendChild(input);
  col.appendChild(invalid);
  col.appendChild(valid);
  const form = wrap(col);

  const controller = makeController(cfg);
  bindForm(form, controller);

  assert.equal(invalid.style.display, 'none', 'an empty field shows neither block');
  assert.equal(valid.style.display, 'none');

  input.value = 'abc123';
  input.fire('input');
  assert.equal(invalid.style.display, 'block', 'a broken value reveals the error copy');
  assert.equal(valid.style.display, 'none');

  input.value = 'Вентиль';
  input.fire('input');
  assert.equal(invalid.style.display, 'none');
  assert.equal(valid.style.display, 'block', 'a valid value reveals the success copy');
});

test('widget names take part in the same feedback sync', () => {
  const cfg = {
    version: 1,
    id: 'w',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'guard', type: 'widgets', widget: 'captcha', required: false },
    ] }] }],
  };

  const shell = tree('div', { 'data-widget-name': 'guard' });
  const invalid = tree('div', { class: 'invalid-feedback' });
  const span = tree('span', { 'data-error': 'guard' });
  invalid.appendChild(span);
  shell.appendChild(invalid);
  const form = wrap(shell);

  const controller = makeController(cfg);
  bindForm(form, controller);

  assert.equal(invalid.style.display, 'none');
  assert.equal(span.textContent, '');

  controller.setGlueError('guard', 'Підтвердіть, що ви не робот');
  assert.equal(invalid.style.display, 'block');
  assert.equal(span.textContent, 'Підтвердіть, що ви не робот');

  controller.clearGlueError('guard');
  assert.equal(invalid.style.display, 'none');
});

test('an untouched single checkbox stays neutral until the user acts', () => {
  const cfg = {
    version: 1,
    id: 'cb',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'agree', type: 'checkbox', required: true },
    ] }] }],
  };

  const col = tree('div', { 'data-field-col': 'agree' });
  const cb = tree('input', { type: 'checkbox', class: 'custom-control-input', 'data-field': 'agree' });
  const invalid = tree('div', { class: 'invalid-feedback' });
  const valid = tree('div', { class: 'valid-feedback' });
  col.appendChild(cb);
  col.appendChild(invalid);
  col.appendChild(valid);
  const form = wrap(col);

  // buildData initialises a single checkbox to `false` (form-add-property.js).
  const controller = makeController(cfg, { data: { agree: false } });
  bindForm(form, controller);

  assert.equal(cb.classList.contains('is-valid'), false, 'untouched empty checkbox shows no green');
  assert.equal(cb.classList.contains('is-invalid'), false, 'and no red either');
  assert.equal(valid.style.display, 'none', 'no success copy before any action');
  assert.equal(invalid.style.display, 'none', 'no error copy before any action');

  cb.checked = true;
  cb.fire('change');
  assert.ok(cb.classList.contains('is-valid'), 'a checked required checkbox is green');
  assert.equal(valid.style.display, 'block');
  assert.equal(invalid.style.display, 'none');

  cb.checked = false;
  cb.fire('change');
  assert.ok(cb.classList.contains('is-invalid'), 'an unchecked required checkbox is red');
  assert.equal(invalid.style.display, 'block');
  assert.equal(valid.style.display, 'none');
});

test('an empty checkbox_group is not painted valid at boot', () => {
  const cfg = {
    version: 1,
    id: 'grp',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'comms', type: 'checkbox_group', options: [{ value: 'phone' }, { value: 'email' }] },
    ] }] }],
  };
  const a = tree('input', { type: 'checkbox', value: 'phone', name: 'comms', 'data-group': 'comms', 'data-field': 'comms' });
  const b = tree('input', { type: 'checkbox', value: 'email', name: 'comms', 'data-group': 'comms', 'data-field': 'comms' });
  const form = wrap(a, b);

  // buildData initialises a checkbox_group to `[]` - an empty array must not
  // count as "filled" or every group would be green on load.
  const controller = makeController(cfg, { data: { comms: [] } });
  bindForm(form, controller);

  assert.equal(a.classList.contains('is-valid'), false);
  assert.equal(b.classList.contains('is-valid'), false);

  a.checked = true;
  a.fire('change');
  assert.equal(controller.getValue('comms').length, 1);
  assert.ok(a.classList.contains('is-valid'), 'a non-empty group paints valid');
});

test('checkbox_group option labels light up with the values they hold', () => {
  const cfg = {
    version: 1,
    id: 'grp-active',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'comms', type: 'checkbox_group', options: [{ value: 'phone' }, { value: 'email' }] },
    ] }] }],
  };
  const mkOption = (value) => {
    const label = tree('label', { 'data-toggle-for': 'comms', 'data-value': value });
    label.appendChild(tree('input', {
      type: 'checkbox', value, name: 'comms', 'data-group': 'comms', 'data-field': 'comms',
    }));
    return label;
  };
  const phone = mkOption('phone');
  const email = mkOption('email');
  const form = wrap(phone, email);

  const controller = makeController(cfg, { data: { comms: ['email'] } });
  bindForm(form, controller);

  assert.equal(phone.classList.contains('active'), false, 'a value that is not checked stays plain');
  assert.equal(email.classList.contains('active'), true, 'a preset value lights its label up');

  const phoneInput = phone.children[0];
  phoneInput.checked = true;
  phoneInput.fire('change');
  assert.ok(phone.classList.contains('active'), 'checking a box activates its label');
  assert.ok(email.classList.contains('active'), 'the other checked box keeps its label');

  phoneInput.checked = false;
  phoneInput.fire('change');
  assert.equal(phone.classList.contains('active'), false, 'unchecking clears the label again');
  assert.ok(email.classList.contains('active'), 'and leaves the still-checked one alone');
});

test('an empty required number input stays neutral until filled', () => {
  const cfg = {
    version: 1,
    id: 'num',
    settings: { required: { message: 'Вкажіть кількість' } },
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'rooms', type: 'number', required: true, min: 1 },
    ] }] }],
  };
  const input = tree('input', { type: 'number', class: 'form-control', 'data-field': 'rooms' });
  const col = tree('div', { 'data-field-col': 'rooms' });
  const invalid = tree('div', { class: 'invalid-feedback' });
  const valid = tree('div', { class: 'valid-feedback' });
  col.appendChild(input);
  col.appendChild(invalid);
  col.appendChild(valid);
  const form = wrap(col);

  const controller = makeController(cfg);
  bindForm(form, controller);

  assert.equal(input.classList.contains('is-valid'), false, 'empty number shows nothing at boot');
  assert.equal(input.classList.contains('is-invalid'), false);
  assert.equal(valid.style.display, 'none');

  input.value = '2';
  input.fire('input');
  assert.ok(input.classList.contains('is-valid'), 'a filled required number is green');
  assert.equal(valid.style.display, 'block');

  input.value = '';
  input.fire('input');
  assert.ok(input.classList.contains('is-invalid'), 'clearing it turns it red');
  assert.equal(invalid.style.display, 'block');
  assert.equal(valid.style.display, 'none');
});

test('a cascade parent change does not paint its dependent field red until engaged', () => {
  const cfg = {
    version: 1,
    id: 'kaskad',
    settings: { required: { message: 'Заповніть поле' } },
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'property_type', type: 'select' },
      {
        name: 'rooms',
        type: 'number',
        required: { depends: [{ field: 'property_type', values: ['commercial'] }] },
      },
    ] }] }],
  };

  const col = tree('div', { 'data-field-col': 'rooms' });
  const type = tree('select', { class: 'form-control', 'data-field': 'property_type' });
  const input = tree('input', { type: 'number', class: 'form-control', 'data-field': 'rooms' });
  const invalid = tree('div', { class: 'invalid-feedback' });
  const span = tree('span', { 'data-error': 'rooms' });
  const valid = tree('div', { class: 'valid-feedback' });
  invalid.appendChild(span);
  col.appendChild(input);
  col.appendChild(invalid);
  col.appendChild(valid);
  const form = wrap(type, col);

  const controller = makeController(cfg);
  bindForm(form, controller);

  type.value = 'commercial';
  type.fire('change');
  assert.equal(controller.fieldError('rooms'), 'Заповніть поле', 'the rule fires for logic');
  assert.equal(input.classList.contains('is-invalid'), false,
    'the freshly revealed required field stays neutral until the user touches it');
  assert.equal(span.textContent, '', 'no error copy reaches the page yet');
  assert.equal(invalid.style.display, 'none');

  input.value = '';
  input.fire('input');
  assert.ok(input.classList.contains('is-invalid'), 'engaging the field turns the empty required one red');
  assert.equal(span.textContent, 'Заповніть поле');
  assert.equal(invalid.style.display, 'block', 'the feedback block joins the engaged error');

  input.value = '2';
  input.fire('input');
  assert.ok(input.classList.contains('is-valid'), 'a filled dependent field is green');
  assert.equal(invalid.style.display, 'none');
});

test('autocomplete search validity classes belong to the page glue, not the binder', () => {
  const cfg = {
    version: 1,
    id: 'ac-hand-off',
    steps: [{ id: 'a', rows: [{ class: 'row', fields: [
      { name: 'district', type: 'autocomplete' },
      { name: 'other', type: 'text' },
    ] }] }],
  };
  const search = tree('input', { class: 'form-control', 'data-autocomplete-search': 'district' });
  search.value = 'query';
  const other = tree('input', { type: 'text', class: 'form-control', 'data-field': 'other' });
  const form = wrap(search, other);

  const controller = makeController(cfg);
  bindForm(form, controller);
  search.classList.add('is-invalid');

  controller.setData('other', 'x');

  assert.ok(search.classList.contains('is-invalid'),
    'syncing another field must not clear the glue-owned invalid state');
});