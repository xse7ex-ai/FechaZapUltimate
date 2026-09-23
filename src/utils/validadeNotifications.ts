import { Orcamento } from '../types';

export type StatusVencimento = 'vencido' | 'vence_hoje' | 'urgente' | 'em_dia';

export interface OrcamentoVencimentoInfo {
  orcamento: Orcamento;
  diasRestantes: number;
  statusVencimento: StatusVencimento;
  textoVencimento: string;
  badgeCor: string;
}

/**
 * Calcula a diferença em dias entre a data de validade e hoje (à meia-noite)
 */
export function calcularDiasAteValidade(dataValidade: string): number {
  if (!dataValidade) return 999;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [ano, mes, dia] = dataValidade.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  data.setHours(0, 0, 0, 0);

  const diffMs = data.getTime() - hoje.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Retorna os orçamentos que estão abertos (pendente ou enviado) e com vencimento próximo (<= maxDias)
 */
export function getOrcamentosProximosValidade(
  orcamentos: Orcamento[],
  maxDias: number = 3
): OrcamentoVencimentoInfo[] {
  return orcamentos
    .filter((o) => o.status === 'pendente' || o.status === 'enviado')
    .map((o) => {
      const diasRestantes = calcularDiasAteValidade(o.dataValidade);

      let statusVencimento: StatusVencimento = 'em_dia';
      let textoVencimento = '';
      let badgeCor = 'bg-slate-100 text-slate-700 border-slate-200';

      if (diasRestantes < 0) {
        statusVencimento = 'vencido';
        const abs = Math.abs(diasRestantes);
        textoVencimento = `Vencido há ${abs} ${abs === 1 ? 'dia' : 'dias'}`;
        badgeCor = 'bg-rose-100 text-rose-800 border-rose-300';
      } else if (diasRestantes === 0) {
        statusVencimento = 'vence_hoje';
        textoVencimento = 'Vence hoje!';
        badgeCor = 'bg-red-500 text-white border-red-600 font-extrabold animate-pulse';
      } else if (diasRestantes === 1) {
        statusVencimento = 'urgente';
        textoVencimento = 'Vence amanhã (24h)';
        badgeCor = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      } else if (diasRestantes <= maxDias) {
        statusVencimento = 'urgente';
        textoVencimento = `Vence em ${diasRestantes} dias`;
        badgeCor = 'bg-amber-50 text-amber-800 border-amber-200 font-medium';
      } else {
        textoVencimento = `Vence em ${diasRestantes} dias`;
      }

      return {
        orcamento: o,
        diasRestantes,
        statusVencimento,
        textoVencimento,
        badgeCor,
      };
    })
    .filter((info) => info.diasRestantes <= maxDias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Solicita permissão para notificações nativas do navegador
 */
export async function solicitarPermissaoNotificacao(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Dispara uma notificação nativa do sistema operacional/navegador
 */
export function dispararNotificacaoNativa(titulo: string, corpo: string, onClick?: () => void) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(titulo, {
      body: corpo,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'fechazap-validade',
    });

    if (onClick) {
      notif.onclick = () => {
        window.focus();
        onClick();
        notif.close();
      };
    }
  } catch (err) {
    console.warn('Erro ao disparar notificação nativa:', err);
  }
}
