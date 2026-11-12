import test from 'node:test';
import assert from 'node:assert/strict';

import { attr, classes, escapeHtml, inlineMarkdown, link, safeHref } from '../src/assets/js/form-engine/html.js';

const XSS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "'; alert(1); //",
  'javascript:alert(1)',
  '<svg/onload=alert(1)>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
];

test('escapeHtml neutralises every active character', () => {
  for (const payload of XSS) {
    const out = escapeHtml(payload);
    assert.ok(!/<[a-z]/i.test(out), `tags survived in ${JSON.stringify(payload)}`);
    assert.ok(!out.includes('"'), `quote survived in ${JSON.stringify(payload)}`);
    assert.equal(out, escapeHtml(payload), 'deterministic');
  }

  assert.equal(escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0', 'falsy-but-real values are kept');
});

test('attr escapes values intended for attribute positions', () => {
  for (const payload of XSS) {
    assert.equal(attr(payload), escapeHtml(payload));

    const html = `<div title="${attr(payload)}"></div>`;
    // The payload text may still contain the word `onerror` - harmless, it is
    // just text now. What must not happen is a new tag or a closed attribute,
    // so the counts must stay at the two of `<div ...>` itself.
    assert.equal(html.match(/</g).length, 2, `opened a tag: ${html}`);
    assert.equal(html.match(/"/g).length, 2, `broke out of the attribute: ${html}`);
  }
});

test('safeHref refuses active schemes and keeps normal ones', () => {
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('JavaScript:alert(1)'), '#');
  assert.equal(safeHref('data:text/html,<script>x</script>'), '#');
  assert.equal(safeHref('vbscript:msgbox'), '#');

  assert.equal(safeHref('/terms-and-conditions.html'), '/terms-and-conditions.html');
  assert.equal(safeHref('https://example.test/x'), 'https://example.test/x');
  assert.equal(safeHref('mailto:a@b.test'), 'mailto:a@b.test');
  assert.equal(safeHref('#section'), '#section');
  assert.equal(safeHref(''), '#');
  assert.equal(safeHref(null), '#');
});

test('link escapes the text and guards the href together', () => {
  assert.equal(link('terms', '/terms.html'), '<a href="/terms.html">terms</a>');
  assert.equal(link('<b>x</b>', '/y'), '<a href="/y">&lt;b&gt;x&lt;/b&gt;</a>');
  assert.equal(link('x', 'javascript:alert(1)'), '<a href="#">x</a>');
  assert.equal(link('x', ''), 'x', 'no URL means plain text');
});

test('inlineMarkdown renders config HTML, matching Liquid', () => {
  // Liquid emits `{{ l.text }}` with no escape filter and 55 strings in
  // add-property.yml rely on that. Matching it is what makes Phase 5 a diff of
  // zero rather than a wall of &lt;b&gt;.
  assert.equal(inlineMarkdown('<b>правила</b>'), '<b>правила</b>');
  assert.equal(
    inlineMarkdown('читайте [правила](/terms-and-conditions.html)'),
    'читайте <a href="/terms-and-conditions.html">правила</a>',
    'the one label in add-property.yml renders as a link',
  );

  assert.equal(inlineMarkdown('**bold**'), '<strong>bold</strong>');
  assert.equal(inlineMarkdown('`code`'), '<code>code</code>');
  assert.equal(inlineMarkdown('some *em* here'), 'some <em>em</em> here');
  assert.equal(inlineMarkdown('1 * 2 * 3'), '1 * 2 * 3', 'arithmetic is left alone');
});

test('inlineMarkdown still refuses an active href', () => {
  // Text is trusted; the URL target is checked anyway because it is one line
  // and a scheme typo in a config should not ship a live payload.
  for (const payload of XSS.filter((p) => /^[a-z]+:/i.test(p))) {
    const out = inlineMarkdown(`[click](${payload})`);
    assert.ok(!/href="(?!#)[a-z]+:/i.test(out), `active href survived: ${out}`);
  }

  assert.equal(inlineMarkdown('[x](/ok)'), '<a href="/ok">x</a>');
});

test('classes drops empties and flattens arguments', () => {
  assert.equal(classes('a', null, '', undefined, 'b'), 'a b');
  assert.equal(classes(['a', ['b', 'c']], 'd'), 'a b c d');
  assert.equal(classes(), '');
});
