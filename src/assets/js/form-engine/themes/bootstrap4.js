// Bootstrap 4 theme for the form renderer.
//
// Every class string here is copied from _includes/form/** rather than from
// memory, because Phase 5 compares the output against the Liquid templates and
// a single wrong utility class shows up as a layout diff.
//
// What is deliberately NOT emitted: Alpine directives. The Liquid partials bind
// the form with x-model, :class, x-show and @change; this theme leaves those
// out and exposes `data-field` hooks instead, so the same markup works on a
// site with no Alpine at all - the Eleventy one has none. The controller that
// reacts to those hooks comes in Phase 2.

import { attr, inlineMarkdown, raw, safeHref, classes } from '../html.js';
import { autoCol, colFor } from '../layout.js';
import { resolveConditionalText } from '../conditions.js';
import { isFieldRequired } from '../validation.js';
import { filePlaceholders, fillFilePlaceholders } from '../data.js';
import { modalIdFor } from '../modals.js';

// ------------------------------------------------------------------ pieces ---

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// The magnifier icon both autocomplete and the location widget shade in,
// verbatim from their Liquid partials. Only the span class differs.
const searchIcon = (klass) =>
  `<span class="${attr(klass)}">` +
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<circle cx="7" cy="7" r="5"></circle>' +
  '<line x1="11" y1="11" x2="14.5" y2="14.5"></line>' +
  '</svg></span>';

// The map widget injects its layout CSS inline, exactly like the partial does.
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

/**
 * Label text.
 *
 * Field labels carry markdown on the label object; content types (paragraph,
 * heading, list) carry it on the field itself, which is a second place the
 * Liquid templates read it from. `forceMarkdown` covers that case.
 */
function labelBody(label, ctx, forceMarkdown) {
  if (label === null || label === undefined || label === '') return '';
  if (typeof label !== 'object' || Array.isArray(label)) {
    return forceMarkdown ? inlineMarkdown(label) : raw(label);
  }

  // `label.depends` is resolved against the whole label, because that is where
  // the partials read the conditions from; otherwise `label.text` itself may be
  // a condition list.
  const source = label.depends ? label : label.text;
  const text = resolveConditionalText(source, (path) => ctx.getData(path), '');
  if (!text) return '';
  return label.markdown ? inlineMarkdown(text) : raw(text);
}

function informerLink(label) {
  if (!label || typeof label !== 'object' || !label.informer) return '';
  return `<a href="${attr(safeHref(label.informer))}" target="_blank" class="ml-1">${raw(label.icon || 'ⓘ')}</a>`;
}

/** The `<label>` element a control points at, or '' when the field has none. */
function labelHtml(field, ctx) {
  const label = labelBody(field.label, ctx);
  const informer = informerLink(field.label);
  if (!label && !informer) return '';
  return `<label for="field_${attr(field.name)}">${label}${informer}</label>`;
}

/**
 * The red asterisk and its optional ⓘ link.
 *
 * Emitted without `x-show`: `hidden` is set only when the field is not
 * required right now, and the controller flips it as conditions change.
 */
function requiredMarker(field, ctx) {
  if (!field.required) return '';

  const settings = ctx.config?.settings?.required || {};
  const visible = isFieldRequired(field, {
    evaluateDepends: (deps) => ctx.evaluateDepends(deps),
  });
  const tooltip = settings.tooltip ? ` title="${attr(settings.tooltip)}"` : '';
  const informer = settings.informer
    ? `<a href="${attr(safeHref(settings.informer))}" target="_blank" class="ml-1">${raw(settings.icon || 'ⓘ')}</a>`
    : '';

  const cls = settings.class || '';
  const clsAttr = cls ? ` class="${attr(cls)}"` : '';
  return `<span${clsAttr}${visible ? '' : ' hidden'} data-required-marker="${attr(field.name)}"${tooltip}>${raw(settings.marker || '*')}${informer}</span>`;
}

function helperHtml(field) {
  if (!field.helper) return '';
  return `<small id="helper_${attr(field.name)}" class="form-text text-muted">${raw(field.helper)}</small>`;
}

/**
 * Legacy `textarea.html` renders a live "N символів залишилось" line below the
 * helper whenever `maxlength` is set; the plain text partial does not, so this
 * stays textarea-only. The page glue keeps the count in sync via the
 * data-char-counter/data-maxlength attributes.
 */
function charCounter(field) {
  if (field.type !== 'textarea') return '';
  if (field.maxlength === undefined || field.maxlength === null || field.maxlength === '') return '';
  return `<small class="form-text text-muted" data-char-counter="${attr(field.name)}" data-maxlength="${attr(field.maxlength)}"><span>${attr(field.maxlength)}</span> символів залишилось</small>`;
}

/**
 * The valid/invalid pair.
 *
 * No inline `display: block` and no `x-show`: Bootstrap already reveals them
 * from the `.is-valid` / `.is-invalid` state on the control, so the controller
 * only has to set that one class. Split into halves because the file field and
 * the widgets interleave their own containers between the two.
 */
function validFeedback(field, ctx) {
  const settings = ctx.config?.settings?.feedback || {};
  const own = field.feedback || {};
  const valid = own.valid || field.valid || settings.valid || '✓';
  return `<div class="valid-feedback">${raw(valid)}</div>`;
}

function invalidFeedback(field, ctx, copy) {
  const own = field.feedback || {};
  const text = copy !== undefined ? copy : own.invalid;
  const invalid = text
    ? raw(text)
    : `<span data-error="${attr(field.name)}"></span>`;
  return `<div class="invalid-feedback">${invalid}</div>`;
}

function feedbackHtml(field, ctx) {
  return validFeedback(field, ctx) + invalidFeedback(field, ctx);
}

/** Attributes every control shares, from _includes/form/attributes.html. */
function controlAttrs(field, opts = {}) {
  const parts = [];
  if (!opts.noId) parts.push(`id="field_${attr(field.name)}"`);
  parts.push(`name="${attr(field.name)}"`);
  parts.push(`data-field="${attr(field.name)}"`);

  // Liquid emits `required` for any truthy value, including the conditional
  // object form; with `novalidate` on the form it is decoration either way,
  // and the controller keeps it in sync.
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
    // `rows` is not here on purpose: the partial hardcodes rows="4" outside
    // attributes.html, and emitting it in both places produced a duplicate
    // attribute. renderField owns it instead.
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

// ----------------------------------------------------------------- addons ---

function addon(field, side) {
  const value = field[side];
  if (!value) return '';

  if (value.button) {
    const button = value.button;
    const modalId = modalIdFor(field, side);
    const klass = classes('btn', button.variant ? `btn-${button.variant}` : 'btn-primary', button.class);
    return `<div class="input-group-${side}"><button type="button" class="${attr(klass)}"` +
      `${button.title ? ` title="${attr(button.title)}"` : ''}` +
      ` data-toggle="modal" data-target="#${attr(modalId)}">${raw(button.label ?? button)}</button></div>`;
  }

  const text = typeof value === 'string' ? value : (value.text ?? '');
  const id = `inputGroup${capitalize(field.name)}${capitalize(side)}`;
  const klass = classes('input-group-text', value.class);
  return `<div class="input-group-${side}"><span class="${attr(klass)}" id="${attr(id)}">${raw(text)}</span></div>`;
}

// ------------------------------------------------------------ field types ---

/** A pattern is only usable as an attribute when it is a literal string. */
function staticPattern(field, ctx) {
  if (typeof field.pattern === 'string') return field.pattern;
  if (field.pattern !== undefined) return '';
  // Liquid applies the form wide pattern to text, tel and email alike. The
  // validator exempts email; the attribute does not. novalidate makes that
  // inert, and matching it keeps Phase 5 a faithful diff.
  return ctx.config?.settings?.pattern ?? '';
}

function textLike(field, ctx, type) {
  const hasAddons = Boolean(field.prepend || field.append);
  // `number` is the odd one out in the partials: no wrapper, no clear button.
  const hasClear = type !== 'number';
  const pattern = type === 'number' ? '' : ` pattern="${attr(staticPattern(field, ctx))}"`;

  const numberAttrs = type === 'number'
    ? ` min="${attr(field.min)}" max="${attr(field.max)}" step="${attr(field.step ?? 1)}"`
    : '';

  const control = `<input type="${attr(type)}" class="form-control"` +
    controlAttrs(field, { element: 'input', helper: field.helper }) +
    `${pattern}${numberAttrs} placeholder="${attr(field.placeholder ?? '')}"` +
    `${field.readonly === true ? ' readonly' : ''}>`;

  const wrapped = hasClear
    ? `<div class="text-input-wrapper">${control}<button type="button" class="btn-clear" title="Очистити поле" data-clear="${attr(field.name)}" hidden>&times;</button></div>`
    : control;

  if (!hasAddons) return wrapped;
  return `<div class="input-group">${addon(field, 'prepend')}${wrapped}${addon(field, 'append')}</div>`;
}

function textarea(field) {
  const control = `<textarea class="form-control"` +
    controlAttrs(field, { element: 'textarea', helper: field.helper }) +
    // Hardcoded in the partial as well; without it a textarea collapses to the
    // browser default of two rows.
    ` rows="${attr(field.rows ?? 4)}"` +
    ` placeholder="${attr(field.placeholder ?? '')}"${field.readonly === true ? ' readonly' : ''}></textarea>`;

  return `<div class="text-input-wrapper">${control}` +
    `<button type="button" class="btn-clear" title="Очистити поле" data-clear="${attr(field.name)}" hidden>&times;</button></div>`;
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

  return `<select class="form-control"` +
    controlAttrs(field, { element: 'select', helper: field.helper }) +
    `${field.readonly === true ? ' disabled' : ''}>${placeholder}${options}</select>`;
}

function radio(field, ctx) {
  const heading = `<label class="d-block">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</label>`;
  const options = (field.options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? value;
    return `<div class="custom-control custom-radio custom-control-inline">
        <input type="radio" class="custom-control-input" id="field_${attr(field.name)}_${attr(value)}" value="${attr(value)}" name="${attr(field.name)}" data-field="${attr(field.name)}"${field.required ? ' required' : ''}${field.readonly === true ? ' disabled' : ''}>
        <label class="custom-control-label" for="field_${attr(field.name)}_${attr(value)}">${raw(label)}</label>
      </div>`;
  }).join('');

  return `${heading}<div class="d-flex flex-wrap">${options}</div>`;
}

function checkbox(field, ctx) {
  return `<div class="custom-control custom-checkbox">
      <input type="checkbox" class="custom-control-input"` +
    controlAttrs(field, { element: 'input', helper: field.helper }) +
    `${field.readonly === true ? ' disabled' : ''}>
      <label class="custom-control-label" for="field_${attr(field.name)}">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</label>
    </div>`;
}

function checkboxGroup(field, ctx) {
  const variant = field.variant || 'secondary';
  const options = (field.options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? value;
    return `<label class="btn btn-outline-${attr(variant)} mr-2 mb-2" data-toggle-for="${attr(field.name)}" data-value="${attr(value)}">
        <input type="checkbox" value="${attr(value)}" name="${attr(field.name)}" data-group="${attr(field.name)}" data-field="${attr(field.name)}"${field.readonly === true ? ' disabled' : ''}> ${raw(label)}
      </label>`;
  }).join('');

  return `<fieldset class="mb-0 p-0">
      <legend class="d-block">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</legend>
      <div class="btn-group-toggle d-flex flex-wrap">${options}</div>
    </fieldset>`;
}

function hidden(field) {
  // The old modal emitted every hidden input with autocomplete="off" and no
  // visible id; the engine convention (`field_<name>`) stays so the binder can
  // target them uniformly.
  const value = field.value === undefined || field.value === null ? '' : field.value;
  return `<input type="hidden" id="field_${attr(field.name)}" name="${attr(field.name)}"` +
    ` data-field="${attr(field.name)}" autocomplete="off" value="${attr(value)}">`;
}

// ------------------------------------------------- autocomplete and file ----
//
// Both partials render their whole chrome - label, helper, feedback - inside
// the <div class="form-group" data-field-group> themselves, so unlike the text-like fields they
// are self-labelled in renderField too.

function autocomplete(field, ctx) {
  // The select and the search input mirror field/autocomplete.html one for
  // one, minus x-* / :* / @* bindings. Neither got a name in the Liquid
  // markup: the value travels in the app's data store, and the bind hooks
  // point the controller at both controls.
  const describedBy = field.helper ? ` aria-describedby="helper_${attr(field.name)}"` : '';
  const placeholder = field.placeholder || 'Введіть назву...';

  const select = `<select class="form-control" id="field_${attr(field.name)}"${describedBy}` +
    ` data-field="${attr(field.name)}">` +
    (field.placeholder ? `<option value="">${raw(field.placeholder)}</option>` : '') +
    `</select>`;

  const search = `<div class="position-relative">
      <input type="text" class="form-control autocomplete-search" autocomplete="off"` +
    ` id="field_${attr(field.name)}_search"${describedBy} placeholder="${attr(placeholder)}"` +
    ` data-autocomplete-search="${attr(field.name)}">
      ${searchIcon('autocomplete-search-icon')}
      <button type="button" class="btn-clear autocomplete-clear" title="Очистити поле" data-autocomplete-clear="${attr(field.name)}" hidden>&times;</button>
      <div class="dropdown-menu position-absolute w-100"` +
    ` style="max-height: 250px; overflow-y: auto; z-index: 1050;" data-autocomplete-dropdown="${attr(field.name)}">
        <div class="dropdown-item dropdown-item-empty" style="pointer-events: none;" data-autocomplete-noresults="${attr(field.name)}"></div>
      </div>
    </div>`;

  return `<div class="form-group" data-field-group>
    ${labelHtml(field, ctx)}${requiredMarker(field, ctx)}
    ${select}
    ${search}
    ${helperHtml(field)}
    ${feedbackHtml(field, ctx)}
  </div>`;
}

function file(field, ctx) {
  // field/file.html: a Bootstrap custom-file input plus the info line that
  // Liquid composes from file.minFiles/maxFiles/maxSize before rendering.
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

  const input = `<div class="custom-file">
      <input type="file" class="custom-file-input" id="field_${attr(field.name)}"` +
    controlAttrs(field, { element: 'input', helper: field.helper, noId: true }) +
    ` accept="${attr(field.accept ?? '')}"` +
    `${field.multiple ? ' multiple' : ''}>
      <label class="custom-file-label" for="field_${attr(field.name)}"></label>
    </div>
    <button type="button" class="btn-clear" title="Очистити файли" data-clear="${attr(field.name)}" hidden>&times;</button>`;

  return `<div class="form-group" data-field-group>
    ${labelHtml(field, ctx)}${requiredMarker(field, ctx)}
    <div class="text-input-wrapper">${input}</div>
    <small class="form-text text-muted">${raw(infoText)}</small>
    ${helperHtml(field)}
    ${validFeedback(field, ctx)}
    <div class="file-previews mt-2" hidden></div>
    ${invalidFeedback(field, ctx, invalidCopy)}
  </div>`;
}

// ----------------------------------------------------------------- widgets ---
//
// A `widgets` field defers to its `widget` name, and every widget owns the
// whole `<div class="col-12">` column itself - exactly like the content types
// but with f.class as the column (the partial's `default: 'col-12'`).

function widgetShell(field, inner, ctx) {
  const col = field.class || 'col-12';
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
    <div class="alert alert-info mt-2 mb-0 py-2" hidden><small>Turnstile пропущено (локальний режим)</small></div>
    <div class="alert alert-warning mt-2 mb-0 py-2" hidden>
      <small>Не вдалося завантажити перевірку.
        <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-captcha-retry="${attr(field.name)}">Спробувати ще раз</button>
      </small>
    </div>
    ${field.helper ? `<small class="form-text text-muted mt-1 d-block">${raw(field.helper)}</small>` : ''}
    ${invalidFeedback(field, ctx)}
  </div>`, ctx);
}

function widgetMap(field, ctx) {
  const marker = `<div class="map-marker-info" hidden>
    <div class="map-marker-info-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0a5 5 0 0 0-5 5c0 4.14 4.21 9.34 4.66 9.89a.44.44 0 0 0 .68 0C8.79 14.34 13 9.14 13 5a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
    </div>
    <div class="map-marker-info-body">
      <div class="map-marker-info-loading"><span class="spinner-border spinner-border-sm"></span> Визначаю адресу&hellip;</div>
      <div class="map-marker-info-address text-muted font-italic" data-map-fallback>Адресу не вдалося визначити</div>
      <div class="map-marker-info-address">Адреса: <span data-map-address="${attr(field.name)}"></span></div>
      <div class="map-marker-info-coords">Координати: <span data-map-coords="${attr(field.name)}"></span></div>
    </div>
  </div>`;

  const picker = field.height
    ? `<div id="map-picker" style="height: ${attr(field.height)}px;" class="border rounded" role="application" aria-labelledby="label_${attr(field.name)}"></div>`
    : `<div id="map-picker" class="border rounded map-picker-responsive" role="application" aria-labelledby="label_${attr(field.name)}"></div>`;

  const label = `<div class="mb-2" id="label_${attr(field.name)}">${labelBody(field.label, ctx)}${requiredMarker(field, ctx)}</div>`;

  return widgetShell(field, MAP_STYLE + `<div class="card mb-3">
    <div class="card-body p-2">
      ${label}
      ${marker}
      ${picker}
      ${field.helper ? `<small class="form-text text-muted mt-1">${raw(field.helper)}</small>` : ''}
      ${field.required ? invalidFeedback(field, ctx) : ''}
    </div>
  </div>`, ctx);
}

function widgetPriceInfo(field, ctx) {
  // visible content is entirely condition-bound in the partial; the static
  // skeleton is the card with an empty small.
  return widgetShell(field, `<div class="card bg-light mb-3">
    <div class="card-body py-2">
      <small class="text-muted d-block" data-price-info="${attr(field.name)}"></small>
    </div>
  </div>`, ctx);
}

function widgetLocation(field, ctx) {
  const root = field.name;
  const fields = (field.fields || []).map((sub) => {
    const describedBy = sub.helper ? ` aria-describedby="helper_${root}_${sub.name}"` : '';

    const select = `<select class="form-control" id="field_${root}_${sub.name}" name="${root}.${sub.name}"${describedBy}` +
      ` data-location-field="${sub.name}" data-location-root="${root}">` +
      `<option value="">${raw(sub.placeholder || 'Виберіть...')}</option></select>`;

    const search = `<div class="position-relative">
      <input type="text" class="form-control location-search" autocomplete="off"` +
      ` id="field_${root}_${sub.name}_search"${describedBy}` +
      ` placeholder="${attr(sub.placeholder || 'Введіть назву...')}"` +
      ` data-location-search="${sub.name}" data-location-root="${root}">
      ${searchIcon('location-search-icon')}
      <button type="button" class="btn-clear" title="Очистити поле" data-location-clear="${sub.name}" hidden>&times;</button>
      <div class="dropdown-menu position-absolute w-100"` +
      ` style="max-height: 250px; overflow-y: auto; z-index: 1050;" data-location-dropdown="${sub.name}">
        <div class="dropdown-item dropdown-item-empty" style="pointer-events: none;"></div>
      </div>
    </div>`;

    const feedback = invalidFeedback(
      { ...sub, name: `${root}.${sub.name}` },
      ctx,
    ) + validFeedback(sub, ctx);

    return `<div class="form-group" data-field-group>
      <label for="field_${root}_${sub.name}">${labelBody(sub.label, ctx)}${requiredMarker(sub, ctx)}</label>
      ${select}
      ${search}
      ${sub.helper ? `<small id="helper_${root}_${sub.name}" class="form-text text-muted">${raw(sub.helper)}</small>` : ''}
      ${feedback}
    </div>`;
  }).join('');

  const leaf = field.fields?.[field.fields.length - 1]?.name || '';

  return widgetShell(field, `<div class="card mb-3">
    <div class="card-body">
      ${field.label ? `<h6 class="card-title">${labelBody(field.label, ctx)}</h6>` : ''}
      ${field.helper ? `<small class="form-text text-muted mb-2">${raw(field.helper)}</small>` : ''}
      ${fields}
      <div class="mt-2" data-location-summary-panel hidden><div class="card bg-light mb-0"><div class="card-body py-2"><small class="text-muted d-block" data-location-summary="${leaf}"></small></div></div></div>
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

// These three render their own heading - a `<label>`, a `<legend>` and a label
// inside the custom control respectively - so the generic one is skipped.
const SELF_LABELLED = new Set(['radio', 'checkbox', 'checkbox_group']);

// autocomplete and the file input render the whole field - label, helper and
// both feedback blocks - from inside their form-group, just like the partials.
const SELF_CHROME = new Set(['autocomplete', 'file']);

const CONTENT_TYPES = new Set(['heading', 'paragraph', 'list', 'alert', 'badge', 'image', 'raw']);

// ---------------------------------------------------------------- content ----

function content(field, ctx) {
  const col = field.col || 'col-12';
  const depends = field.depends
    ? ` data-depends="${attr(JSON.stringify(field.depends))}"${ctx.evaluateDepends(field.depends) ? '' : ' hidden'}`
    : '';
  return `<div class="${attr(col)}"${depends}>${contentBody(field, ctx)}</div>`;
}

function contentBody(field, ctx) {
  const label = labelBody(field.label, ctx, field.markdown);
  const klass = field.class ? ` class="${attr(field.class)}"` : '';

  switch (field.type) {
    case 'heading': {
      const level = field.level || 2;
      return `<h${level}${klass}>${label}</h${level}>`;
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
        ? `<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>`
        : '';
      const full = classes('alert', `alert-${variant}`, field.class);
      return `<div class="${attr(full)}" role="alert">${label}${dismiss}</div>`;
    }
    case 'badge': {
      const variant = field.variant || 'secondary';
      const full = classes('badge', `badge-${variant}`, field.pill && 'badge-pill', field.class);
      return `<span class="${attr(full)}">${label}</span>`;
    }
    case 'image':
      return `<figure${klass}><img src="${attr(field.src)}" alt="${attr(field.alt ?? '')}" class="img-fluid">` +
        (field.caption
          ? `<figcaption class="figure-caption text-center mt-1">${raw(field.caption)}</figcaption>`
          : '') +
        `</figure>`;
    case 'raw':
      return raw(field.html ?? '');
    default:
      return '';
  }
}

// ----------------------------------------------------------------- fields ----

/**
 * One field, wrapped in its column.
 *
 * Content and widget types pick their column from `col`/`class` directly; only
 * plain fields go through fieldCol/autoCol. Three conventions, matching the
 * Liquid templates.
 */
export function renderField(field, ctx) {
  if (CONTENT_TYPES.has(field.type)) return content(field, ctx);
  if (field.type === 'widgets') {
    const renderer = WIDGET_TYPES[field.widget];
    return renderer ? renderer(field, ctx) : '';
  }

  const renderer = FIELD_TYPES[field.type];
  if (!renderer) return '';

  // Hidden fields carry the collected values, not a visible control: no column,
  // no label, no form-group, no feedback. They must stay inside the form for
  // serialisation to pick them up.
  if (field.type === 'hidden') return renderer(field, ctx);

  const auto = ctx.rowInfo.get(field.name)?.auto;
  const col = auto ? autoCol(field.name, ctx) : (field.col || colFor(field.name, ctx));

  const heading = SELF_LABELLED.has(field.type)
    ? ''
    : `${labelHtml(field, ctx)}${requiredMarker(field, ctx)}`;

  const inner = SELF_CHROME.has(field.type)
    ? renderer(field, ctx)
    : `<div class="form-group" data-field-group>
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
  const klass = row.class || 'row';
  const cols = (row.cols || []).map((col) => {
    const inner = (col.rows || []).map((nested) => renderRow(nested, ctx)).join('');
    return `<div class="${attr(col.class || 'col-12')}">${inner}</div>`;
  });

  if (cols.length > 0) return `<div class="${attr(klass)}">${cols.join('')}</div>`;

  const fields = (row.fields || []).map((field) => renderField(field, ctx)).join('');
  return `<div class="${attr(klass)}">${fields}</div>`;
}

function renderStep(step, index, ctx) {
  const rows = (step.rows || []).map((row) => renderRow(row, ctx)).join('');
  const hidden = ctx.step !== index ? ' hidden' : '';
  return `<div data-step="${index + 1}"${hidden}>${rows}</div>`;
}

// ------------------------------------------------------------------ chrome ---
//
// The wizard chrome (step indicator, titles, action bar, success/error blocks)
// used to live in the Liquid shell (_includes/form/app/shell.html). It is now
// rendered here so the whole page fragment is a pure function of the config,
// which is what lets Jekyll and Eleventy bake the same block from one engine.

const NAV_TOKENS = {
  current: ['bg-warning', 'text-dark'],
  done: ['bg-success', 'text-white'],
  todo: ['bg-primary', 'text-white'],
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
      `<div class="step-number rounded-circle d-inline-flex align-items-center justify-content-center ${nav.join(' ')}"` +
      ` data-step-nav="${n}">${n}</div>`,
    );
    if (i < steps.length - 1) {
      indicator.push('<div class="step-dot bg-warning rounded-circle"></div>');
    }
  });

  const top =
    `<div class="d-flex justify-content-between align-items-center flex-wrap step-indicator" data-step-indicator>\n` +
    `  ${indicator.join('\n  ')}\n` +
    `</div>\n` +
    `\n` +
    `<div class="text-center my-3">\n` +
    steps.map((step, i) => {
      const n = i + 1;
      const klass = step.class || 'h2';
      const hidden = n === 1 ? '' : ' hidden';
      return `  <div class="step-title ${attr(klass)} mb-0" data-step-title="${n}"${hidden}>${raw(step.title ?? '')}</div>`;
    }).join('\n') +
    `\n</div>`;

  const bottom =
    `<div class="d-flex justify-content-between mt-4" data-step-actions>\n` +
    `  <button type="button" class="btn btn-outline-secondary" data-step-prev hidden>\n` +
    `    ← ${title('previous', 'Попереднє')}\n` +
    `  </button>\n` +
    `  <span data-step-spacer hidden></span>\n` +
    `  <button type="button" class="btn btn-primary" data-step-next>\n` +
    `    ${title('next', 'Наступне')} →\n` +
    `  </button>\n` +
    `  <button type="button" class="btn btn-success" data-submit hidden>\n` +
    `    <span data-submit-label>${title('submit', 'Надіслати')}</span>\n` +
    `    <span data-submit-busy hidden>${title('sending', 'Надсилаю')}` +
    `<span class="spinner-border spinner-border-sm ml-2" role="status">` +
    `<span class="sr-only">${title('sending', 'Надсилаю')}...</span></span></span>\n` +
    `  </button>\n` +
    `</div>\n` +
    `\n` +
    `<div data-submitted-block hidden>\n` +
    `  <div class="alert alert-success text-center py-5">\n` +
    `    <h4 class="alert-heading">${title('successTitle', 'Оголошення надіслано')}</h4>\n` +
    `    <p class="mb-0">${title('successText', 'Дякуємо!')}</p>\n` +
    `  </div>\n` +
    `</div>\n` +
    `\n` +
    `<div data-error-block hidden>\n` +
    `  <div class="alert alert-danger text-center py-4" role="alert">\n` +
    `    <h5 class="alert-heading">${title('errorTitle', 'Не вдалося надіслати оголошення')}</h5>\n` +
    `    <p class="mb-2" data-error-text></p>\n` +
    `    <p class="mb-3 small text-muted" data-error-code-wrap hidden>\n` +
    `      ${title('errorCode', 'Код помилки')}: <span data-error-code></span>\n` +
    `    </p>\n` +
    `    <button type="button" class="btn btn-outline-danger btn-sm" data-submit-retry>${title('retry', 'Спробувати ще раз')}</button>\n` +
    `  </div>\n` +
    `</div>\n` +
    `\n` +
    `<div class="mt-4">\n` +
    `  <div class="alert alert-info mb-3" style="display:none" id="local-notice"></div>\n` +
    `</div>`;

  return { top, bottom };
}

/** Renders the addon (prepend/append) modals a form defines. */
function renderModals(list, opts = {}) {
  const close = raw(opts.close || 'Закрити');
  return list.map(({ id, modal }) =>
    `<div class="modal fade realestate" id="${attr(id)}" tabindex="-1" role="dialog"` +
    ` aria-labelledby="${attr(id)}Label" aria-hidden="true">\n` +
    `  <div class="modal-dialog${modal.size ? ` modal-${attr(modal.size)}` : ''}">\n` +
    `    <div class="modal-content text-white net-realestate">\n` +
    `      <div class="modal-header border-0">\n` +
    `        <h5 class="modal-title pl-2" id="${attr(id)}Label">${raw(modal.title ?? '')}</h5>\n` +
    `        <button type="button" class="close py-1 px-2" data-dismiss="modal" aria-label="Close" title="${attr(close)}">\n` +
    `          <span aria-hidden="true">&times;</span>\n` +
    `        </button>\n` +
    `      </div>\n` +
    `      <div class="modal-body pt-0 pb-4 px-4">${modal.markdown ? inlineMarkdown(modal.body) : raw(modal.body)}</div>\n` +
    `    </div>\n` +
    `  </div>\n` +
    `</div>`
  ).join('\n');
}

export const bootstrap4 = {
  name: 'bootstrap4',

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
  colClass: (string) => string || '',
  // State classes the binder toggles and the page glue reuses, so a third
  // theme can supply its own vocabulary without patching the glue (G-2).
  validationClasses: { invalid: 'is-invalid', valid: 'is-valid' },
  chrome: renderChrome,
  modals: renderModals,
  navTokens: NAV_TOKENS,
};
