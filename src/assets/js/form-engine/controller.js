// Instance controller: one per form, no module-level state.
//
// The legacy engine stored form state in module-level `fieldsCache`, `steps`
// and `fieldRowMap` (assets/js/form-engine.js:4-6), so the second form on a
// page silently overwrote the first one's index. Worse, server and client
// errors shared one map and clobbered each other: a server field error was
// wiped by the next client validation pass (assets/js/form-engine.js:688,710),
// and a failed submit replaced all freshly computed client errors with the
// worker's report (add-property.html:2599).
//
// Here everything lives in the instance and the two error maps stay apart:
// client errors are recomputed per input, server errors are cleared the moment
// the user edits that field, and what the page shows is a read-only merge.
//
// Pure of DOM. It tracks data and answers questions - is the field visible,
// what does its label say, what error is showing. Getting an input into it and
// moving pixels afterwards is the binder's job (Phase 3), so everything below
// runs under `node --test`.

import { buildModel, stepFields } from './model.js';
import { autoCol } from './layout.js';
import {
  asConditionList,
  evaluateDepends,
  getDataValue,
  resolveConditionalText,
} from './conditions.js';
import { fieldError, isFieldRequired } from './validation.js';

/** Collects the field names a single condition entry can read. */
function refsOf(entry, out) {
  if (!entry || typeof entry !== 'object') return;
  if (Array.isArray(entry)) {
    for (const e of entry) refsOf(e, out);
    return;
  }
  if (entry.field !== undefined) {
    if (Array.isArray(entry.field)) out.push(...entry.field);
    else out.push(entry.field);
  }
  if (entry.when && entry.when.field !== undefined) {
    if (Array.isArray(entry.when.field)) out.push(...entry.when.field);
    else out.push(entry.when.field);
  }
}

/**
 * Reverse index: which fields react when a given field changes.
 *
 * A change to `property_type` must re-render every field whose visibility,
 * required state, validation or label reads it - and re-validate them, because
 * an error that was valid copy five seconds ago may no longer apply.
 */
function buildDependents(model) {
  const map = new Map();
  const add = (from, target) => {
    if (target === undefined || target === null || from.name === undefined) return;
    if (!map.has(target)) map.set(target, new Set());
    map.get(target).add(from.name);
  };

  for (const field of model.fields) {
    const refs = [];

    for (const cond of asConditionList(field.depends)) refsOf(cond, refs);

    if (field.required && typeof field.required === 'object' && !Array.isArray(field.required)) {
      for (const cond of asConditionList(field.required.depends)) refsOf(cond, refs);
    } else {
      for (const cond of asConditionList(field.required)) refsOf(cond, refs);
    }

    if (field.label && typeof field.label === 'object' && !Array.isArray(field.label)) {
      for (const cond of asConditionList(field.label.depends)) refsOf(cond, refs);
    }

    if (field.validation) {
      for (const key of Object.keys(field.validation)) {
        const value = field.validation[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          for (const cond of asConditionList(value.depends)) refsOf(cond, refs);
        }
      }
      if (Array.isArray(field.validation.compare)) {
        for (const rule of field.validation.compare) refsOf(rule, refs);
      }
    }

    for (const target of new Set(refs)) add(field, target);
  }

  return map;
}

const defaultPluralizeFile = (n) =>
  n % 10 === 1 && n % 100 !== 11 ? 'файл' : n % 10 < 5 && n % 100 !== 12 && n % 100 !== 13 && n % 100 !== 14 ? 'файли' : 'файлів';

const defaultParseFileSize = (size) =>
  ({ display: `${size} MB` });

/** Mirrors the legacy audit's notion of "no content": an implicit false, an
 * empty string/null/undefined or an empty selection. */
const blankValue = (v) => v === '' || v === null || v === undefined || v === false ||
  (Array.isArray(v) && v.length === 0);

/**
 * One live instance of a form.
 *
 * @param {object} config  parsed form config (see _form-engine/schema)
 * @param {object} [opts]
 *   {object} [opts.data]           initial values
 *   {object} [opts.files]          field name -> list of file objects
 *   {object} [opts.fileValid]      field name -> parallel array of booleans
 *   {function} [opts.pluralizeFile]
 *   {function} [opts.parseFileSize]
 */
export function makeController(config, opts = {}) {
  const model = buildModel(config);
  const byName = model.byName;
  const dependents = buildDependents(model);

  const data = { ...(opts.data || {}) };
  const clientErrors = new Map();
  const serverErrors = new Map();
  // Page-layer findings - the email DNS check lives outside the validator, but
  // where the legacy engine wrote it into its errors map, so it has to be able
  // to surface the same way. Cleared the moment the user edits the field.
  const glueErrors = new Map();
  // Fields the user has actually worked with (or a step validate explicitly
  // included). A client error is computed eagerly for cascade dependents, but
  // before the field is engaged the page stays neutral - the legacy engine only
  // ever showed errors for fields it had touched or a step it had validated.
  const engaged = new Set();
  const files = { ...(opts.files || {}) };
  const fileValid = { ...(opts.fileValid || {}) };
  const captchaTokens = {};
  // A captcha that is skipped entirely (no CaptchaSite loaded, or the site runs
  // in local/disabled Turnstile mode) is "solved" without ever producing a
  // token. The page glue reports that verdict through setCaptchaSolved so the
  // required rule matches the legacy captchaSolved() (form-engine.js:172).
  const solvedCaptcha = new Set();
  const listeners = new Set();

  let step = 0;

  const getData = (path) => getDataValue(data, path);
  const evaluate = (deps) => evaluateDepends(deps, getData);
  const isVisible = (name) => {
    const field = byName.get(name);
    return field ? evaluate(field.depends || []) : true;
  };
  const layoutCtx = { rowInfo: model.rowInfo, byName, isVisible };
  const pluralizeFile = opts.pluralizeFile || defaultPluralizeFile;
  const parseFileSize = opts.parseFileSize || defaultParseFileSize;

  const makeCtx = () => ({
    config,
    data,
    getData,
    evaluateDepends: evaluate,
    isVisible,
    files,
    fileValid,
    pluralizeFile,
    parseFileSize,
    captchaSolved: (field) => {
      const token = captchaTokens[field.name];
      return solvedCaptcha.has(field.name) || Boolean(token);
    },
  });

  const notify = (event, names) => {
    for (const fn of listeners) {
      try {
        fn(event, names);
      } catch {
        // A broken listener must not take the form down with it.
      }
    }
  };

  const recompute = (name) => {
    const field = byName.get(name);
    if (!field) return '';
    // A page-layer finding no longer applies once the rules speak: editing the
    // field clears the DNS/glue error first (legacy: errors map rebuilt on
    // validateField).
    glueErrors.delete(name);
    const message = fieldError(field, makeCtx());
    if (message) clientErrors.set(name, message);
    else clientErrors.delete(name);
    return message;
  };

  return {
    getData: () => data,
    getValue: (name) => getDataValue(data, name),
    getClientErrors: () => Object.fromEntries(clientErrors),
    getServerErrors: () => Object.fromEntries(serverErrors),
    /** What the page shows for a field: the page layer first (a live DNS
     * verdict outranks a stale formula), then the server's report until the
     * user edits that field, otherwise the freshly computed client error. */
fieldError: (name) => glueErrors.get(name) ?? serverErrors.get(name) ?? clientErrors.get(name) ?? '',

    /** The raw validator verdict for a field, computed on the spot and ignoring
     * engagement. The wizard chrome gates the next/submit buttons with it, so an
     * untouched empty step keeps them disabled exactly like the legacy stepValid
     * (assets/js/form-engine.js:723) - {@link visibleError} still hides the red
     * until the field is engaged. */
    rawFieldError: (name) => {
      const field = byName.get(name);
      return field ? fieldError(field, makeCtx()) : '';
    },

    /** What the page may display for a field. Page-layer and server verdicts
     * always surface, but a client error computed for a field the user has not
     * touched stays hidden until the field is engaged (edited) or a step or
     * whole-form validation runs - that is what stops a cascade change from
     * painting every freshly revealed required field red before it is filled. */
    visibleError: (name) => {
      const nonClient = glueErrors.get(name) ?? serverErrors.get(name);
      if (nonClient !== undefined && nonClient !== null) return nonClient;
      const message = clientErrors.get(name) || '';
      if (!message) return '';
      if (engaged.has(name) || !blankValue(getDataValue(data, name))) return message;
      return '';
    },

    /** Marks a field as user-engaged; from then on its client error shows. */
    engage: (name) => engaged.add(name),

    /** The field definition this instance was built from. */
    field: (name) => byName.get(name) ?? null,

    /** Column classes an `auto: true` row wants for this field right now, or
     * null when the field is not in an auto row (legacy form-engine.js:422
     * autoCol - Alpine re-evaluated it on every change via `:class`, and the
     * binder replays that pass over the rendered columns). */
    autoCol: (name) => (model.rowInfo.get(name)?.auto ? autoCol(name, layoutCtx) : null),

    setData(name, value) {
      data[name] = value === undefined ? '' : value;
      serverErrors.delete(name);
      glueErrors.delete(name);

      const changed = new Set([name]);
      for (const dep of dependents.get(name) || []) changed.add(dep);
      for (const other of changed) if (other !== name) recompute(other);
      recompute(name);

      notify('setData', [...changed]);
      return { fields: [...changed] };
    },

    clearData(name) {
      return this.setData(name, '');
    },

    setFiles(name, list) {
      files[name] = list || [];
      recompute(name);
      notify('setFiles', [name]);
    },

    setFileValid(name, validities) {
      fileValid[name] = validities || [];
      recompute(name);
      notify('setFiles', [name]);
    },

    setCaptchaToken(name, token) {
      captchaTokens[name] = token ? token : '';
      recompute(name);
      notify('setCaptcha', [name]);
    },

    /** Reports whether the captcha is satisfied for a reason other than a token
     * - the widget is disabled or the host is local, so there is nothing to
     * solve. Mirrors the legacy captchaSolved() that consulted CaptchaSite. */
    setCaptchaSolved(name, solved) {
      if (solved) solvedCaptcha.add(name);
      else solvedCaptcha.delete(name);
      recompute(name);
      notify('setCaptcha', [name]);
    },

    /** Recomputes the single field's client error; returns its message. The
     * binder needs the name so the result stops being a silent side channel. */
    validateField(name) {
      engaged.add(name);
      const message = recompute(name);
      notify('validateField', [name]);
      return message;
    },

    /** All fields of one step must be valid to leave it (mirrors the original
     * nextStep behaviour). The recomputed names go to the binder too, so a
     * failed {@link next()} shows its errors instead of failing silently. */
    validateStep(index) {
      const names = [];
      let valid = true;
      for (const field of stepFields(model, index)) {
        names.push(field.name);
        engaged.add(field.name);
        if (recompute(field.name)) valid = false;
      }
      notify('validateStep', names);
      return valid;
    },

    /** Whole-form validation; jumps to the first step that has an error. */
    validateAll() {
      let valid = true;
      let firstErrorStep = -1;
      for (let i = 0; i < model.steps.length; i++) {
        let hasError = false;
        for (const field of stepFields(model, i)) {
          engaged.add(field.name);
          const message = recompute(field.name);
          if (message) {
            valid = false;
            hasError = true;
          }
        }
        if (hasError && firstErrorStep === -1) firstErrorStep = i;
      }
      if (firstErrorStep !== -1) step = firstErrorStep;
      notify('validateAll', []);
      return valid;
    },

    /** A worker reply is a complete report: it replaces the previous server
     * report wholesale, so an error the server no longer reports stops showing.
     * Client errors stay untouched - the legacy bug was exactly that the two
     * shared one map (assets/js/form-engine.js:688,710). */
    setServerErrors(errors) {
      serverErrors.clear();
      for (const name of Object.keys(errors || {})) serverErrors.set(name, errors[name]);
      notify('setServerErrors', Object.keys(serverErrors));
    },

    clearServerError(name) {
      serverErrors.delete(name);
      notify('clearServerErrors', [name]);
    },

    /** Page layer: a finding outside the validator (e.g. a dead email domain
     * from a DNS check). Overrides client and server errors until the rules or
     * the user reset it. */
    setGlueError(name, message) {
      if (!message) this.clearGlueError(name);
      else {
        glueErrors.set(name, String(message));
        notify('setGlueError', [name]);
      }
    },

    clearGlueError(name) {
      if (!glueErrors.delete(name)) return;
      notify('clearGlueError', [name]);
    },

    isFieldRequired: (name) => {
      const field = byName.get(name);
      return field ? isFieldRequired(field, makeCtx()) : false;
    },

    isFieldVisible: isVisible,

    /** Raw dependency check for any dependency list. The theme marks up the
     * markup objects themselves - columns, blocks, widget shells - with a
     * `data-depends` attribute, so the binder needs a check that is not tied to
     * a field definition. */
    evaluateDepends: (deps) => evaluate(deps || []),

    /** Resolved label copy for a field, honouring `label.depends`. */
    label(name) {
      const field = byName.get(name);
      if (!field || !field.label) return '';
      if (typeof field.label === 'string') return field.label;
      const source = field.label.depends ? field.label : field.label.text;
      return resolveConditionalText(source, getData, '');
    },

    /** Which fields re-render when `name` changes. Always includes itself. */
    dependentsOf: (name) => new Set([name, ...(dependents.get(name) || [])]),

    // Wizard step navigation, 0-based like the renderer.
    step: () => step,
    totalSteps: () => model.steps.length,
    setStep(index) {
      step = Math.max(0, Math.min(index, model.steps.length - 1));
      notify('setStep', []);
    },
    next() {
      if (step >= model.steps.length - 1) return false;
      if (!this.validateStep(step)) return false;
      step += 1;
      notify('setStep', []);
      return true;
    },
    prev() {
      if (step <= 0) return false;
      step -= 1;
      notify('setStep', []);
      return true;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export default makeController;