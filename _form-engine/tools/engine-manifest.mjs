// Writes test/engine-manifest.json: the normalised SHA-256 of every file in the
// form engine (src/assets/js/form-engine/**).
//
// The manifest is the lock on the synced snapshot. The engine itself is the
// same code as the Jekyll site (realtyua assets/js/form-engine/**); EL-1 copied
// it here, and test/engine-hash.test.mjs fails when a file changes without this
// manifest following it. Regenerate deliberately:
//
//   npm run engine:manifest
//
// Line endings are normalised (CRLF -> LF) before hashing: the two checkouts
// carry different EOLs (see the Jekyll side's JEK-R8), and that is not a change
// to the engine.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const ENGINE_DIR = path.join(REPO, 'src', 'assets', 'js', 'form-engine');
export const MANIFEST = path.join(REPO, 'test', 'engine-manifest.json');

export function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Relative, forward-slashed paths so the manifest is the same on every OS.
export function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function digest(rel) {
  const text = normalize(fs.readFileSync(path.join(ENGINE_DIR, ...rel.split('/')), 'utf8'));
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function collect() {
  const files = {};
  for (const rel of walk(ENGINE_DIR)) files[rel] = digest(rel);
  return files;
}

export function build() {
  return {
    engine: 'src/assets/js/form-engine',
    normalization: 'crlf-to-lf',
    algorithm: 'sha256',
    files: collect(),
  };
}

// Run as a script: write the manifest. Imported by the test: no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = build();
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`engine-manifest: wrote ${Object.keys(manifest.files).length} file(s) to test/engine-manifest.json`);
}
