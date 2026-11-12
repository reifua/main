// HTML helpers.
//
// Trust model. A form config is authored in this repository, so it sits at the
// same trust level as the Liquid templates it replaces: 55 labels and helpers
// contain `<b>`, `<sup>` and friends, and Liquid emits them through `{{ }}`
// with no escape filter. The new renderer does the same, otherwise every one of
// those strings would change on migration.
//
//   escapeHtml()  untrusted data - field values, anything echoed back to the user
//   raw()         trusted config text - labels, helpers, placeholders
//
// The real XSS surface is therefore not the config, it is a value the user
// typed being reflected back into the document. Those must always go through
// escapeHtml(), and attr() is the default for anything inside an attribute.
//
// inlineMarkdown() adds markup around text it does not rewrite, so it never
// creates a window where an element appears before the text is settled.

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const PATTERN = /[&<>"']/g;

/** Neutralises a value that will be placed in the document as text or an attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(PATTERN, (c) => ESCAPES[c]);
}

/** Escaped attribute value without the surrounding quotes. */
export function attr(value) {
  return escapeHtml(value);
}

/** Trusted config text, passed through untouched. */
export function raw(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

// Only these schemes can be reached by clicking a label. `javascript:`,
// `data:` and friends are dropped. Checked even on trusted text, because a
// bad URL costs one line to reject and can cost a page to accept.
const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#|\?)/i;
const UNSAFE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function safeHref(href) {
  const value = String(href ?? '').trim();
  if (value === '') return '#';
  if (UNSAFE_SCHEME.test(value) && !SAFE_SCHEME.test(value)) return '#';
  return value;
}

/**
 * Anchor for trusted text with a scheme-checked href.
 * Link text is escaped anyway: no config in the repo relies on markup inside
 * link text, and leaving it open would only be useful to an attacker.
 */
export function link(text, href) {
  const body = escapeHtml(text);
  if (!href) return body;
  return `<a href="${escapeHtml(safeHref(href))}">${body}</a>`;
}

/**
 * Markdown subset that form labels actually use: links, bold, code and
 * emphasis. Text is trusted config, so it is not re-escaped; hrefs are.
 *
 * Supports: [text](url)  **bold**  *italic*  `code`
 */
export function inlineMarkdown(text) {
  let out = raw(text);

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => link(label, href));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');

  return out;
}

/** Combines class names, skipping null/empty so callers can be terse. */
export function classes(...values) {
  const out = [];
  for (const value of values.flat(Infinity)) {
    if (value === null || value === undefined || value === '') continue;
    out.push(String(value).trim());
  }
  return out.join(' ');
}
