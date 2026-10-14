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
  assert.match(result.message, /ambiente/);
});

test('completes a multi-turn discovery without forgetting prior answers', () => {
  let result = decideSalesAgent({ message: '' });
  for (const message of ['Para minha casa', 'Sala', 'Rio de Janeiro', '30 m²', 'No próximo mês']) {
    result = decideSalesAgent({ message, state: result.state });
  }
  assert.equal(result.mode, 'handoff');
  assert.equal(result.reason, 'discovery_complete');
  assert.match(result.message, /varejo.*Sala.*Rio de Janeiro.*30 m².*próximo mês/);
  assert.match(result.message, /não confirma orçamento/);
});

test('unknown area is not invented and invalid area does not advance', () => {
  const state = { version: 1 as const, turns: 3, operation: 'varejo' as const, environment: 'Sala', city: 'Rio', awaiting: 'area' as const };
  assert.equal(decideSalesAgent({ message: 'talvez', state }).reason, 'area_not_understood');
  const result = decideSalesAgent({ message: 'não sei', state });
  assert.equal(result.state.awaiting, 'timing');
  assert.match(result.state.area!, /não informada/);
});

test('manual restart clears previous context and stop never promises a booking', () => {
  const stopped = decideSalesAgent({ message: 'quero um atendente' });
  assert.equal(stopped.mode, 'handoff');
  assert.equal(stopped.state.finished, true);
  const restarted = decideSalesAgent({ message: '', state: stopped.state });
  assert.equal(restarted.state.finished, undefined);
  assert.equal(restarted.state.awaiting, 'operation');
});
