// Shared YAML -> JS loader (Eleventy twin).
//
// The Jekyll site reads YAML through Ruby's psych (Jekyll already ships Ruby);
// this side already depends on js-yaml, so the loader stays pure Node here.
// Same export and same contract, so the shared tests run on both.

import { readFileSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';

export function loadYaml(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return parseYaml(text);
}
