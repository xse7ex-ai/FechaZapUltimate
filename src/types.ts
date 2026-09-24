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
  modeloIA: string;
}

export type TipoPlano = 'GRATUITO' | 'PRO' | 'TURBO';

export interface UserProfile {
  id: string;
  email: string;
  nome?: string;
  plano: TipoPlano;
  empresaNome?: string;
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

export type ActiveTab = 'dashboard' | 'orcamentos' | 'clientes' | 'relatorios' | 'ia';
