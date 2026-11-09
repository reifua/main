// EL-1 — the engine snapshot lock.
//
// The form engine in this repo is a copy of the Jekyll site's engine
// (realtyua assets/js/form-engine/**), not a fork. test/engine-manifest.json
// records the normalised SHA-256 of every engine file; this test fails when the
// engine drifts from that snapshot, so a change cannot land silently.
//
// When a sync is intended, regenerate the manifest in the same commit:
//
//   npm run engine:manifest
//
// (Line endings are normalised first: CRLF vs LF is checkout noise, not an
// engine change - the Jekyll side learned that in JEK-R8.)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ENGINE_DIR,
  MANIFEST,
  normalize,
  walk,
  digest,
} from '../_form-engine/tools/engine-manifest.mjs';

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const actual = walk(ENGINE_DIR).sort((a, b) => a.localeCompare(b));
const recorded = Object.keys(manifest.files).sort((a, b) => a.localeCompare(b));

test('the manifest covers the whole engine, no more and no less', () => {
  assert.deepEqual(
    actual,
    recorded,
    'engine files and manifest keys differ - run `npm run engine:manifest` after a deliberate sync',
  );
});

test('every engine file matches its recorded hash', () => {
  const drifted = actual.filter((rel) => digest(rel) !== manifest.files[rel]);
  assert.deepEqual(
    drifted,
    [],
    `engine file(s) changed without the manifest: ${drifted.join(', ')} - run \`npm run engine:manifest\` if the change is intended`,
  );
});

test('the manifest declares how it was produced', () => {
  assert.equal(manifest.algorithm, 'sha256');
  assert.equal(manifest.normalization, 'crlf-to-lf');
  assert.equal(manifest.engine, 'src/assets/js/form-engine');
  assert.ok(Object.keys(manifest.files).length > 0);
});
