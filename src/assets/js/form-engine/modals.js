// Addon (prepend/append button) modals.
//
// A modal is declared on the button that opens it and is rendered next to the
// form, outside it - the button only carries `data-target="#<id>"`. So the id
// rule lives here once: the theme that paints the button, the theme that paints
// the dialog and the page shell that collects the dialogs must all agree, or a
// click opens nothing.

/** `modal_<field>_<side>` unless the config names the modal itself. */
export function modalIdFor(field, side) {
  const modal = field[side] && field[side].button && field[side].button.modal;
  return (modal && modal.id) || `modal_${field.name}_${side}`;
}

/** Walks the rows the renderer walks, so no field the form shows is missed. */
function walkRows(rows, visit) {
  for (const row of rows || []) {
    for (const field of row.fields || []) visit(field);
    for (const col of row.cols || []) walkRows(col.rows, visit);
  }
}

/**
 * Every modal the config defines, in render order, deduplicated by id.
 *
 * Two fields may point at the same dialog (config `modal.id` shared); the
 * second declaration is dropped so the page carries one element per id.
 *
 * @param {object} config parsed form config
 * @returns {Array<{id: string, modal: object}>}
 */
export function collectModals(config) {
  const seen = new Set();
  const out = [];
  for (const step of (config && config.steps) || []) {
    walkRows(step.rows, (field) => {
      for (const side of ['prepend', 'append']) {
        const value = field[side];
        const modal = value && value.button && value.button.modal;
        if (!modal) continue;
        const id = modalIdFor(field, side);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, modal });
      }
    });
  }
  return out;
}

/**
 * Wires the theme's own modal shells when Bootstrap is not driving them.
 *
 * A Bootstrap theme ships real `.modal` dialogs and lets Bootstrap's data-api
 * open them. The Tailwind theme ships a plain overlay that is toggled with the
 * `hidden` utility instead, and no Bootstrap is loaded on such a site, so a
 * click on `data-toggle="modal"` would otherwise do nothing. This binds the
 * same data attributes for dialogs that are NOT Bootstrap modals and dispatches
 * the `show/shown/hidden.bs.modal` events the modal-form glue listens for, so
 * one theme file keeps working under both stacks. Bootstrap dialogs (they carry
 * the `modal` class) are left untouched for Bootstrap itself to handle.
 *
 * @param {Document|Element} root element the delegated listener is attached to
 */
export function bindModals(root = document) {
  if (!root || typeof root.addEventListener !== 'function') return;

  const isBootstrapModal = (el) => el.classList.contains('modal');
  const fire = (el, type) => el.dispatchEvent(new CustomEvent(type, { bubbles: true }));
  const show = (el) => {
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    fire(el, 'show.bs.modal');
    fire(el, 'shown.bs.modal');
  };
  const hide = (el) => {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    fire(el, 'hidden.bs.modal');
  };
  const dialogOf = (node) => node.closest && node.closest('[role="dialog"]');

  root.addEventListener('click', (event) => {
    const source = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!source) return;

    const opener = source.closest('[data-toggle="modal"]');
    if (opener) {
      const id = (opener.getAttribute('data-target') || '').replace(/^#/, '');
      const target = id ? document.getElementById(id) : null;
      if (target && !isBootstrapModal(target)) {
        event.preventDefault();
        show(target);
      }
      return;
    }

    const dismiss = source.closest('[data-dismiss="modal"]');
    if (dismiss) {
      const dialog = dialogOf(dismiss);
      if (dialog && !isBootstrapModal(dialog)) {
        event.preventDefault();
        hide(dialog);
      }
    }
  });
}
