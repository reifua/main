import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyFreshness, formatResults } from '../_form-engine/tools/verify-render.mjs';

test('all baked fragments in dist/ are fresh', async () => {
  const results = await verifyFreshness();
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.log(formatResults(results));
    assert.fail(`${failures.length} fragment(s) are stale - run npm run build`);
  }
});