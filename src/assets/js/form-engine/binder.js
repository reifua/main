// DOM binder: the bridge between the controller and the markup the theme emits.
//
// The controller (Phase 2) tracks data and answers questions but touches no
// DOM; that split keeps every rule under `node --test`. This file is where the
// questions stop being academic: input events go in, Bootstrap validity classes
// and error copy go out.
//
// The binder is agnostic of the DOM implementation on purpose. It takes `form`,
// `controller` and two accessor functions - `query(form, selector)` and
// `listen(el, type, fn)` - so a test can hand it a shim of stub elements, and
// the Eleventy site can run it against whatever DOM it has. No jsdom, no global
// `document`, nothing imported that needs a browser.
//
// Lifecycle of one field, e.g. a reason select:
//   1. the user picks a value -> 'change' listener reads the select and calls
//      controller.setData('reason', value)
//   2. the controller recomputes client errors and notifies 'setData'
//   3. syncField() turns that into classes (.is-invalid/.is-valid), the error
//      span text (when the theme emitted one), the required marker and the
//      clear button - exactly the single-class contract the theme documents.

const escAttrSelector = (s) => String(s).replace(/[\\"]/g, (ch) => `\\${ch}`);

/**
 * Ensures an element has an ID, generating one if needed.
 * Returns the ID (existing or new).
 */
const ensureId = (el, prefix = 'fb') => {
  if (el.id) return el.id;
  const base = prefix + '_' + Math.random().toString(36).slice(2, 9);
  el.id = base;
  return base;
};

/**
 * Merges a new ID into an element's aria-describedby, avoiding duplicates.
 */
const mergeDescribedBy = (el, newId) => {
  const current = el.getAttribute('aria-describedby') || '';
  const ids = current.split(/\s+/).filter(Boolean);
  if (!ids.includes(newId)) {
    ids.push(newId);
    el.setAttribute('aria-describedby', ids.join(' '));
  }
};

/** Same emptiness the legacy engine used (form-engine.js:312): `false` and an
 * empty array are "no answer", not a value. A single checkbox initialises to
 * `false` and a checkbox_group to `[]`, so without this the binder would paint
 * an untouched required checkbox green the moment the page loads. */
const isBlank = (value) =>
  value === '' || value === null || value === undefined || value === false ||
  (Array.isArray(value) && value.length === 0);

/**
 * The value a control contributes to its field.
 *
 * Checkboxes and radio groups map onto the same element (several radio inputs
 * share one `data-field`), so the extraction reads the whole group rather than
 * the element the event came from.
 */
function readValue(el, form, query) {
  const type = el.getAttribute && el.getAttribute('type');
  if (type === 'checkbox') {
    // A checkbox_group is one model value: the array of checked option values.
    // The group hook distinguishes it from a single `agree` checkbox.
    const group = el.getAttribute && el.getAttribute('data-group');
    if (group) {
      const values = [];
      for (const input of query(form, `input[type="checkbox"][data-group="${escAttrSelector(group)}"]`)) {
        if (input.checked) values.push(input.getAttribute('value') ?? input.value ?? '');
      }
      return values;
    }
    return el.checked;
  }
  if (type === 'radio') {
    for (const radio of query(form, `input[type="radio"][name="${escAttrSelector(el.getAttribute('name'))}"]`)) {
      if (radio.checked) return radio.getAttribute('value') ?? radio.value ?? '';
    }
    return '';
  }
  return el.value ?? '';
}

function changeEvent(el) {
  const tag = (el.tagName || '').toUpperCase();
  const type = el.getAttribute && el.getAttribute('type');
  if (tag === 'SELECT' || type === 'checkbox' || type === 'radio') return 'change';
  return 'input';
}

/**
 * Wires one form up. Returns an object with `detach()` for the page glue that
 * loads the form later.
 *
 * @param form        element with querySelectorAll
 * @param controller  instance from makeController()
 * @param opts
 *   {function} [opts.query]  (el, selector) -> iterable of elements
 *   {function} [opts.listen] (el, type, fn) -> void
 *   {object}   [opts.classes]  the invalid/valid classes the theme reacts to,
 *                              defaults to the Bootstrap names (is-invalid,
 *                              is-valid). Both built-in themes pass their
 *                              `validationClasses` here, so the names come from
 *                              the theme rather than from this default; a third
 *                              theme can supply its own, e.g.
 *                              { invalid: 'border-red-500', valid: 'border-green-500' }
 *   {function} [opts.colClass] (colString) -> colString, translates the grid
 *                              classes autoCol() emits (Bootstrap vocabulary)
 *                              into the theme's own; the Tailwind theme passes
 *                              its twCol. Defaults to identity.
 */
export function bindForm(form, controller, opts = {}) {
  const query = opts.query || ((el, selector) => el.querySelectorAll(selector));
  const listen = opts.listen || ((el, type, fn) => el.addEventListener(type, fn));
  const classes = {
    invalid: 'is-invalid',
    valid: 'is-valid',
    ...(opts.classes || {}),
  };
  const colClass = typeof opts.colClass === 'function' ? opts.colClass : (string) => string;

  const qsa = (selector, scope) => Array.prototype.slice.call(query(scope || form, selector));
  const byField = (name) => qsa(`[data-field="${escAttrSelector(name)}"]`);

  const allNames = [];
  const seen = new Set();
  for (const el of qsa('[data-field]')) {
    const name = el.getAttribute('data-field');
    if (name && !seen.has(name)) {
      seen.add(name);
      allNames.push(name);
    }
  }
  // Widgets hold their error state too (a failed captcha, an empty required
  // map), but expose no control with `data-field` - only the shell hook. Their
  // names go through the same syncField so feedback blocks reach the same fate.
  for (const el of qsa('[data-widget-name]')) {
    const name = el.getAttribute('data-widget-name');
    if (name && !seen.has(name)) {
      seen.add(name);
      allNames.push(name);
    }
  }

  const controlsByField = new Map();
  for (const name of allNames) controlsByField.set(name, byField(name));

  /**
   * The valid/invalid feedback blocks the theme emits per field. Bootstrap
   * reveals them from a sibling `.is-invalid`/`.is-valid` control, but the
   * `text-input-wrapper` and the widget shells sit between control and feedback,
   * so the sibling selector never matches (legacy: inline `display: block`).
   * The binder scopes by the field column or widget shell and drives the
   * feedback display itself.
   */
  const feedbackByField = new Map();
  for (const name of allNames) {
    const invalid = [];
    const valid = [];
    for (const scope of [
      ...qsa(`[data-field-col="${escAttrSelector(name)}"]`),
      ...qsa(`[data-widget-name="${escAttrSelector(name)}"]`),
    ]) {
      for (const node of qsa('.invalid-feedback', scope)) invalid.push(node);
      for (const node of qsa('.valid-feedback', scope)) valid.push(node);
    }
    feedbackByField.set(name, { invalid, valid });
  }

  /** Fields the theme hides behind `depends`: the dependency is marked right on
   * the column, block or widget shell that owns them. A change to `property_type`
   * shows and hides whole groups at once, mirroring the legacy `x-show`. */
  function syncDepends() {
    for (const el of qsa('[data-depends]')) {
      let visible = true;
      const raw = el.getAttribute('data-depends');
      if (raw) {
        try {
          visible = controller.evaluateDepends(JSON.parse(raw) || []);
        } catch {
          visible = true;
        }
      }
      el.hidden = !visible;
    }
  }

  /** Column classes of `auto: true` rows follow the same visibility pass: the
   * legacy page recomputed them on every change (`:class="autoCol(...)"`), so
   * a row collapses to col-12 while alone and takes its configured widths back
   * as soon as a sibling is revealed. Runs right after syncDepends so the two
   * always agree. Fields outside auto rows keep the class the theme baked. */
  function syncAutoCols() {
    for (const el of qsa('[data-field-col]')) {
      const cls = controller.autoCol(el.getAttribute('data-field-col'));
      if (cls == null) continue;
      const mapped = colClass(cls);
      if (el.className !== mapped) el.className = mapped;
    }
  }

  /** What one field looks like right now, straight into Bootstrap classes. */
  function syncField(name) {
    const controls = controlsByField.get(name) || [];
    const error = controller.visibleError(name);
    const value = controller.getValue(name);
    const nonEmpty = !isBlank(value);

    for (const control of controls) {
      if (control.getAttribute && control.getAttribute('type') === 'hidden') continue;
      const cls = control.classList;
      if (error) {
        cls.add(classes.invalid);
        cls.remove(classes.valid);
        control.setAttribute('aria-invalid', 'true');
      } else {
        cls.remove(classes.invalid);
        if (nonEmpty) cls.add(classes.valid);
        else cls.remove(classes.valid);
        control.setAttribute('aria-invalid', 'false');
      }
    }

    // Two-way like the legacy `x-model`: the data is the truth, so mirror it
    // back onto checkbox/radio controls. Group boxes hold an array, a single
    // checkbox a boolean, a radio the selected string. Without this a value
    // set from the page (a reset, a prefill) would light the label up while
    // the box stays empty - and the next click would read the stale boxes.
    for (const control of controls) {
      const type = control.getAttribute && control.getAttribute('type');
      if (type !== 'checkbox' && type !== 'radio') continue;
      const option = control.getAttribute('value') ?? control.value ?? '';
      if (type === 'radio') {
        control.checked = String(value ?? '') === String(option);
      } else if (Array.isArray(value)) {
        control.checked = value.some((v) => String(v) === String(option));
      } else {
        control.checked = Boolean(value);
      }
    }

    // The theme emits the error text itself when the config carries a static
    // `feedback.invalid`; it emits an empty `<span data-error>` otherwise, and
    // that span is the one this binder fills.
    for (const span of qsa(`[data-error="${escAttrSelector(name)}"]`)) {
      span.textContent = error || '';
    }

    for (const marker of qsa(`[data-required-marker="${escAttrSelector(name)}"]`)) {
      marker.hidden = !controller.isFieldRequired(name);
    }

    // Only fields the binder actually reads drive a clear button. A file field
    // carries no `data-field` (its generic control walk is removed by the page
    // glue), so its clear button is owned by the file glue, not the binder -
    // toggling it here from an empty model value would hide it on every re-sync.
    if (controls.length) {
      for (const btn of qsa(`[data-clear="${escAttrSelector(name)}"]`)) {
        btn.hidden = !nonEmpty;
      }
    }

    // Toggle-button groups (checkbox_group): the theme marks every option
    // label with data-toggle-for/data-value, and the legacy page kept `active`
    // on it through Alpine's `:class`. The controller's array is the source of
    // truth - the label is what the user sees as "selected".
    for (const label of qsa(`[data-toggle-for="${escAttrSelector(name)}"]`)) {
      const option = label.getAttribute('data-value');
      const on = Array.isArray(value)
        ? value.some((v) => String(v) === option)
        : String(value ?? '') === option;
      if (on) label.classList.add('active');
      else label.classList.remove('active');
    }

    const fb = feedbackByField.get(name);
    if (fb) {
      for (const node of fb.invalid) {
        if (node.style) node.style.display = error ? 'block' : 'none';
      }
      // The success copy belongs to a control, not a container: a widget shell
      // (location) carries its sub-fields' blocks, and its data object is never
      // "empty", so without the control check it would light every sub-field
      // green on any broad re-sync. The glue owns the location blocks instead.
      for (const node of fb.valid) {
        if (node.style) node.style.display = nonEmpty && !error && controls.length > 0 ? 'block' : 'none';
      }

      // 2) Associate controls with the first invalid feedback block via aria-describedby
      // (runtime IDs only - no static IDs in the baked markup)
      if (error && fb.invalid.length > 0 && controls.length > 0) {
        const firstInvalid = fb.invalid[0];
        const fbId = ensureId(firstInvalid, 'err');
        for (const control of controls) {
          if (control.getAttribute && control.getAttribute('type') === 'hidden') continue;
          mergeDescribedBy(control, fbId);
        }
      } else if (!error && controls.length > 0) {
        // When error clears, remove the describedby reference to the error block
        for (const control of controls) {
          if (control.getAttribute && control.getAttribute('type') === 'hidden') continue;
          const current = control.getAttribute('aria-describedby') || '';
          const ids = current.split(/\s+/).filter((id) => id && !id.startsWith('err_'));
          if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
          else control.removeAttribute('aria-describedby');
        }
      }
    }
  }

  function syncStep() {
    const active = controller.step() + 1;
    for (const el of qsa('[data-step]')) {
      const n = Number(el.getAttribute('data-step'));
      if (Number.isFinite(n)) el.hidden = n !== active;
    }
  }

  function syncAll() {
    syncStep();
    syncDepends();
    syncAutoCols();
    for (const name of allNames) syncField(name);
  }

  for (const name of allNames) {
    const controls = controlsByField.get(name);
    for (const control of controls) {
      listen(control, changeEvent(control), () => {
        controller.engage(name);
        controller.setData(name, readValue(control, form, query));
      });
    }
  }

  for (const btn of qsa('[data-clear]')) {
    const name = btn.getAttribute('data-clear');
    listen(btn, 'click', () => {
      for (const control of controlsByField.get(name) || []) {
        if (control.getAttribute && control.getAttribute('type') === 'radio') {
          control.checked = false;
        } else {
          control.value = '';
        }
      }
      controller.engage(name);
      controller.clearData(name);
      syncField(name);
    });
  }

  const unsubscribe = controller.subscribe((event, names) => {
    syncDepends();
    syncAutoCols();
    if (event === 'setStep') {
      syncStep();
      syncAll();
      return;
    }
    if (names && names.length) {
      for (const name of names) syncField(name);
      return;
    }
    syncAll();
  });

  syncAll();

  return { detach: unsubscribe };
}

export default bindForm;