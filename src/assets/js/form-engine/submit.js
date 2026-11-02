// Submit payloads and worker-error copy for the form engine.
//
// The payload shape is a pure function of (data, tokens, photos); the error
// map is the built-in fallback a config may override via submit.errors.


// ---------------------------------------------------------------- payload -----

/**
 * Worker error codes -> Ukrainian copy. These mirror site.data.uk.* exactly,
 * like NOTIFY_ERROR_TEXTS in form-notify.js, so the config island never has to
 * carry copy and the Phase 5 copy-parity gate keeps seeing the strings on the
 * legacy page only.
 */
export const AP_ERROR_TEXTS = {
  E_CAPTCHA: 'Не вдалося перевірити, що ви не робот. Оновіть сторінку та спробуйте ще раз.',
  E_CAPTCHA_REQUIRED: 'Підтвердьте, що ви не робот, щоб надіслати оголошення.',
  E_CAPTCHA_INVALID: 'Не вдалося перевірити, що ви не робот. Спробуйте ще раз.',
  E_CAPTCHA_REUSED: 'Перевірка captcha вже була використана. Підтвердьте її ще раз і надішліть оголошення заново.',
  E_CAPTCHA_MALFORMED: 'Не вдалося перевірити, що ви не робот. Спробуйте ще раз.',
  E_CAPTCHA_ACTION: 'Не вдалося перевірити, що ви не робот. Спробуйте ще раз.',
  E_CAPTCHA_HOSTNAME: 'Не вдалося перевірити, що ви не робот. Спробуйте ще раз.',
  E_CAPTCHA_UNAVAILABLE: 'Не вдалося перевірити, що ви не робот. Спробуйте ще раз.',
  E_CONTENT_TOO_LARGE: 'Фото завеликі, щоб надіслати лист. Приклейте менше фото або спробуйте ще раз.',
  E_TOO_MANY_ATTACHMENTS: 'Забагато фото. Можна приклеїти не більше 4.',
  E_ATTACHMENT_TYPE_INVALID: 'Фото мають некоректний формат. Приклейте фото у форматі JPG або PNG.',
  E_RATE_LIMIT_EXCEEDED: 'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.',
  E_DAILY_LIMIT_EXCEEDED: 'Забагато спроб за короткий час. Зачекайте хвилину і спробуйте ще раз.',
};

export const AP_ERROR_GENERIC = 'Виникла несподівана помилка. Спробуйте ще раз.';

/**
 * The multipart body the worker expects. Pure structure: fields first (the
 * turnstile tokens, kept separate so the page never puts a secret in JSON),
 * then the JSON 'data' walk, then the processed photos in order.
 */
export function buildPayload(data, tokens, photos) {
  const fields = [];
  for (const [name, value] of Object.entries(tokens || {})) {
    fields.push({ name: name || 'cf-turnstile-response', value: value || '' });
  }
  return {
    data: JSON.stringify(data),
    fields,
    images: photos && photos.list ? photos.list : [],
  };
}

/** Builds a real FormData from the payload structure (browser submit). */
export function toFormData(payload) {
  const fd = new FormData();
  for (const entry of payload.fields || []) fd.append(entry.name, entry.value);
  fd.append('data', payload.data);
  for (const file of payload.images || []) fd.append('images', file);
  return fd;
}

// ----------------------------------------------------------- notify payload ---


/**
 * What the worker receives: the controller's data (fields the user touched),
 * overridden by every named control in the DOM - which is how the legacy
 * FormData(form) walk collected the hidden page fields and the honeypot - plus
 * the turnstile token the controller never sees.
 */
export function buildJsonPayload(form, controller, token) {
  const payload = { ...controller.getData() };

  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'submit' || type === 'button') continue;
    if (type === 'radio') {
      if (el.checked) payload[el.name] = el.value;
      continue;
    }
    if (type === 'checkbox') {
      if (el.checked) payload[el.name] = el.value;
      else delete payload[el.name];
      continue;
    }
    payload[el.name] = el.value;
  }

  payload['cf-turnstile-response'] = token || '';
  return payload;
}
