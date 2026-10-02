export interface ItemOrcamento {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
}

export type StatusOrcamento = 'pendente' | 'enviado' | 'aprovado' | 'recusado';

export interface Orcamento {
  id: string;
  numero: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  itens: ItemOrcamento[];
  subtotal: number;
  descontoTipo: 'porcentagem' | 'valor';
  descontoValor: number;
  valorTotal: number;
  status: StatusOrcamento;
  dataCriacao: string;
  dataValidade: string;
  formaPagamento: string;
  prazoEntrega: string;
  observacoes?: string;
  termosGarantia?: string;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  documento?: string; // CPF ou CNPJ
  endereco?: string;
  cidade?: string;
  observacoes?: string;
  dataCadastro: string;
  totalOrcamentos?: number;
  valorTotalGasto?: number;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
  whatsappOptOutAt?: string;
  lastInboundAt?: string;
}

export interface ConfiguracaoEmpresa {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  telefone: string;
  email: string;
  chavePix: string;
  tipoChavePix: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
  endereco: string;
  cidadeEstado: string;
  logoUrl?: string;
  mensagemPadraoWhatsapp: string;
  modeloIA?: string;
}

export type TipoPlano = 'GRATUITO' | 'PRO' | 'TURBO';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'grace_period';

export interface SubscriptionInfo {
  id?: string;
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plano: TipoPlano;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEnd?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
  gracePeriodEnd?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  nome?: string;
  plano: TipoPlano;
  empresaNome?: string;
  subscription?: SubscriptionInfo;
}

export interface UserQuota {
  plano: TipoPlano;
  used: number;
  limit: number;
  allowed: boolean;
  month?: string;
}

export interface GatilhoIA {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  exemplo: string;
}

export interface MensagemWhatsApp {
  id: string;
  userId: string;
  phoneNumberId?: string;
  clienteId?: string;
  clienteTelefone: string;
  clienteNome?: string;
  corpo: string;
  direcao?: 'inbound' | 'outbound';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  lida: boolean;
  waMessageId?: string;
  orcamentoId?: string;
  timestamp?: string;
  createdAt: string;
}

export interface WhatsAppConnection {
  id: string;
  userId: string;
  wabaId?: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  status: 'active' | 'inactive' | 'revoked';
  createdAt?: string;
  updatedAt?: string;
}

export type ActiveTab = 'dashboard' | 'orcamentos' | 'clientes' | 'relatorios' | 'ia' | 'mensagens';

export interface DbOrcamentoRow {
  id: string;
  user_id: string;
  numero: string;
  cliente_id?: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  itens: ItemOrcamento[];
  subtotal: number | string;
  desconto_tipo: 'porcentagem' | 'valor';
  desconto_valor: number | string;
  valor_total: number | string;
  status: StatusOrcamento;
  data_validade?: string | null;
  forma_pagamento?: string | null;
  prazo_entrega?: string | null;
  observacoes?: string | null;
  termos_garantia?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbClienteRow {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  email?: string | null;
  documento?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  whatsapp_opt_in?: boolean;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_source?: string | null;
  whatsapp_opt_out_at?: string | null;
  last_inbound_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbMensagemWhatsAppRow {
  id: string;
  user_id: string;
  phone_number_id?: string | null;
  cliente_id?: string | null;
  cliente_telefone: string;
  cliente_nome?: string | null;
  corpo: string;
  direcao?: 'inbound' | 'outbound';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  lida: boolean;
  wa_message_id?: string | null;
  orcamento_id?: string | null;
  timestamp?: string;
  created_at: string;
}
