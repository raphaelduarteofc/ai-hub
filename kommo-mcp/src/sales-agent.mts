export type Operation = 'varejo' | 'atacado' | 'servicos' | 'desconhecida';
type Field = 'operation' | 'environment' | 'city' | 'area' | 'timing';
export type SalesAgentState = {
  version: 1; operation?: Operation; environment?: string; city?: string;
  area?: string; timing?: string; awaiting?: Field; turns: number; finished?: boolean;
};
export type SalesAgentInput = { message: string; operation?: Operation; state?: SalesAgentState };
export type SalesAgentDecision = { mode: 'discover' | 'handoff'; message: string; reason: string; state: SalesAgentState };
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
const HANDOFF_TERMS = /\b(preco|valor|desconto|promocao|estoque|pagamento|pix|cartao|boleto|pedido|visita|medicao|frete|garantia|contrapiso|umidade)\b/;
const questions: Record<Field, string> = {
  operation: 'Você procura piso para sua casa, compra em volume para uma empresa ou instalação/serviço?',
  environment: 'Qual ambiente você pretende atender, por exemplo sala, quarto ou escritório?',
  city: 'Em qual cidade fica o imóvel?',
  area: 'Qual é a área aproximada em m²? Se ainda não souber, pode dizer “não sei”.',
  timing: 'Para quando você pretende realizar esse projeto?',
};

/** Deterministic supervised triage, not the future LLM salesperson. */
export function decideSalesAgent(input: SalesAgentInput): SalesAgentDecision {
  const message = input.message.trim().slice(0, 2000);
  const text = normalize(message);
  const state: SalesAgentState = message ? { ...(input.state ?? { version: 1, turns: 0 }) } : { version: 1, turns: 0 };
  state.turns += 1;
  if (input.operation && input.operation !== 'desconhecida') state.operation = input.operation;
  const result = (mode: SalesAgentDecision['mode'], reply: string, reason: string): SalesAgentDecision => ({ mode, message: reply, reason, state });
  if (/\b(parar|cancelar|humano|atendente|vendedor)\b/.test(text)) {
    state.finished = true;
    return result('handoff', 'Certo, encerro a triagem automática. Sua mensagem permanece nesta conversa para atendimento pela equipe; nenhum agendamento ou pedido foi confirmado.', 'user_requested_human_or_stop');
  }
  if (HANDOFF_TERMS.test(text)) {
    state.finished = true;
    return result('handoff', 'Essa informação precisa ser confirmada pela equipe. Neste teste não confirmo preços, estoque, pagamento nem visita. Sua solicitação permanece registrada nesta conversa.', 'commercial_fact_or_operation_required');
  }
  if (state.finished || state.turns > 12) {
    state.finished = true;
    return result('handoff', 'A triagem foi encerrada. As informações permanecem nesta conversa para revisão da equipe.', 'session_finished');
  }
  if (/\b(casa|apartamento|consumo proprio|varejo|cpf)\b/.test(text)) state.operation = 'varejo';
  else if (/\b(volume|atacado|revenda|cnpj|empresa)\b/.test(text)) state.operation = 'atacado';
  else if (/\b(instalacao|instalar|servico)\b/.test(text)) state.operation = 'servicos';
  if (message && state.awaiting && state.awaiting !== 'operation') {
    if (state.awaiting === 'area') {
      const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:m2|m²|metros)?/);
      if (/nao sei|nao tenho|ainda nao|medir/.test(text)) state.area = 'Ainda não informada; precisa de medição';
      else if (match && Number(match[1].replace(',', '.')) > 0) state.area = `${match[1]} m² (informado pelo cliente)`;
      else return result('discover', questions.area, 'area_not_understood');
    } else state[state.awaiting] = message.slice(0, 200);
  }
  const field: Field | undefined = !state.operation || state.operation === 'desconhecida' ? 'operation'
    : !state.environment ? 'environment' : !state.city ? 'city' : !state.area ? 'area' : !state.timing ? 'timing' : undefined;
  if (field) {
    state.awaiting = field;
    return result('discover', !message ? `Olá! Sou o assistente de triagem em teste da ELEAR. ${questions[field]}` : questions[field], field === 'operation' ? 'operation_not_identified' : 'discovery_incomplete');
  }
  state.finished = true;
  delete state.awaiting;
  return result('handoff', `Obrigado! Resumo do que você informou: operação ${state.operation}; ambiente ${state.environment}; cidade ${state.city}; área ${state.area}; previsão ${state.timing}. A triagem está concluída para revisão da equipe. Isso não confirma orçamento, visita, pagamento ou pedido.`, 'discovery_complete');
}
