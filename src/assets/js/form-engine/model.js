// Structural index over a form config.
//
// Replaces the module-level `fieldsCache`, `steps` and `fieldRowMap` in
// assets/js/form-engine.js:4-6. Those were shared by every form on the page, so
// a second form silently overwrote the first one's cache. Here the index is a
// value you create per instance and pass around, which is what makes multiple
// forms on one page safe.
//
// Shape walked, matching both the YAML and the Liquid templates:
//
//   steps[] -> rows[] -> cols[] -> rows[] -> fields[]
//
// There is exactly one traversal in this file; column and field layout both
// hang off it, so the shape cannot drift apart between callers.

/**
 * Visits every field under `rows`, passing its enclosing row.
 * Handles both nesting depths: fields directly on a row, and rows inside cols.
 */
export function eachField(rows, visit) {
  for (const row of rows || []) {
    for (const field of row.fields || []) visit(field, row);
    for (const col of row.cols || []) eachField(col.rows, visit);
  }
}

/** Collects the fields of one step, in document order. */
export function collectStepFields(step) {
  const found = [];
  if (step) eachField(step.rows, (field) => found.push(field));
  return found;
}

/**
 * Index for one form.
 *
 * @returns {{
 *   config: object,
 *   steps: object[],
 *   fields: object[],
 *   byName: Map<string, object>,
 *   rowInfo: Map<string, {auto: boolean, siblings: string[]}>,
 * }}
 */
export function buildModel(config) {
  const fields = [];
  const rowInfo = new Map();
  const steps = (config && config.steps) || [];

  for (const step of steps) {
    eachField(step.rows, (field, row) => {
      fields.push(field);
      if (!field.name) return;
      if (rowInfo.has(field.name)) return;
      rowInfo.set(field.name, {
        auto: !!row.auto,
        siblings: (row.fields || []).map((f) => f.name).filter(Boolean),
      });
    });
  }

  const byName = new Map();
  for (const field of fields) {
    if (field.name && !byName.has(field.name)) byName.set(field.name, field);
  }

  return { config, steps, fields, byName, rowInfo };
}

/** True when any step mounts a `widgets` field of the given widget name. */
export function hasWidget(model, name) {
  return model.fields.some((f) => f.type === 'widgets' && f.widget === name);
}

/** Fields that make up a single step, in document order. */
export function stepFields(model, index) {
  const step = model.steps[index];
  return step ? collectStepFields(step) : [];
}
