// Browser boot for page forms (the add-property wizard style).
//
// One entry for every page form: discover the <name>-config island, mount the
// rendered form, wire the controller/binder, the widget runtimes and the
// submit flow. Dispatched from app.js, the single loader entry - there are no
// per-form files.

import { FormRender } from './render.js';
import { makeController } from './controller.js';
import { bindForm } from './binder.js';
import { autocompleteFilter, autocompleteMatch, buildData, buildLocationIndex, buildLocationShowTypes, collectPhotos, fileNoticeFor, filePlural, findFieldInConfig, formatFileSize, locationAncestorsTail, locationDisplay, locationField, locationFieldNames, locationIsRequired, locationLocked, locationMethod, locationNearest, locationOptions, locationParent, locationPreset, locationReadonly, matchesValues, newFileName, parseFileSize, priceInfoHtml, resolveAutocompleteSource, stepFieldNames } from './data.js';
import { AP_ERROR_GENERIC, AP_ERROR_TEXTS, buildPayload, toFormData } from './submit.js';

// Nav-chip classes used when the island carries no theme tokens (bare mounts,
// tests). Matches the bootstrap4 theme, the engine default.
const DEFAULT_NAV = {
  current: ['bg-warning', 'text-dark'],
  done: ['bg-success', 'text-white'],
  todo: ['bg-primary', 'text-white'],
};

// ------------------------------------------------------------ browser boot ----

/**
 * Boots one FormEngine v2 form on the page. Discovery is generic: it finds the
 * `#<name>-config` JSON island (or `opts.name`) and mounts into `#<name>-app`,
 * so the same glue drives every form the engine renders, not just add-property.
 * Returns null when the page has no matching config island (safety: the module
 * may load on a page where the form was removed).
 *
 * @param {Document} root
 * @param {object} [opts]
 *   {string}   [opts.name]        form id; default: first `*-config` island
 *   {object}   [opts.Captcha]     default window.CaptchaSite
 *   {function} [opts.fetch]       default global fetch
 *   {function} [opts.setTimeout]  default setTimeout
 *   {function} [opts.setInterval] default setInterval
 *   {function} [opts.leaflet]     default window.L
 */
export function bootPage(root, opts = {}) {
  let name = opts.name || '';
  let configNode = name ? root.getElementById(`${name}-config`) : null;
  if (!configNode) {
    configNode = root.querySelector('script[type="application/json"][id$="-config"]');
  }
  if (!configNode) return null;
  name = configNode.id.slice(0, -'-config'.length);

  const app = root.getElementById(`${name}-app`);
  if (!app) return null;

  let config;
  try {
    config = JSON.parse(configNode.textContent);
  } catch (e) {
    return null;
  }

  const endpoint = app.getAttribute('data-endpoint') || (config.submit && config.submit.action) || '';
  config.submit = { ...(config.submit || {}), method: 'POST' };
  if (endpoint) config.submit.action = endpoint;

  const form = FormRender.mount(app, config, { theme: config.theme });
  const controller = makeController(config, { data: buildData(config) });

  // Chrome (nav buttons, blocks, indicator) lives in the form's page wrapper so
  // several forms can share a document without stepping on each other's nodes.
  // The fallback keeps bare mounts (tests, legacy pages) working.
  const scope = root.getElementById(`${name}-page`) || root;
  const qsa = (sel, s) => Array.prototype.slice.call((s || scope).querySelectorAll(sel));
  const el = (sel) => scope.querySelector(sel);

  // File inputs must not participate in the binder's data-field walk: they take
  // part in submit() via <input type=file> FormData appending (legacy behavior).
  qsa('input[type="file"][data-field]', form).forEach((input) => input.removeAttribute('data-field'));

  const theme = FormRender.theme(config.theme || 'bootstrap4');
  const binder = bindForm(form, controller, { classes: theme.validationClasses, colClass: theme.colClass });

  const Captcha = opts.Captcha !== undefined
    ? opts.Captcha
    : (typeof window !== 'undefined' ? window.CaptchaSite || null : null);
  const fetchImpl = opts.fetch || ((...args) => globalThis.fetch(...args));
  const later = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const every = opts.setInterval || ((fn, ms) => setInterval(fn, ms));
  const L = opts.leaflet !== undefined
    ? opts.leaflet
    : (typeof window !== 'undefined' ? window.L || null : null);

  const totalSteps = controller.totalSteps();
  const data = controller.getData();
  const rates = config.rates || { usd: 43.5, eur: 51.5, nbu: 43.2413 };

  // ------------------------------------------------------ wizard chrome ------
  const stepNavs = qsa('[data-step-nav]');
  const stepTitles = qsa('[data-step-title]');
  const prevBtn = el('[data-step-prev]');
  const nextBtn = el('[data-step-next]');
  const stepActions = el('[data-step-actions]');
  const stepSpacer = el('[data-step-spacer]');
  const submitBtn = el('[data-submit]');
  const submitLabel = el('[data-submit-label]');
  const submitBusy = el('[data-submit-busy]');
  const submittedBlock = el('[data-submitted-block]');
  const errorBlock = el('[data-error-block]');
  const errorText = el('[data-error-text]');
  const errorCode = el('[data-error-code]');
  const errorCodeWrap = el('[data-error-code-wrap]');
  const localNotice = el('#local-notice');
  // Worker code -> copy. A config may carry its own messages in submit.errors.
  const errorMap = { ...AP_ERROR_TEXTS, ...((config.submit && config.submit.errors) || {}) };
  const stepIndicator = el('[data-step-indicator]');
  const titleWrap = stepTitles.length ? stepTitles[0].parentElement : null;

  let state = { submitted: false, submitting: false, submittingError: false };

  const syncChrome = () => {
    const step = controller.step() + 1;
    const nav = (config.chrome && config.chrome.nav) || DEFAULT_NAV;
    for (const node of stepNavs) {
      const n = Number(node.getAttribute('data-step-nav'));
      const current = n === step;
      const done = n < step;
      for (const cls of nav.current.concat(nav.done, nav.todo)) node.classList.remove(cls);
      for (const cls of (current ? nav.current : done ? nav.done : nav.todo)) node.classList.add(cls);
      // aria-current for accessibility
      if (current) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    }
    for (const node of stepTitles) {
      const n = Number(node.getAttribute('data-step-title'));
      node.hidden = n !== step;
    }
    if (prevBtn) prevBtn.hidden = state.submitted || step <= 1;
    if (nextBtn) nextBtn.hidden = state.submitted || step >= totalSteps;
    if (stepActions) stepActions.hidden = state.submitted;
    if (stepSpacer) stepSpacer.hidden = state.submitted || step !== 1;
    if (submitBtn) {
      submitBtn.hidden = state.submitted || step !== totalSteps;
      submitBtn.disabled = state.submitting || !stepValid();
    }
    if (submitLabel) submitLabel.hidden = state.submitting;
    if (submitBusy) submitBusy.hidden = !state.submitting;
    if (nextBtn) nextBtn.disabled = !stepValid();
    if (stepIndicator) stepIndicator.hidden = state.submitted;
    if (titleWrap) titleWrap.hidden = state.submitted;
    if (submittedBlock) submittedBlock.hidden = !state.submitted;
    if (errorBlock) errorBlock.hidden = !state.submittingError;
    if (form) form.hidden = state.submitted;
  };

  const stepValid = () => {
    if (locationStepInvalid()) return false;
    const index = controller.step();
    const step = (config.steps || [])[index];
    if (!step) return true;
    for (const field of stepFieldNames(step)) {
      if (controller.rawFieldError(field.name)) return false;
    }
    return true;
  };

  const showLocalNotice = (text) => {
    if (!localNotice) return;
    localNotice.textContent = text;
    localNotice.style.display = text ? 'block' : 'none';
  };

  const showSubmitError = (code) => {
    state.submittingError = true;
    state.submitting = false;
    if (errorText) errorText.textContent = errorMap[code] || AP_ERROR_GENERIC;
    if (errorCode) {
      errorCode.textContent = code || '';
      // The wrap ships with `hidden`; toggle the property (not a `d-none` class)
      // or the attribute would keep it invisible even when a code exists.
      if (errorCodeWrap) errorCodeWrap.hidden = !code;
    }
    if (errorBlock) {
      errorBlock.hidden = false;
      errorBlock.scrollIntoView && errorBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (['E_CAPTCHA', 'E_CAPTCHA_REUSED', 'E_CAPTCHA_MALFORMED', 'E_CAPTCHA_ACTION', 'E_CAPTCHA_REQUIRED'].indexOf(code) !== -1) {
      resetCaptcha();
    }
  };

  //
  // The old Alpine block validated the location widget in submit() but the new
  // engine keeps the rules in the controller; here only the glue parts - the
  // widget cascade and the photos - are gate-checked by hand (form-engine.js:
  // 688,710 rebuilt the errors map and would wipe a widget finding otherwise).
  const submit = () => {
    if (state.submitting) return;
    showLocalNotice('');
    state.submittingError = false;
    if (errorBlock) errorBlock.hidden = true;
    if (!controller.validateAll()) {
      syncChrome();
      focusFirstInvalid();
      return;
    }
    const locNames = locationFieldNames(locationWidget());
    for (const fn of locNames) {
      if (locationIsRequired(locationWidget(), fn, evalDependsLocal) && !locData()[fn]) {
        controller.setGlueError(`${locRoot()}.${fn}`, locationFieldMessage(fn));
      } else {
        controller.clearGlueError(`${locRoot()}.${fn}`);
      }
    }
    for (const fn of locNames) {
      if (locationIsRequired(locationWidget(), fn, evalDependsLocal) && !locData()[fn]) return;
    }
    for (const field of captchaWidgets()) {
      if (Captcha && Captcha.enabled && !controllerSolved(field)) {
        controller.validateField(field.name);
        const boxSel = captchaSelector(field.name);
        const box = root.querySelector(boxSel);
        if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    const photos = collectPhotos((files['images'] || []), (processed['images'] || []));
    if (photos.error) {
      controller.setGlueError('images', photos.error);
      showLocalNotice(photos.error);
      return;
    }
    controller.clearGlueError('images');
    state.submitting = true;
    syncChrome();
    const tokens = {};
    for (const field of captchaWidgets()) {
      const selector = captchaSelector(field.name);
      tokens[field.token || 'cf-turnstile-response'] = Captcha ? Captcha.token(selector) : '';
    }
    const payload = buildPayload(data, tokens, photos);
    fetchImpl(endpoint, { method: 'POST', body: toFormData(payload) })
      .then((r) => r.json().then((res) => ({ ok: r.ok, body: res })))
      .then((res) => {
        if (res.body && res.body.success) {
          state.submitted = true;
          state.submittingError = false;
        } else if (res.body && res.body.errors) {
          controller.setServerErrors(res.body.errors);
        } else {
          showSubmitError(res.body && res.body.code);
        }
        syncChrome();
        // Focus management after submit
        if (state.submitted && submittedBlock) {
          later(() => submittedBlock.focus(), 0);
        } else if (state.submittingError && errorBlock) {
          later(() => errorBlock.focus(), 0);
        }
      })
      .catch(() => {
        showSubmitError('');
        syncChrome();
      })
      .finally(() => {
        state.submitting = false;
        syncChrome();
      });
  };

  const focusFirstInvalid = () => {
    later(() => {
      const el = form.querySelector('.' + theme.validationClasses.invalid);
      if (el) {
        el.focus && el.focus();
        el.scrollIntoView && el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  };

  const retryBtn = el('[data-submit-retry]');
  if (retryBtn) retryBtn.addEventListener('click', submit);

  const focusStepTitle = (stepNum) => {
    const title = el(`[data-step-title="${stepNum}"]`);
    if (title) {
      title.focus();
    }
  };

  if (prevBtn) prevBtn.addEventListener('click', () => { controller.prev(); focusStepTitle(controller.step() + 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (locationStepInvalid()) {
      syncChrome();
      focusFirstInvalid();
      return;
    }
    if (controller.next()) {
      focusStepTitle(controller.step() + 1);
    } else {
      syncChrome();
      focusFirstInvalid();
    }
  });
  if (submitBtn) submitBtn.addEventListener('click', submit);

  const scrollToIndicator = () => {
    if (stepIndicator && stepIndicator.scrollIntoView) stepIndicator.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ------------------------------------------------------------- widgets -----

  const widgetByName = (name) => {
    for (const step of config.steps || []) {
      for (const field of stepFieldNames(step)) {
        if (field.type === 'widgets' && field.widget === name) return field;
      }
    }
    return null;
  };

  const locationWidget = () => widgetByName('location');
  const mapField = () => widgetByName('map');
  const locRoot = () => (locationWidget() && locationWidget().name) || 'location_widget';
  const locData = () => {
    if (!data[locRoot()]) data[locRoot()] = {};
    return data[locRoot()];
  };

  // ---- location widget
  let addressIndex = [];
  let locationState = {};
  const shoType = {};
  let patternErrors = {};
  let noResults = {};
  let noResultsQuery = {};
  const locationFeedbackDefault = new WeakMap();

  const locationIndex = locationFieldNames;
  const locationIsSearchFor = (fieldName) => {
    const field = locationField(locationWidget(), fieldName);
    const mode = (field && field.mode) || 'auto';
    if (mode === 'search') return true;
    if (mode === 'select') return false;
    return locationOptionsList(fieldName).length > ((field && field.threshold) !== undefined ? field.threshold : 15);
  };

  const locationOptionsList = (fieldName) =>
    locationOptions(addressIndex, locationWidget(), fieldName, locData, locationPreset(locationWidget(), fieldName, (path) => controller.getValue(path)));

  const locationSearch = (fieldName, isFocus) => {
    const st = locationState[fieldName];
    if (!st) return;
    const raw = st.search ? st.search.trim() : '';
    const q = raw.toLowerCase();
    checkLocationPattern(fieldName, raw);
    if (patternErrors[fieldName]) {
      st.results = [];
      noResults[fieldName] = false;
      st.showDropdown = false;
      return;
    }
    const opts = locationOptionsList(fieldName);
    const searchName = q.split(' - ')[0].trim();
    const field = locationField(locationWidget(), fieldName);
    const minChars = (field && field.minChars !== undefined) ? field.minChars : 2;
    if (q.length < minChars) {
      if (isFocus && !locationIsSearchFor(fieldName)) {
        st.results = opts.slice(0, locationMaxResults(fieldName));
        st.showDropdown = true;
      } else {
        st.results = [];
        st.showDropdown = false;
      }
      st.highlightIndex = -1;
      noResults[fieldName] = false;
      return;
    }
    const results = [];
    for (const o of opts) {
      if (results.length >= locationMaxResults(fieldName)) break;
      if (String(o.name).toLowerCase().indexOf(searchName) !== -1) results.push(o);
    }
    st.results = results;
    st.highlightIndex = -1;
    noResults[fieldName] = results.length === 0;
    noResultsQuery[fieldName] = raw;
    st.showDropdown = true;
  };

  const locationMaxResults = (fieldName) => {
    const field = locationField(locationWidget(), fieldName);
    let v = (field && field.maxResults !== undefined) ? field.maxResults : 10;
    v = parseInt(v, 10);
    return (isNaN(v) || v < 1) ? 10 : v;
  };

  const checkLocationPattern = (fieldName, searchText) => {
    const field = locationField(locationWidget(), fieldName);
    const pattern = (field && field.pattern) || (config.settings && config.settings.pattern);
    if (!pattern || !searchText) { patternErrors[fieldName] = ''; return; }
    try {
      if (!new RegExp(pattern).test(searchText)) {
        patternErrors[fieldName] = (field && field.validation && field.validation.pattern) || (field && field.feedback && field.feedback.pattern) || (config.settings && config.settings.feedback && config.settings.feedback.pattern) || 'Неправильний формат';
      } else {
        patternErrors[fieldName] = '';
      }
    } catch (e) { patternErrors[fieldName] = ''; }
  };

  const locationNoResultsText = (fieldName) => {
    const q = noResultsQuery[fieldName] || '';
    const field = locationField(locationWidget(), fieldName);
    const msg = (field && field.noResults) || (config.settings && config.settings.noResults) || 'Запис "{q}" відсутній у списку';
    return msg.replace(/\{\{q\}\}/g, q).replace(/\{q\}/g, q);
  };

  // Legacy locationFillAncestors (method "two"): choosing the leaf fills every
  // ancestor from the option so the middle fields become visible and locked
  // (mirrors _includes/add-property.html locationFillAncestors).
  const locationFillAncestors = (entry) => {
    for (const a of entry._ancestors || []) {
      locData()[a.field] = a.id;
      locData()[`${a.field}Name`] = a.name;
      locData()[`${a.field}Type`] = a.type || '';
      const ast = locationState[a.field];
      if (ast) {
        ast.search = locationDisplay({ name: a.name, type: a.type }, shoType[a.field]);
        ast.results = [];
        ast.showDropdown = false;
        ast.highlightIndex = -1;
      }
      noResults[a.field] = false;
      patternErrors[a.field] = '';
      controller.engage(`${locRoot()}.${a.field}`);
      controller.clearGlueError(`${locRoot()}.${a.field}`);
    }
  };

  // A sub-field pinned by a single-value preset (value.default.value or a
  // matching value.depends rule) is never wiped by a cascade: the preset is a
  // fixed value the engine itself auto-fills (applyLocationPresets), and when
  // the field is readonly the user cannot re-enter it. Mirrors the single-id
  // rule applyLocationPresets uses to decide what it fills.
  const locationHasPreset = (fn) => {
    const preset = locationPreset(locationWidget(), fn, (p) => controller.getValue(p));
    return !!(preset && preset.length === 1);
  };

  // Legacy clearLocationAncestors (method "two"): clearing the leaf wipes the
  // fields before it instead of cascading into descendants. A preset ancestor
  // (e.g. a readonly preset oblast) is kept - wiping it would drop a value the
  // user cannot restore.
  const locationClearAncestors = (fieldName) => {
    const names = locationIndex(locationWidget());
    const idx = names.indexOf(fieldName);
    for (let i = 0; i < idx; i++) {
      const fn = names[i];
      if (locationHasPreset(fn)) { syncLocationField(fn); continue; }
      locData()[fn] = '';
      locData()[`${fn}Name`] = '';
      locData()[`${fn}Type`] = '';
      const s = locationState[fn];
      if (s) { s.search = ''; s.results = []; s.showDropdown = false; s.highlightIndex = -1; }
      noResults[fn] = false;
      patternErrors[fn] = '';
      controller.clearGlueError(`${locRoot()}.${fn}`);
      syncLocationField(fn);
    }
  };

  const locationEntryById = (fieldName, id) =>
    addressIndex.find((s) => s._field === fieldName && String(s.id) === String(id));

  const locationSelectById = (fieldName, id) => {
    if (id === '' || id === null || id === undefined) { locationClear(fieldName); return; }
    const widget = locationWidget();
    const names = locationIndex(widget);
    const entry = addressIndex.find((s) => s._field === fieldName && String(s.id) === String(id));
    locData()[fieldName] = entry ? entry.id : id;
    locData()[`${fieldName}Name`] = entry ? entry.name : '';
    locData()[`${fieldName}Type`] = entry ? (entry.type || '') : '';
    // Legacy locationSelect: method "two" fills the leaf's ancestors, then
    // cascades the descendants away in every method (a leaf has none).
    if (locationMethod(widget) === 'two' && names.indexOf(fieldName) === names.length - 1 && entry) {
      locationFillAncestors(entry);
    }
    for (const other of names) {
      if (other === fieldName) continue;
      let p = locationParent(widget, other);
      while (p) {
        if (p === fieldName) break;
        p = locationParent(widget, p);
      }
      if (p === fieldName) {
        if (locationHasPreset(other)) continue;
        locData()[other] = '';
        locData()[`${other}Name`] = '';
        locData()[`${other}Type`] = '';
        // Legacy locationCascade -> _wipeLocationField: the parent pick also
        // drops the descendant's typed text, pattern/no-results state and its
        // error, or a failed submit keeps the child red until it is re-touched
        // (the DOM itself is re-synced by refreshRelated below).
        const os = locationState[other];
        if (os) { os.search = ''; os.results = []; os.showDropdown = false; os.highlightIndex = -1; }
        patternErrors[other] = '';
        noResults[other] = false;
        noResultsQuery[other] = '';
        controller.clearGlueError(`${locRoot()}.${other}`);
      }
    }
    patternErrors[fieldName] = '';
    controller.clearGlueError(`${locRoot()}.${fieldName}`);
    const st = locationState[fieldName];
    if (st) {
      st.search = locationDisplay(entry, shoType[fieldName]);
      st.results = [];
      st.showDropdown = false;
      st.highlightIndex = -1;
      noResults[fieldName] = false;
    }
    syncLocationField(fieldName);
    syncSummary();
    refreshRelated(fieldName);
    controller.setData(locRoot(), locData());
  };

  const locationClear = (fieldName) => {
    locData()[fieldName] = '';
    locData()[`${fieldName}Name`] = '';
    locData()[`${fieldName}Type`] = '';
    const st = locationState[fieldName];
    if (st) { st.search = ''; st.results = []; st.showDropdown = false; st.highlightIndex = -1; }
    noResults[fieldName] = false;
    patternErrors[fieldName] = '';
    controller.clearGlueError(`${locRoot()}.${fieldName}`);
    syncLocationField(fieldName);
    syncSummary();
    const widget = locationWidget();
    const names = locationIndex(widget);
    // Legacy locationClear: method "two" clearing the leaf wipes its ancestors,
    // every other field cascades into its descendants.
    if (locationMethod(widget) === 'two' && names.indexOf(fieldName) === names.length - 1) {
      locationClearAncestors(fieldName);
    } else {
      for (const other of names) {
        if (locationParent(widget, other) === fieldName || isDescendantOf(other, fieldName)) {
          if (locationHasPreset(other)) { syncLocationField(other); continue; }
          locData()[other] = '';
          locData()[`${other}Name`] = '';
          locData()[`${other}Type`] = '';
          const s = locationState[other];
          if (s) { s.search = ''; s.results = []; s.showDropdown = false; s.highlightIndex = -1; }
          patternErrors[other] = '';
          controller.clearGlueError(`${locRoot()}.${other}`);
          syncLocationField(other);
        }
      }
    }
    refreshRelated(fieldName);
    controller.setData(locRoot(), locData());
  };

  const isDescendantOf = (node, ancestor) => {
    let p = locationParent(locationWidget(), node);
    while (p) {
      if (p === ancestor) return true;
      p = locationParent(locationWidget(), p);
    }
    return false;
  };

  // Editing the visible text of a location search field away from the picked
  // label drops the stored value: the id must never survive behind a label the
  // user has overwritten. The typed text is untouched - the caller re-renders
  // the search state right after (legacy kept a stale id here, so the field
  // could stay valid while showing garbage).
  const locationDeselect = (fieldName) => {
    const widget = locationWidget();
    const names = locationIndex(widget);
    const clearOne = (fn) => {
      locData()[fn] = '';
      locData()[`${fn}Name`] = '';
      locData()[`${fn}Type`] = '';
      patternErrors[fn] = '';
      noResults[fn] = false;
      noResultsQuery[fn] = '';
      controller.clearGlueError(`${locRoot()}.${fn}`);
    };
    clearOne(fieldName);
    for (const other of names) {
      if (other === fieldName) continue;
      if (locationParent(widget, other) === fieldName || isDescendantOf(other, fieldName)) {
        if (locationHasPreset(other)) { syncLocationField(other); continue; }
        clearOne(other);
        const s = locationState[other];
        if (s) { s.search = ''; s.results = []; s.showDropdown = false; s.highlightIndex = -1; }
        syncLocationField(other);
      }
    }
    refreshRelated(fieldName);
    syncSummary();
    controller.setData(locRoot(), locData());
  };

  const locationShouldShow = (fieldName) => {
    const method = locationMethod(locationWidget());
    const names = locationIndex(locationWidget());
    const isRoot = !locationParent(locationWidget(), fieldName);
    const isLeaf = names.indexOf(fieldName) === names.length - 1;
    if (method === 'one') {
      if (isRoot) return true;
      const parent = locationParent(locationWidget(), fieldName);
      return !!(parent && locData()[parent]);
    }
    if (isRoot || isLeaf) return true;
    return !!locData()[fieldName];
  };

  const evalDependsLocal = (deps) => {
    let ok = true;
    for (const d of deps || []) {
      if (!matchesValues(controller.getValue(d.field), d.values, d.except)) { ok = false; break; }
    }
    return ok;
  };

  // The location widget's required sub-fields live in the glue layer, not as
  // controller fields (the widget root carries no `required`), so stepValid's
  // per-field rawFieldError loop misses them. Gate the current step on the
  // first revealed required sub-field that is still unpicked.
  const locationStepInvalid = () => {
    const widget = locationWidget();
    if (!widget) return false;
    const step = (config.steps || [])[controller.step()];
    if (!step) return false;
    const mountsLocation = stepFieldNames(step).some((f) => f && f.type === 'widgets' && f.widget === 'location');
    if (!mountsLocation) return false;
    return locationIndex(widget).some((fieldName) =>
      locationShouldShow(fieldName) &&
      locationIsRequired(widget, fieldName, evalDependsLocal) &&
      !locData()[fieldName]);
  };

  const fieldReadonly = (name) => {
    const field = findFieldInConfig(config, name);
    return !!(field && field.readonly === true);
  };

  const locationFieldMessage = (fieldName) => {
    const field = locationField(locationWidget(), fieldName);
    const v = field && field.validation;
    if (v && v.required !== undefined) {
      const req = v.required;
      if (typeof req === 'string') return req;
      if (req && typeof req === 'object') {
        if (Array.isArray(req.depends)) {
          for (const d of req.depends) {
            if (matchesValues(controller.getValue(d.field), d.values, d.except) && d.text !== undefined && d.text !== '') {
              return d.text;
            }
          }
        }
        if (req.text !== undefined) return req.text;
      }
    }
    if (field && field.message) return field.message;
    const settings = config && config.settings;
    if (settings && settings.required && settings.required.message) return settings.required.message;
    return "Це поле обов'язкове";
  };

  // Legacy validateLocationField (add-property.html:1587): a blur touches the
  // sub-field and shows the required message with the full precedence order.
  const validateLocationSubfield = (fieldName) => {
    const val = locData()[fieldName];
    const empty = val === '' || val === null || val === undefined;
    if (locationIsRequired(locationWidget(), fieldName, evalDependsLocal) && empty) {
      controller.setGlueError(`${locRoot()}.${fieldName}`, locationFieldMessage(fieldName));
    } else {
      controller.clearGlueError(`${locRoot()}.${fieldName}`);
    }
    syncLocationField(fieldName);
  };

  // Valid means committed: the stored value exists and, in search mode, the
  // visible text still carries its label. Uncommitted search text is never
  // valid - the field is invalid while the text cannot lead anywhere (pattern
  // failure, too short, or no match) and stays neutral only while a query with
  // candidates is being typed.
  const syncLocationField = (fieldName) => {
    const glueName = `${locRoot()}.${fieldName}`;
    const field = locationField(locationWidget(), fieldName);
    const st = locationState[fieldName] || { search: '', results: [], showDropdown: false, highlightIndex: -1 };
    const value = locData()[fieldName];
    const entry = value ? locationEntryById(fieldName, value) : null;
    const display = entry ? locationDisplay(entry, shoType[fieldName]) : '';
    const patternErr = patternErrors[fieldName] || '';
    const useSearch = locationIsSearchFor(fieldName);
    const committed = Boolean(value) && (!useSearch || (st.search || '') === display);
    let err = '';
    if (!useSearch) {
      err = controller.visibleError(glueName) || '';
    } else if (patternErr) {
      err = patternErr;
    } else if (committed) {
      err = '';
    } else if (controller.visibleError(glueName)) {
      // A blur (validateLocationSubfield) or submit set the required message; it
      // must win over the neutral "typing a query with candidates" state, exactly
      // like legacy's errors[field] || patternError class binding.
      err = controller.visibleError(glueName);
    } else if (st.search) {
      const raw = st.search.trim();
      const minChars = (field && field.minChars !== undefined) ? field.minChars : 2;
      if (raw.length >= minChars) {
        if (!((st.results || []).length)) err = locationNoResultsText(fieldName);
      } else {
        err = locationFieldMessage(fieldName);
      }
    }
    const valueOk = Boolean(value);
    const ok = committed && !err;
    const select = form.querySelector(`select[data-location-field="${fieldName}"]`);
    if (select) {
      select.classList.toggle(theme.validationClasses.invalid, Boolean(err));
      select.classList.toggle(theme.validationClasses.valid, !err && valueOk);
    }
    const search = form.querySelector(`input[data-location-search="${fieldName}"]`);
    if (search) {
      search.classList.toggle(theme.validationClasses.invalid, Boolean(err));
      search.classList.toggle(theme.validationClasses.valid, ok);
      search.title = err ? err : '';
    }
    // The sub-field feedback blocks live in the same .form-group, a shell the
    // binder does not scope by data-field-col; show them the same way (legacy:
    // inline display: block), not through the Bootstrap sibling selector.
    const control = select || search;
    const group = control ? control.closest('[data-field-group]') : null;
    if (group) {
      for (const node of group.querySelectorAll('.invalid-feedback')) {
        node.style.display = err ? 'block' : 'none';
        const span = node.querySelector('[data-error]');
        if (span) {
          span.textContent = err;
        } else {
          // The baked copy for location sub-fields is static `feedback.invalid`
          // text with no [data-error] slot (legacy showed the pattern/glue
          // message there instead); swap it in and keep the original to restore.
          if (!locationFeedbackDefault.has(node)) locationFeedbackDefault.set(node, node.textContent);
          node.textContent = err || locationFeedbackDefault.get(node);
        }
      }
      for (const node of group.querySelectorAll('.valid-feedback')) node.style.display = ok ? 'block' : 'none';
    }
  };

  const syncSummary = () => {
    const leaf = locationIndex(locationWidget()).slice(-1)[0];
    const panel = form.querySelector('[data-location-summary-panel]');
    if (!panel) return;
    const box = form.querySelector('[data-location-summary]');
    if (!leaf || !locData()[leaf]) {
      panel.hidden = true;
      return;
    }
    const parts = [];
    const names = locationIndex(locationWidget());
    // Legacy locationSummary (add-property.html:2009): leaf as "type name",
    // the penultimate row cleaned to "... територіальна громада", and the
    // country pinned at the end.
    for (let i = 0; i < names.length; i++) {
      const fn = names[i];
      const name = locData()[`${fn}Name`] || '';
      const type = locData()[`${fn}Type`] || '';
      if (fn === leaf) {
        if (type) parts.push(type + ' ' + name);
        else if (name) parts.push(name);
      } else if (i === names.length - 2) {
        const clean = name.replace('територіальна громада', '').trim();
        if (type) parts.push(clean + ' ' + type + ' територіальна громада');
        else if (clean) parts.push(clean);
      } else if (name) {
        parts.push(name);
      }
    }
    parts.push('Україна');
    if (box) box.textContent = parts.join(', ');
    panel.hidden = false;
  };

  const refreshRelated = (fieldName) => {
    for (const other of locationIndex(locationWidget())) {
      if (locationParent(locationWidget(), other) !== fieldName && !isDescendantOf(other, fieldName)) continue;
      syncFieldWrapper(other, true);
    }
  };

  // The clear button and the magnifier are pure chrome: they follow the field
  // value, the typed text and the lock state. Alpine bound them with x-show, so
  // they tracked every keystroke; here they are synced from both the full
  // wrapper sync and the input/focus handlers (typing changes no controller
  // state, so no wrapper sync fires on its own).
  const syncLocationChrome = (fieldName) => {
    const locked = locationLocked(locationWidget(), fieldName, locationReadonly(locationWidget(), fieldName, (p) => controller.getValue(p)), locData);
    const search = form.querySelector(`input[data-location-search="${fieldName}"]`);
    if (!search) return;
    const st = locationState[fieldName] || { search: '', results: [], showDropdown: false, highlightIndex: -1 };
    const shown = Boolean(st.search || locData()[fieldName]);
    const clearBtn = form.querySelector(`[data-location-clear="${fieldName}"]`);
    if (clearBtn) clearBtn.hidden = !shown || locked;
    const icon = search.parentElement ? search.parentElement.querySelector('.location-search-icon') : null;
    if (icon) icon.hidden = shown || locked;
  };

  const syncFieldWrapper = (fieldName, force) => {
    const sel = form.querySelector(`select[data-location-field="${fieldName}"]`);
    const group = sel ? sel.closest('[data-field-group]') : null;
    if (group) group.hidden = !locationShouldShow(fieldName);
    const locked = locationLocked(locationWidget(), fieldName, locationReadonly(locationWidget(), fieldName, (p) => controller.getValue(p)), locData);
    const select = form.querySelector(`select[data-location-field="${fieldName}"]`);
    const search = form.querySelector(`input[data-location-search="${fieldName}"]`);
    const searchWrap = search ? search.closest('.position-relative') : null;
    const useSearch = locationIsSearchFor(fieldName);
    if (select) {
      select.hidden = useSearch;
      select.disabled = locked;
      // In search mode the select is hidden and driven by the dropdown, so skip
      // rebuilding its options: the leaf can carry tens of thousands of them and
      // this runs on every controller change (legacy rebuilt it too, but only
      // Alpine-visible options, so the cost was never paid for a hidden select).
      if (!useSearch) renderLocationOptions(fieldName, select);
      select.value = locData()[fieldName] || '';
    }
    if (search) {
      if (searchWrap) searchWrap.hidden = useSearch ? false : true;
      search.readOnly = locked;
      const st = locationState[fieldName] || { search: '', results: [], showDropdown: false, highlightIndex: -1 };
      locationState[fieldName] = st;
      // Combobox ARIA attributes
      if (useSearch) {
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-autocomplete', 'list');
        search.setAttribute('aria-expanded', st.showDropdown ? 'true' : 'false');
        search.setAttribute('aria-controls', `loc-dropdown-${fieldName}`);
      }
      // Derive the display text only for an untouched field: an in-progress
      // query is never wiped by an unrelated controller change (legacy kept it
      // too - nothing outside clear/select rewrote locationState.search), and
      // a focused input is never rewritten under the cursor.
      if (!st.search && locData()[fieldName] && document.activeElement !== search) {
        const entry = addressIndex.find((s) => s._field === fieldName && String(s.id) === String(locData()[fieldName]));
        st.search = entry ? locationDisplay(entry, shoType[fieldName]) : '';
      }
      search.value = st.search;
      syncLocationChrome(fieldName);
      renderLocationDropdown(fieldName, st);
    }
    // Legacy rewrites the label target when the control flips between the
    // select and the search input (widget/location.html:12-13).
    const label = form.querySelector(`label[for^="field_${locRoot()}_${fieldName}"]`);
    if (label) label.setAttribute('for', `field_${locRoot()}_${fieldName}${useSearch ? '_search' : ''}`);
    syncLocationField(fieldName);
    if (force) syncSummary();
  };

  const renderLocationOptions = (fieldName, select) => {
    const opts = locationOptionsList(fieldName);
    const placeholder = select.querySelector('option[value=""]');
    const placeholderText = placeholder ? placeholder.textContent : '';
    select.innerHTML = '';
    if (placeholderText) {
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = placeholderText;
      select.appendChild(ph);
    }
    for (const o of opts) {
      const option = document.createElement('option');
      option.value = o.id;
      option.textContent = locationDisplay(o, shoType[fieldName]);
      select.appendChild(option);
    }
    select.value = locData()[fieldName] || '';
  };

  const renderLocationDropdown = (fieldName, st) => {
    const dropdown = form.querySelector(`[data-location-dropdown="${fieldName}"]`);
    if (!dropdown) return;
    dropdown.style.display = st.showDropdown ? 'block' : 'none';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('id', `loc-dropdown-${fieldName}`);
    const items = dropdown.querySelectorAll('.dropdown-item');
    for (const item of Array.prototype.slice.call(items)) item.remove();
    const host = dropdown;
    const showInfo = showParentInfoFor(fieldName);
    const search = form.querySelector(`input[data-location-search="${fieldName}"]`);
    if (st.results.length || noResults[fieldName]) {
      for (let i = 0; i < st.results.length; i++) {
        const o = st.results[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', st.highlightIndex === i ? 'true' : 'false');
        btn.setAttribute('id', `loc-option-${fieldName}-${i}`);
        // Legacy location widget adds `searchable-dropdown-item` so the item
        // wraps (white-space: normal in _buttons.scss) instead of pushing a
        // horizontal scrollbar when the ancestor tail is shown.
        btn.className = 'dropdown-item'
          + (showInfo ? ' searchable-dropdown-item' : '')
          + (st.highlightIndex === i ? ' highlighted' : '');
        // Both mousedown (legacy mouse) and click (keyboard Enter/Space) for activation
        const pick = () => { locationSelectById(fieldName, o.id); };
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); pick(); });
        btn.addEventListener('click', (e) => { e.preventDefault(); pick(); });
        btn.addEventListener('mouseenter', () => { st.highlightIndex = i; renderLocationDropdown(fieldName, st); });
        const span = document.createElement('span');
        span.textContent = locationDisplay(o, shoType[fieldName]);
        btn.appendChild(span);
        if (showInfo) {
          const sub = document.createElement('small');
          sub.className = 'dropdown-item-info';
          sub.textContent = ' ' + locationNearest(o);
          btn.appendChild(sub);
          const tail = document.createElement('div');
          tail.className = 'dropdown-item-tail';
          tail.textContent = locationAncestorsTail(o);
          btn.appendChild(tail);
        }
        host.appendChild(btn);
      }
      if (noResults[fieldName] && !st.results.length) {
        const div = document.createElement('div');
        div.className = 'dropdown-item dropdown-item-empty';
        div.style.pointerEvents = 'none';
        div.setAttribute('role', 'option');
        div.setAttribute('aria-selected', 'false');
        div.textContent = locationNoResultsText(fieldName);
        host.appendChild(div);
      }
      // aria-activedescendant on search input
      if (search && st.highlightIndex >= 0 && st.highlightIndex < st.results.length) {
        search.setAttribute('aria-activedescendant', `loc-option-${fieldName}-${st.highlightIndex}`);
      } else if (search) {
        search.removeAttribute('aria-activedescendant');
      }
    }
  };

  const showParentInfoFor = (fieldName) => {
    const field = locationField(locationWidget(), fieldName);
    if (field && field.showParentInfo !== undefined) return !!field.showParentInfo;
    return locationMethod(locationWidget()) === 'two' && locationIndex(locationWidget()).indexOf(fieldName) === locationIndex(locationWidget()).length - 1;
  };

  const applyLocationPresets = () => {
    for (const fn of locationIndex(locationWidget())) {
      const fcfg = locationField(locationWidget(), fn);
      if (!fcfg || !fcfg.value) continue;
      const vals = locationPreset(locationWidget(), fn, (p) => controller.getValue(p));
      if (!vals || vals.length !== 1) continue;
      if (!locData()[fn] || String(locData()[fn]) !== String(vals[0])) {
        locationSelectById(fn, vals[0]);
        syncFieldWrapper(fn, true);
      }
    }
  };

  // ---- file fields
  const files = {};
  const processed = {};
  const filePreviewMap = {};
  const fileOrigSizes = {};
  const fileNewSizes = {};
  const fileDims = {};
  const fileStamp = {};
  const fileFeedbackDefault = new WeakMap();

  const fileField = () => findFieldInConfig(config, 'images') || widgetByName('file_handle');
  const fileCfg = () => (fileField() && fileField().file) || {};

  qsa('input[type="file"]', form).forEach((input) => {
    const name = input.getAttribute('name') || (input.getAttribute('id') || '').replace(/^field_/, '');
    if (!name) return;
    files[name] = files[name] || [];
    processed[name] = processed[name] || [];
    filePreviewMap[name] = filePreviewMap[name] || [];
    fileOrigSizes[name] = fileOrigSizes[name] || [];
    fileNewSizes[name] = fileNewSizes[name] || [];
    fileDims[name] = fileDims[name] || [];
    const label = input.closest('.custom-file') && input.closest('.custom-file').querySelector('.custom-file-label');
    input.addEventListener('change', () => handleFileChange(input, name, label));
    const clearBtn = form.querySelector(`[data-clear="${name}"]`);
    if (clearBtn) clearBtn.addEventListener('click', () => clearAllFiles(name));
  });

  const handleFileChange = (input, name) => {
    const newFiles = Array.prototype.slice.call(input.files);
    const all = (files[name] || []).slice().concat(newFiles);
    files[name] = all;
    fileOrigSizes[name] = all.map((f) => f.size);
    fileDims[name] = all.map(() => null);
    fileNewSizes[name] = all.map(() => null);
    processed[name] = all.map(() => null);
    filePreviewMap[name] = all.map(() => null);
    fileStamp[name] = Math.floor(Date.now() / 1000);
    controller.setFiles(name, all);
    buildFilePreviews(name, () => {
      syncFileSizes(name);
      controller.validateField(name);
      syncFilesUI(name);
    });
    input.value = '';
  };

  const syncFileSizes = (name) => {
    const cfg = fileCfg();
    const sizeInfo = parseFileSize(cfg.maxSize);
    const list = files[name] || [];
    const newSizes = fileNewSizes[name] || [];
    const validities = list.map((f, i) => {
      const s = newSizes[i] || f.size;
      return s <= sizeInfo.bytes;
    });
    controller.setFileValid(name, validities);
  };

  const buildFilePreviews = (name, onDone) => {
    const cfg = fileCfg();
    const thumbW = cfg.thumbWidth || 140;
    const thumbH = cfg.thumbHeight || 105;
    const resizeW = cfg.resizeWidth || 800;
    const resizeH = cfg.resizeHeight || 600;
    const cropOrigin = cfg.cropOrigin || 'top-left';
    const list = files[name] || [];
    filePreviewMap[name] = [];
    let pending = list.length;
    const done = () => {
      pending--;
      if (pending === 0 && onDone) onDone();
    };
    if (!pending) {
      if (onDone) onDone();
      return;
    }
    list.forEach((file, idx) => {
      if (file.type && file.type.indexOf('image/') === 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            fileDims[name][idx] = { w: img.width, h: img.height };
            const cropW = Math.min(img.width, resizeW);
            const cropH = Math.min(img.height, resizeH);
            let sx = 0; let sy = 0;
            if (cropOrigin === 'center') {
              sx = Math.max(0, (img.width - cropW) / 2);
              sy = Math.max(0, (img.height - cropH) / 2);
            }
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const ctx = cropCanvas.getContext('2d');
            ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
            cropCanvas.toBlob((blob) => {
              const cropped = new File([blob], newFileName(idx, data.property_type, fileStamp[name], cfg.ext), { type: 'image/jpeg' });
              processed[name][idx] = cropped;
              fileNewSizes[name][idx] = blob.size;
              fileNewSizes[name] = fileNewSizes[name].slice();
              const thumbCanvas = document.createElement('canvas');
              thumbCanvas.width = thumbW;
              thumbCanvas.height = thumbH;
              const tctx = thumbCanvas.getContext('2d');
              tctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, thumbW, thumbH);
              filePreviewMap[name][idx] = thumbCanvas.toDataURL('image/jpeg', 0.85);
              done();
            }, 'image/jpeg', 0.92);
          };
          img.onerror = () => { filePreviewMap[name][idx] = null; done(); };
          img.src = e.target.result;
        };
        reader.onerror = () => { filePreviewMap[name][idx] = null; done(); };
        reader.readAsDataURL(file);
      } else {
        filePreviewMap[name][idx] = null;
        done();
      }
    });
  };

  const clearAllFiles = (name) => {
    files[name] = [];
    processed[name] = [];
    filePreviewMap[name] = [];
    fileOrigSizes[name] = [];
    fileDims[name] = [];
    fileNewSizes[name] = [];
    controller.setFiles(name, []);
    controller.setFileValid(name, []);
    syncFilesUI(name);
    controller.validateField(name);
  };

  const syncFilesUI = (name) => {
    const field = fileField();
    const cfg = fileCfg();
    const list = files[name] || [];
    const cfile = form.querySelector(`#field_${name}`);
    const cfileLabel = cfile && cfile.closest('.custom-file') ? cfile.closest('.custom-file').querySelector('.custom-file-label') : null;
    if (cfileLabel) cfileLabel.textContent = list.length ? `Вибрано ${list.length} ${filePlural(list.length)}` : 'Оберіть файли...';
    const clearBtn = form.querySelector(`[data-clear="${name}"]`);
    if (clearBtn) clearBtn.hidden = !list.length;
    const err = controller.visibleError(name);
    const group = cfile ? cfile.closest('[data-field-group]') : null;
    const customFile = cfile ? cfile.closest('.custom-file') : null;
    const valid = !err && list.length > 0;
    for (const el of [cfile, group, customFile]) {
      if (!el) continue;
      el.classList.toggle(theme.validationClasses.invalid, Boolean(err));
      el.classList.toggle(theme.validationClasses.valid, valid);
    }
    syncFileFeedback(name);
    const previewWrap = form.querySelector('.file-previews');
    if (previewWrap) {
      previewWrap.innerHTML = '';
      previewWrap.hidden = !list.length;
    }
    if (list.length && previewWrap) {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const item = document.createElement('div');
        item.className = 'file-preview';
        const row = document.createElement('div');
        const sizeInfo = parseFileSize(cfg.maxSize);
        const sizeOver = fileOrigSizes[name][i] > sizeInfo.bytes;
        const rowValid = (fileNewSizes[name][i] || fileOrigSizes[name][i]) <= sizeInfo.bytes;
        row.className = 'file-preview-row ' + (rowValid ? 'file-preview-row-valid' : 'file-preview-row-invalid');
        const thumb = document.createElement('div');
        thumb.className = 'file-thumb';
        thumb.style.width = `${cfg.thumbWidth || 140}px`;
        thumb.style.height = `${cfg.thumbHeight || 105}px`;
        if (sizeOver) {
          const badge = document.createElement('span');
          badge.className = 'file-badge-compress';
          badge.textContent = 'буде стиснуто';
          thumb.appendChild(badge);
        }
        if (filePreviewMap[name][i]) {
          const img = document.createElement('img');
          img.src = filePreviewMap[name][i];
          img.className = 'file-thumb-img';
          thumb.appendChild(img);
        } else {
          const fallback = document.createElement('div');
          fallback.className = 'file-thumb-fallback';
          fallback.style.width = `${cfg.thumbWidth || 140}px`;
          fallback.style.height = `${cfg.thumbHeight || 105}px`;
          fallback.style.fontSize = '0.7rem';
          fallback.style.wordBreak = 'break-all';
          fallback.textContent = truncateName(file.name, 20);
          thumb.appendChild(fallback);
        }
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'file-remove';
        close.style.top = '1px';
        close.style.right = '1px';
        close.innerHTML = '&times;';
        close.setAttribute('aria-label', `Видалити файл: ${file.name}`);
        close.addEventListener('click', () => removeFilesAt(name, [i]));
        thumb.appendChild(close);
        row.appendChild(thumb);
        const info = document.createElement('div');
        info.className = 'file-list-info';
        info.appendChild(infoRow("Поточне ім'я:", truncateName(file.name, 40)));
        if (cfg.formatName) info.appendChild(infoRow("Нове ім'я:", newFileName(i, data.property_type, fileStamp[name], cfg.ext)));
        const dims = fileDims[name][i];
        const resizeW = cfg.resizeWidth || 800;
        const resizeH = cfg.resizeHeight || 600;
        const dimsRow = infoRow('Поточний розмір:', dims ? `${dims.w} × ${dims.h}` : '');
        if (dims && (dims.w > resizeW || dims.h > resizeH)) {
          dimsRow.querySelector('.file-list-info-value').classList.add('file-list-info-value-over');
        }
        info.appendChild(dimsRow);
        info.appendChild(infoRow('Новий розмір:', `${resizeW} × ${resizeH}`));
        const curSize = fileOrigSizes[name][i];
        const curRow = infoRow('Поточний розмір файлу:', formatFileSize(curSize));
        if (sizeOver) curRow.querySelector('.file-list-info-value').classList.add('file-list-info-value-over');
        info.appendChild(curRow);
        const newSize = fileNewSizes[name][i];
        info.appendChild(infoRow('Новий розмір файлу:', newSize ? formatFileSize(newSize) : (file.size ? formatFileSize(file.size) : '')));
        row.appendChild(info);
        item.appendChild(row);
        // The notice belongs to this photo only: it names the limit this photo
        // broke, so the reader knows what the system is about to change.
        const noticeText = fileNoticeFor(fileOrigSizes[name][i], newSize, fileDims[name][i], cfg);
        if (noticeText) {
          const notice = document.createElement('div');
          notice.className = 'file-preview-notice';
          notice.textContent = noticeText;
          item.appendChild(notice);
        }
        previewWrap.appendChild(item);
      }
    }
  };

  /**
   * The feedback blocks of a file field: the rule message of the validator and
   * the generic complaint the theme baked, plus the success note.
   *
   * A file input carries no `data-field` - the glue strips it so the binder
   * leaves the file control alone - so the binder never drives these blocks.
   * The file glue has to, the same way the location sub-fields do.
   */
  const syncFileFeedback = (name) => {
    const cfile = form.querySelector(`#field_${name}`);
    const group = cfile ? cfile.closest('[data-field-group]') : null;
    if (!group) return;
    const err = controller.visibleError(name) || '';
    const list = files[name] || [];
    const valid = !err && list.length > 0;
    for (const node of group.querySelectorAll('.invalid-feedback')) {
      node.style.display = err ? 'block' : 'none';
      const span = node.querySelector('[data-error]');
      if (span) {
        span.textContent = err;
      } else {
        // The baked copy is the static `feedback.invalid` text with no
        // [data-error] slot; swap the rule message in and keep the original
        // to restore it when the field is fine again.
        if (!fileFeedbackDefault.has(node)) fileFeedbackDefault.set(node, node.textContent);
        node.textContent = err || fileFeedbackDefault.get(node);
      }
    }
    for (const node of group.querySelectorAll('.valid-feedback')) {
      node.style.display = valid ? 'block' : 'none';
    }
  };

  const infoRow = (label, value) => {
    const row = document.createElement('div');
    row.className = 'file-list-info-row';
    const l = document.createElement('span');
    l.className = 'file-list-info-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'file-list-info-value';
    v.textContent = value || '';
    row.appendChild(l);
    row.appendChild(v);
    return row;
  };

  const truncateName = (name, maxLen) => {
    if (!name) return '';
    if (name.length <= maxLen) return name;
    return name.substring(0, maxLen - 3) + '...';
  };

  const removeFilesAt = (name, indices) => {
    for (const idx of indices.slice().sort((a, b) => b - a)) {
      files[name].splice(idx, 1);
      processed[name].splice(idx, 1);
      filePreviewMap[name].splice(idx, 1);
      fileOrigSizes[name].splice(idx, 1);
      fileDims[name].splice(idx, 1);
      fileNewSizes[name].splice(idx, 1);
    }
    controller.setFiles(name, files[name]);
    syncFileSizes(name);
    syncFilesUI(name);
    controller.validateField(name);
  };

  // ---- autocomplete
  const asCache = {};
  const asState = {};

  const asResolver = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field) return null;
    return resolveAutocompleteSource(field, () => data);
  };

  const autocompleteLoad = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field) return;
    const src = asResolver(name);
    const st = asState[name] || (asState[name] = { search: '', results: [], showDropdown: false, highlightIndex: -1, loaded: false, loading: false, dataUrl: null, patternError: '', noResults: false });
    if (src && src.inline) {
      st.loaded = true;
      st.loading = false;
      st.dataUrl = null;
      autocompleteSync(name);
      return;
    }
    const url = src && src.url ? src.url : null;
    if (!url) {
      st.loaded = true;
      st.loading = false;
      st.dataUrl = null;
      autocompleteSync(name);
      return;
    }
    if (asCache[url]) {
      st.loaded = true;
      st.loading = false;
      st.dataUrl = url;
      autocompleteSync(name);
      return;
    }
    if (st.loading && st.dataUrl === url) return;
    st.loading = true;
    st.dataUrl = url;
    fetchImpl(url)
      .then((r) => r.json())
      .then((json) => {
        asCache[url] = json;
        const cur = asState[name];
        if (!cur) return;
        cur.loading = false;
        if (cur.dataUrl === url) {
          cur.loaded = true;
          autocompleteSync(name);
        }
      })
      .catch(() => {
        if (asState[name]) asState[name].loading = false;
      });
  };

  const autocompleteRawOptions = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field) return [];
    const src = asResolver(name);
    if (!src) return [];
    if (src.inline) return src.inlineData;
    if (!src.url) return [];
    return autocompleteFilter(field, { url: src.url }, asCache, () => data);
  };

  const autocompleteIsSearch = (name) => {
    const field = findFieldInConfig(config, name);
    const src = asResolver(name);
    const mode = (src && src.mode) || 'auto';
    const res = mode === 'search' ? true
      : mode === 'select' ? false
      : ((asState[name] && asState[name].loaded) && autocompleteRawOptions(name).length > ((src && src.threshold !== undefined) ? src.threshold : 15));
    return res;
  };

  const autocompleteMaxResults = (name) => {
    const field = findFieldInConfig(config, name);
    const src = asResolver(name);
    let v = (src && src.maxResults !== undefined) ? src.maxResults : (field ? field.maxResults : undefined);
    if (v === undefined || v === null) v = 10;
    v = parseInt(v, 10);
    return (isNaN(v) || v < 1) ? 10 : v;
  };

  const autocompleteMinChars = (name) => {
    const src = asResolver(name);
    return (src && src.minChars !== undefined) ? src.minChars : 3;
  };

  const autocompleteSync = (name) => {
    const st = asState[name];
    if (!st) return;
    const opts = autocompleteRawOptions(name);
    const val = data[name];
    if (val === '' || val === null || val === undefined) {
      st.search = '';
    } else {
      const found = opts.find((o) => String(o.id) === String(val));
      if (!found) {
        data[name] = '';
        st.search = '';
      } else {
        st.search = found.name;
      }
    }
    st.patternError = '';
    st.noResults = false;
    syncAcSearch(name);
  };

  const autocompleteSearch = (name, isFocus) => {
    const field = findFieldInConfig(config, name);
    const st = asState[name];
    if (!field || !st) return;
    const q = st.search ? st.search.trim() : '';
    const minChars = autocompleteMinChars(name);
    const pattern = field.pattern || (config.settings && config.settings.pattern);
    if (pattern && q) {
      try {
        if (!new RegExp(pattern).test(q)) {
          const pmsg = (field.validation && field.validation.pattern) || (config.settings && config.settings.feedback && config.settings.feedback.pattern) || 'Неправильний формат';
          st.patternError = pmsg;
          st.results = [];
          st.highlightIndex = -1;
          st.showDropdown = false;
          st.noResults = false;
          syncAcSearch(name);
          return;
        }
      } catch (e) {}
    }
    if (st.patternError) st.patternError = '';
    if (!q && data[name]) { autocompleteSync(name); return; }
    if (q && data[name]) {
      const opts = autocompleteRawOptions(name);
      const selected = opts.find((o) => String(o.id) === String(data[name]));
      if (selected && q.toLowerCase() !== String(selected.name || '').toLowerCase()) {
        data[name] = '';
      }
    }
    const all = autocompleteRawOptions(name);
    if (q.length < minChars) {
      if (isFocus && field.showOnFocus !== false && !autocompleteIsSearch(name)) {
        st.results = all.slice(0, autocompleteMaxResults(name));
        st.showDropdown = true;
        st.noResults = false;
      } else {
        st.results = [];
        st.showDropdown = false;
        st.noResults = false;
      }
      st.highlightIndex = -1;
    } else {
      st.results = autocompleteMatch(all, q, autocompleteMaxResults(name));
      st.highlightIndex = -1;
      st.noResults = st.loaded && q && st.results.length === 0;
      st.showDropdown = st.results.length > 0 || st.noResults;
    }
    syncAcSearch(name);
  };

  const autocompleteSelect = (name, opt) => {
    data[name] = opt.id;
    asState[name].search = opt.name || String(opt.id);
    asState[name].results = [];
    asState[name].showDropdown = false;
    asState[name].highlightIndex = -1;
    asState[name].noResults = false;
    asState[name].patternError = '';
    const select = form.querySelector(`select[data-field="${name}"]`);
    if (select) select.value = opt.id;
    controller.setData(name, opt.id);
    syncAcSearch(name);
    controller.validateField(name);
  };

  const autocompleteClear = (name) => {
    data[name] = '';
    asState[name].search = '';
    asState[name].results = [];
    asState[name].showDropdown = false;
    asState[name].highlightIndex = -1;
    asState[name].noResults = false;
    asState[name].patternError = '';
    const select = form.querySelector(`select[data-field="${name}"]`);
    if (select) select.value = '';
    controller.setData(name, '');
    syncAcSearch(name);
    controller.validateField(name);
  };

  const syncAcSearch = (name) => {
    const st = asState[name];
    const field = findFieldInConfig(config, name);
    if (!st || !field) return;
    const search = form.querySelector(`[data-autocomplete-search="${name}"]`);
    const dropdown = form.querySelector(`[data-autocomplete-dropdown="${name}"]`);
    const wrap = search ? search.closest('.position-relative') : null;
    const clearBtn = form.querySelector(`[data-autocomplete-clear="${name}"]`);
    const select = form.querySelector(`select[data-field="${name}"]`);
    const useSearch = autocompleteIsSearch(name);
    const readonly = fieldReadonly(name);
    if (select) {
      const placeholder = select.querySelector('option[value=""]');
      const placeholderText = placeholder ? placeholder.textContent : '';
      const opts = autocompleteRawOptions(name);
      const prev = select.value;
      select.innerHTML = '';
      if (placeholderText) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholderText;
        select.appendChild(ph);
      }
      for (const o of opts) {
        const option = document.createElement('option');
        option.value = o.id;
        option.textContent = o.name;
        select.appendChild(option);
      }
      select.value = data[name] || prev;
      select.hidden = useSearch;
      select.disabled = !!readonly;
    }
    if (wrap) wrap.hidden = !useSearch;
    if (search) {
      search.readOnly = !!readonly;
      search.value = st.search || '';
      // Combobox ARIA attributes
      if (useSearch) {
        search.setAttribute('role', 'combobox');
        search.setAttribute('aria-autocomplete', 'list');
        search.setAttribute('aria-expanded', st.showDropdown ? 'true' : 'false');
        search.setAttribute('aria-controls', `ac-dropdown-${name}`);
      }
      if (clearBtn) {
        const hasValue = (data[name] || st.search);
        clearBtn.hidden = !hasValue || !!readonly;
      }
      const searchIconEl = search.parentElement ? search.parentElement.querySelector('.autocomplete-search-icon') : null;
      if (searchIconEl) {
        searchIconEl.hidden = Boolean(data[name] || st.search);
      }
    }
    if (dropdown) {
      dropdown.style.display = st.showDropdown && (st.results.length > 0 || st.noResults) ? 'block' : 'none';
      dropdown.setAttribute('id', `ac-dropdown-${name}`);
      dropdown.setAttribute('role', 'listbox');
      const host = dropdown;
      const items = host.querySelectorAll('.dropdown-item');
      for (const item of Array.prototype.slice.call(items)) item.remove();
      if (st.showDropdown) {
        if (st.noResults && !st.results.length) {
          const div = document.createElement('div');
          div.className = 'dropdown-item dropdown-item-empty';
          div.style.pointerEvents = 'none';
          div.setAttribute('role', 'option');
          div.setAttribute('aria-selected', 'false');
          div.textContent = autocompleteNoResults(name);
          host.appendChild(div);
        }
        st.results.forEach((o, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dropdown-item' + (st.highlightIndex === i ? ' highlighted' : '');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', st.highlightIndex === i ? 'true' : 'false');
          btn.setAttribute('id', `ac-option-${name}-${i}`);
          // Both mousedown (legacy mouse) and click (keyboard Enter/Space) for activation
          const pick = () => { autocompleteSelect(name, o); };
          btn.addEventListener('mousedown', (e) => { e.preventDefault(); pick(); });
          btn.addEventListener('click', (e) => { e.preventDefault(); pick(); });
          btn.addEventListener('mouseenter', () => { st.highlightIndex = i; syncAcSearch(name); });
          btn.textContent = o.name;
          host.appendChild(btn);
        });
        // aria-activedescendant on search input
        if (st.highlightIndex >= 0 && st.highlightIndex < st.results.length) {
          search.setAttribute('aria-activedescendant', `ac-option-${name}-${st.highlightIndex}`);
        } else {
          search.removeAttribute('aria-activedescendant');
        }
      }
    }
    const err = controller.visibleError(name);
    if (search) {
      const invalid = Boolean(err) || Boolean(st.patternError) || Boolean(st.noResults);
      search.classList.toggle(theme.validationClasses.invalid, invalid);
      search.classList.toggle(theme.validationClasses.valid, !invalid && Boolean(data[name]));
      search.title = err || st.patternError || '';
    }
  };

  // The binder deliberately leaves autocomplete search inputs alone: their
  // uncommitted query, pattern error and no-results state live here, so only
  // this module may toggle their validity classes.
  const syncAcSearchFor = (names) => {
    if (!names || !names.length) {
      for (const name of Object.keys(asState)) syncAcSearch(name);
      return;
    }
    for (const name of names) {
      if (asState[name]) syncAcSearch(name);
    }
  };

  const autocompleteNoResults = (name) => {
    const field = findFieldInConfig(config, name);
    const st = asState[name];
    const q = (st && st.search) || '';
    const msg = (field && field.noResults) || (config.settings && config.settings.noResults) || 'Запис "{q}" відсутній у списку';
    return msg.replace(/\{\{q\}\}/g, q).replace(/\{q\}/g, q);
  };

  const autocompleteReResolveLocation = (names) => {
    if (!locationWidget()) return;
    if (!(names && names.length)) return;
    const hits = new Set();
    for (const n of names) {
      if (n === locRoot() || n.startsWith(`${locRoot()}.`)) hits.add(locRoot());
    }
    if (!hits.size) return;
    qsa('[data-autocomplete-search]', form).forEach((search) => {
      const name = search.getAttribute('data-autocomplete-search');
      const field = findFieldInConfig(config, name);
      if (!field || !(field.datas && field.datas.length)) return;
      const dependsOnLocation = field.datas.some((d) => d && d.field && d.field.indexOf(`${locRoot()}.`) === 0);
      if (!dependsOnLocation) return;
      const st = asState[name];
      if (!st) return;
      const prevUrl = st.dataUrl;
      const src = asResolver(name);
      const url = src && src.url ? src.url : null;
      if (url !== prevUrl && data[name] !== '' && data[name] !== null && data[name] !== undefined) {
        data[name] = '';
        st.search = '';
        st.results = [];
        st.highlightIndex = -1;
        st.noResults = false;
      }
      autocompleteLoad(name);
    });
  };

  qsa('[data-autocomplete-search]', form).forEach((search) => {
    const name = search.getAttribute('data-autocomplete-search');
    asState[name] = { search: '', results: [], showDropdown: false, highlightIndex: -1, loaded: false, loading: false, dataUrl: null, patternError: '', noResults: false };
    if (!findFieldInConfig(config, name)) return;
    autocompleteLoad(name);
    search.addEventListener('input', () => {
      asState[name].search = search.value;
      autocompleteSearch(name);
    });
    search.addEventListener('focus', () => {
      const locked = fieldReadonly(name);
      if (locked) return;
      asState[name].search = search.value;
      asState[name].showDropdown = true;
      asState[name].highlightIndex = -1;
      autocompleteSearch(name, true);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); asHighlightNext(name); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); asHighlightPrev(name); }
      else if (e.key === 'Enter') { e.preventDefault(); asSelectHighlighted(name); }
      else if (e.key === 'Escape') { asState[name].showDropdown = false; asState[name].highlightIndex = -1; syncAcSearch(name); }
    });
    search.addEventListener('blur', () => {
      later(() => {
        const st = asState[name];
        if (!st) return;
        st.showDropdown = false;
        st.highlightIndex = -1;
        if (st.search && !data[name]) controller.validateField(name);
        syncAcSearch(name);
      }, 0);
    });
    const clearBtn = form.querySelector(`[data-autocomplete-clear="${name}"]`);
    if (clearBtn) clearBtn.addEventListener('click', () => autocompleteClear(name));
  });

  const asHighlightNext = (name) => {
    const st = asState[name];
    if (!st) return;
    const max = st.results.length - 1;
    st.highlightIndex = st.highlightIndex >= max ? 0 : st.highlightIndex + 1;
    syncAcSearch(name);
  };
  const asHighlightPrev = (name) => {
    const st = asState[name];
    if (!st) return;
    const max = st.results.length - 1;
    st.highlightIndex = st.highlightIndex <= 0 ? max : st.highlightIndex - 1;
    syncAcSearch(name);
  };
  const asSelectHighlighted = (name) => {
    const st = asState[name];
    if (st && st.highlightIndex >= 0 && st.highlightIndex < st.results.length) {
      autocompleteSelect(name, st.results[st.highlightIndex]);
    }
  };

  // ---- price_info widget
  const priceField = () => widgetByName('price_info');
  const syncPriceInfo = () => {
    const field = priceField();
    if (!field) return;
    const node = form.querySelector(`[data-price-info="${field.name}"]`);
    if (!node) return;
    node.innerHTML = priceInfoHtml(data, config, rates);
  };

  // ---- captcha widgets
  const captchaWidgets = () => {
    const list = [];
    for (const step of config.steps || []) {
      for (const field of stepFieldNames(step)) {
        if (field.type === 'widgets' && field.widget === 'captcha') list.push(field);
      }
    }
    return list;
  };

  const captchaSelector = (name) => {
    const field = findFieldInConfig(config, name);
    return '#' + ((field && (field.element_id || field.name)) || name) + '-widget';
  };

  const captchaActionOf = (field) => field.action || 'add_property';

  const controllerSolved = (field) => {
    const selector = captchaSelector(field.name);
    if (!root.querySelector(selector)) return true;
    return Boolean(Captcha && Captcha.solved && Captcha.solved(selector));
  };

  const captchaTokenOf = (field) => {
    const selector = captchaSelector(field.name);
    return Captcha && Captcha.token ? (Captcha.token(selector) || '') : '';
  };

  const sealedCaptchaWatch = {};

  const mountCaptcha = (field, attempt) => {
    if (!Captcha || !Captcha.mount) return;
    const container = root.querySelector(captchaSelector(field.name));
    if (!container) return;
    if (container.offsetParent === null) {
      if (container._captchaObserver) return;
      const observer = new MutationObserver(() => {
        if (container.offsetParent === null) return;
        observer.disconnect();
        container._captchaObserver = null;
        mountCaptcha(field, attempt);
      });
      container._captchaObserver = observer;
      observer.observe(container, { attributes: true, attributeFilter: ['style'] });
      return;
    }
    // A stale hidden-step observer may still be parked from a previous wake;
    // drop it before mounting so the two paths cannot fight over one widget.
    if (container._captchaObserver) {
      container._captchaObserver.disconnect();
      container._captchaObserver = null;
    }
    const action = captchaActionOf(field);
    const onFail = () => {
      // stall watchdog is handled by CaptchaSite's own retry; surface the
      // unavailable state after a mount error so the alert + retry show.
      const next = (attempt || 0) + 1;
      if (next < 3) {
        later(() => mountCaptcha(field, next), 700);
        return;
      }
      markCaptchaUnavailable(field.name, true);
    };
    try {
      Captcha.mount(captchaSelector(field.name), action, onFail);
      watchCaptchaToken(field);
    } catch (e) {
      onFail();
    }
  };

  const captainUnavailable = {};

  const markCaptchaUnavailable = (name, value) => {
    captainUnavailable[name] = Boolean(value);
    const widget = form.querySelector(`[data-captcha-field="${name}"]`);
    const card = widget ? widget.closest('.captcha-widget') : null;
    if (card) {
      const alerts = card.querySelectorAll('.alert');
      for (const a of alerts) {
        if (a.querySelector('[data-captcha-retry]')) a.hidden = !value;
      }
    }
  };

  const watchCaptchaToken = (field) => {
    const key = '_captchaTimer_' + field.name;
    if (sealedCaptchaWatch[key]) return;
    let ticks = 0;
    sealedCaptchaWatch[key] = every(() => {
      ticks++;
      if (state.submitted || ticks > 240) {
        clearInterval(sealedCaptchaWatch[key]);
        sealedCaptchaWatch[key] = null;
        return;
      }
      if (controllerSolved(field)) {
        clearInterval(sealedCaptchaWatch[key]);
        sealedCaptchaWatch[key] = null;
        const token = captchaTokenOf(field);
        controller.setCaptchaToken(field.name, token);
        markCaptchaUnavailable(field.name, false);
        return;
      }
      const container = root.querySelector(captchaSelector(field.name));
      if (!container) return;
      if (container && container.querySelector('iframe')) return;
      if (ticks < 60) return;
      markCaptchaUnavailable(field.name, true);
      clearInterval(sealedCaptchaWatch[key]);
      sealedCaptchaWatch[key] = null;
    }, 500);
  };

  const resetCaptcha = () => {
    for (const field of captchaWidgets()) {
      markCaptchaUnavailable(field.name, false);
      if (!Captcha || !Captcha.token) continue;
      try {
        Captcha.reset(captchaSelector(field.name), captchaActionOf(field), () => mountCaptcha(field, 0));
      } catch (e) {}
    }
  };

  qsa('[data-captcha-field]', form).forEach((box) => {
    const name = box.getAttribute('data-captcha-field');
    const field = findFieldInConfig(config, name);
    if (!field) return;
    const local = Boolean(Captcha && Captcha.isLocal && Captcha.isLocal());
    const card = box.closest('.captcha-widget');
    const localAlert = card && card.querySelector('.alert-info');
    if (localAlert) localAlert.hidden = !local;
    // A skipped captcha (the build disabled Turnstile, or the host is local)
    // never produces a token, so the required rule must not block on it - the
    // legacy engine read CaptchaSite.solved() as true in exactly these cases.
    controller.setCaptchaSolved(name, local || !Captcha);
    // aria-labelledby for accessibility (runtime, not in baked markup)
    const labelId = `label_${name}`;
    if (root.getElementById(labelId)) box.setAttribute('aria-labelledby', labelId);
  });

  for (const field of captchaWidgets()) {
    markCaptchaUnavailable(field.name, false);
  }

  qsa('[data-captcha-retry]', form).forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-captcha-retry');
      markCaptchaUnavailable(name, false);
      const field = findFieldInConfig(config, name);
      if (!field) return;
      mountCaptcha(field, 0);
      watchCaptchaToken(field);
    });
  });

  // ---- map widget
  let mapInstance = null;
  let mapMarker = null;
  let mapReady = false;
  let mapSeq = 0;
  let mapGeocoding = false;
  let mapAttribution = '';
  let settlementSeq = 0;
  let settlementTimer = null;

  const initMap = () => {
    if (!L || !L.map) return;
    const container = root.getElementById('map-picker');
    if (!container) return;
    if (container.offsetParent === null) {
      if (container._mapObserver) return;
      const observer = new MutationObserver(() => {
        if (container.offsetParent !== null) {
          observer.disconnect();
          container._mapObserver = null;
          doInitMap(container);
        }
      });
      container._mapObserver = observer;
      observer.observe(container, { attributes: true, attributeFilter: ['style'] });
      return;
    }
    // Same stale-observer cleanup as the captcha: a hidden-step observer must
    // not double-trigger doInitMap once the map wakes on the step change.
    if (container._mapObserver) {
      container._mapObserver.disconnect();
      container._mapObserver = null;
    }
    doInitMap(container);
  };

  const doInitMap = (container) => {
    L.Icon.Default.imagePath = '/assets/css/images/';
    if (mapReady) {
      if (mapInstance) later(() => mapInstance.invalidateSize(true), 0);
      syncMapInfo();
      return;
    }
    if (container._leaflet_id) return;
    const mc = mapField() || {};
    const center = mc.center || [48.9215, 24.7097];
    const zoom = mc.zoom !== undefined ? mc.zoom : 12;
    const map = L.map(container, {
      center,
      zoom,
      maxBounds: L.latLngBounds([43.9, 21.5], [52.7, 40.6]),
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '',
      tileSize: L.Browser.retina ? 512 : 256,
      zoomOffset: L.Browser.retina ? -1 : 0,
    }).addTo(map);
    map.attributionControl.setPrefix('');
    map.on('click', (e) => placeMarker(e.latlng));
    later(() => map.invalidateSize(true), 300);
    mapInstance = map;
    mapReady = true;
    mapGeocoding = false;
    setMapAttribution('© Україна — OpenStreetMap');
    const field = mapFieldName();
    if (field && locData()[`${field}Name`]) centerMapOnSettlement();
    syncMapInfo();
  };

  const mapFieldName = () => {
    const mc = mapField() || {};
    const path = (mc.depends && mc.depends.length && mc.depends[0].field) || (mc.value && mc.value.depends && mc.value.depends.length && mc.value.depends[0].field) || null;
    if (!path) return null;
    if (typeof path === 'string' && path.indexOf('.') !== -1) {
      const parts = path.split('.');
      return parts[parts.length - 1];
    }
    return path;
  };

  const setMapAttribution = (text) => {
    if (!mapInstance) return;
    const c = mapInstance.attributionControl;
    if (mapAttribution) c.removeAttribution(mapAttribution);
    mapAttribution = text;
    c.addAttribution(text);
  };

  /** The name the map widget's DOM uses for its info hooks. */
  const mapWidgetName = () => {
    const mc = mapField() || {};
    return mc.name || 'map_widget';
  };

  /**
   * Mirrors the legacy Alpine x-show/x-text bindings for the marker info
   * panel: legend visibility from data.lat, the address, the coordinates and
   * the "Визначаю адресу…" spinner from the geocoding state.
   */
  const syncMapInfo = () => {
    const shell = root.querySelector(`[data-widget-name="${mapWidgetName()}"]`);
    if (!shell) return;
    const panel = shell.querySelector('.map-marker-info');
    if (!panel) return;
    const coordsSpan = shell.querySelector(`[data-map-coords="${mapWidgetName()}"]`);
    const addressSpan = shell.querySelector(`[data-map-address="${mapWidgetName()}"]`);
    const loading = shell.querySelector('.map-marker-info-loading');
    const fallback = shell.querySelector('[data-map-fallback]');
    const addressLine = addressSpan ? addressSpan.closest('.map-marker-info-address') : null;
    const coordsLine = coordsSpan ? coordsSpan.closest('.map-marker-info-coords') : null;

    if (coordsSpan) coordsSpan.textContent = (data.lat || '') + (data.lat ? ', ' : '') + (data.lng || '');
    if (addressSpan) addressSpan.textContent = data.address || '';
    if (loading) loading.hidden = !mapGeocoding;
    if (fallback) fallback.hidden = mapGeocoding || Boolean(data.address);
    if (addressLine) addressLine.hidden = mapGeocoding || !data.address;
    if (coordsLine) coordsLine.hidden = !data.lat;
    panel.hidden = !data.lat;
  };

  const resetMapInfo = () => {
    data.lat = '';
    data.lng = '';
    data.address = '';
    mapGeocoding = false;
    syncMapInfo();
    controller.validateField(mapWidgetName());
  };

  const removeMapMarker = () => {
    if (mapMarker) {
      if (mapMarker.remove) mapMarker.remove();
      mapMarker = null;
    }
  };

  const resetMap = () => {
    mapSeq++;
    removeMapMarker();
    resetMapInfo();
  };

  const placeMarker = (latlng) => {
    data.lat = latlng.lat.toFixed(6);
    data.lng = latlng.lng.toFixed(6);
    if (!mapMarker) {
      mapMarker = L.marker(latlng, { draggable: true }).addTo(mapInstance);
      mapMarker.on('dragend', () => placeMarker(mapMarker.getLatLng()));
    } else {
      mapMarker.setLatLng(latlng);
    }
    syncMapInfo();
    syncMapInfo();
    reverseGeocode(latlng);
  };

  const reverseGeocode = (latlng) => {
    const seq = ++mapSeq;
    mapGeocoding = true;
    syncMapInfo();
    later(() => {
      if (seq !== mapSeq) return;
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&accept-language=uk`;
      fetchImpl(url)
        .then((r) => r.json())
        .then((json) => {
          if (seq !== mapSeq) return;
          data.address = (json && json.display_name) ? json.display_name : '';
          mapGeocoding = false;
          mapGeocoding = false;
          syncMapInfo();
        })
        .catch(() => {
          if (seq !== mapSeq) return;
          data.address = '';
          mapGeocoding = false;
          syncMapInfo();
        });
    }, 450);
  };

  const centerMapOnSettlement = () => {
    if (!mapInstance) return;
    const field = mapFieldName();
    if (!field) return;
    const mc = mapField() || {};
    const fallbackZoom = mc.zoom !== undefined ? mc.zoom : 12;
    const name = locData()[`${field}Name`] || '';
    if (!name) { mapFallbackView(); return; }
    const qParts = [name];
    const oblast = locData().oblastName;
    if (oblast && oblast.toLowerCase().indexOf(name.toLowerCase()) === -1) qParts.push(oblast);
    qParts.push('Україна');
    const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(qParts.join(', ')) + '&format=json&limit=5&accept-language=uk';
    const seq = ++settlementSeq;
    clearTimeout(settlementTimer);
    settlementTimer = later(() => {
      if (seq !== settlementSeq) return;
      fetchImpl(url)
        .then((r) => r.json())
        .then((res) => {
          if (seq !== settlementSeq) return;
          if (!res || !res.length) { mapFallbackView(); return; }
          const zoom = mapZoomFor(field, fallbackZoom);
          mapInstance.setView(L.latLng(parseFloat(res[0].lat), parseFloat(res[0].lon)), zoom);
          setMapAttribution(`© ${name} — OpenStreetMap`);
        })
        .catch(() => mapFallbackView());
    }, 450);
  };

  const mapZoomFor = (field, fallbackZoom) => {
    const mc = mapField() || {};
    const def = (mc.value && mc.value.default && mc.value.default.zoom) || undefined;
    const type = (locData()[`${field}Type`] || '').toLowerCase();
    if (mc.value && mc.value.depends) {
      for (const rule of mc.value.depends) {
        if (matchesValues(controller.getValue(rule.field), rule.values, rule.except)) {
          if (rule.zoom !== undefined) return rule.zoom;
        }
      }
    }
    if (def !== undefined) return def;
    if (type === 'місто') return 8;
    if (type === 'столиця') return 7;
    if (type === 'селище') return 10;
    if (type === 'село') return 12;
    return fallbackZoom;
  };

  const mapFallbackView = () => {
    if (!mapInstance) return;
    const mc = mapField() || {};
    const c = mc.center || [48.9215, 24.7097];
    const z = mc.zoom !== undefined ? mc.zoom : 12;
    mapInstance.setView(L.latLng(c[0], c[1]), z);
    setMapAttribution('© Україна — OpenStreetMap');
  };

  // ---- location DOM wiring + address load
  const locationW = locationWidget();
  if (locationW) {
    locationIndex(locationW).forEach((fn) => {
      locationState[fn] = { search: '', results: [], showDropdown: false, highlightIndex: -1 };
    });
    const addressPath = (locationW.data) || '/assets/data/address.json';
    fetchImpl(addressPath)
      .then((r) => r.json())
      .then((json) => {
        addressIndex = buildLocationIndex(json || [], locationW);
        Object.assign(shoType, buildLocationShowTypes(addressIndex, locationW));
        applyLocationPresets();
        syncAllLocation();
        syncSummary();
      })
      .catch(() => {});
  }

  qsa('[data-location-field]', form).forEach((select) => {
    const fieldName = select.getAttribute('data-location-field');
    const search = form.querySelector(`input[data-location-search="${fieldName}"]`);
    const clearBtn = form.querySelector(`[data-location-clear="${fieldName}"]`);
    const dropdown = form.querySelector(`[data-location-dropdown="${fieldName}"]`);
    select.addEventListener('change', () => locationSelectById(fieldName, select.value));
    select.addEventListener('blur', () => validateLocationSubfield(fieldName));
    if (search) {
      search.addEventListener('input', () => {
        const st = locationState[fieldName];
        if (!st) return;
        st.search = search.value;
        // A label the user overwrote drops the stored id so submit cannot send
        // a value that no longer matches what the field shows.
        const stored = locData()[fieldName];
        if (stored) {
          const entry = locationEntryById(fieldName, stored);
          const display = entry ? locationDisplay(entry, shoType[fieldName]) : '';
          if (!entry || search.value !== display) locationDeselect(fieldName);
        }
        // Typing clears the blur-time required error: the text is re-evaluated
        // below, so a stale "fill this field" must not mask it.
        if (search.value) controller.clearGlueError(`${locRoot()}.${fieldName}`);
        locationSearch(fieldName);
        renderLocationDropdown(fieldName, st);
        syncLocationField(fieldName);
        // Typing changes no controller state, so the chrome toggles here.
        syncLocationChrome(fieldName);
      });
      search.addEventListener('focus', () => {
        const locked = locationLocked(locationWidget(), fieldName, locationReadonly(locationWidget(), fieldName, (p) => controller.getValue(p)), locData);
        if (locked) return;
        const st = locationState[fieldName];
        if (!st) return;
        st.showDropdown = true;
        st.highlightIndex = -1;
        locationSearch(fieldName, true);
        renderLocationDropdown(fieldName, st);
        syncLocationField(fieldName);
        syncLocationChrome(fieldName);
      });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); locationHighlightNext(fieldName); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); locationHighlightPrev(fieldName); }
        else if (e.key === 'Enter') { e.preventDefault(); locationSelectHighlighted(fieldName); }
        else if (e.key === 'Escape') { locationState[fieldName].showDropdown = false; locationState[fieldName].highlightIndex = -1; syncAcLocationDropdown(fieldName); }
      });
      search.addEventListener('blur', () => {
        later(() => {
          const st = locationState[fieldName];
          if (!st) return;
          // Legacy blur only validated the field (widget/location.html:51): the
          // typed query and the pattern state survive, the dropdown closes.
          st.showDropdown = false;
          st.highlightIndex = -1;
          syncAcLocationDropdown(fieldName);
          validateLocationSubfield(fieldName);
        }, 0);
      });
    }
    if (clearBtn) clearBtn.addEventListener('click', () => locationClear(fieldName));
    if (dropdown) dropdown.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); locationHighlightNext(fieldName); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); locationHighlightPrev(fieldName); }
      else if (e.key === 'Enter') { e.preventDefault(); locationSelectHighlighted(fieldName); }
      else if (e.key === 'Escape') { locationState[fieldName].showDropdown = false; locationState[fieldName].highlightIndex = -1; syncAcLocationDropdown(fieldName); }
    });
  });

  const syncAllLocation = () => {
    locationIndex(locationWidget() || {}).forEach((fn) => syncFieldWrapper(fn, false));
  };

  const syncAcLocationDropdown = (fieldName) => {
    const dropdown = form.querySelector(`[data-location-dropdown="${fieldName}"]`);
    if (!dropdown) return;
    const st = locationState[fieldName];
    if (!st) return;
    dropdown.style.display = st.showDropdown ? 'block' : 'none';
  };

  const locationHighlightNext = (fieldName) => {
    const st = locationState[fieldName];
    if (!st) return;
    const max = st.results.length - 1;
    st.highlightIndex = st.highlightIndex >= max ? 0 : st.highlightIndex + 1;
    renderLocationDropdown(fieldName, st);
  };
  const locationHighlightPrev = (fieldName) => {
    const st = locationState[fieldName];
    if (!st) return;
    const max = st.results.length - 1;
    st.highlightIndex = st.highlightIndex <= 0 ? max : st.highlightIndex - 1;
    renderLocationDropdown(fieldName, st);
  };
  const locationSelectHighlighted = (fieldName) => {
    const st = locationState[fieldName];
    if (st && st.highlightIndex >= 0 && st.highlightIndex < st.results.length) {
      locationSelectById(fieldName, st.results[st.highlightIndex].id);
    }
  };

  // ---------------------------------------------------------- application -----

  // Widgets that live on a later wizard step start hidden, so their own
  // `offsetParent === null` guard parks a never-firing MutationObserver and the
  // map / captcha never wake up. The step change flips the `hidden` attribute on
  // an ancestor, not on the widget container, so nothing re-triggers them - this
  // wake tracks the offsetParent transition itself on every controller notify.
  let mapVisibilitySeen = false;
  const captchaMountSeen = {};

  const wakeMap = () => {
    const el = root.getElementById('map-picker');
    if (!el) return;
    if (el.offsetParent === null) {
      mapVisibilitySeen = false;
      return;
    }
    if (!mapVisibilitySeen) {
      mapVisibilitySeen = true;
      initMap();
    } else {
      syncMapInfo();
    }
  };

  const wakeCaptcha = () => {
    for (const field of captchaWidgets()) {
      const box = root.querySelector(captchaSelector(field.name));
      if (!box) continue;
      if (box.offsetParent === null) {
        captchaMountSeen[field.name] = false;
        continue;
      }
      if (captchaMountSeen[field.name]) continue;
      // Keep the flag open until a mount was actually attempted: the captcha
      // script may not be loaded yet on the first pass.
      if (!Captcha || !Captcha.mount) continue;
      captchaMountSeen[field.name] = true;
      mountCaptcha(field, 0);
    }
  };

  const wakeHiddenWidgets = () => {
    wakeMap();
    wakeCaptcha();
  };

  // Legacy textarea.html renders "N символів залишилось" under a maxlength
  // textarea; the theme bakes the initial count and this keeps it live.
  const syncCharCounters = () => {
    for (const node of qsa('[data-char-counter]', form)) {
      const name = node.getAttribute('data-char-counter');
      const max = parseInt(node.getAttribute('data-maxlength'), 10) || 0;
      const val = controller.getValue(name);
      const len = (val === null || val === undefined) ? 0 : String(val).length;
      const span = node.querySelector('span');
      if (span) span.textContent = String(Math.max(0, max - len));
    }
  };

  let lastSettlementName = '';

  const getSettlementFieldName = () => {
    const field = mapFieldName();
    return field || '';
  };

  const followSettlementChange = (names) => {
    const sfn = getSettlementFieldName();
    if (!sfn) return;
    // Only react when settlement-related fields changed
    const related = names && Array.isArray(names) ? names.filter((n) => {
      if (typeof n !== 'string') return false;
      return n === `location_widget.${sfn}` || n === `location_widget.${sfn}Name` || n === sfn;
    }) : [];
    if (!related.length && !names) return;
    const cur = locData()[`${sfn}Name`] || '';
    if (cur === lastSettlementName) return;
    lastSettlementName = cur;
    if (cur) {
      resetMap();
      centerMapOnSettlement();
    } else {
      resetMap();
    }
  };

  const dnsTimers = {};
  const emailFieldNames = (() => {
    const out = [];
    for (const step of config.steps || []) {
      for (const field of stepFieldNames(step)) {
        if (field.type === 'email') out.push(field.name);
      }
    }
    return out;
  })();

  const checkEmailDomain = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field || !(field.validation && field.validation.dnscheck && field.validation.dnscheck.value)) return;
    const val = controller.getValue(name);
    if (!val || String(val).indexOf('@') <= 0) { controller.clearGlueError(name); return; }
    const domain = String(val).split('@')[1];
    if (!domain) { controller.clearGlueError(name); return; }
    const msg = (field.validation.dnscheck.message) || 'Домен не приймає пошту або не існує';
    const opts = { headers: { Accept: 'application/dns-json' } };
    const base = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=';
    Promise.all([
      fetchImpl(base + 'MX', opts),
      fetchImpl(base + 'A', opts),
      fetchImpl(base + 'AAAA', opts),
    ]).then((responses) => Promise.all(responses.map((r) => r.json())))
      .then((results) => {
        if (String(controller.getValue(name)) !== String(val)) return;
        const has = (r) => Boolean(r && r.Answer && r.Answer.length > 0);
        if (!has(results[0]) && !has(results[1]) && !has(results[2])) controller.setGlueError(name, msg);
        else controller.clearGlueError(name);
      })
      .catch(() => {});
  };

  const scheduleEmailDns = (name) => {
    if (dnsTimers[name]) clearTimeout(dnsTimers[name]);
    dnsTimers[name] = setTimeout(() => { delete dnsTimers[name]; checkEmailDomain(name); }, 500);
  };

  const lastEmailValue = {};
  controller.subscribe((event, names) => {
    if (names && Array.isArray(names)) {
      for (const n of names) {
        if (emailFieldNames.indexOf(n) === -1) continue;
        const v = String(controller.getValue(n) || '');
        if (lastEmailValue[n] === v) continue;
        lastEmailValue[n] = v;
        scheduleEmailDns(n);
      }
      // A file field has no `data-field`, so the binder does not touch its
      // feedback blocks - a step validation (next/submit) is the moment the
      // rule message of the file field has to appear.
      for (const n of names) {
        if (!files[n]) continue;
        syncFileFeedback(n);
      }
    }
    syncChrome();
    syncPriceInfo();
    syncCharCounters();
    // location + autocomplete live states settle after the cascade
    if (locationWidget()) syncAllLocation();
    autocompleteReResolveLocation(names);
    syncAcSearchFor(event === 'setServerErrors' ? null : names);
    followSettlementChange(names);
    later(wakeHiddenWidgets, 0);
  });

  syncChrome();
  syncPriceInfo();
  syncCharCounters();
  for (const name of Object.keys(files)) syncFilesUI(name);
  syncAllLocation();
  {
    const sfn = getSettlementFieldName();
    if (sfn) lastSettlementName = locData()[`${sfn}Name`] || '';
  }
  initMap();
  if (locationW) {
    syncSummary();
  }
  const firstWake = () => {
    wakeHiddenWidgets();
  };
  firstWake();

  return {
    controller,
    form,
    data,
    state,
    refetchAddress: () => {
      if (!locationWidget()) return;
      const addressPath = locationWidget().data || '/assets/data/address.json';
      return fetchImpl(addressPath).then((r) => r.json()).then((json) => {
        addressIndex = buildLocationIndex(json || [], locationWidget());
        Object.assign(shoType, buildLocationShowTypes(addressIndex, locationWidget()));
        applyLocationPresets();
        syncAllLocation();
        syncSummary();
      });
    },
  };
}

