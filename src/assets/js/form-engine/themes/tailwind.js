// Tailwind theme for the form renderer.
//
// A full functional sibling of themes/bootstrap4.js: the same config walks the
// same field/widget/content logic and emits the same ids, names and data-*
// hooks, so the instance controller, the binder and the page/modal glue
// work against it unchanged. What
// differs is presentation only: Tailwind utility classes replace the Bootstrap
// ones.
//
// The runtime hooks the glue touches by class name are preserved as empty
// tokens next to the utilities - `custom-file`, `custom-file-label`,
// `dropdown-menu`, `dropdown-item`, `alert`, `alert-info`, `file-previews`,
// `btn-clear`, `mt-2` (the location summary panel) - because the
// page scripts and the page CSS select them directly. Everything else is pure
// Tailwind. The `hidden` attribute is used exactly like the Bootstrap theme
// uses it: the controller flips it, never a display utility.
//
// The validator classes stay the Bootstrap names (`is-invalid`/`is-valid`) by
// default, because the binder adds them and a Tailwind site can either style
// them with two utility rules or pass `{ classes: {...} }` to bindForm().

import { attr, inlineMarkdown, raw, safeHref, classes } from '../html.js';
import { autoCol, colFor } from '../layout.js';
import { resolveConditionalText } from '../conditions.js';
import { isFieldRequired } from '../validation.js';
import { filePlaceholders, fillFilePlaceholders } from '../data.js';
import { modalIdFor } from '../modals.js';

// ------------------------------------------------------------------ pieces ---

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// ------------------------------------------------------------------ tokens ---
//
// The single place the two themes differ. Hook classes (see header) stay; all
// other tokens are Tailwind utilities.

const ROW = 'grid grid-cols-12 gap-4';
const GROUP = 'mb-4';
const LABEL = 'mb-1 inline-block text-base font-medium text-gray-700';
const CONTROL =
  'block w-full rounded border border-gray-500 bg-white px-3 py-1.5 ' +
  'text-base text-gray-700 placeholder-gray-600 shadow-sm ' +
  'focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
const CONTROL_NO_CORNERS = 'rounded-none';
const HELPER = 'mt-1 block text-xs text-gray-600';
// Valid/invalid hint lines carry the hook classes the binder toggles
// (`.valid-feedback` / `.invalid-feedback`, binder.js) and start hidden; the
// binder reveals them via inline `display`. Nothing else renders these names.
const VALID = 'valid-feedback mt-1 text-xs text-green-600';
const INVALID = 'invalid-feedback mt-1 text-xs text-red-600';
const CLEAR =
  'btn-clear absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 ' +
  'text-base leading-none text-gray-500 hover:text-gray-700';
const MENU =
  'dropdown-menu absolute z-10 mt-1 w-full rounded-md border border-gray-200 ' +
  'bg-white py-2 shadow-lg';
const NOITEM = 'dropdown-item px-6 py-1 text-base text-gray-600 pointer-events-none';
const SEARCH_INPUT = 'pr-8';
const SEARCH_ICON =
  'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500';
// The native file control gets its "choose file" button styled by plain CSS
// (`::file-selector-button`) in this theme's skin, themes/tailwind.css, via the
// `form-file` hook; Tailwind v2 has no `file:` variant, so utilities cannot do it.
const FILE_INPUT = 'form-file block w-full cursor-pointer text-sm text-gray-600';
const FILE_LABEL = 'custom-file-label mt-1 block text-xs text-gray-600';

const BTN_PRIMARY =
  'inline-flex items-center rounded border-0 bg-blue-600 px-3 py-1.5 text-base ' +
  'font-medium text-white hover:bg-blue-700';

const ALERT_VARIANTS = {
  primary: 'border-blue-300 bg-blue-50 text-blue-900',
  secondary: 'border-gray-300 bg-gray-50 text-gray-800',
  success: 'border-green-300 bg-green-50 text-green-900',
  danger: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-cyan-300 bg-cyan-50 text-cyan-900',
  light: 'border-gray-200 bg-gray-100 text-gray-800',
  dark: 'border-gray-700 bg-gray-800 text-gray-100',
};

const BADGE_VARIANTS = {
  primary: 'bg-blue-100 text-blue-800',
  secondary: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-800',
  danger: 'bg-red-100 text-red-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-cyan-100 text-cyan-800',
  light: 'bg-gray-100 text-gray-700',
  dark: 'bg-gray-700 text-gray-100',
};

const OUTLINE_VARIANTS = {
  primary: 'border-blue-300 text-blue-700 hover:bg-blue-50 active:bg-blue-100 active:text-blue-900 active:border-blue-400',
  secondary: 'border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 active:text-gray-900 active:border-gray-400',
  success: 'border-green-300 text-green-700 hover:bg-green-50 active:bg-green-100 active:text-green-900 active:border-green-400',
  danger: 'border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100 active:text-red-900 active:border-red-400',
  warning: 'border-amber-300 text-amber-700 hover:bg-amber-50 active:bg-amber-100 active:text-amber-900 active:border-amber-400',
  info: 'border-cyan-300 text-cyan-700 hover:bg-cyan-50 active:bg-cyan-100 active:text-cyan-900 active:border-cyan-400',
  light: 'border-gray-200 text-gray-800 hover:bg-gray-100 active:bg-gray-200 active:text-gray-900 active:border-gray-300',
  dark: 'border-gray-600 text-gray-800 hover:bg-gray-100 active:bg-gray-200 active:text-gray-900 active:border-gray-700',
};

// ------------------------------------------------------------------ layout ---
//
// The config carries Bootstrap grid classes (col-12 col-md-6 ...). Tailwind
// has different fraction names, so the tokens are translated here; anything
// that is not a Bootstrap grid token passes through (spacing utilities like
// mt-3 are shared between both frameworks).

const COL_SPANS = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10', 11: '11', 12: '12',
};

const FRACTIONS = {
  1: '1/12', 2: '1/6', 3: '1/4', 4: '1/3', 5: '5/12', 6: '1/2',
  7: '7/12', 8: '2/3', 9: '3/4', 10: '5/6', 11: '11/12', 12: 'full',
};

// Purge safe-list for the classic (non-JIT) build.
//
// twCol() below composes column/offset utilities from FRACTIONS at runtime, so
// the final tokens ("md:w-1/2", "ml-1/4", ...) never appear as literals in this
// module and a production `purge` would strip them. The build scans this file
// (tailwind.config.js -> purge.content), so spelling every token out here keeps
// them alive. Modal sizing ("max-w-xl"/"max-w-3xl") is composed the same way.
// Keep in sync with FRACTIONS and the modal sizes in renderModals().
export const SAFELIST =
  'col-span-1 col-span-2 col-span-3 col-span-4 col-span-5 col-span-6 ' +
  'col-span-7 col-span-8 col-span-9 col-span-10 col-span-11 col-span-12 ' +
  'sm:col-span-1 sm:col-span-2 sm:col-span-3 sm:col-span-4 sm:col-span-5 sm:col-span-6 ' +
  'sm:col-span-7 sm:col-span-8 sm:col-span-9 sm:col-span-10 sm:col-span-11 sm:col-span-12 ' +
  'md:col-span-1 md:col-span-2 md:col-span-3 md:col-span-4 md:col-span-5 md:col-span-6 ' +
  'md:col-span-7 md:col-span-8 md:col-span-9 md:col-span-10 md:col-span-11 md:col-span-12 ' +
  'lg:col-span-1 lg:col-span-2 lg:col-span-3 lg:col-span-4 lg:col-span-5 lg:col-span-6 ' +
  'lg:col-span-7 lg:col-span-8 lg:col-span-9 lg:col-span-10 lg:col-span-11 lg:col-span-12 ' +
  'xl:col-span-1 xl:col-span-2 xl:col-span-3 xl:col-span-4 xl:col-span-5 xl:col-span-6 ' +
  'xl:col-span-7 xl:col-span-8 xl:col-span-9 xl:col-span-10 xl:col-span-11 xl:col-span-12 ' +
  'max-w-xl max-w-3xl';

/** col-12 / col-md-6 / offset-lg-3 -> Tailwind grid spans / margins. */
function twCol(string) {
  const colSpans = {}; // bp -> span number
  const offsetSpans = {}; // bp -> fraction string
  const bpsOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const bpsWithCol = [];
  const out = [];
  for (const token of String(string || '').split(/\s+/).filter(Boolean)) {
    // Direct Tailwind grid span: col-span-6 / md:col-span-4
    const spanMatch = /^((sm|md|lg|xl|2xl):)?col-span-(\d{1,2})$/.exec(token);
    if (spanMatch) {
      const bp = spanMatch[2] || 'xs';
      const span = parseInt(spanMatch[3], 10);
      if (bp === 'xs') {
        out.push(`col-span-${span}`);
      } else {
        out.push(`${bp}:col-span-${span}`);
      }
      continue;
    }
    const m = /^(col|offset)-((sm|md|lg|xl|2xl)-)?(\d{1,2})$/.exec(token);
    if (m) {
      const bp = m[3] || 'xs';
      if (m[1] === 'col') {
        const num = Number(m[4]);
        if (COL_SPANS[num] !== undefined) {
          colSpans[bp] = num;
          if (!bpsWithCol.includes(bp)) bpsWithCol.push(bp);
        }
      } else if (m[1] === 'offset') {
        const num = Number(m[4]);
        if (FRACTIONS[num] !== undefined) {
          offsetSpans[bp] = FRACTIONS[num];
        }
      }
      continue;
    }
    if (/^(col|offset)(-\d+)?$/.test(token)) continue;
    out.push(twUtility(token));
  }
  // Bootstrap downward cascade for columns: md-6 implies xs-12, sm-12, etc.
  const sortedColBps = bpsOrder.filter(bp => colSpans[bp] !== undefined || bpsWithCol.includes(bp));
  // Apply cascade: previous lower span propagates downward
  const cascadedCols = {};
  let prevCol = 12; // Bootstrap default
  for (const bp of bpsOrder) {
    if (colSpans[bp] !== undefined) prevCol = colSpans[bp];
    if (bpsWithCol.includes(bp) || colSpans[bp] !== undefined) {
      cascadedCols[bp] = prevCol;
    }
  }
  // Build output: base (xs or lowest col bp) as plain col-span-*, responsive with prefix.
  // Add offset margins first (no cascade needed for offset)
  for (const bp of bpsOrder) {
    if (offsetSpans[bp] !== undefined) {
      const prefix = bp === 'xs' ? '' : `${bp}:`;
      out.push(`${prefix}ml-${offsetSpans[bp]}`);
    }
  }
  // Build column spans with cascade
  const colBps = bpsOrder.filter(bp => cascadedCols[bp] !== undefined);
  const baseBp = colBps[0] || 'xs';
  const finalCols = [];
  for (let i = 0; i < colBps.length; i++) {
    const bp = colBps[i];
    const span = cascadedCols[bp];
    const prefix = bp === 'xs' ? '' : `${bp}:`;
    finalCols.push(`${prefix}col-span-${span}`);
  }
  out.push(...finalCols);
  return out.length ? out.join(' ') : 'col-span-12';
}

// ---------------------------------------------------------------- look ---
//
// A config authored in Bootstrap vocabulary carries utility classes the Tailwind
// output would not understand (h4, text-primary, font-weight-bold). These map
// the handful the configs actually use; anything already Tailwind passes through.

const UTILITY = {
  h1: 'text-4xl', h2: 'text-3xl', h3: 'text-3xl', h4: 'text-2xl', h5: 'text-xl', h6: 'text-base',
  small: 'text-xs',
  'font-weight-bold': 'font-bold', 'font-weight-semibold': 'font-semibold',
  'font-weight-normal': 'font-normal', 'font-weight-light': 'font-light',
  'font-italic': 'italic',
  'text-primary': 'text-blue-700', 'text-secondary': 'text-gray-600',
  'text-success': 'text-green-700', 'text-danger': 'text-red-700',
  'text-warning': 'text-amber-700', 'text-info': 'text-cyan-700',
  'text-muted': 'text-gray-600',
  'text-left': 'text-left', 'text-center': 'text-center', 'text-right': 'text-right',
  'text-white': 'text-white',
  'd-block': 'block', 'd-flex': 'flex', 'd-none': 'hidden',
};

/** One Bootstrap look token -> Tailwind, or the token itself when it already is. */
function twUtility(token) {
  return UTILITY[token] || token;
}

/** A whole class string of look tokens -> Tailwind. */
function twUtilities(string) {
  return String(string || '').split(/\s+/).filter(Boolean).map(twUtility).join(' ');
}

// The map widget injects the responsive height rule the partial shipped; it is
// plain CSS about the marker and the picker, no Bootstrap.
const MAP_STYLE = `<style>
  .map-marker-info { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0.65rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 0.3rem; margin-bottom: 0.5rem; }
  .map-marker-info-icon { flex-shrink: 0; line-height: 0; color: #dc3545; margin-top: 2px; }
  .map-marker-info-body { flex-grow: 1; min-width: 0; }
  .map-marker-info-address { font-size: 0.8125rem; line-height: 1.4; color: #212529; word-break: break-word; }
  .map-marker-info-coords { font-size: 0.75rem; line-height: 1.4; color: #6c757d; margin-top: 1px; font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .map-marker-info-loading { display: flex; align-items: center; gap: 0.45rem; font-size: 0.8125rem; color: #6c757d; }
  .map-picker-responsive { height: 280px; }
  @media (min-width: 768px) { .map-picker-responsive { height: 420px; } }
</style>`;

// ------------------------------------------------------------- label parts ---

function labelBody(label, ctx, forceMarkdown) {
  if (label === null || label === undefined || label === '') return '';
  if (typeof label !== 'object' || Array.isArray(label)) {
    return forceMarkdown ? inlineMarkdown(label) : raw(label);
  }

  const source = label.depends ? label : label.text;
  const text = resolveConditionalText(source, (path) => ctx.getData(path), '');
  if (!text) return '';
  return label.markdown ? inlineMarkdown(text) : raw(text);
}

function informerLink(label) {
  if (!label || typeof label !== 'object' || !label.informer) return '';
  return `<a href="${attr(safeHref(label.informer))}" target="_blank" class="ml-1 self-center text-gray-500 hover:text-blue-700">${raw(label.icon || 'ⓘ')}</a>`;
}

function labelHtml(field, ctx) {
  const label = labelBody(field.label, ctx);
  const informer = informerLink(field.label);
  if (!label && !informer) return '';
  return `<label for="field_${attr(field.name)}" class="${LABEL}">${label}${informer}</label>`;
}

function requiredMarker(field, ctx) {
  if (!field.required) return '';

  const settings = ctx.config?.settings?.required || {};
  const visible = isFieldRequired(field, {
    evaluateDepends: (deps) => ctx.evaluateDepends(deps),
  });
  const tooltip = settings.tooltip ? ` title="${attr(settings.tooltip)}"` : '';
  const informer = settings.informer
    ? `<a href="${attr(safeHref(settings.informer))}" target="_blank" class="ml-1 text-gray-500 hover:text-blue-700">${raw(settings.icon || 'ⓘ')}</a>`
    : '';

  const cls = twUtilities(settings.class);
  const clsAttr = cls ? ` class="${attr(cls)}"` : '';
  return `<span${clsAttr}${visible ? '' : ' hidden'} data-required-marker="${attr(field.name)}"${tooltip}>${raw(settings.marker || '*')}${informer}</span>`;
}

function helperHtml(field) {
  if (!field.helper) return '';
  return `<small id="helper_${attr(field.name)}" class="${HELPER}">${raw(field.helper)}</small>`;
}

// Legacy `textarea.html` renders a live "N символів залишилось" line below the
// helper whenever `maxlength` is set; the plain text partial does not, so this
// stays textarea-only. The page glue keeps the count in sync via the
// data-char-counter/data-maxlength attributes.
function charCounter(field) {
  if (field.type !== 'textarea') return '';
  if (field.maxlength === undefined || field.maxlength === null || field.maxlength === '') return '';
  return `<small class="${HELPER}" data-char-counter="${attr(field.name)}" data-maxlength="${attr(field.maxlength)}"><span>${attr(field.maxlength)}</span> символів залишилось</small>`;
}

function validFeedback(field, ctx) {
  const settings = ctx.config?.settings?.feedback || {};
  const own = field.feedback || {};
  const valid = own.valid || field.valid || settings.valid || '✓';
  return `<div class="${VALID}" hidden>${raw(valid)}</div>`;
}

function invalidFeedback(field, ctx, copy) {
  const own = field.feedback || {};
  const text = copy !== undefined ? copy : own.invalid;
  const invalid = text
    ? raw(text)
    : `<span data-error="${attr(field.name)}"></span>`;
  return `<div class="${INVALID}" hidden>${invalid}</div>`;
}

function feedbackHtml(field, ctx) {
  return validFeedback(field, ctx) + invalidFeedback(field, ctx);
}

/** Attributes every control shares - identical to the Bootstrap theme. */
function controlAttrs(field, opts = {}) {
  const parts = [];
  if (!opts.noId) parts.push(`id="field_${attr(field.name)}"`);
  parts.push(`name="${attr(field.name)}"`);
  parts.push(`data-field="${attr(field.name)}"`);

  if (field.required) parts.push('required');
  if (field.autocomplete) parts.push(`autocomplete="${attr(field.autocomplete)}"`);
  if (field.tabindex) parts.push(`tabindex="${attr(field.tabindex)}"`);
  for (const [key, value] of Object.entries(field.aria || {})) {
    parts.push(`aria-${attr(key)}="${attr(value)}"`);
  }
  for (const [key, value] of Object.entries(field.data || {})) {
    parts.push(`data-${attr(key)}="${attr(value)}"`);
  }

  const typed = opts.element === 'input' || opts.element === 'textarea';
  if (typed) {
    if (field.inputmode) parts.push(`inputmode="${attr(field.inputmode)}"`);
    if (field.enterkeyhint) parts.push(`enterkeyhint="${attr(field.enterkeyhint)}"`);
    if (field.spellcheck !== undefined) parts.push(`spellcheck="${field.spellcheck}"`);
    if (field.autocapitalize !== undefined) parts.push(`autocapitalize="${attr(field.autocapitalize)}"`);
    if (field.minlength !== undefined) parts.push(`minlength="${attr(field.minlength)}"`);
    if (field.maxlength !== undefined) parts.push(`maxlength="${attr(field.maxlength)}"`);
  }
  if (opts.element === 'textarea') {
    if (field.cols !== undefined) parts.push(`cols="${attr(field.cols)}"`);
    if (field.wrap) parts.push(`wrap="${attr(field.wrap)}"`);
  }
  if (opts.element === 'input') {
    if (field.list) parts.push(`list="${attr(field.list)}"`);
    if (field.size) parts.push(`size="${attr(field.size)}"`);
  }
  if (opts.element === 'select') {
    if (field.size) parts.push(`size="${attr(field.size)}"`);
    if (field.multiple) parts.push('multiple');
  }
  if (opts.helper) parts.push(`aria-describedby="helper_${attr(field.name)}"`);

  return parts.length ? ' ' + parts.join(' ') : '';
}

// ------------------------------------------------------------------ addons ---

function addon(field, side) {
  const value = field[side];
  if (!value) return '';

  if (value.button) {
    const button = value.button;
    const modalId = modalIdFor(field, side);
    const klass = classes('inline-flex items-center', BTN_PRIMARY, button.class);
    return `<div class="flex items-stretch">` +
      `<button type="button" class="${attr(klass)}"` +
      `${button.title ? ` title="${attr(button.title)}"` : ''}` +
      ` data-toggle="modal" data-target="#${attr(modalId)}">${raw(button.label ?? button)}</button></div>`;
  }

  const text = typeof value === 'string' ? value : (value.text ?? '');
  const id = `inputGroup${capitalize(field.name)}${capitalize(side)}`;
  const edge = side === 'prepend' ? 'rounded-l border-r-0' : 'rounded-r border-l-0';
  const klass = classes('inline-flex items-center border border-gray-500 bg-gray-50 px-3 text-base text-gray-600', edge, value.class);
  return `<span class="${attr(klass)}" id="${attr(id)}">${raw(text)}</span>`;
}

// ------------------------------------------------------------ field types ---

function staticPattern(field, ctx) {
  if (typeof field.pattern === 'string') return field.pattern;
  if (field.pattern !== undefined) return '';
  return ctx.config?.settings?.pattern ?? '';
}

function textLike(field, ctx, type) {
  const hasPrepend = Boolean(field.prepend);
  const hasAppend = Boolean(field.append);
  const hasAddons = hasPrepend || hasAppend;
  const hasClear = type !== 'number';
  const pattern = type === 'number' ? '' : ` pattern="${attr(staticPattern(field, ctx))}"`;

  const numberAttrs = type === 'number'
    ? ` min="${attr(field.min)}" max="${attr(field.max)}" step="${attr(field.step ?? 1)}"`
    : '';

  const corners = hasAddons
    ? (hasPrepend ? ' rounded-r rounded-l-none' : ' rounded-l rounded-r-none')
    : '';

  const control = `<input type="${attr(type)}" class="${CONTROL}${corners}"` +
    controlAttrs(field, { element: 'input', helper: field.helper }) +
    `${pattern}${numberAttrs} placeholder="${attr(field.placeholder ?? '')}"` +
    `${field.readonly === true ? ' readonly' : ''}>`;

  const wrapped = hasClear
    ? `<div class="text-input-wrapper relative w-full">${control}<button type="button" class="${CLEAR}" title="Очистити поле" data-clear="${attr(field.name)}" hidden>&times;</button></div>`
    : control;

  if (!hasAddons) return wrapped;
  return `<div class="flex w-full items-stretch">${addon(field, 'prepend')}${wrapped}${addon(field, 'append')}</div>`;
}

function textarea(field) {
  const control = `<textarea class="${CONTROL} resize-y"` +
    controlAttrs(field, { element: 'textarea', helper: field.helper }) +
    ` rows="${attr(field.rows ?? 4)}"` +
    ` placeholder="${attr(field.placeholder ?? '')}"${field.readonly === true ? ' readonly' : ''}></textarea>`;

  return `<div class="text-input-wrapper relative">${control}` +
    `<button type="button" class="${CLEAR}" title="Очистити поле" data-clear="${attr(field.name)}" hidden>&times;</button></div>`;
}

function select(field) {
  const placeholder = field.placeholder
    ? `<option value="">${raw(field.placeholder)}</option>`
    : '';
  const options = (field.options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? value;
    return `<option value="${attr(value)}">${raw(label)}</option>`;
  }).join('');

  return `<select class="${CONTROL}"` +
    controlAttrs(field, { element: 'select', helper: field.helper }) +
    `${field.readonly === true ? ' disabled' : ''}>${placeholder}${options}</select>`;
}

function radio(field, ctx) {
  const heading = `<label class="mb-1 block text-base font-medium text-gray-700">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</label>`;
  const options = (field.options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? value;
    return `<div class="mr-4 inline-flex items-center gap-2">
        <input type="radio" class="h-4 w-4 engine-accent" id="field_${attr(field.name)}_${attr(value)}" value="${attr(value)}" name="${attr(field.name)}" data-field="${attr(field.name)}"${field.required ? ' required' : ''}${field.readonly === true ? ' disabled' : ''}>
        <label class="text-base text-gray-800" for="field_${attr(field.name)}_${attr(value)}">${raw(label)}</label>
      </div>`;
  }).join('');

  return `${heading}<div class="flex flex-wrap items-start">${options}</div>`;
}

function checkbox(field, ctx) {
  return `<div class="inline-flex items-start gap-2">
      <input type="checkbox" class="mt-0.5 h-4 w-4 engine-accent"` +
    controlAttrs(field, { element: 'input', helper: field.helper }) +
    `${field.readonly === true ? ' disabled' : ''}>
      <label class="text-base text-gray-800" for="field_${attr(field.name)}">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</label>
    </div>`;
}

function checkboxGroup(field, ctx) {
  const variant = field.variant || 'secondary';
  const outline = OUTLINE_VARIANTS[variant] || OUTLINE_VARIANTS.secondary;
  const options = (field.options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? value;
    return `<label class="mr-2 mb-2 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-base font-medium ${OUTLINE_VARIANTS[variant] || outline} peer-checked:border-blue-600 peer-checked:bg-blue-100 peer-checked:text-blue-900 cursor-pointer" data-toggle-for="${attr(field.name)}" data-value="${attr(value)}">
        <input type="checkbox" class="sr-only peer" value="${attr(value)}" name="${attr(field.name)}" data-group="${attr(field.name)}" data-field="${attr(field.name)}"${field.readonly === true ? ' disabled' : ''}> ${raw(label)}
      </label>`;
  }).join('');

  return `<fieldset class="m-0 border-0 p-0">
      <legend class="mb-1 block text-base font-medium text-gray-700">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</legend>
      <div class="flex flex-wrap">${options}</div>
    </fieldset>`;
}

function hidden(field) {
  const value = field.value === undefined || field.value === null ? '' : field.value;
  return `<input type="hidden" id="field_${attr(field.name)}" name="${attr(field.name)}"` +
    ` data-field="${attr(field.name)}" autocomplete="off" value="${attr(value)}">`;
}

// ------------------------------------------------- autocomplete and file ----

function autocomplete(field, ctx) {
  const describedBy = field.helper ? ` aria-describedby="helper_${attr(field.name)}"` : '';
  const placeholder = field.placeholder || 'Введіть назву...';

  const select = `<select class="${CONTROL}" id="field_${attr(field.name)}"${describedBy}` +
    ` data-field="${attr(field.name)}">` +
    (field.placeholder ? `<option value="">${raw(field.placeholder)}</option>` : '') +
    `</select>`;

  const search = `<div class="position-relative">
      <input type="text" class="${CONTROL} autocomplete-search" autocomplete="off"` +
    ` id="field_${attr(field.name)}_search"${describedBy} placeholder="${attr(placeholder)}"` +
    ` data-autocomplete-search="${attr(field.name)}">
      ${searchIcon('autocomplete-search-icon ' + SEARCH_ICON)}
      <button type="button" class="${CLEAR} autocomplete-clear" title="Очистити поле" data-autocomplete-clear="${attr(field.name)}" hidden>&times;</button>
      <div class="${MENU} show"` +
    ` style="max-height: 250px; overflow-y: auto; z-index: 1050;" data-autocomplete-dropdown="${attr(field.name)}">
        <div class="${NOITEM}" data-autocomplete-noresults="${attr(field.name)}"></div>
      </div>
    </div>`;

  return `<div class="${GROUP}" data-field-group>
    ${labelHtml(field, ctx)}${requiredMarker(field, ctx)}
    ${select}
    ${search}
    ${helperHtml(field)}
    ${feedbackHtml(field, ctx)}
  </div>`;
}

function searchIcon(klass) {
  return `<span class="${attr(klass)}">` +
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<circle cx="7" cy="7" r="5"></circle>' +
    '<line x1="11" y1="11" x2="14.5" y2="14.5"></line>' +
    '</svg></span>';
}

function file(field, ctx) {
  const fm = field.file || {};
  const min = fm.minFiles;
  const max = fm.maxFiles || 10;
  const limit = fm.maxSize || '5 MB';
  const values = filePlaceholders(field);
  const infoText = fillFilePlaceholders(
    fm.infoLine ||
      (min
        ? `фотознімки: від ${min} до ${max} файлів, до ${limit}`
        : `фотознімки: максимум ${max} файлів, до ${limit}`),
    values,
  );
  // The generic complaint of the field, with the file limits spelled out: the
  // dynamic rule message replaces it while the field is broken.
  const fb = field.feedback || {};
  const invalidCopy = fb.invalid ? fillFilePlaceholders(fb.invalid, values) : undefined;

  // `.custom-file-actions` is a sibling of the label (not a child): the glue
  // rewrites the label with `textContent`, which would wipe nested nodes. It
  // holds the ✗/✓ validation glyph and the × clear button, laid out in a row so
  // they sit tight together just left of the "Огляд" button; bootstrap4.js keeps
  // the plain sibling-× markup instead.
  const input = `<div class="custom-file">
      <input type="file" class="${FILE_INPUT}" id="field_${attr(field.name)}"` +
    controlAttrs(field, { element: 'input', helper: field.helper, noId: true }) +
    ` accept="${attr(field.accept ?? '')}"` +
    `${field.multiple ? ' multiple' : ''}>
      <label class="${FILE_LABEL}" for="field_${attr(field.name)}"></label>
      <span class="custom-file-actions">
        <button type="button" class="btn-clear" title="Очистити файли" data-clear="${attr(field.name)}" hidden>&times;</button>
        <span class="custom-file-icon" aria-hidden="true"></span>
      </span>
    </div>`;

  return `<div class="${GROUP}" data-field-group>
    ${labelHtml(field, ctx)}${requiredMarker(field, ctx)}
    <div class="text-input-wrapper block">${input}</div>
    <small class="mt-1 block text-xs text-gray-600">${raw(infoText)}</small>
    ${helperHtml(field)}
    ${validFeedback(field, ctx)}
    <div class="file-previews mt-2" hidden></div>
    ${invalidFeedback(field, ctx, invalidCopy)}
  </div>`;
}

// ----------------------------------------------------------------- widgets ---

function widgetShell(field, inner, ctx) {
  const col = twCol(field.class || 'col-12');
  // `hidden` mirrors the initial evaluation: a wrapper whose condition already
  // holds paints open, so the first frame matches what the binder settles on.
  const depends = field.depends
    ? ` data-depends="${attr(JSON.stringify(field.depends))}"${ctx.evaluateDepends(field.depends) ? '' : ' hidden'}`
    : '';
  return `<div class="${attr(col)}"${depends} data-widget="${attr(field.widget)}" data-widget-name="${attr(field.name)}">${inner}</div>`;
}

function widgetCaptcha(field, ctx) {
  const box = `<div id="${attr(field.element_id || field.name)}-widget" class="captcha-widget-box" tabindex="-1"` +
    ` data-captcha-field="${attr(field.name)}"` +
    (field.theme ? ` data-captcha-theme="${attr(field.theme)}"` : '') +
    (field.size ? ` data-captcha-size="${attr(field.size)}"` : '') +
    (field.appearance ? ` data-captcha-appearance="${attr(field.appearance)}"` : '') +
    `></div>`;

  const label = `<div class="mb-2" id="label_${attr(field.name)}">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</div>`;

  return widgetShell(field, `<div class="captcha-widget mb-3">
    ${label}
    ${box}
    <div class="alert alert-info mt-2 mb-0 rounded-md border border-blue-200 bg-blue-50 px-5 py-2 text-base text-blue-800" hidden>Turnstile пропущено (локальний режим)</div>
    <div class="alert alert-warning mt-2 mb-0 rounded-md border border-amber-300 bg-amber-50 px-5 py-2 text-base text-amber-800" hidden>
      Не вдалося завантажити перевірку.
        <button type="button" class="ml-1 inline text-sm font-medium text-blue-600 underline hover:text-blue-500" data-captcha-retry="${attr(field.name)}">Спробувати ще раз</button>
    </div>
    ${field.helper ? `<small class="${HELPER} mt-1 block">${raw(field.helper)}</small>` : ''}
    ${invalidFeedback(field, ctx)}
  </div>`, ctx);
}

function widgetMap(field, ctx) {
  const marker = `<div class="map-marker-info" hidden>
    <div class="map-marker-info-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a5 5 0 0 0-5 5c0 4.14 4.21 9.34 4.66 9.89a.44.44 0 0 0 .68 0C8.79 14.34 13 9.14 13 5a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
    </div>
    <div class="map-marker-info-body">
      <div class="map-marker-info-loading"><span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500" style="border-top-color:transparent"></span> Визначаю адресу&hellip;</div>
      <div class="map-marker-info-address text-gray-500 italic">Адресу не вдалося визначити</div>
      <div class="map-marker-info-address">Адреса: <span data-map-address="${attr(field.name)}"></span></div>
      <div class="map-marker-info-coords">Координати: <span data-map-coords="${attr(field.name)}"></span></div>
    </div>
  </div>`;

  const picker = field.height
    ? `<div id="map-picker" style="height: ${attr(field.height)}px;" class="relative w-full rounded-md border border-gray-300" role="application" aria-labelledby="label_${attr(field.name)}"></div>`
    : `<div id="map-picker" class="map-picker-responsive relative w-full rounded-md border border-gray-300" role="application" aria-labelledby="label_${attr(field.name)}"></div>`;

  const label = `<div class="mb-2" id="label_${attr(field.name)}">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</div>`;

  return widgetShell(field, MAP_STYLE + `<div class="mb-3 rounded-md border border-gray-200 bg-white">
    <div class="p-2">
      ${label}
      ${marker}
      ${picker}
      ${field.helper ? `<small class="${HELPER} mt-1 block">${raw(field.helper)}</small>` : ''}
      ${field.required ? invalidFeedback(field, ctx) : ''}
    </div>
  </div>`, ctx);
}

function widgetPriceInfo(field, ctx) {
  return widgetShell(field, `<div class="mb-3 rounded-md bg-gray-50">
    <div class="px-3 py-1.5">
      <small class="block text-xs text-gray-600" data-price-info="${attr(field.name)}"></small>
    </div>
  </div>`, ctx);
}

function widgetLocation(field, ctx) {
  const root = field.name;
  const fields = (field.fields || []).map((sub) => {
    const describedBy = sub.helper ? ` aria-describedby="helper_${root}_${sub.name}"` : '';

    const select = `<select class="${CONTROL}" id="field_${root}_${sub.name}" name="${root}.${sub.name}"${describedBy}` +
      ` data-location-field="${sub.name}" data-location-root="${root}">` +
      `<option value="">${raw(sub.placeholder || 'Виберіть...')}</option></select>`;

    const search = `<div class="position-relative">
      <input type="text" class="${CONTROL} location-search ${SEARCH_INPUT}" autocomplete="off"` +
      ` id="field_${root}_${sub.name}_search"${describedBy}` +
      ` placeholder="${attr(sub.placeholder || 'Введіть назву...')}"` +
      ` data-location-search="${sub.name}" data-location-root="${root}">
      ${searchIcon('location-search-icon ' + SEARCH_ICON)}
      <button type="button" class="${CLEAR}" title="Очистити поле" data-location-clear="${sub.name}" hidden>&times;</button>
      <div class="${MENU} show"` +
      ` style="max-height: 250px; overflow-y: auto; z-index: 1050;" data-location-dropdown="${sub.name}">
        <div class="${NOITEM}"></div>
      </div>
    </div>`;

    const feedback = invalidFeedback(
      { ...sub, name: `${root}.${sub.name}` },
      ctx,
    ) + validFeedback(sub, ctx);

    return `<div class="${GROUP}" data-field-group>
      <label for="field_${root}_${sub.name}" class="${LABEL}">${labelBody(sub.label, ctx)}${requiredMarker(sub, ctx)}</label>
      ${select}
      ${search}
      ${sub.helper ? `<small id="helper_${root}_${sub.name}" class="${HELPER}">${raw(sub.helper)}</small>` : ''}
      ${feedback}
    </div>`;
  }).join('');

  const leaf = field.fields?.[field.fields.length - 1]?.name || '';

  return widgetShell(field, `<div class="mb-3 rounded-md border border-gray-200 bg-white">
    <div class="p-3">
      ${field.label ? `<h6 class="mb-2 text-base font-semibold leading-tight text-gray-900">${labelBody(field.label, ctx)}</h6>` : ''}
      ${field.helper ? `<small class="${HELPER} mb-2 block">${raw(field.helper)}</small>` : ''}
      ${fields}
      <div class="mt-2" hidden><div class="rounded-md bg-gray-50"><div class="px-3 py-1.5"><small class="block text-xs text-gray-600" data-location-summary="${leaf}"></small></div></div></div>
    </div>
  </div>`, ctx);
}

const WIDGET_TYPES = {
  captcha: widgetCaptcha,
  map: widgetMap,
  location: widgetLocation,
  price_info: widgetPriceInfo,
};

const FIELD_TYPES = {
  text: (f, ctx) => textLike(f, ctx, 'text'),
  tel: (f, ctx) => textLike(f, ctx, 'tel'),
  email: (f, ctx) => textLike(f, ctx, 'email'),
  number: (f, ctx) => textLike(f, ctx, 'number'),
  textarea,
  select,
  radio,
  checkbox,
  checkbox_group: checkboxGroup,
  autocomplete,
  file,
  hidden,
};

const SELF_LABELLED = new Set(['radio', 'checkbox', 'checkbox_group']);
const SELF_CHROME = new Set(['autocomplete', 'file']);
const CONTENT_TYPES = new Set(['heading', 'paragraph', 'list', 'alert', 'badge', 'image', 'raw']);

// ---------------------------------------------------------------- content ---

function content(field, ctx) {
  const col = `${twCol(field.col || 'col-12')} mb-4`;
  const depends = field.depends
    ? ` data-depends="${attr(JSON.stringify(field.depends))}"${ctx.evaluateDepends(field.depends) ? '' : ' hidden'}`
    : '';
  return `<div class="${attr(col)}"${depends}>${contentBody(field, ctx)}</div>`;
}

function contentBody(field, ctx) {
  const label = labelBody(field.label, ctx, field.markdown);
  const klass = field.class ? ` class="${attr(twUtilities(field.class))}"` : '';

  switch (field.type) {
    case 'heading': {
      const level = field.level || 2;
      // Tailwind's Preflight resets headings to the base size, so carry the
      // Bootstrap heading scale explicitly; a class from the config adds on top.
      const size = UTILITY[`h${level}`] || 'text-base';
      const merged = field.class ? classes('leading-tight', size, twUtilities(field.class)) : `leading-tight ${size}`;
      return `<h${level} class="${attr(merged)}">${label}</h${level}>`;
    }
    case 'paragraph':
      return `<p${klass}>${label}</p>`;
    case 'list': {
      const tag = field.tag || 'ul';
      const items = (field.items || []).map((item) => {
        const isObject = item !== null && typeof item === 'object';
        const text = isObject ? item.text : item;
        const markdown = isObject ? (item.markdown ?? field.markdown) : field.markdown;
        return `<li>${markdown ? inlineMarkdown(text) : raw(text)}</li>`;
      }).join('');
      return `<${tag}${klass}>${items}</${tag}>`;
    }
    case 'alert': {
      const variant = field.variant || 'info';
      const dismiss = field.dismissible
        ? `<button type="button" class="float-right -my-3 -mr-5 py-3 pl-5 text-gray-500 hover:text-gray-700" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>`
        : '';
      const full = classes('rounded-md border py-3 px-5 text-base', ALERT_VARIANTS[variant] || ALERT_VARIANTS.info, field.class ? twUtilities(field.class) : '');
      return `<div class="${attr(full)}" role="alert">${dismiss}${label}</div>`;
    }
    case 'badge': {
      const variant = field.variant || 'secondary';
      const full = classes('inline-flex items-center rounded px-1.5 py-1 text-xs font-semibold leading-none', BADGE_VARIANTS[variant] || BADGE_VARIANTS.secondary, field.pill && 'rounded-full', field.class ? twUtilities(field.class) : '');
      return `<span class="${attr(full)}">${label}</span>`;
    }
    case 'image':
      return `<figure${klass}><img src="${attr(field.src)}" alt="${attr(field.alt ?? '')}" class="max-w-full h-auto">` +
        (field.caption
          ? `<figcaption class="mt-1 text-center text-sm text-gray-600">${raw(field.caption)}</figcaption>`
          : '') +
        `</figure>`;
    case 'raw':
      return raw(field.html ?? '');
    default:
      return '';
  }
}

// ----------------------------------------------------------------- fields ---

export function renderField(field, ctx) {
  if (CONTENT_TYPES.has(field.type)) return content(field, ctx);
  if (field.type === 'widgets') {
    const renderer = WIDGET_TYPES[field.widget];
    return renderer ? renderer(field, ctx) : '';
  }

  const renderer = FIELD_TYPES[field.type];
  if (!renderer) return '';

  if (field.type === 'hidden') return renderer(field, ctx);

  const auto = ctx.rowInfo.get(field.name)?.auto;
  const col = auto ? twCol(autoCol(field.name, ctx)) : twCol(field.col || colFor(field.name, ctx));

  const heading = SELF_LABELLED.has(field.type)
    ? ''
    : `${labelHtml(field, ctx)}${requiredMarker(field, ctx)}`;

  const inner = SELF_CHROME.has(field.type)
    ? renderer(field, ctx)
    : `<div class="${GROUP}" data-field-group>
        ${heading}
        ${renderer(field, ctx)}
        ${helperHtml(field)}
        ${charCounter(field)}
        ${feedbackHtml(field, ctx)}
      </div>`;

  const depends = field.depends
    ? ` data-depends="${attr(JSON.stringify(field.depends))}"${ctx.evaluateDepends(field.depends) ? '' : ' hidden'}`
    : '';

  return `<div class="${attr(col)}"${depends} data-field-col="${attr(field.name)}">${inner}</div>`;
}

// ------------------------------------------------------------------ layout ---

function renderRow(row, ctx) {
  const klass = row.class === 'row' ? ROW : twRow(row.class);
  const cols = (row.cols || []).map((col) => {
    const inner = (col.rows || []).map((nested) => renderRow(nested, ctx)).join('');
    return `<div class="${attr(twCol(col.class || 'col-12'))}">${inner}</div>`;
  });

  if (cols.length > 0) return `<div class="${attr(klass)}">${cols.join('')}</div>`;

  const fields = (row.fields || []).map((field) => renderField(field, ctx)).join('');
  return `<div class="${attr(klass)}">${fields}</div>`;
}

/** 'row' -> flex wrap; 'row mb-3' keeps the spacing token; look tokens map. */
function twRow(string) {
  const tokens = (string || '').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return ROW;
  return tokens.map((t) => (t === 'row' ? ROW : twUtility(t))).join(' ');
}

function renderStep(step, index, ctx) {
  const rows = (step.rows || []).map((row) => renderRow(row, ctx)).join('');
  const hidden = ctx.step !== index ? ' hidden' : '';
  return `<div data-step="${index + 1}"${hidden}>${rows}</div>`;
}

// ------------------------------------------------------------------ chrome ---
//
// Same wizard chrome as bootstrap4.js, restyled with Tailwind utilities.

const NAV_TOKENS = {
  current: ['bg-amber-400', 'text-gray-900'],
  done: ['bg-green-600', 'text-white'],
  todo: ['bg-blue-600', 'text-white'],
};

function renderChrome(opts) {
  const { steps = [], copy = {} } = opts;
  const title = (key, fallback) => raw(copy[key] ?? fallback ?? '');

  const indicator = [];
  steps.forEach((_, i) => {
    const n = i + 1;
    const first = n === 1;
    const nav = NAV_TOKENS[first ? 'current' : 'todo'];
    indicator.push(
      `<div class="step-number w-8 h-8 rounded-full inline-flex items-center justify-center text-sm font-semibold ${nav.join(' ')}"` +
      ` data-step-nav="${n}">${n}</div>`,
    );
    if (i < steps.length - 1) {
      indicator.push('<div class="step-dot w-8 h-1.5 rounded-full bg-amber-400"></div>');
    }
  });

  const top =
    `<div class="flex justify-between items-center flex-wrap gap-y-2 step-indicator">\n` +
    `  ${indicator.join('\n  ')}\n` +
    `</div>\n` +
    `\n` +
    `<div class="text-center my-3">\n` +
    steps.map((step, i) => {
      const n = i + 1;
      const klass = twUtilities(step.class || 'h2');
      const hidden = n === 1 ? '' : ' hidden';
      return `  <div class="step-title ${attr(klass)} leading-tight mb-0" data-step-title="${n}"${hidden}>${raw(step.title ?? '')}</div>`;
    }).join('\n') +
    `\n</div>`;

  const bottom =
    `<div class="flex justify-between mt-4" data-step-actions>\n` +
    `  <button type="button" class="px-3 py-1.5 rounded border border-gray-500 text-gray-800" data-step-prev hidden>\n` +
    `    ← ${title('previous', 'Попереднє')}\n` +
    `  </button>\n` +
    `  <span data-step-spacer hidden></span>\n` +
    `  <button type="button" class="px-3 py-1.5 rounded bg-blue-600 text-white" data-step-next>\n` +
    `    ${title('next', 'Наступне')} →\n` +
    `  </button>\n` +
    `  <button type="button" class="px-3 py-1.5 rounded bg-green-600 text-white" data-submit hidden>\n` +
    `    <span data-submit-label>${title('submit', 'Надіслати')}</span>\n` +
    `    <span data-submit-busy hidden>${title('sending', 'Надсилаю')}` +
    `<span class="inline-block w-4 h-4 rounded-full animate-spin ml-2 align-middle" role="status"` +
    ` style="border:2px solid rgba(255,255,255,.4);border-top-color:#fff">` +
    `<span class="sr-only">${title('sending', 'Надсилаю')}</span></span></span>\n` +
    `  </button>\n` +
    `</div>\n` +
    `\n` +
    `<div data-submitted-block hidden>\n` +
    `  <div class="rounded-md border border-green-200 bg-green-50 text-center px-5 py-5">\n` +
    `    <h4 class="text-2xl font-semibold leading-tight text-green-800">${title('successTitle', 'Оголошення надіслано')}</h4>\n` +
    `    <p class="mb-0 text-green-700">${title('successText', 'Дякуємо!')}</p>\n` +
    `  </div>\n` +
    `</div>\n` +
    `\n` +
    `<div data-error-block hidden>\n` +
    `  <div class="rounded-md border border-red-200 bg-red-50 text-center px-5 py-4" role="alert">\n` +
    `    <h5 class="text-xl font-semibold leading-tight text-red-800">${title('errorTitle', 'Не вдалося надіслати оголошення')}</h5>\n` +
    `    <p class="mb-2 text-red-700" data-error-text></p>\n` +
    `    <p class="mb-3 text-xs text-gray-600" data-error-code-wrap hidden>\n` +
    `      ${title('errorCode', 'Код помилки')}: <span data-error-code></span>\n` +
    `    </p>\n` +
    `    <button type="button" class="px-2 py-1 rounded border border-red-300 text-red-700 text-sm" data-submit-retry>${title('retry', 'Спробувати ще раз')}</button>\n` +
    `  </div>\n` +
    `</div>\n` +
    `\n` +
    `<div class="mt-4">\n` +
    `  <div class="rounded-md border border-cyan-200 bg-cyan-50 py-3 px-5 text-base text-cyan-800 mb-3" style="display:none" id="local-notice"></div>\n` +
    `</div>`;

  return { top, bottom };
}

/** Renders the addon (prepend/append) modals a form defines, Tailwind-styled. */
function renderModals(list, opts = {}) {
  const close = raw(opts.close || 'Закрити');
  return list.map(({ id, modal }) =>
    `<div id="${attr(id)}" class="fixed inset-0 z-50 hidden" role="dialog"` +
    ` aria-labelledby="${attr(id)}Label" aria-hidden="true">\n` +
    `  <div class="absolute inset-0 bg-black bg-opacity-50" data-dismiss="modal"></div>\n` +
    `  <div class="relative mx-auto my-12 max-w-${attr(modal.size === 'lg' ? '3xl' : 'xl')} overflow-auto rounded bg-white text-gray-900 shadow-xl"` +
    ` style="max-height:90vh">\n` +
    `    <div class="flex items-start justify-between px-6 pt-5">\n` +
    `      <h5 class="font-semibold leading-tight text-xl" id="${attr(id)}Label">${raw(modal.title ?? '')}</h5>\n` +
    `      <button type="button" class="text-2xl leading-none text-gray-500 hover:text-gray-700" data-dismiss="modal" aria-label="Close" title="${attr(close)}">&times;</button>\n` +
    `    </div>\n` +
    `    <div class="px-6 pb-5 pt-3">${modal.markdown ? inlineMarkdown(modal.body) : raw(modal.body)}</div>\n` +
    `  </div>\n` +
    `</div>`
  ).join('\n');
}

export const tailwind = {
  name: 'tailwind',

  form(model, ctx) {
    const id = model.config.id || 'form';
    const submit = model.config.submit || model.config.settings?.submit || {};
    const action = submit.action || '';
    const method = submit.method || 'POST';

    const steps = model.steps
      .map((step, index) => renderStep(step, index, ctx))
      .join('');

    return `<form id="${attr(id)}-form" method="${attr(method)}"` +
      `${action ? ` action="${attr(safeHref(action))}"` : ''}` +
      ` novalidate autocomplete="off" data-form="${attr(id)}">${steps}</form>`;
  },

  field: renderField,
  labelHtml,
  requiredMarker,
  helperHtml,
  feedbackHtml,
  controlAttrs,
  addon,
  colClass: twCol,
  chrome: renderChrome,
  modals: renderModals,
  navTokens: NAV_TOKENS,
};