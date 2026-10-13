export type SalesAgentInput = {
  message: string;
  operation?: 'varejo' | 'atacado' | 'servicos' | 'desconhecida';
};

export type SalesAgentDecision = {
  mode: 'discover' | 'handoff';
  message: string;
  reason: string;
};

const HANDOFF_TERMS = /\b(preço|preco|valor|desconto|promoção|promocao|estoque|pagamento|pix|cartão|cartao|boleto|comprar|pedido|instalação|instalacao|visita|medição|medicao|prazo)\b/i;

/**
 * Safe first-pass policy. It does not invent commercial facts and does not
 * execute CRM or financial actions. Operational tools are intentionally kept
 * outside this module until approved sources are connected.
 */
export function decideSalesAgent(input: SalesAgentInput): SalesAgentDecision {
  const message = input.message.trim();
  if (!message) {
    return {
      mode: 'discover',
      message: 'Olá! Como posso ajudar com seu projeto?',
      reason: 'empty_message',
    };
  }

  if (HANDOFF_TERMS.test(message)) {
    return {
      mode: 'handoff',
      message: 'Vou encaminhar sua solicitação para a equipe confirmar as informações corretas antes de responder.',
      reason: 'commercial_fact_or_operation_required',
    };
  }

  if (input.operation === 'desconhecida' || !input.operation) {
    return {
      mode: 'discover',
      message: 'Para orientar corretamente, você está falando sobre compra para sua casa, compra em volume ou instalação/serviço?',
      reason: 'operation_not_identified',
    };
  }

  return {
    mode: 'discover',
    message: 'Entendi. Para conhecer melhor sua necessidade, qual ambiente será atendido e qual é a cidade do imóvel?',
    reason: 'discovery_incomplete',
  };
}
