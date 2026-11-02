// Public entry point of the form renderer.
//
//   FormRender.render(config, { theme: 'bootstrap4' })  ->  HTML string
//   FormRender.mount('#app', config, opts)              ->  fills an element
//
// The renderer is a pure function of (config, options). It reads no globals and
// touches no DOM, which is what lets the same code run inside Jekyll's build,
// inside Eleventy's, and in a browser at click time - and what lets the whole
// thing be tested in bare Node without a DOM stub.
//
// The one exception is mount(), which is browser only and is never called from
// a test.

import { buildModel } from './model.js';
import { evaluateDepends, getDataValue } from './conditions.js';
import { bootstrap4 } from './themes/bootstrap4.js';
import { tailwind } from './themes/tailwind.js';

const THEMES = {
  bootstrap4,
  tailwind,
};

/**
 * Builds the context both the layout helpers and the theme read from.
 *
 * It carries the model twice - once as `model`, once as `rowInfo`/`byName` -
 * because autoCol/colFor were written against the flat shape and taking that
 * shape as given keeps the port a copy of the original rather than a rewrite.
 */
function makeContext(config, opts) {
  const model = buildModel(config);
  const data = opts.data || {};
  const getData = (path) => getDataValue(data, path);
  const evaluate = (deps) => evaluateDepends(deps, getData);

  return {
    config,
    model,
    rowInfo: model.rowInfo,
    byName: model.byName,
    step: opts.step === undefined ? 0 : opts.step,
    getData,
    evaluateDepends: evaluate,
    // A field is visible when its depends group holds. Fields without one are
    // always visible, which evaluateDepends already returns for an empty list.
    isVisible: (name) => evaluate(model.byName.get(name)?.depends || []),
    errors: opts.errors || {},
  };
}

export const FormRender = {
  /** Themes available to render(), by name. */
  get themes() {
    return Object.keys(THEMES);
  },

  /** Adds a theme. Themes are plain objects, so this is a registry entry. */
  register(name, theme) {
    if (!name || typeof theme !== 'object') throw new Error('register(name, theme) needs both');
    THEMES[name] = theme;
  },

  /**
   * The registered theme object. Besides `form()`, a theme carries the page
   * helpers the shell calls: `chrome(steps, copy)`, `modals(list, copy)` and
   * `navTokens`. Exposed so the build shell renders the chrome with the same
   * theme that renders the fields.
   */
  theme(name = 'bootstrap4') {
    const theme = THEMES[name];
    if (!theme) {
      throw new Error(`unknown theme "${name}" - available: ${Object.keys(THEMES).join(', ')}`);
    }
    return theme;
  },

  /**
   * Renders a config to HTML.
   *
   * @param {object} config  parsed form config (see _form-engine/schema)
   * @param {object} [opts]
   * @param {string} [opts.theme='bootstrap4']
   * @param {object} [opts.data={}]   current form values, for conditional copy
   * @param {number} [opts.step=0]    active step, 0 based
   * @returns {string}
   */
  render(config, opts = {}) {
    const themeName = opts.theme || 'bootstrap4';
    const theme = THEMES[themeName];
    if (!theme) {
      throw new Error(
        `unknown theme "${themeName}" - available: ${Object.keys(THEMES).join(', ')}`,
      );
    }
    if (!config || typeof config !== 'object') {
      throw new Error('render() needs a parsed config object');
    }

    const ctx = makeContext(config, opts);
    return theme.form(ctx.model, ctx);
  },

  /**
   * Renders into an element and returns the created `<form>`.
   * Browser only.
   *
   * @param {string|Element} target
   */
  mount(target, config, opts = {}) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) throw new Error(`mount target not found: ${target}`);
    // The build bakes the rendered form into the page so it paints instantly,
    // like the legacy server-rendered wizard. When that markup is already in
    // the target, bind it instead of destroying and re-creating it.
    const existing = element.querySelector ? element.querySelector('form') : null;
    if (existing) return existing;
    element.innerHTML = FormRender.render(config, opts);
    return element.querySelector('form');
  },
};

export default FormRender;
