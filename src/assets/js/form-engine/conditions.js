// Condition evaluation: `depends`, `required`, conditional labels and
// conditional validation copy all reduce to these three functions.
//
// Behaviour is ported from assets/js/form-engine.js (matchesValues,
// matchesValueCondition, evaluateDepends, labelText) and must stay compatible
// with it until add-property is migrated in Phase 5 - that is the plan's
// equivalence guarantee. Two quirks are intentional and covered by tests:
//
//  1. A group switches to OR if ANY entry carries `logic: or`. It is not
//     per-entry, the whole group changes mode.
//  2. An entry whose `when` gate does not hold counts as passed rather than
//     skipped, so an inactive gate never blocks and (in OR mode) matches.

/**
 * Reads a possibly dotted path out of the form data.
 * `location_widget.settlement` walks into nested objects.
 */
export function getDataValue(root, path) {
  if (root === null || root === undefined) return undefined;
  if (typeof path === 'string' && path.includes('.')) {
    let current = root;
    for (const key of path.split('.')) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }
  return root[path];
}

/**
 * Equality against `values` and/or negation against `except`.
 * With neither list present the condition is vacuously true.
 */
export function matchesValues(dataValue, values, except) {
  const hasValues = Array.isArray(values) && values.length > 0;
  const hasExcept = Array.isArray(except) && except.length > 0;

  if (!hasValues && !hasExcept) return true;

  if (hasValues) {
    const inValues = values.includes(dataValue);
    if (hasExcept) return inValues && !except.includes(dataValue);
    return inValues;
  }

  // `except` alone: only an explicitly empty value is treated as "not set".
  // An unset field stays visible, so `except: [land]` hides the row only once
  // the user actually picks "land" - matching form-engine.js:105.
  return dataValue !== '' && !except.includes(dataValue);
}

/**
 * Numeric comparison expressions such as `'>0'`, `'>=10'`, `'!=0'`.
 * A non-numeric value with `>0` means "present but not a number", which is how
 * widgets that hold free text participate in comparisons.
 */
export function matchesValueCondition(dataValue, condition) {
  if (typeof condition === 'number') return parseFloat(dataValue) === condition;
  if (typeof condition !== 'string') return false;

  const normalised = condition.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
  const match = normalised.match(/^\s*([><=!]+)\s*(\d+\.?\d*)\s*$/);
  if (!match) return false;

  const num = parseFloat(dataValue);
  const op = match[1];
  const target = parseFloat(match[2]);

  if (Number.isNaN(num)) {
    if (op === '>' && target === 0) return dataValue !== '' && dataValue !== null && dataValue !== undefined;
    return false;
  }

  switch (op) {
    case '>': return num > target;
    case '>=': return num >= target;
    case '<': return num < target;
    case '<=': return num <= target;
    case '==': return num === target;
    case '!=': return num !== target;
    default: return false;
  }
}

function matchesWhen(gate, getData) {
  if (!gate) return true;
  const value = getData(gate.field);
  if (Array.isArray(gate.values) && gate.values.length > 0) return gate.values.includes(value);
  if (gate.value !== undefined) return matchesValueCondition(value, gate.value);
  return true;
}

/** True when one condition entry holds. See the file header for gate quirks. */
export function matchesCondition(entry, getData) {
  if (!entry || typeof entry !== 'object') return false;
  if (!matchesWhen(entry.when, getData)) return true;

  if (!matchesValues(getData(entry.field), entry.values, entry.except)) return false;
  if (entry.value !== undefined && !matchesValueCondition(getData(entry.field), entry.value)) return false;
  return true;
}

/** Normalises the two shapes the DSL allows: a single condition or a list. */
export function asConditionList(deps) {
  if (!deps) return [];
  return Array.isArray(deps) ? deps : [deps];
}

/** Combined visibility of a `depends` group. See the file header for OR quirks. */
export function evaluateDepends(deps, getData) {
  const list = asConditionList(deps);
  if (list.length === 0) return true;

  const mode = list.some((entry) => entry && entry.logic === 'or') ? 'or' : 'and';

  if (mode === 'or') return list.some((entry) => matchesCondition(entry, getData));

  return list.every((entry) => matchesCondition(entry, getData));
}

/**
 * Resolves copy that varies with form state.
 *
 * Accepts every shape the v1 DSL allows: a plain string, a condition list, or a
 * default plus `depends` overrides where each entry may carry its own `text`.
 */
export function resolveConditionalText(spec, getData, fallback = '') {
  if (spec === null || spec === undefined) return fallback;
  if (typeof spec === 'string') return spec;
  if (typeof spec === 'number' || typeof spec === 'boolean') return String(spec);
  if (typeof spec !== 'object') return fallback;

  if (Array.isArray(spec)) {
    for (const entry of spec) {
      if (matchesCondition(entry, getData)) return entry.text ?? fallback;
    }
    return fallback;
  }

  if (spec.depends) {
    for (const entry of asConditionList(spec.depends)) {
      if (matchesCondition(entry, getData)) return entry.text ?? spec.text ?? fallback;
    }
    return spec.text ?? fallback;
  }

  if (typeof spec.text === 'string') return spec.text;
  return fallback;
}
