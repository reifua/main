// Browser boot for modal forms (the notify style), driven by
// behavior.mode: modal in the form config.
//
// Same engine as page forms - discover the island, mount the rendered form,
// wire the controller/binder - but the submit keeps the modal life-cycle
// (captcha on shown, reset on show, JSON payload). Dispatched from app.js.

import { FormRender } from './render.js';
import { makeController } from './controller.js';
import { bindForm } from './binder.js';
import { CAPTCHA_REQUIRED_TEXT, captchaBlocked, counterRemaining, NOTIFY_ERROR_TEXTS, notifyErrorText, SPINNER_HTML, SUBMIT_LABEL } from './data.js';
import { buildJsonPayload } from './submit.js';

/**
 * Boots the modal form. Returns a handle, or null when the page has no
 * #notify-app (the modal lives on every property page, the module may load
 * on a page where it was removed).
 *
 * @param {Document} root
 * @param {object} [opts]
 *   {object}   [opts.Captcha]    default window.CaptchaSite
 *   {object}   [opts.jQuery]     default window.jQuery
 *   {function} [opts.fetch]      default global fetch
 *   {function} [opts.now]        default Date.now
 *   {function} [opts.setTimeout] default setTimeout
 */
export function bootModal(root, opts = {}) {
  const app = root.getElementById('notify-app');
  const configNode = root.getElementById('notify-config');
  if (!app || !configNode) return null;

  const config = JSON.parse(configNode.textContent);
  const pageNode = root.getElementById('notify-page');
  const page = pageNode ? JSON.parse(pageNode.textContent) : {};

  const endpoint = app.getAttribute('data-endpoint') || '';
  config.submit = { ...(config.submit || {}), method: (config.submit && config.submit.method) || 'POST' };
  if (endpoint) config.submit.action = endpoint;

  const form = FormRender.mount(app, config);
  const controller = makeController(config);
  const theme = FormRender.theme(config.theme || 'bootstrap4');
  const binder = bindForm(form, controller, { classes: theme.validationClasses, colClass: theme.colClass });

  const Captcha = opts.Captcha !== undefined
    ? opts.Captcha
    : (typeof window !== 'undefined' ? window.CaptchaSite || null : null);
  const jq = opts.jQuery !== undefined
    ? opts.jQuery
    : (typeof window !== 'undefined' ? window.jQuery || null : null);
  const fetchImpl = opts.fetch || ((...args) => globalThis.fetch(...args));
  const now = opts.now || (() => Date.now());
  const later = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));

  const el = (id) => form.querySelector(`#${id}`) || root.getElementById(id);

  const showError = (message) => {
    const err = el('notify-error');
    if (!err) return;
    if (message) err.textContent = message;
    err.classList.remove('d-none');
  };
  const hideError = () => {
    const err = el('notify-error');
    if (err) err.classList.add('d-none');
  };

  // The page fields arrive as JSON because the form itself is rendered by
  // JavaScript - Liquid cannot fill an input that does not exist yet.
  const pageFields = {
    uid: page.uid,
    property_url: page.property_url,
    property_email: page.property_email,
    property_title: page.property_title,
  };
  for (const [name, value] of Object.entries(pageFields)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input && value !== undefined && value !== null) input.value = String(value);
  }

  const timestampInput = form.querySelector('[name="timestamp"]');
  const stamp = () => {
    if (timestampInput) timestampInput.value = String(now());
  };
  stamp();

  // The counter lives in the field's helper copy; one attribute in the config
  // names the field it counts down for, so the glue never hardcodes an id.
  for (const counter of form.querySelectorAll('[data-countdown]')) {
    const name = counter.getAttribute('data-countdown');
    const control = form.querySelector(`[data-field="${name}"]`);
    if (!control) continue;
    const update = () => {
      const left = counterRemaining(control, control.value);
      if (left !== null) counter.textContent = String(left);
    };
    control.addEventListener('input', update);
    update();
  }

  const submitBtn = el('notify-submit');

  const restoreSubmit = () => {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.textContent = SUBMIT_LABEL;
    submitBtn.classList.remove('d-none');
  };

  // show.bs.modal: clear whatever the previous round left behind. The old
  // reset only refilled the timestamp and hid the error, so a closed-after-
  // success modal reopened with a dead form; the groups and the button come
  // back here.
  const resetForm = () => {
    stamp();
    hideError();
    form.classList.remove('was-validated');
    for (const group of form.querySelectorAll('[data-field-group]')) group.classList.remove('d-none');
    const success = el('notify-success');
    if (success) success.classList.add('d-none');
    restoreSubmit();
  };

  const mountNotifyCaptcha = () => {
    if (!Captcha) return;
    if (Captcha.isLocal()) {
      const notice = el('notify-local-notice');
      if (notice) notice.classList.remove('d-none');
      return;
    }
    const localNotice = el('notify-local-notice');
    if (localNotice) localNotice.classList.add('d-none');
    const retryNotice = el('notify-captcha-retry');
    if (retryNotice) retryNotice.classList.add('d-none');
    if (typeof window === 'undefined' || typeof window.turnstile === 'undefined') {
      later(mountNotifyCaptcha, 250);
      return;
    }
    let mounted = false;
    try {
      Captcha.mount('#turnstile-widget', 'notify_property', () => {
        if (!mounted) {
          mounted = true;
          later(mountNotifyCaptcha, 700);
          return;
        }
        if (retryNotice) retryNotice.classList.remove('d-none');
        showError('Не вдалося завантажити перевірку.');
      });
      mounted = true;
    } catch {
      later(mountNotifyCaptcha, 700);
    }
  };

  // Bootstrap 4 викликає події модалки через jQuery.trigger(), який не
  // породжує нативну DOM-подію. Тому слухач через addEventListener ніколи не
  // спрацьовує. При наявності jQuery підписка робиться через .on(), інакше
  // залишається нативний варіант.
  const onModalEvent = (modalEl, eventName, handler) => {
    if (jq) {
      jq(modalEl).on(eventName, handler);
      return;
    }
    modalEl.addEventListener(eventName, handler);
  };

  const modalEl = root.getElementById('notifyModal');
  if (modalEl) {
    onModalEvent(modalEl, 'show.bs.modal', resetForm);
    // Turnstile не малюється у контейнері з display:none, а Bootstrap 4
    // надсилає show.bs.modal до _showElement(). Тому captcha встановлюється
    // на shown.bs.modal, коли модалка вже видима.
    onModalEvent(modalEl, 'shown.bs.modal', mountNotifyCaptcha);
    onModalEvent(modalEl, 'hidden.bs.modal', () => {
      if (Captcha) Captcha.unmount('#turnstile-widget');
    });
  }

  const retryBtn = el('notify-captcha-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', mountNotifyCaptcha);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const valid = controller.validateAll();

    if (captchaBlocked(Captcha)) {
      showError(CAPTCHA_REQUIRED_TEXT);
      return;
    }

    if (!valid) {
      form.classList.add('was-validated');
      return;
    }
    form.classList.remove('was-validated');

    const token = Captcha ? Captcha.token('#turnstile-widget') : '';
    const payload = buildJsonPayload(form, controller, token);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = SPINNER_HTML;
    }

    fetchImpl(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json()
        .catch(() => ({}))
        .then((body) => {
          if (!response.ok || !body || !body.success) {
            showError(notifyErrorText(body && body.code, config.submit && config.submit.errors));
            // A turnstile token is single-use, so a rejected one cannot be
            // retried. Ask for a fresh token instead of looping on a dead one.
            if (Captcha && body && String(body.code || '').indexOf('E_CAPTCHA') === 0) {
              const retryNotice = el('notify-captcha-retry');
              if (retryNotice) retryNotice.classList.remove('d-none');
            }
            throw new Error('Send failed');
          }
          return body;
        }))
      .then(() => {
        for (const group of form.querySelectorAll('[data-field-group]')) group.classList.add('d-none');
        const localNotice = el('notify-local-notice');
        if (localNotice) localNotice.classList.add('d-none');
        const success = el('notify-success');
        if (success) success.classList.remove('d-none');
        if (submitBtn) submitBtn.classList.add('d-none');
      })
      .catch(() => {
        restoreSubmit();
        showError('');
      });
  });

  return { form, controller, binder, reset: resetForm, mountCaptcha: mountNotifyCaptcha };
}
