import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  MessageSquare,
  Flame,
  ShieldCheck,
  Zap,
  Clock,
  Send,
  FileText,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Check,
  HelpCircle,
  Building2,
  BellRing,
  Award,
} from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenIA: () => void;
}

interface StepInfo {
  id: number;
  titulo: string;
  subtitulo: string;
  icone: any;
  categoria: string;
}

const STEPS: StepInfo[] = [
  {
    id: 1,
    titulo: 'Bem-vindo ao FechaZap',
    subtitulo: 'Como transformar orçamentos em vendas fechadas',
    icone: Sparkles,
    categoria: 'Visão Geral',
  },
  {
    id: 2,
    titulo: 'Criando Orçamentos Profissionais',
    subtitulo: 'Itens, prazos, descontos e termos de garantia',
    icone: FileText,
    categoria: 'Propostas',
  },
  {
    id: 3,
    titulo: 'Fechamento com Google Gemini IA',
    subtitulo: 'Gatilhos de urgência, escassez e quebra de objeções',
    icone: Zap,
    categoria: 'Inteligência Artificial',
  },
  {
    id: 4,
    titulo: 'Envio Estratégico no WhatsApp',
    subtitulo: 'Por que não enviar apenas o PDF e como chamar para a ação',
    icone: Send,
    categoria: 'Conversão',
  },
  {
    id: 5,
    titulo: 'Alertas de Validade & Funil',
    subtitulo: 'Notificações antes que o cliente esfrie ou a proposta vença',
    icone: BellRing,
    categoria: 'Acompanhamento',
  },
  {
    id: 6,
    titulo: 'Configuração da Empresa & Pix',
    subtitulo: 'Dados comerciais, chave Pix e mensagens personalizadas',
    icone: Building2,
    categoria: 'Configurações',
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onOpenIA,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleFinish = () => {
    if (dontShowAgain) {
      localStorage.setItem('fechazap_has_seen_tutorial_v1', 'true');
    }
    onClose();
  };

  const handleTestIA = () => {
    if (dontShowAgain) {
      localStorage.setItem('fechazap_has_seen_tutorial_v1', 'true');
    }
    onClose();
    onOpenIA();
  };

  const nextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header com Gradiente */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 p-4 sm:p-5 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/80">
                  Guia Prático FechaZap
                </span>
                <span className="text-xs text-slate-400">
                  Passo {currentStep} de {STEPS.length}
                </span>
              </div>
              <h3 className="font-black text-lg sm:text-xl text-slate-100 tracking-tight mt-0.5">
                {STEPS[currentStep - 1].titulo}
              </h3>
            </div>
          </div>

          <button
            onClick={handleFinish}
            title="Fechar tutorial"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Tabs - Navegação por passos */}
        <div className="bg-slate-100/90 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 overflow-x-auto flex items-center gap-2 shrink-0">
          {STEPS.map((s) => {
            const Icon = s.icone;
            const isCurrent = s.id === currentStep;
            const isDone = s.id < currentStep;

            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : isDone
                    ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 font-bold" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                <span>{s.id}. {s.categoria}</span>
              </button>
            );
          })}
        </div>

        {/* Body com Conteúdo Rico de Cada Passo */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900">
          
          {/* PASSO 1: VISÃO GERAL */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/40 dark:to-slate-850 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>O Poder do FechaZap</span>
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Mais de 60% dos orçamentos são perdidos pelo "vácuo" do WhatsApp.
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                    O FechaZap foi desenhado para eliminar a demora na negociação. Em vez de enviar apenas um PDF frio e esperar, você usa inteligência artificial com gatilhos psicológicos para conduzir o cliente ao fechamento imediato.
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black shrink-0 shadow-lg shadow-emerald-600/30">
                  ⚡
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-400 flex items-center justify-center font-black text-sm">
                    1
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white text-sm">Orçamento em Segundos</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Adicione serviços, valores, prazo, formas de pagamento e calcule totais com descontos instantaneamente.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black text-sm">
                    2
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white text-sm">Google Gemini IA Integrado</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Gere mensagens persuasivas com escassez de agenda, bônus Pix e contorno para objeções como "tá caro".
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                    3
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white text-sm">Fechamento com 1 Toque</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Dispare a mensagem pronta diretamente no WhatsApp do cliente com dados Pix e aprovação simplificada.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: CRIANDO ORÇAMENTOS */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Como preencher propostas que transmitem credibilidade
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Siga estas boas práticas ao criar cada orçamento para maximizar suas chances de aprovação:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Detalhamento dos Itens</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Evite descrições genéricas como "serviço de elétrica". Especifique o valor entregue: <em>"Instalação e testes de quadro de distribuição com emissão de laudo e garantia de 6 meses"</em>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Desconto Estratégico</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Configure descontos em porcentagem (%) ou valor fixo (R$). Use o desconto como moeda de troca: <em>"10% de desconto exclusivo para pagamento à vista no Pix hoje"</em>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Data de Validade Curta</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Propostas com validade de 3 a 5 dias geram urgência real. Validades longas (como 30 dias) fazem o cliente adiar a decisão indefinidamente.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                    <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>Termos de Garantia Claros</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Inclua garantia explícita (ex: 90 dias, suporte prioritário). Elimina o medo do cliente e reduz a sensibilidade a preço.
                  </p>
                </div>
              </div>

              {/* Botão de Ação Rápida */}
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                <span>Dica: você pode salvar e duplicar qualquer proposta anterior em 1 clique!</span>
              </div>
            </div>
          )}

          {/* PASSO 3: FECHAMENTO COM IA GEMINI */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Google Gemini 3.8 Flash Integrado</span>
                </div>
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Os 5 Gatilhos Mentais que Fecham Negócios no WhatsApp
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Clique no ícone de varinha mágica <strong>(✨)</strong> em qualquer orçamento para abrir o assistente:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <span className="text-lg">🔥</span>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">1. Urgência de Agenda</h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Avisa que as vagas para atendimento na semana estão se esgotando. Excelente para quem presta serviços com horário agendado.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <span className="text-lg">⚡</span>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">2. Bônus Pix Imediato</h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Oferece um benefício exclusivo (suporte estendido, frete grátis ou condição especial) se o cliente aprovar e pagar pelo Pix agora.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <span className="text-lg">⏳</span>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">3. Validade da Tabela</h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Explica com elegância que o valor promocional ou desconto só pode ser assegurado até a data de validade estipulada.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <span className="text-lg">🛡️</span>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs">4. Quebra de Objeções (Aba Especial)</h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      O cliente disse <em>"achei caro"</em> ou <em>"vou pesquisar mais"</em>? Selecione a objeção na aba de IA e ela redige uma resposta que defende o valor do seu trabalho sem você precisar baixar as calças.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4: ENVIO NO WHATSAPP */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Por que você nunca deve enviar só o arquivo PDF
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  A maioria dos profissionais comete o erro de anexar o PDF e escrever apenas <em>"segue orçamento em anexo, qualquer dúvida estou à disposição"</em>.
                </p>
              </div>

              {/* Simulação Visual do WhatsApp */}
              <div className="p-4 rounded-2xl bg-emerald-950/5 dark:bg-slate-850 border border-emerald-200 dark:border-slate-750 space-y-3">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                  Exemplo de mensagem gerada pelo FechaZap:
                </span>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700/60 text-xs text-slate-800 dark:text-slate-200 space-y-2 shadow-xs font-mono leading-relaxed">
                  <p className="font-sans font-bold text-emerald-700 dark:text-emerald-400">
                    Olá Carlos! Tudo bem? Segue a proposta detalhada:
                  </p>
                  <p>
                    📋 <strong>Orçamento #101</strong> - Soluções Pro Serviços<br />
                    🔹 1x Instalação e Configuração de Sistema: R$ 1.800,00<br />
                    🔹 1x Treinamento de Equipe: R$ 850,00<br />
                    💰 <strong>Total com Desconto: R$ 2.500,00</strong>
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 font-sans font-semibold">
                    ⚡ <em>"Carlos, se confirmarmos hoje consigo encaixar sua execução já nesta quinta-feira com suporte prioritário."</em>
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 font-sans">
                    🔑 <strong>Chave Pix (CNPJ):</strong> 38.192.847/0001-92<br />
                    Posso reservar o seu atendimento?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-red-50 dark:bg-rose-950/30 border border-red-200 dark:border-rose-900 rounded-xl">
                  <span className="font-bold text-red-900 dark:text-rose-400 block mb-1">❌ O que NÃO fazer:</span>
                  <p className="text-red-700 dark:text-rose-300">
                    Mandar só o PDF sem texto, sem chave Pix, e terminar com "fico no aguardo".
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                  <span className="font-bold text-emerald-900 dark:text-emerald-400 block mb-1">✅ O que fazer:</span>
                  <p className="text-emerald-800 dark:text-emerald-300">
                    Enviar resumo em texto formatado, motivo para agir agora e uma chamada de ação direta (CTA).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 5: ALERTAS DE VALIDADE & ACOMPANHAMENTO */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Nunca mais perca um orçamento por esquecimento
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  O FechaZap monitora automaticamente o relógio das suas negociações:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-400 text-sm">
                    <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Sino de Notificações com Badge</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    No topo do app, o sino alerta quantas propostas vencem nos próximos 3 dias. Clicando nele você acessa atalhos de WhatsApp e fechamento instantâneo.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-400 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Comemoração de Venda Fechada</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Quando o cliente aceitar, clique no botão <strong>"Aprovar"</strong>. Além dos confetes comemorativos, o faturamento é contabilizado instantaneamente no gráfico semestral.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-850 text-white border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                  <Clock className="w-4 h-4" />
                  <span>A Regra de Ouro do Follow-up (48 horas)</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Se o cliente não respondeu em até 48 horas após o envio, não se desespere. Ele apenas teve imprevistos na rotina. Abra a IA, selecione o tom <em>"Amigável"</em> ou <em>"Consultivo"</em> e reative o contato sem parecer insistente.
                </p>
              </div>
            </div>
          )}

          {/* PASSO 6: CONFIGURAÇÕES E CHAVE PIX */}
          {currentStep === 6 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Deixe o FechaZap com a cara da sua empresa
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Antes de começar a enviar para clientes reais, personalize os dados em <strong>Configurações</strong>:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Nome & CNPJ da Empresa</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Aparece no cabeçalho do PDF impresso e nas mensagens.</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs">Personalizável</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">Chave Pix Comercial</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Inserida automaticamente nas mensagens geradas para receber pagamento.</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs">Chave Pix</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white block">API Google Gemini</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Modelo Gemini 3.8 Flash nativo integrado no servidor sem necessidade de configuração adicional.</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs">Ativo</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
                <div>
                  <h5 className="font-black text-sm">Você está pronto para vender mais!</h5>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    Explore agora os orçamentos ou faça seu primeiro teste com a IA.
                  </p>
                </div>
                <button
                  onClick={handleTestIA}
                  className="px-4 py-2 rounded-xl bg-white text-emerald-900 font-bold text-xs hover:bg-emerald-50 transition-colors shadow-sm shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Testar IA Gemini Agora</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer com Navegação de Passos e Checkbox */}
        <div className="bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* Checkbox Não Mostrar Novamente */}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer self-start sm:self-auto select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 border-slate-300 dark:border-slate-700"
            />
            <span>Entendi tudo (não abrir automaticamente de novo)</span>
          </label>

          {/* Botões de Navegação */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            )}

            {currentStep < STEPS.length ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <span>Próximo</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Concluir Guia</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
