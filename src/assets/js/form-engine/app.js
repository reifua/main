// Single runtime entry for the form engine.
//
// Discovers every config island on the page and boots it: a page form runs the
// wizard wiring, a modal form (behavior.mode: 'modal' in the config) runs the
// modal wiring. This is the one entry the page loads - there are no per-form
// files, and both contexts share the same controller, binder and submit code.

import { bootPage } from './page-form.js';
import { bootModal } from './modal-form.js';
import { bindModals } from './modals.js';

export function boot(root = document, opts = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  bindModals(root);
  const nodes = root.querySelectorAll('script[type="application/json"][id$="-config"]');
  const handles = [];
  const seen = new Set();
  for (const node of nodes) {
    const name = node.id.slice(0, -'-config'.length);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    let config;
    try {
      config = JSON.parse(node.textContent);
    } catch {
      continue;
    }
    const mode = (config.behavior && config.behavior.mode) || 'page';
    const handle = mode === 'modal'
      ? bootModal(root, { ...opts, name })
      : bootPage(root, { ...opts, name });
    if (handle) handles.push(handle);
  }
  return handles;
}

export default boot;

// The entry self-boots: the page loads this one module (a <script type=module>)
// and every config island it ships is mounted and wired. A page without islands
// is a no-op.
if (typeof document !== 'undefined') {
  const start = () => boot(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
