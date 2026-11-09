// FormEngine adapter for the Eleventy site.
//
// Same engine as the Jekyll site (assets/js/form-engine/**), same contract: a
// form config in src/_data/<name>.yml (the 11ty twin of Jekyll's
// _data/<name>.yml) is baked at build time into one self-contained fragment -
// config island, chrome, the rendered form, addon modals and the module loader
// (assets/js/form-engine/shell.js -> renderPage, assets/js/form-engine/app.js
// as the single entry).
//
// The difference is only how the fragment reaches the page. Jekyll writes a
// Liquid include; Nunjucks would re-parse that include and choke on the JSON,
// CSS and JS inside it. So here the fragment is kept in memory and injected by
// a shortcode whose return value Nunjucks never re-parses:
//
//   {% formApp "demo" %}
//
// The site data is not YAML, so - unlike _form-engine/tools/site-opts.mjs on
// the Jekyll side - this adapter passes its own opts and never reads a
// _config.yml. The config is site-agnostic; only this file knows the site.
//
// Like the Jekyll adapter it inlines the Leaflet blobs (src/assets/vendor/
// leaflet.{js,css}) when a form carries a map widget, so the map works without
// any network or extra <link>/<script> in the page layout.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const REPO = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO, 'src', '_data');
const ENGINE_DIR = path.join(REPO, 'src', 'assets', 'js', 'form-engine');

// Site-specific submit endpoints, keyed by form id. The config stays
// site-agnostic - it never carries a worker URL - so the adapter is the only
// place that knows where this site sends each form.
const SITE = require('../src/_data/site.js');
const ENDPOINTS = {
  'add-property': SITE.addPropertyEndpoint,
  'demo': SITE.demoEndpoint || '/api/demo',
};

function endpointFor(name, config) {
  if (config.submit && config.submit.action) return config.submit.action;
  return ENDPOINTS[name];
}

// The same shape guard the Jekyll plugin uses: a file in _data is a form only
// when it carries the form signature. Everything else there (i18n, menu, ...)
// is left alone.
function isFormConfig(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    'version' in value && typeof value.id === 'string' && Array.isArray(value.steps);
}

// Site assets the bake inlines: the Leaflet blobs the map widget needs. They do
// not live in the engine dir (they are site files), so they are hashed and read
// here by explicit path - mirrors _includes/js|css on the Jekyll side.
const VENDOR_ASSETS = [
  'src/assets/vendor/leaflet.css',
  'src/assets/vendor/leaflet.js',
];

// Reads one bake asset (Leaflet CSS/JS) as UTF-8, or '' when missing.
function readVendor(rel) {
  const full = path.join(REPO, ...rel.split('/'));
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

// The ?v= token: a hash of the runtime the loader serves. Deterministic, so a
// rebuild of an unchanged engine keeps the same URL (browsers stay warm) and a
// changed engine busts it. Mirrors _form-engine/tools/site-opts.mjs engineDigest.
// The inlined Leaflet assets are part of the baked bytes, so they join the hash.
function engineDigest() {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
        hash.update(path.relative(ENGINE_DIR, full).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(full));
        hash.update('\0');
      }
    }
  };
  walk(ENGINE_DIR);
  for (const rel of VENDOR_ASSETS) {
    const full = path.join(REPO, ...rel.split('/'));
    if (!fs.existsSync(full)) continue;
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(full));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function formFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
}

module.exports = function registerForms(eleventyConfig) {
  const baked = new Map();

  // Baked after data is ready and before any template renders, so the
  // shortcode always finds its fragment. Eleventy watches src/_data and the
  // engine, so editing a config or the runtime re-bakes on the next rebuild.
  eleventyConfig.on('beforeBuild', async () => {
    baked.clear();
    if (!formFiles().length) return;

    const yaml = require('js-yaml');
    const { renderPage } = await import(pathToFileURL(path.join(ENGINE_DIR, 'shell.js')).href);
    const version = engineDigest();

    for (const file of formFiles()) {
      const name = file.replace(/\.ya?ml$/, '');
      const config = yaml.load(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      if (!isFormConfig(config)) continue;
      if (config.id !== name) {
        throw new Error(`src/_data/${file}: id "${config.id}" must match the file name "${name}"`);
      }
      baked.set(name, renderPage(config, {
        name,
        theme: config.theme || 'tailwind',
        base: '',
        version,
        endpoint: endpointFor(name, config),
        rates: config.rates,
        mapCss: readVendor('src/assets/vendor/leaflet.css'),
        mapJs: readVendor('src/assets/vendor/leaflet.js'),
      }));
    }
  });

  eleventyConfig.addShortcode('formApp', function formApp(name) {
    const html = baked.get(name);
    if (html === undefined) {
      const known = [...baked.keys()].join(', ') || 'none';
      throw new Error(`formApp("${name}"): no src/_data/${name}.yml (baked: ${known})`);
    }
    return html;
  });

  eleventyConfig.addWatchTarget(DATA_DIR + path.sep);
  eleventyConfig.addWatchTarget(ENGINE_DIR + path.sep);
};
