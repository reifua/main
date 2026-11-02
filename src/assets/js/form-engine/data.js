// Pure, DOM-free helpers of the form engine.
//
// Everything here is a function of its arguments alone - no DOM, no globals -
// so the build shell, the browser runtime and the bare-node tests all share it.
// Extracted from the old page/modal glue (form-add-property.js, form-notify.js).

import { fileLimitText } from './language.js';


// ---------------------------------------------------------------- pure core ---

/** Flattens one step's field definitions, mirroring getStepFields. */
export function stepFieldNames(step) {
  const out = [];
  const walk = (rows) => {
    for (const row of rows || []) {
      for (const col of row.cols || []) walk(col.rows || []);
      for (const field of row.fields || []) if (field && field.name) out.push(field);
    }
  };
  walk(step.rows || []);
  return out;
}

export function findField(step, name) {
  for (const field of stepFieldNames(step)) if (field.name === name) return field;
  return null;
}

/** Walks the whole config for a field definition by name. */
export function findFieldInConfig(config, name) {
  for (const step of config.steps || []) {
    const field = findField(step, name);
    if (field) return field;
  }
  return null;
}

/** The initial data object the legacy Alpine x-data built with Liquid. */
export function buildData(config) {
  const data = {};
  const everyField = (visit) => {
    for (const step of config.steps || []) {
      for (const field of stepFieldNames(step)) visit(field, step);
    }
  };
  everyField((field) => {
    if (field.widget === 'location' && field.fields) {
      const obj = {};
      for (const sub of field.fields) {
        if (sub.name) {
          obj[sub.name] = '';
          obj[`${sub.name}Name`] = '';
          obj[`${sub.name}Type`] = '';
        }
      }
      data[field.name] = obj;
      return;
    }
    if (field.type === 'widgets') return;
    if (field.type === 'checkbox_group') data[field.name] = [];
    else if (field.type === 'checkbox') data[field.name] = false;
    else data[field.name] = '';
  });
  data.lat = '';
  data.lng = '';
  data.address = '';
  return data;
}

// ------------------------------------------------------------- file helpers ---

/** Parses '5 MB' / '800 KB' / a number of MB, defaulting to 5 MB. */
export function parseFileSize(str) {
  if (typeof str === 'number') return { bytes: str * 1048576, display: `${str} MB` };
  const m = String(str).match(/^(\d+)\s*(MB|KB)$/i);
  if (!m) return { bytes: 5 * 1048576, display: '5 MB' };
  const val = parseInt(m[1], 10);
  const unit = m[2].toUpperCase();
  return {
    bytes: unit === 'MB' ? val * 1048576 : val * 1024,
    display: `${val} ${unit}`,
  };
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function filePlural(count) {
  const n = Math.abs(count) % 100;
  const n10 = n % 10;
  if (n > 10 && n < 20) return 'файлів';
  if (n10 > 1 && n10 < 5) return 'файли';
  if (n10 === 1) return 'файл';
  return 'файлів';
}

/**
 * The placeholder values of a file field: {min}, {max} and {limit}.
 *
 * {limit} is the raw config value ('150KB') - the very string the info line
 * under the control shows - so the notice and the error speak the same size.
 * The defaults are the engine's own: ten files, 5 MB, no minimum.
 */
export function filePlaceholders(field) {
  const cfg = (field && field.file) || {};
  const value = (v) => (v === undefined || v === null ? '' : String(v));
  return {
    min: value(cfg.minFiles),
    max: value(cfg.maxFiles === undefined ? 10 : cfg.maxFiles),
    limit: value(cfg.maxSize === undefined ? '5 MB' : cfg.maxSize),
  };
}

/** Fills {min}, {max} and {limit} in a file message. */
export function fillFilePlaceholders(text, values) {
  if (typeof text !== 'string' || !text) return '';
  const v = values || {};
  const value = (x) => (x === undefined || x === null ? '' : String(x));
  return text
    .replace(/\{min\}/g, value(v.min))
    .replace(/\{max\}/g, value(v.max))
    .replace(/\{limit\}/g, value(v.limit));
}

/** The deterministic name stored on the worker side for a processed photo. */
export function newFileName(idx, propertyType, stamp, ext) {
  return `${idx + 1}_${propertyType || 'object'}_${stamp}.${ext || 'jpg'}`;
}

/**
 * Photo collection gate: every original must already have a processed File,
 * otherwise the submit stalls with the legacy message.
 */
export function collectPhotos(originals, processed) {
  const list = [];
  for (let i = 0; i < (originals || []).length; i++) {
    const file = (processed || [])[i];
    if (!file) {
      return { error: 'Фото ще обробляються. Зачекайте кілька секунд і спробуйте ще раз.' };
    }
    list.push(file);
  }
  return { list };
}

/**
 * The notice for one photo, shown under its preview, or null when the photo
 * broke no limit.
 *
 * The photo breaks the byte limit when the original is over maxSize, and the
 * resize box when its width or height is over resizeWidth/resizeHeight. A
 * photo that is still over maxSize after the crop gets no byte notice: the
 * promise "the system will squeeze it down to the limit" would be a lie, and
 * the field error says it better. The resize notice still applies - the crop
 * always happens.
 */
export function fileNoticeFor(origSize, newSize, dims, cfg) {
  const sizeInfo = parseFileSize(cfg.maxSize);
  const resizeW = cfg.resizeWidth || 800;
  const resizeH = cfg.resizeHeight || 600;
  const overSize = origSize > sizeInfo.bytes;
  const stillOver = (newSize || origSize) > sizeInfo.bytes;
  const overDims = !!dims && (dims.w > resizeW || dims.h > resizeH);
  const squeezable = overSize && !stillOver;
  const kind = overDims ? (squeezable ? 'both' : 'dims') : (squeezable ? 'size' : null);
  if (!kind) return null;
  return fileLimitText(kind, { limit: sizeInfo.display, size: `${resizeW}×${resizeH}` });
}

// ------------------------------------------------------------ price helpers ---

const PRICE_LABELS = { sell: 'Ціна продажу', rent: 'Ціна оренди', realty_free: 'Ціна продажу', rent_free: 'Ціна оренди' };

const PERIOD_LABELS = {
  hour: 'за одну годину',
  day_night: 'за 24 години (одну добу)',
  month: 'за один місяць',
  three_month: 'за один місяць',
  six_month: 'за один місяць',
  year: 'за один місяць',
  more_year: 'за один місяць',
};

const PERIOD_NOTES = {
  month: 'період оплати і оренди не менше ніж на один місяць',
  three_month: 'період оплати і оренди не менше ніж на три місяці',
  six_month: 'період оплати і оренди не менше ніж на пів року',
  year: 'період оплати і оренди не менше ніж на один рік',
  more_year: 'період оплати і оренди на рік і більше',
};

const RENT_MONTHS = { hour: 1 / 24 / 30, day_night: 1 / 30, month: 1, three_month: 1, six_month: 1, year: 1, more_year: 1 };

const loc = (n) => n.toLocaleString('uk-UA');

export function rateFor(currency, rates) {
  const r = rates || {};
  const key = currency ? String(currency).toLowerCase() : 'uah';
  if (key === 'uah') return 1;
  return r[key] || 1;
}

export function nbuRate(rates) {
  return (rates || {}).nbu || 0;
}

export function hasNbu(rates) {
  return Boolean((rates || {}).nbu);
}

export function currencySym(currency) {
  if (currency === 'usd') return '$';
  if (currency === 'eur') return '€';
  return '';
}

export function priceUah(data, rates) {
  const p = parseFloat(data.price);
  if (!p) return '';
  return loc(Math.round(p * rateFor(data.currency, rates)));
}

export function priceForeign(data) {
  const p = parseFloat(data.price);
  if (!p) return '';
  return loc(Math.round(p));
}

export function pricePerM2Uah(data, rates) {
  const p = parseFloat(data.price);
  const s = parseFloat(data.surface);
  if (!p || !s) return '';
  return loc(Math.round((p / s) * rateFor(data.currency, rates)));
}

export function pricePerM2Foreign(data) {
  const p = parseFloat(data.price);
  const s = parseFloat(data.surface);
  if (!p || !s) return '';
  return loc(Math.round(p / s));
}

export function priceLabelOf(data) {
  return PRICE_LABELS[data.action_type] || 'Ціна';
}

export function rentPriceFor(data, months) {
  const p = parseFloat(data.price);
  if (!p || data.action_type !== 'rent') return '';
  return loc(Math.round(p * RENT_MONTHS[data.period_rent] * months));
}

export function currencyRateLabel(data, rates) {
  if (data.currency === 'uah') {
    if (!nbuRate(rates)) return '';
    return `${nbuRate(rates)} гривень за $1`;
  }
  const rate = (rates || {})[data.currency];
  if (!rate) return '';
  return `${rate} гривень за ${currencySym(data.currency) || 'в.о.'}1`;
}

/** option label for a select field value (utility_bills_rent summary). */
export function optionLabel(config, fieldName, value) {
  if (value === '' || value === null || value === undefined) return '';
  const field = findFieldInConfig(config, fieldName);
  if (field && field.options) {
    for (const o of field.options || []) if (String(o.value) === String(value)) return o.label;
  }
  return String(value);
}

/** Static label of a field (period_rent heading). */
export function fieldLabel(config, fieldName) {
  const field = findFieldInConfig(config, fieldName);
  return (field && field.label) ? field.label : '';
}

/**
 * Renders the price_info card lines exactly as the legacy Alpine partial did.
 * Returns an HTML string (each line is a <div>, conditionals resolved now,
 * because the new engine has no x-show to defer them).
 */
export function priceInfoHtml(data, config, rates) {
  const r = rates || {};
  const action = data.action_type;
  const sym = currencySym(data.currency);
  const label = priceLabelOf(data);
  const lines = [];

  if (action === 'sell' || action === 'realty_free') {
    if (data.currency !== 'uah') {
      lines.push(`<div>${label} ${priceUah(data, r)} гривень за весь об'єкт нерухомості</div>`);
      if (data.surface) lines.push(`<div>${label} в українських гривнях ${pricePerM2Uah(data, r)} ₴ за 1 м²</div>`);
      lines.push(`<div>${label} в іноземній валюті ${sym} ${priceForeign(data)} за весь об'єкт нерухомості</div>`);
      if (data.surface) lines.push(`<div>${label} в іноземній валюті ${sym} ${pricePerM2Foreign(data)} за 1 м²</div>`);
      lines.push(`<div>Конвертовано за курсом ${currencyRateLabel(data, r)}</div>`);
    } else {
      lines.push(`<div>${label} ${priceForeign(data)} гривень за весь об'єкт нерухомості</div>`);
      if (data.surface) lines.push(`<div>${label} в гривнях ${pricePerM2Foreign(data)} за 1 м²</div>`);
    }
    return lines.join('');
  }

  if (action === 'rent' && !data.period_rent) {
    lines.push('<div class="text-danger fw-bold">Подавач оголошення не вказав період оренди</div>');
    lines.push(`<div>${label} ${data.currency !== 'uah' ? `${sym} ` : ''}${priceForeign(data)} - період не вказано</div>`);
    if (data.surface && data.currency !== 'uah') lines.push(`<div>${label} в українських гривнях ${pricePerM2Uah(data, r)} ₴ за 1 м²</div>`);
    if (data.surface && data.currency !== 'uah') lines.push(`<div>${label} в іноземній валюті ${sym} ${pricePerM2Foreign(data)} за 1 м²</div>`);
    if (data.surface && data.currency === 'uah') lines.push(`<div>${label} в гривнях ${pricePerM2Foreign(data)} за 1 м²</div>`);
    lines.push(`<div class="text-danger fw-bold">Для точного підрахунку ціни оренди вам необхідно вибрати період у полі «${fieldLabel(config, 'period_rent')}»</div>`);
    return lines.join('');
  }

  if (action === 'rent' && data.period_rent) {
    const period = PERIOD_LABELS[data.period_rent] || PERIOD_LABELS.month;
    const note = PERIOD_NOTES[data.period_rent] || '';
    const inForeign = data.currency !== 'uah';
    lines.push(`<div>${label} в українських гривнях ${priceUah(data, r)} ₴ ${period}</div>`);
    if (inForeign) lines.push(`<div>${label} в іноземній валюті ${sym} ${priceForeign(data)} ${period}</div>`);
    if (data.currency === 'uah' && hasNbu(r)) {
      const p = parseFloat(data.price);
      lines.push(`<div>Ціна в іноземній валюті $ ${(p / nbuRate(r)).toFixed(2)} ${period}</div>`);
    }
    if (data.surface) lines.push(`<div>${label} в українських гривнях ${pricePerM2Uah(data, r)} ₴ за 1 м²</div>`);
    if (data.surface && inForeign) lines.push(`<div>${label} в іноземній валюті ${sym} ${pricePerM2Foreign(data)} за 1 м²</div>`);
    if (data.surface && data.currency === 'uah' && hasNbu(r)) {
      const p = parseFloat(data.price);
      const s = parseFloat(data.surface);
      lines.push(`<div>Ціна в іноземній валюті $ ${(p / s / nbuRate(r)).toFixed(2)} за 1 м²</div>`);
    }
    if (['month', 'three_month', 'six_month', 'year', 'more_year'].indexOf(data.period_rent) !== -1) {
      lines.push(`<div>Вартість оренди в ${inForeign ? 'іноземній валюті' : 'українських гривнях'} за відповідні періоди:</div>`);
      lines.push(`<div>- за один місяць: ${inForeign ? `${sym} ` : ''}${rentPriceFor(data, 1)}${!inForeign ? ' гривень' : ''}${data.period_rent === 'month' ? `  (${note})` : ''}</div>`);
      lines.push(`<div>- за три місяці: ${inForeign ? `${sym} ` : ''}${rentPriceFor(data, 3)}${!inForeign ? ' гривень' : ''}${data.period_rent === 'three_month' ? `  (${note})` : ''}</div>`);
      lines.push(`<div>- за півроку: ${inForeign ? `${sym} ` : ''}${rentPriceFor(data, 6)}${!inForeign ? ' гривень' : ''}${data.period_rent === 'six_month' ? `  (${note})` : ''}</div>`);
      lines.push(`<div>- за один рік: ${inForeign ? `${sym} ` : ''}${rentPriceFor(data, 12)}${!inForeign ? ' гривень' : ''}${data.period_rent === 'year' || data.period_rent === 'more_year' ? `  (${note})` : ''}</div>`);
    }
    lines.push(data.currency === 'uah'
      ? `<div>Конвертовано за курсом національного банку України ${currencyRateLabel(data, r)}</div>`
      : `<div>Конвертовано за курсом ${currencyRateLabel(data, r)}</div>`);
    if (optionLabel(config, 'utility_bills_rent', data.utility_bills_rent)) {
      lines.push(`<div>${optionLabel(config, 'utility_bills_rent', data.utility_bills_rent)}</div>`);
    }
    return lines.join('');
  }

  if (action === 'rent_free') {
    lines.push(`<div>${label} ${priceForeign(data)} гривень за весь об'єкт нерухомості на один рік</div>`);
    if (optionLabel(config, 'utility_bills_rent', data.utility_bills_rent)) {
      lines.push(`<div>${optionLabel(config, 'utility_bills_rent', data.utility_bills_rent)}</div>`);
    }
    return lines.join('');
  }

  return '';
}

// ------------------------------------------------------------ autocomplete ---

/** Normalizes an inline option list (id/name, value/label, bare strings). */
export function asInlineData(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d)) return null;
  const norm = [];
  for (const o of d) {
    if (!o) continue;
    if (typeof o !== 'object') {
      norm.push({ id: o, name: String(o) });
      continue;
    }
    const id = o.id !== undefined && o.id !== null ? o.id : o.value;
    if (id === undefined || id === null) continue;
    const name = o.name !== undefined && o.name !== null ? o.name : o.label;
    norm.push({ id, name: name === undefined || name === null ? String(id) : name });
  }
  return norm;
}

function getPathValue(root, path) {
  if (path === null || path === undefined) return undefined;
  let cur = root;
  for (const part of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** The live source for an autocomplete field: inline, URL or datas[] rule. */
export function resolveAutocompleteSource(field, getValue) {
  const inline = asInlineData(field.data);
  if (inline) {
    return {
      url: null,
      inline: true,
      inlineData: inline,
      mode: field.mode,
      threshold: field.threshold,
      minChars: field.minChars,
      maxResults: field.maxResults,
    };
  }

  const fallback = {
    url: field.data || null,
    mode: field.mode,
    threshold: field.threshold,
    minChars: field.minChars,
    maxResults: field.maxResults,
  };
  for (const entry of field.datas || []) {
    if (entry && entry.data && getPathValue(getValue(), entry.field) === entry.value) {
      const ed = asInlineData(entry.data);
      if (ed) {
        return {
          url: null,
          inline: true,
          inlineData: ed,
          mode: entry.mode || field.mode,
          threshold: entry.threshold !== undefined ? entry.threshold : field.threshold,
          minChars: entry.minChars !== undefined ? entry.minChars : field.minChars,
          maxResults: entry.maxResults !== undefined ? entry.maxResults : field.maxResults,
        };
      }
      return {
        url: entry.data,
        mode: entry.mode || field.mode,
        threshold: entry.threshold !== undefined ? entry.threshold : field.threshold,
        minChars: entry.minChars !== undefined ? entry.minChars : field.minChars,
        maxResults: entry.maxResults !== undefined ? entry.maxResults : field.maxResults,
      };
    }
  }
  return fallback;
}

/** Raw options after the field.filter cascade (parent key match). */
export function autocompleteFilter(field, source, cache, getValue) {
  if (source && source.inline) return source.inlineData;
  if (!source || !source.url) return [];
  const data = cache[source.url];
  if (!data) return [];
  const filter = field.filter;
  if (!filter || !filter.field) return data;
  const parentVal = getPathValue(getValue(), filter.field);
  const key = filter.key || filter.field;
  if (parentVal === '' || parentVal === null || parentVal === undefined) return [];
  return data.filter((o) => String(o[key]) === String(parentVal));
}

/** Name-prefix match over an option list, capped to maxResults. */
export function autocompleteMatch(options, query, maxResults) {
  const q = String(query || '').trim().toLowerCase();
  const searchName = q.split(' - ')[0].trim();
  const max = maxResults === undefined || maxResults === null ? 10 : parseInt(maxResults, 10);
  const limit = Number.isFinite(max) && max > 0 ? max : 10;
  const out = [];
  if (!searchName) return out;
  for (const o of options) {
    if (out.length >= limit) break;
    if (String(o.name || '').toLowerCase().indexOf(searchName) !== -1) out.push(o);
  }
  return out;
}

// ------------------------------------------------------------- location ------

export function locationFieldNames(widget) {
  const out = [];
  for (const sub of (widget && widget.fields) || []) if (sub.name) out.push(sub.name);
  return out;
}

export function locationMethod(widget) {
  return widget && widget.settings && widget.settings.method === 'two' ? 'two' : 'one';
}

export function locationField(widget, name) {
  for (const sub of (widget && widget.fields) || []) if (sub.name === name) return sub;
  return null;
}

export function locationParent(widget, name) {
  const f = locationField(widget, name);
  return (f && f.parent) || null;
}

/** Flat index of nested (or flat) address data, one row per option. */
export function buildLocationIndex(data, widget) {
  const names = locationFieldNames(widget);
  const all = [];
  if (!data || !data.length || !names.length) return all;
  const isFlat = Object.prototype.hasOwnProperty.call(data[0] || {}, 'parentId');

  if (isFlat) {
    const byId = {};
    for (const item of data) {
      if (item && item.id !== undefined && item.id !== null) byId[String(item.id)] = item;
    }
    const levels = {};
    const assignLevel = (item) => {
      const key = String(item.id);
      if (levels[key] !== undefined) return levels[key];
      const p = item.parentId;
      if (p === null || p === undefined || p === '') levels[key] = 0;
      else {
        const parent = byId[String(p)];
        levels[key] = parent ? assignLevel(parent) + 1 : 0;
      }
      return levels[key];
    };
    for (const item of data) assignLevel(item);
    for (const item of data) {
      let lvl = assignLevel(item);
      if (lvl >= names.length) lvl = names.length - 1;
      if (lvl < 0) continue;
      const fieldName = names[lvl];
      const entry = {
        id: item.id, name: item.name || item.label || String(item.id),
        type: item.type || '', url: item.url || '', katotth: item.katotth || '',
        _field: fieldName, _parent: null, _ancestors: [],
      };
      const anc = [];
      let cur = item;
      let guard = 0;
      while (cur && cur.parentId !== null && cur.parentId !== undefined && cur.parentId !== '' && guard < names.length) {
        const par = byId[String(cur.parentId)];
        if (!par) break;
        const pf = names[assignLevel(par)];
        entry[pf] = par.id;
        anc.unshift({ field: pf, id: par.id, name: par.name || String(par.id), type: par.type || '' });
        cur = par;
        guard++;
      }
      entry._ancestors = anc;
      entry._parent = anc.length ? anc[anc.length - 1].field : null;
      all.push(entry);
    }
    return all;
  }

  const chain = [];
  const walk = (node, fieldIdx) => {
    const fieldName = names[fieldIdx];
    const nodeField = locationField(widget, fieldName);
    const entry = {
      id: node.id, name: node.name || node.label || String(node.id),
      type: node.type || '', url: node.url || '', katotth: node.katotth || '',
      _field: fieldName,
    };
    const anc = [];
    for (const a of chain) {
      entry[a.field] = a.id;
      anc.push({ field: a.field, id: a.id, name: a.name, type: a.type });
    }
    entry._ancestors = anc;
    entry._parent = chain.length ? chain[chain.length - 1].field : null;
    all.push(entry);
    const childKey = nodeField && nodeField.children ? nodeField.children : null;
    const kids = childKey && node[childKey] ? node[childKey] : [];
    if (kids.length && fieldIdx < names.length - 1) {
      chain.push({ field: fieldName, id: node.id, name: entry.name, type: entry.type });
      for (const kid of kids) walk(kid, fieldIdx + 1);
      chain.pop();
    }
  };
  for (const node of data) walk(node, 0);
  return all;
}

/** Options for one sub-field, honouring the cascade and value presets. */
export function locationOptions(index, widget, fieldName, getLocationData, presets) {
  const idx = locationFieldNames(widget).indexOf(fieldName);
  if (idx < 0) return [];
  const parent = locationParent(widget, fieldName);
  const method = locationMethod(widget);
  const data = getLocationData();
  let out = [];

  if (parent) {
    if (method === 'two') {
      out = index.filter((s) => {
        if (s._field !== fieldName) return false;
        for (const a of s._ancestors || []) {
          const pv = a.field ? data[a.field] : null;
          if (pv === '' || pv === null || pv === undefined) continue;
          if (String(a.id) !== String(pv)) return false;
        }
        return true;
      });
    } else {
      const parentVal = data[parent];
      if (parentVal === '' || parentVal === null || parentVal === undefined) return [];
      out = index.filter((s) => s._field === fieldName && String(s[parent]) === String(parentVal));
    }
  } else {
    out = index.filter((s) => s._field === fieldName);
  }

  if (presets) out = out.filter((o) => presets.indexOf(o.id) !== -1);
  return out;
}

/** showType per sub-field: has a type at all, and it adds information. */
export function buildLocationShowTypes(index, widget) {
  const map = {};
  for (const fieldName of locationFieldNames(widget)) {
    const field = locationField(widget, fieldName);
    if (field && field.showType !== undefined) {
      map[fieldName] = !!field.showType;
      continue;
    }
    let hasType = false;
    let allRedundant = true;
    for (const e of index) {
      if (e._field !== fieldName || !e.type) continue;
      hasType = true;
      if (String(e.name).toLowerCase().indexOf(String(e.type).toLowerCase()) === -1) {
        allRedundant = false;
        break;
      }
    }
    map[fieldName] = hasType && !allRedundant;
  }
  return map;
}

/** The preset ids (or null) the legacy value rules pin a sub-field to. */
export function locationPreset(widget, fieldName, getDataValueFn) {
  const field = locationField(widget, fieldName);
  if (!field || !field.value) return null;
  let val = null;
  if (field.value.depends) {
    for (const rule of field.value.depends) {
      if (matchesRule(getDataValueFn(rule.field), rule.values, rule.except)) {
        val = rule.value;
        break;
      }
    }
  }
  if (val === null && field.value.default && field.value.default.value !== undefined) {
    val = field.value.default.value;
  }
  if (val === null || val === '' || val === undefined) return null;
  return Array.isArray(val) ? val : [val];
}

function matchesRule(dataValue, values, except) {
  const vals = Array.isArray(values) ? values : [values];
  const ex = Array.isArray(except) ? except : (except ? [except] : []);
  let matched = vals.indexOf(dataValue) !== -1;
  if (ex.length) matched = matched && ex.indexOf(dataValue) === -1;
  if (!values) matched = true;
  return matched;
}

/** Legacy matchesValues: true when empty values list or dataValue matches. */
export function matchesValues(dataValue, values, except) {
  const vals = Array.isArray(values) ? values : (values === undefined ? [] : [values]);
  if (!vals.length) return true;
  return matchesRule(dataValue, vals, except);
}

export function locationReadonly(widget, fieldName, getDataValueFn) {
  const field = locationField(widget, fieldName);
  if (!field || !field.value) return false;
  if (field.value.depends) {
    for (const d of field.value.depends) {
      if (matchesValues(getDataValueFn(d.field), d.values, d.except)) return !!d.readonly;
    }
  }
  if (field.value.default) return !!field.value.default.readonly;
  return false;
}

export function locationIsRequired(widget, fieldName, evaluateDependsFn) {
  const field = locationField(widget, fieldName);
  if (!field) return false;
  const r = field.required;
  if (r === true) return true;
  if (Array.isArray(r)) return evaluateDependsFn(r);
  if (r && typeof r === 'object' && !Array.isArray(r) && r.depends) return evaluateDependsFn(r.depends);
  return false;
}

export function locationRequiredMeta(widget, configSettings, fieldName, key, def) {
  const field = locationField(widget, fieldName);
  if (!field) return def;
  const r = field.required;
  if (r && typeof r === 'object' && !Array.isArray(r) && r[key] !== undefined) return r[key];
  const settings = (configSettings && configSettings.required) || {};
  return settings[key] !== undefined ? settings[key] : def;
}

export function locationLocked(widget, fieldName, readonly, getLocationData) {
  if (readonly) return true;
  const method = locationMethod(widget);
  const names = locationFieldNames(widget);
  const isRoot = !locationParent(widget, fieldName);
  const isLeaf = names.indexOf(fieldName) === names.length - 1;
  if (method === 'two' && !isRoot && !isLeaf && getLocationData()[fieldName]) return true;
  return false;
}

export function locationDisplay(entry, showType) {
  if (!entry) return '';
  return entry.name + (showType && entry.type ? ` - ${entry.type}` : '');
}

export function locationAncestorsTail(entry) {
  const anc = entry._ancestors || [];
  if (!anc.length) return '';
  return anc.map((a) => a.name).join(', ');
}

export function locationNearest(entry) {
  const anc = entry._ancestors || [];
  return anc.length ? anc[anc.length - 1].name : '';
}

// ------------------------------------------------------------ notify core ---

// map the worker's machine code to a specific Ukrainian message,
// falling back to the generic one already in the markup
export const NOTIFY_ERROR_TEXTS = {
  E_CAPTCHA: 'Не вдалося перевірити, що ви не робот. Оновіть сторінку та спробуйте ще раз.',
  E_CAPTCHA_REQUIRED: 'Підтвердьте, що ви не робот, щоб надіслати звернення.',
  E_CAPTCHA_INVALID: 'Перевірка captcha не пройдена. Оновіть сторінку та спробуйте ще раз.',
  E_CAPTCHA_REUSED: 'Перевірка captcha вже була використана. Натисніть «Спробувати ще раз» і надішліть заново.',
  E_CAPTCHA_MALFORMED: 'Перевірка captcha отримала некоректну відповідь. Оновіть сторінку та спробуйте ще раз.',
  E_CAPTCHA_ACTION: 'Перевірка captcha не пройдена. Оновіть сторінку та спробуйте ще раз.',
  E_CAPTCHA_HOSTNAME: 'Перевірка captcha не підтримує цей домен. Спробуйте з головної сторінки сайту.',
  E_CAPTCHA_UNAVAILABLE: 'Сервер тимчасово недоступний. Спробуйте ще раз пізніше.',
  E_SPAM: 'Запит відхилено. Спробуйте ще раз.',
  E_INVALID_PAYLOAD: 'Не вдалося обробити дані форми. Спробуйте ще раз.',
  E_MAIL_UNAVAILABLE: 'Сервер тимчасово недоступний. Спробуйте ще раз пізніше.',
  E_RATE_LIMIT_EXCEEDED: 'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.',
  E_DAILY_LIMIT_EXCEEDED: 'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.',
};

export const CAPTCHA_REQUIRED_TEXT = 'Підтвердьте, що ви не робот, щоб надіслати звернення.';
export const SUBMIT_LABEL = 'Надіслати';
export const SPINNER_HTML =
  'Надсилаю<span class="spinner-border spinner-border-sm ml-2" role="status">' +
  '<span class="sr-only">Надсилаю...</span></span>';

export function notifyErrorText(code, overrides) {
  const map = overrides ? { ...NOTIFY_ERROR_TEXTS, ...overrides } : NOTIFY_ERROR_TEXTS;
  return map[code] || '';
}

export function captchaBlocked(Captcha) {
  return Boolean(Captcha && Captcha.enabled() && !Captcha.solved('#turnstile-widget'));
}

/** Characters left in a bounded field, or null when it has no maxlength. */
export function counterRemaining(control, value) {
  const raw = control.getAttribute('maxlength');
  if (raw === null || raw === '') return null;
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return null;
  return Math.max(0, limit - String(value).length);
}
