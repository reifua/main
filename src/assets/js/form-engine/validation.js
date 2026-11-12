// Field validation.
//
// Ported from getFieldErrors/getValidationMsg/isFieldRequired in
// assets/js/form-engine.js:272-415,602-610. Those closed over the module's
// globals; here everything is passed in through `ctx`, so the rules are
// testable and two forms on one page cannot read each other's state.
//
// Pure: no DOM, no network, no timers. The email DNS check lives in the
// controller because it is asynchronous and belongs to the page, not the rules.

import {
  asConditionList,
  getDataValue,
  matchesValues,
  resolveConditionalText,
} from './conditions.js';
import { filePlaceholders, fillFilePlaceholders } from './data.js';

const TEXT_TYPES = ['text', 'email', 'tel', 'textarea', 'number'];

const isWidget = (field, name) => field && field.type === 'widgets' && field.widget === name;

const isEmpty = (value) =>
  value === '' || value === null || value === undefined || value === false ||
  (Array.isArray(value) && value.length === 0);

const boundText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return 'невідоме значення';
  return String(value);
};

/**
 * Whether a field must be filled right now.
 * `required` may be a boolean, a condition list, or an object with `depends`.
 */
export function isFieldRequired(field, ctx) {
  const r = field.required;
  if (r === true) return true;
  if (Array.isArray(r)) return ctx.evaluateDepends(r);
  if (r && typeof r === 'object' && r.depends) return ctx.evaluateDepends(r.depends);
  return false;
}

/**
 * Resolves the message for one validation rule.
 *
 * Order matters and mirrors the original: rule-specific copy beats the
 * field-level fallback, which beats the form settings, which beats hardcoded
 * defaults. The `required` key additionally reads `field.required` rather than
 * `field.validation`, because that is where the DSL puts it.
 */
export function validationMessage(field, key, defKey, hardcoded, ctx) {
  const read = (path) => getDataValue(ctx.data, path);

  if (key === 'required') {
    const r = field.required;
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      if (r.message) return r.message;
      if (r.depends) {
        // Keeps scanning after a match with no message of its own, so a
        // partially specified condition set still reaches a later entry.
        for (const entry of asConditionList(r.depends)) {
          if (matchesValues(read(entry.field), entry.values, entry.except) && entry.message) {
            return entry.message;
          }
        }
      }
    }
  }

  const fromValidation = field.validation ? field.validation[key] : undefined;
  if (typeof fromValidation === 'string') return fromValidation;
  if (fromValidation && typeof fromValidation === 'object') {
    return resolveConditionalText(fromValidation, read, '');
  }

  if (key === 'required' && field.message) return field.message;

  if (key === 'required') {
    const settingsMessage = ctx.config?.settings?.required?.message;
    if (settingsMessage) return settingsMessage;
  }

  // Per-key defaults for the whole form. The schema does not use this yet, but
  // the legacy engine reads it, so a config written for that engine has to keep
  // working here - the renderer is meant to be a drop-in.
  const settingsDefaults = ctx.config?.settings?.validation;
  if (settingsDefaults && settingsDefaults[defKey]) return settingsDefaults[defKey];

  return hardcoded;
}

/**
 * The single error for a field, or null when it is valid.
 *
 * A hidden field never errors: invisible fields have no data the user
 * committed to, and leaving their stale errors visible is how a form gets
 * stuck unsubmittable.
 */
export function fieldError(field, ctx) {
  if (!ctx.isVisible(field.name)) return null;

  const isMapWidget = isWidget(field, 'map');
  const isCaptchaWidget = isWidget(field, 'captcha');

  let value = ctx.data[field.name];
  if (isMapWidget) value = ctx.data.lat || '';
  if (isCaptchaWidget) value = ctx.captchaSolved(field) ? '1' : '';

  if (isFieldRequired(field, ctx)) {
    const empty = field.type === 'file'
      ? !(ctx.files?.[field.name]?.length)
      : isMapWidget
        ? !ctx.data.lat
        : isEmpty(value);

    const defMsg = field.type === 'checkbox' ? 'Підтвердіть згоду'
      : field.type === 'checkbox_group' ? 'Оберіть хоча б один варіант'
      : field.type === 'file' ? 'Виберіть хоча б один файл'
      : isMapWidget ? 'Поставте маркер на карті'
      : isCaptchaWidget ? 'Підтвердьте, що ви не робот'
      : "Це поле обов'язкове";

    if (empty) {
      if (field.type === 'file') {
        const fileError = fileValidationError(field, ctx);
        if (fileError) return fileError;
      }
      return validationMessage(field, 'required', 'required', defMsg, ctx);
    }
  }

  if (isCaptchaWidget) return null;

  if ((value === '' || value === null || value === undefined) && field.type !== 'file') return null;

  if (field.type === 'number') {
    const num = parseFloat(value);
    if (!Number.isNaN(num)) {
      if (field.min !== undefined && num < field.min) {
        return validationMessage(field, 'min', 'min', `Мінімальне значення: ${boundText(field.min)}`, ctx);
      }
      if (field.max !== undefined && num > field.max) {
        return validationMessage(field, 'max', 'max', `Максимальне значення: ${boundText(field.max)}`, ctx);
      }
    }
  }

  if (field.type === 'file') {
    const fileError = fileValidationError(field, ctx);
    if (fileError) return fileError;
  }

  if (TEXT_TYPES.includes(field.type) && typeof value === 'string') {
    // An email carries its own `pattern`; without that exception every email
    // would fail the Ukrainian-letters form pattern the form sets globally.
    const pattern = field.pattern || (field.type !== 'email' && ctx.config?.settings?.pattern);
    if (pattern) {
      try {
        if (!new RegExp(pattern).test(value)) {
          return field.validation?.pattern
            || ctx.config?.settings?.feedback?.pattern
            || 'Неправильний формат';
        }
      } catch {
        // A pattern the config author got wrong must not block the form.
      }
    }

    const length = value.length;
    if (field.minlength !== undefined && length < field.minlength) {
      return validationMessage(
        field, 'minlength', 'minlength',
        `Мінімальна довжина: ${boundText(field.minlength)} символів`, ctx,
      );
    }
    if (field.maxlength !== undefined && length > field.maxlength) {
      return validationMessage(
        field, 'maxlength', 'maxlength',
        `Максимальна довжина: ${boundText(field.maxlength)} символів`, ctx,
      );
    }
  }

  if (field.type === 'email' && typeof value === 'string') {
    const at = value.indexOf('@');
    if (at === -1 || at === value.length - 1 || at === 0) {
      return field.validation?.email
        || ctx.config?.settings?.feedback?.email
        || 'Введіть дійсну електронну адресу';
    }
  }

  const compareError = compareErrorFor(field, value, ctx);
  if (compareError) return compareError;

  return null;
}

function fileValidationError(field, ctx) {
  const list = ctx.files?.[field.name] || [];
  const validity = ctx.fileValid?.[field.name] || [];
  const config = field.file || {};

  const maxFiles = config.maxFiles || 10;
  const minFiles = config.minFiles || 0;
  const values = filePlaceholders(field);
  // The config speaks first: `validation.maxFiles` and friends replace the
  // hardcoded copy, `settings.validation.*` is the form-wide default.
  const copy = (key, fallback) => validationMessage(field, key, key, fallback, ctx) || fallback;

  if (list.length > maxFiles) {
    return fillFilePlaceholders(copy('maxFiles', `Максимум ${maxFiles} файлів`), values);
  }
  if (minFiles && list.length < minFiles) {
    const noun = ctx.pluralizeFile ? ctx.pluralizeFile(minFiles) : (minFiles === 1 ? 'файл' : 'файлів');
    return fillFilePlaceholders(copy('minFiles', `Мінімум ${minFiles} ${noun}`), values);
  }

  for (let i = 0; i < list.length; i++) {
    if (validity[i] === false) {
      const size = ctx.parseFileSize ? ctx.parseFileSize(config.maxSize) : null;
      if (size) {
        return fillFilePlaceholders(
          copy('maxSize', `Файл "${list[i].name}" перевищує ${size.display}`),
          values,
        );
      }
    }
  }

  return null;
}

/**
 * Cross-field rules from `validation.compare`.
 *
 * A `field` array means the sum of those fields - used by "total area cannot
 * be smaller than the sum of its parts".
 */
function compareErrorFor(field, value, ctx) {
  const rules = field.validation?.compare;
  if (!Array.isArray(rules) || rules.length === 0) return null;

  const empty = value === '' || value === null || value === undefined;
  const myNum = empty ? NaN : parseFloat(value);
  if (empty || Number.isNaN(myNum)) return null;

  for (const rule of rules) {
    let otherNum;

    if (Array.isArray(rule.field)) {
      let sum = 0;
      let any = false;
      for (const name of rule.field) {
        const other = ctx.data[name];
        if (other === '' || other === null || other === undefined) continue;
        const parsed = parseFloat(other);
        if (!Number.isNaN(parsed)) {
          sum += parsed;
          any = true;
        }
      }
      if (!any) continue;
      otherNum = sum;
    } else {
      const other = getDataValue(ctx.data, rule.field);
      if (other === '' || other === null || other === undefined) continue;
      otherNum = parseFloat(other);
      if (Number.isNaN(otherNum)) continue;
    }

    let passes;
    switch (rule.operator) {
      case '<': passes = myNum < otherNum; break;
      case '<=': passes = myNum <= otherNum; break;
      case '>': passes = myNum > otherNum; break;
      case '>=': passes = myNum >= otherNum; break;
      case '==': passes = myNum == otherNum; break; // eslint-disable-line eqeqeq
      case '!=': passes = myNum != otherNum; break; // eslint-disable-line eqeqeq
      // The original initialises `pass` to false and has no default branch, so
      // an operator neither of us recognises blocks rather than silently lets
      // a bad value through.
      default: passes = false;
    }

    if (!passes) {
      return rule.message
        || field.validation?.compareMessage
        || ctx.config?.settings?.feedback?.compare
        || 'Некоректне значення';
    }
  }

  return null;
}
