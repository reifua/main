import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildModel } from '../src/assets/js/form-engine/model.js';
import { loadYaml } from '../_form-engine/tools/yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = join(ROOT, '_form-engine', 'tools', 'validate-config.mjs');
const CONFIG = join(ROOT, 'src', '_data', 'add-property.yml');

function runValidator(file, ...extra) {
  return spawnSync(process.execPath, [VALIDATOR, file, ...extra], { encoding: 'utf8' });
}

test('add-property.yml validates against the schema', () => {
  const run = runValidator(CONFIG);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /valid \(schema version 1, id "add-property"\)/);
});

test('add-property.yml has no keys outside the schema', () => {
  // This is the guard for the keys the renderer has to honour: anything listed
  // here would be a config key nothing reads.
  const run = runValidator(CONFIG, '--strict');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.match(/^\s+\? /gm)?.length ?? 0, 0, run.stdout);
});

test('the validator rejects a config that breaks the contract', () => {
  const dir = mkdtempSync(join(tmpdir(), 'form-config-'));
  try {
    const bad = join(dir, 'bad.yml');
    writeFileSync(bad, 'id: x\nversion: 2\nsteps: 4\n');
    const run = runValidator(bad);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /schema error/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real config builds into a usable model', () => {
  const config = loadYaml(CONFIG);
  const model = buildModel(config);

  assert.equal(config.version, 1);
  assert.equal(config.id, 'add-property');
  assert.ok(model.steps.length > 1, 'a multi-step form');
  assert.ok(model.fields.length >= 40, `expected a full form, got ${model.fields.length}`);
  assert.equal(model.byName.size, model.fields.length, 'every field is addressable by name');

  for (const [name, field] of model.byName) {
    assert.ok(field.type, `field "${name}" has no type`);
  }

  for (const [name, info] of model.rowInfo) {
    assert.ok(info.siblings.includes(name), `rowInfo for "${name}" lost it from its own row`);
    for (const sibling of info.siblings) {
      assert.ok(model.byName.has(sibling), `row sibling "${sibling}" is not a real field`);
    }
  }
});

test('every condition points at a field that exists', () => {
  const config = loadYaml(CONFIG);
  const model = buildModel(config);
  const known = (ref) => model.byName.has(String(ref).split('.')[0]);

  const problems = [];

  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;

    // A condition entry: has a target field plus a way to match it.
    if (
      typeof node.field === 'string' &&
      (node.values !== undefined || node.except !== undefined || node.value !== undefined)
    ) {
      if (!known(node.field)) problems.push(`${path}.field -> "${node.field}"`);
    }

    for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key);
  };

  walk(config, '');

  // `validation.compare` targets are matched by operator, not by `values`, so
  // they are collected on their own.
  for (const field of model.fields) {
    for (const rule of field.validation?.compare || []) {
      const targets = Array.isArray(rule.field) ? rule.field : [rule.field];
      for (const target of targets) {
        if (!known(target)) problems.push(`${field.name}.compare -> "${target}"`);
      }
    }
  }

  assert.deepEqual(problems, [], `dangling references:\n${problems.join('\n')}`);
});
