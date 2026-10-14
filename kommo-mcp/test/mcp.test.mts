import test from 'node:test';
import assert from 'node:assert/strict';
import { tools } from '../src/mcp.mts';

test('exposes only read tools', () => {
  assert.ok(tools.length > 0);
  assert.equal(tools.some((tool) => tool.name.endsWith('_create')), false);
  assert.equal(tools.some((tool) => /delete/i.test(tool.name)), false);
});

test('schemas reject undeclared fields', () => {
  for (const tool of tools) assert.equal(tool.inputSchema.additionalProperties, false);
});
