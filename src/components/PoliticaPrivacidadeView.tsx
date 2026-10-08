import React from 'react';
import { ShieldCheck, ArrowLeft, Lock, FileText, CheckCircle2, UserCheck, Mail, AlertCircle, RefreshCw } from 'lucide-react';

interface PoliticaPrivacidadeViewProps {
  onVoltar: () => void;
  onOpenTermos?: () => void;
}

export const PoliticaPrivacidadeView: React.FC<PoliticaPrivacidadeViewProps> = ({
  onVoltar,
  onOpenTermos,
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
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Conformidade Meta & LGPD</span>
            </span>
            {onOpenTermos && (
              <button
                onClick={onOpenTermos}
                className="text-xs font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 underline ml-2 cursor-pointer"
              >
                Ver Termos de Uso
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
                Política de Privacidade
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                CLOSI • Gestão de Orçamentos e Atendimento ao Cliente
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 pt-1">
            Última atualização: Outubro de 2026 • Em conformidade com as Políticas da Meta (WhatsApp Cloud API) e LGPD (Lei nº 13.709/2018).
          </div>
        </div>

        {/* Highlights: Meta Compliance Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>WhatsApp Cloud API Oficial</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Comunicação autorizada estritamente com base no consentimento prévio (opt-in) do cliente.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-1.5">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-xs">
              <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Finalidade Estrita</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Dados utilizados apenas para emissão de orçamentos solicitados e suporte. Nunca comercializados.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Opt-out Descomplicado</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              O cliente final pode revogar o opt-in e cancelar o recebimento a qualquer momento.
            </p>
          </div>
        </div>

        {/* Policy Content Sections */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          
          {/* Seção 1 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              1. Quem Somos e Objetivo da Plataforma
            </h2>
            <p>
              O <strong>CLOSI</strong> é uma solução tecnológica voltada para profissionais autônomos, prestadores de serviços e pequenas empresas para a gestão de orçamentos, organização de clientes e comunicação comercial transparente via WhatsApp.
            </p>
            <p>
              Nossa missão é fornecer ferramentas de CRM eficientes que permitam aos prestadores organizar propostas solicitadas pelos seus próprios clientes de maneira ética, rápida e em total conformidade com as diretrizes da Meta e a legislação brasileira de proteção de dados.
            </p>
          </section>

          {/* Seção 2 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              2. Integração com a WhatsApp Cloud API (Meta Platforms, Inc.)
            </h2>
            <p>
              O CLOSI utiliza a <strong>WhatsApp Cloud API oficial da Meta Platforms, Inc.</strong> para a comunicação de propostas e atendimento ao cliente:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                <strong>Comunicação Solicitada:</strong> As mensagens enviadas através da plataforma restringem-se ao envio de orçamentos comerciais, esclarecimento de dúvidas e acompanhamento previamente autorizado pelo cliente.
              </li>
              <li>
                <strong>Proibição Absoluta de Spam e Disparos em Massa:</strong> É terminantemente vedado o uso da plataforma para disparo em massa, publicidade não solicitada, spam ou mensagens para bases de dados de terceiros ou frias.
              </li>
              <li>
                <strong>Consentimento Prévio Obrigatório (Opt-in):</strong> Antes de cadastrar um cliente ou enviar um orçamento, o prestador de serviços confirma ativamente que o cliente final autorizou o recebimento da proposta e atualizações comerciais via WhatsApp.
              </li>
            </ul>
          </section>

          {/* Seção 3 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              3. Dados Coletados e Finalidade Estrita
            </h2>
            <p>
              Coletamos e armazenamos apenas os dados estritamente necessários para a execução dos serviços de CRM:
            </p>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <strong>a) Dados do Prestador de Serviços (Usuário do CRM):</strong> Nome, e-mail de acesso, dados da empresa (razão social, nome fantasia, CNPJ, telefone de contato, chave PIX e endereço comercial).
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <strong>b) Dados dos Clientes Finais:</strong> Nome e número de telefone celular fornecidos voluntariamente para cotação de serviços.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <strong>c) Dados Operacionais dos Orçamentos:</strong> Descrição de itens e serviços, valores acordados, condições de pagamento e prazos.
              </div>
            </div>
          </section>

          {/* Seção 4 - Cláusula Central Meta */}
          <section className="space-y-2.5 p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50">
            <h2 className="text-base sm:text-lg font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              4. Não Comercialização e Não Compartilhamento para Fins de Marketing
            </h2>
            <p className="text-xs sm:text-sm text-emerald-950 dark:text-emerald-200 font-medium">
              O CLOSI <strong>NUNCA comercializa, vende, aluga ou cede dados pessoais</strong> de usuários ou de seus clientes finais para terceiros, empresas de publicidade ou corretores de dados.
            </p>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              O compartilhamento de dados ocorre exclusivamente com provedores de infraestrutura estritamente indispensáveis para o funcionamento técnico do serviço:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <li><strong>Meta Platforms, Inc.:</strong> Processamento da comunicação via WhatsApp Cloud API.</li>
              <li><strong>Supabase Inc.:</strong> Armazenamento seguro de dados e autenticação criptografada.</li>
              <li><strong>Stripe Inc.:</strong> Processamento seguro de assinaturas (não armazenamos dados de cartão).</li>
              <li><strong>Google Cloud (Gemini API):</strong> Processamento textual de propostas para usuários assinantes.</li>
            </ul>
          </section>

          {/* Seção 5 - Revogação de Opt-in */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              5. Direito de Revogação do Opt-in (Opt-Out a Qualquer Momento)
            </h2>
            <p>
              Garantimos a todo cliente final o pleno direito de revogar o seu consentimento de recebimento de comunicações a qualquer momento, de forma simples e imediata:
            </p>
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm space-y-1.5">
              <p>
                <strong>Como revogar:</strong> O cliente final pode simplesmente responder à conversa no WhatsApp com qualquer um dos termos: <code>PARAR</code>, <code>CANCELAR</code> ou <code>SAIR</code>, ou solicitar a interrupção diretamente ao prestador de serviços ou pelo nosso canal de suporte.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Uma vez registrado o opt-out, o número de telefone é imediatamente desautorizado para novos envios automáticos no sistema.
              </p>
            </div>
          </section>

          {/* Seção 6 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              6. Direitos do Titular de Dados (LGPD)
            </h2>
            <p>
              Nos termos do artigo 18 da Lei Geral de Proteção de Dados (LGPD), o titular de dados pessoais pode exercer, a qualquer tempo, os seguintes direitos perante o CLOSI:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Confirmação da existência de tratamento
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Acesso aos dados pessoais mantidos
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Correção de dados incompletos ou inexatos
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Eliminação ou anonimização de dados desnecessários
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Portabilidade dos dados em formato estruturado
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                ✓ Revogação expressa do consentimento
              </div>
            </div>
          </section>

          {/* Seção 7 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              7. Segurança da Informação e Armazenamento
            </h2>
            <p>
              Adotamos elevados padrões técnicos de segurança, incluindo isolamento multi-tenant entre contas, transmissão de dados com criptografia TLS 1.3, controle de acesso baseado em JWT e proteção estrita de chaves de API exclusivamente no lado do servidor.
            </p>
          </section>

          {/* Seção 8 */}
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              8. Canal de Contato e Encarregado de Proteção de Dados (DPO)
            </h2>
            <p>
              Para dúvidas, solicitações de exclusão de dados ou esclarecimentos sobre esta Política de Privacidade, entre em contato através de nosso canal oficial:
            </p>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Canal de Privacidade e DPO</p>
                <a
                  href="mailto:fechazap.suporte@gmail.com"
                  className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  fechazap.suporte@gmail.com
                </a>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
          <p>© 2026 CLOSI — Todos os direitos reservados.</p>
          <p className="mt-1">
            Plataforma em conformidade com as Políticas Comerciais da Meta e da WhatsApp Cloud API.
          </p>
        </div>

      </div>
    </div>
  );
};
