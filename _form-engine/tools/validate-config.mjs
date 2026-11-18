#!/usr/bin/env node
// Validates a form config against _form-engine/schema/form-config.schema.json.
//
//   node _form-engine/tools/validate-config.mjs _data/add-property.yml
//   node _form-engine/tools/validate-config.mjs _data/add-property.yml --strict
//   node _form-engine/tools/validate-config.mjs assets/data/form-config.json
//
// No npm dependencies on purpose: the same check has to run in CI, in an editor
// task and inside the browser runtime without a package install. YAML is read
// through Ruby (psych), which Jekyll already requires.
//
// --strict additionally reports field keys that are not in the schema. The
// schema keeps `field` open on purpose, so that is where typos hide.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, resolve } from 'node:path';
import { loadYaml } from './yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = join(ROOT, '_form-engine', 'schema', 'form-config.schema.json');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: node _form-engine/tools/validate-config.mjs <config.yml|config.json> [--strict]');
  process.exit(2);
}

// ---------------------------------------------------------------- loading

function loadConfig(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.yml' || ext === '.yaml') return loadYaml(file);
  if (ext === '.json') return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  throw new Error(`unsupported extension "${ext}" - pass a .yml or .json file`);
}

// ------------------------------------------------------- draft-07 subset

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`only local $ref is supported, got "${ref}"`);
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => node[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

function matches(value, schema, root) {
  const errors = [];
  check(value, schema, root, '', errors);
  return errors;
}

function check(value, schema, root, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path || '<root>'}: no value is allowed here`);
    return;
  }
  if (schema.$ref) {
    check(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => typeMatches(value, t))) {
      errors.push(`${path || '<root>'}: expected ${allowed.join('|')}, got ${typeOf(value)}`);
      return;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path || '<root>'}: must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path || '<root>'}: must be one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`);
  }

  if (schema.anyOf && !schema.anyOf.some((sub) => matches(value, sub, root).length === 0)) {
    errors.push(`${path || '<root>'}: does not match any accepted shape`);
  }

  if (typeOf(value) === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
  }

  if (typeOf(value) === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path || '<root>'}: needs at least ${schema.minItems} item(s), got ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, i) => check(item, schema.items, root, `${path || '<root>'}[${i}]`, errors));
    }
  }

  if (typeOf(value) === 'object') {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path || '<root>'}: missing required key "${key}"`);
      }
    }
    const props = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (props[key] !== undefined) {
        check(child, props[key], root, path ? `${path}.${key}` : key, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path || '<root>'}: unknown key "${key}"`);
      } else if (typeof schema.additionalProperties === 'object') {
        check(child, schema.additionalProperties, root, path ? `${path}.${key}` : key, errors);
      }
    }
  }
}

// Collects keys that exist in the data but not in the schema, for the places
// where the schema deliberately stays open.
function collectUnknown(value, schema, root, path, out) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) return collectUnknown(value, resolveRef(schema.$ref, root), root, path, out);
  if (schema.anyOf) {
    // `anyOf` next to `properties` is a constraint on this shape ("cols or
    // fields"), not an alternative shape. Only treat it as a shape choice when
    // the schema declares no properties of its own.
    if (schema.properties) return;
    const matched = schema.anyOf.filter((sub) => matches(value, sub, root).length === 0);
    if (matched.length === 1) return collectUnknown(value, matched[0], root, path, out);
    if (matched.length === 0) return;
    const props = {};
    for (const sub of matched) Object.assign(props, sub.properties || {});
    return collectUnknown(value, { properties: props, additionalProperties: true }, root, path, out);
  }
  if (typeOf(value) !== 'object' && typeOf(value) !== 'array') return;
  if (typeOf(value) === 'array') {
    if (schema.items) {
      value.forEach((item, i) => collectUnknown(item, schema.items, root, `${path || '<root>'}[${i}]`, out));
    }
    return;
  }
  const props = schema.properties || {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (props[key] !== undefined) {
      collectUnknown(child, props[key], root, childPath, out);
    } else if (schema.additionalProperties !== false) {
      out.push(childPath);
      if (typeof schema.additionalProperties === 'object') {
        collectUnknown(child, schema.additionalProperties, root, childPath, out);
      }
    }
  }
}

// ---------------------------------------------------------------- running

const file = resolve(process.cwd(), target);
if (!existsSync(file)) {
  console.error(`not found: ${file}`);
  process.exit(2);
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const config = loadConfig(file);

const errors = matches(config, schema, schema);
if (errors.length > 0) {
  console.error(`${target}: ${errors.length} schema error(s)`);
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}

let warnings = 0;
if (strict) {
  const unknown = [];
  collectUnknown(config, schema, schema, '', unknown);
  if (unknown.length > 0) {
    warnings = unknown.length;
    console.log(`${target}: valid, ${unknown.length} key(s) outside the schema`);
    for (const key of unknown) console.log(`  ? ${key}`);
  }
}

console.log(`${target}: valid (schema version ${config.version}, id "${config.id}")`);
if (warnings > 0) {
  console.log(`NOTE: ${warnings} unknown key(s) - accepted, but no renderer honours them yet.`);
}