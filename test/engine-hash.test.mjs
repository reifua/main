// EL-1 — the engine snapshot lock.
//
// The form engine in this repo used to be a local copy (EL-1). After PUB-14 the
// runtime is consumed from the npm package (@realtyua/form-engine/runtime), so
// there is no local src/assets/js/form-engine snapshot to lock. In that state the
// manifest-based check is not applicable.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ENGINE_DIR,
  MANIFEST,
  walk,
  digest,
} from '../_form-engine/tools/engine-manifest.mjs';

if (!fs.existsSync(ENGINE_DIR)) {
  test('engine snapshot lock not applicable (package-backed runtime)', () => {
    assert.ok(!fs.existsSync(ENGINE_DIR));
  });
} else {
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
}
