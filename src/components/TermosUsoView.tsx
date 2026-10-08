import React from 'react';
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, ShieldCheck, Mail, Scale } from 'lucide-react';

interface TermosUsoViewProps {
  onVoltar: () => void;
  onOpenPrivacidade?: () => void;
}

export const TermosUsoView: React.FC<TermosUsoViewProps> = ({
  onVoltar,
  onOpenPrivacidade,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Bar Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={onVoltar}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Voltar ao CRM</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Termos de Uso Oficiais</span>
            </span>
            {onOpenPrivacidade && (
              <button
                onClick={onOpenPrivacidade}
                className="text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 underline ml-2 cursor-pointer"
              >
                Ver Política de Privacidade
              </button>
            )}
          </div>
        </div>

        {/* Header Hero Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black text-xl shadow-md shadow-emerald-500/20">
              ⚡
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Termos de Uso
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                CLOSI • Regras de Uso da Plataforma e Políticas Comerciais
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 pt-1">
            Última atualização: Outubro de 2026 • Em conformidade com as Políticas de Mensagens Comerciais da Meta.
          </div>
        </div>

        {/* Terms Content */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              1. Aceitação dos Termos
            </h2>
            <p>
              Ao criar uma conta, acessar ou utilizar o <strong>CLOSI</strong>, você declara estar de acordo com estes Termos de Uso e com a nossa Política de Privacidade. Caso não concorde com qualquer disposição aqui estabelecida, solicitamos que não utilize a plataforma.
            </p>
          </section>

          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              2. Objeto e Descrição dos Serviços
            </h2>
            <p>
              O CLOSI é uma plataforma de produtividade e CRM destinada a autônomos e empresas para a criação, organização e gestão de orçamentos e comunicação de suporte com clientes via WhatsApp. Os planos disponíveis (GRATUITO, PRO e TURBO) possuem recursos e cotas específicos descritos na plataforma.
            </p>
          </section>

          <section className="space-y-2.5 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60">
            <h2 className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              3. Regras de Uso e Conformidade com a Meta (WhatsApp Cloud API)
            </h2>
            <p className="text-xs sm:text-sm text-amber-950 dark:text-amber-200">
              O usuário do CLOSI compromete-se a utilizar a plataforma estritamente dentro das diretrizes e políticas da Meta Platforms, Inc. e da legislação vigente:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <li>
                <strong>Consentimento Obrigatório:</strong> O usuário é o único e exclusivo responsável por coletar e comprovar o consentimento prévio (opt-in) do cliente antes de enviar qualquer mensagem comercial pelo WhatsApp.
              </li>
              <li>
                <strong>Vedação Expressa de Spam e Mensagens em Massa:</strong> É terminantemente proibido utilizar o CLOSI para envio de spam, correntes, comunicações não solicitadas, mensagens automatizadas em massa ou abordagem de listas frias.
              </li>
              <li>
                <strong>Respeito ao Opt-Out:</strong> Caso o cliente final solicite a interrupção das comunicações (ex: respondendo PARAR ou SAIR), o usuário deve cessar imediatamente o envio de qualquer mensagem subsequente.
              </li>
              <li>
                <strong>Suspensão por Violação:</strong> O descumprimento das regras da Meta ou o envio abusivo de mensagens ensejará o cancelamento imediato da conta, sem prejuízo das medidas cabíveis.
              </li>
            </ul>
          </section>

          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              4. Responsabilidade pelos Dados Cadastrados
            </h2>
            <p>
              Os dados de clientes inseridos na plataforma (nome, telefone e escopo de propostas) são de responsabilidade do profissional contratante. O CLOSI atua exclusivamente como operador das ferramentas de gestão e envio, cabendo ao usuário zelar pela veracidade e pela base legal da coleta desses dados conforme a LGPD.
            </p>
          </section>

          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              5. Planos, Assinaturas e Cancelamento
            </h2>
            <p>
              Os planos PRO e TURBO são processados com segurança por meio da Stripe. O usuário pode cancelar a renovação da sua assinatura a qualquer momento através do portal do cliente no aplicativo, mantendo o acesso até o fim do período vigente já faturado.
            </p>
          </section>

          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              6. Contato e Suporte
            </h2>
            <p>
              Para esclarecimentos ou dúvidas sobre estes Termos de Uso, entre em contato com nossa equipe:
            </p>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold">fechazap.suporte@gmail.com</span>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
          <p>© 2026 CLOSI — Todos os direitos reservados.</p>
        </div>

      </div>
    </div>
  );
};
