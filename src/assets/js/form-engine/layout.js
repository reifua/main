// Grid layout: turning a row's `auto: true` into concrete Bootstrap column
// classes for each visible field.
//
// Ported from autoCol/parseGridClasses in assets/js/form-engine.js:83-94,422-550.
// That code reads global `fieldRowMap` and the module-level field cache, which
// is exactly the shared state Phase 2 removes; here everything it needs is
// passed in, so the algorithm is testable without a DOM or a page.

const BP_ORDER = ['xs', 'sm', 'md', 'lg', 'xl'];
const BP_RANK = { sm: 1, md: 2, lg: 3, xl: 4 };
// The captured group keeps its trailing dash: `col-md-4` captures `md-`.
const CAPTURED_BP = { 'sm-': 'sm', 'md-': 'md', 'lg-': 'lg', 'xl-': 'xl' };

/**
 * Parses Bootstrap column classes into breakpoint -> span.
 * `col-6 col-md-4` becomes `{ xs: 6, md: 4 }`.
 */
export function parseGridClasses(colStr) {
  if (!colStr || typeof colStr !== 'string') return {};

  const spans = {};
  const reCol = /col-(?:(sm-|md-|lg-|xl-))?(\d+)/g;
  const reSpan = /col-span-(?:(sm-|md-|lg-|xl-))?(\d+)/g;
  let match;
  while ((match = reCol.exec(colStr)) !== null) {
    const bp = CAPTURED_BP[match[1]] || 'xs';
    spans[bp] = parseInt(match[2], 10);
  }
  while ((match = reSpan.exec(colStr)) !== null) {
    const bp = CAPTURED_BP[match[1]] || 'xs';
    spans[bp] = parseInt(match[2], 10);
  }

  // Bootstrap widens a breakpoint downward: md-4 also applies at sm and xs.
  // Keeping only the explicit sizes here, and cascading separately, keeps the
  // "what the config asked for" and "what the browser does" concerns apart.
  return spans;
}

/** Applies Bootstrap's downward cascade: md-4 implies sm-4 and xs-4. */
function cascade(spans) {
  const out = {};
  let previous;
  for (const bp of BP_ORDER) {
    if (spans[bp] !== undefined) previous = spans[bp];
    if (previous !== undefined) out[bp] = previous;
  }
  return out;
}

function sortedBreakpoints(spanSet) {
  return Object.keys(spanSet)
    .filter((bp) => bp !== 'xs')
    .sort((a, b) => BP_RANK[a] - BP_RANK[b]);
}

/**
 * Column classes for one field inside an `auto: true` row.
 *
 * @param {string} fieldName
 * @param {{ rowInfo: Map<string, {auto:boolean, siblings:string[]}>,
 *           byName: Map<string, object>,
 *           isVisible: (name: string) => boolean }} ctx
 * @returns {string} Bootstrap column classes
 */
export function autoCol(fieldName, ctx) {
  const info = ctx.rowInfo.get(fieldName);
  if (!info || !info.auto) return 'col-12';

  // Legacy order (form-engine.js:426-437): count visible siblings first. A row
  // with none or one field showing collapses to the full width - even when
  // this field pins its own `col`. Only once two or more show does the
  // config's `col` win over the distribution. The legacy page re-ran autoCol
  // on every change (`:class="autoCol(...)"`); the binder replays that at
  // runtime (syncAutoCols), so a baked `col-12` for a hidden field becomes
  // the field's own width the moment a sibling is revealed.
  const visible = info.siblings.filter((name) => ctx.isVisible(name));
  if (visible.length <= 1) return 'col-12';

  const me = ctx.byName.get(fieldName);
  if (me && me.col) return me.col;

  // What the fixed siblings pinned at which breakpoints.
  const fixedSpans = [];
  const spanSet = {};
  let fixedCount = 0;
  for (const name of visible) {
    const field = ctx.byName.get(name);
    if (!field || !field.col) continue;
    const spans = parseGridClasses(field.col);
    fixedSpans.push(spans);
    for (const bp of Object.keys(spans)) spanSet[bp] = true;
    fixedCount++;
  }

  const active = ['xs', ...sortedBreakpoints(spanSet)];
  const cascaded = fixedSpans.map(cascade);
  const autoCount = visible.length - fixedCount;
  const result = {};

  for (const bp of active) {
    let fixed = 0;
    let anyFixed = false;
    for (const c of cascaded) {
      if (c[bp] !== undefined) {
        fixed += c[bp];
        anyFixed = true;
      }
    }

    if (!anyFixed) {
      result[bp] = fixedCount === 0 ? Math.floor(12 / autoCount) : 12;
      continue;
    }

    const remaining = 12 - fixed;
    result[bp] = remaining < autoCount ? 12 : Math.floor(remaining / autoCount);
  }

  // Spread leftover columns across the auto fields on each real breakpoint, so
  // a 12-wide row with 4 fields lands on 4/4/4 rather than 3/3/3.
  for (const bp of active.slice(1)) {
    let fixed = 0;
    for (const c of cascaded) if (c[bp] !== undefined) fixed += c[bp];

    const remaining = 12 - fixed;
    if (remaining > 0 && remaining < autoCount) {
      result[bp] = 12;
      continue;
    }
    if (remaining < autoCount) continue;

    const base = Math.floor(remaining / autoCount);
    const extra = remaining - base * autoCount;

    let index = 0;
    for (const name of visible) {
      const field = ctx.byName.get(name);
      if (field && field.col) continue;
      if (name === fieldName) break;
      index++;
    }

    result[bp] = base + (index < extra ? 1 : 0);
  }

  const out = [];
  for (const bp of active) {
    const span = result[bp];
    if (span === undefined) continue;
    out.push(bp === 'xs' ? `col-${span}` : `col-${bp}-${span}`);
  }
  return out.join(' ');
}

/**
 * Column class for a field: its own `col`, or the automatic distribution.
 * Mirrors fieldCol/autoCol being chosen by the Liquid partial.
 */
export function colFor(fieldName, ctx) {
  const info = ctx.rowInfo.get(fieldName);
  if (info && info.auto) return autoCol(fieldName, ctx);

  const field = ctx.byName.get(fieldName);
  return (field && field.col) || 'col-12';
}
