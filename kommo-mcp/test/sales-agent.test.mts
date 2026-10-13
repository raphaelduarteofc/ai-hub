import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSalesAgent } from '../src/sales-agent.mts';

test('does not invent a price and routes commercial questions to handoff', () => {
  const result = decideSalesAgent({ message: 'Qual o preço do piso?' });
  assert.equal(result.mode, 'handoff');
  assert.equal(result.reason, 'commercial_fact_or_operation_required');
});

test('asks for operation before operational guidance', () => {
  const result = decideSalesAgent({ message: 'Quero reformar minha sala' });
  assert.equal(result.mode, 'discover');
  assert.match(result.message, /casa|volume|instalação/);
});

test('continues basic discovery after operation is known', () => {
  const result = decideSalesAgent({ message: 'Quero reformar minha sala', operation: 'varejo' });
  assert.equal(result.mode, 'discover');
  assert.match(result.message, /ambiente|cidade/);
});
