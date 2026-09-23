import React from 'react';
import { X, Sparkles, CheckCircle2, MessageSquare, Flame, ShieldCheck } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenIA: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onOpenIA,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Como Vender Mais com FechaZap & Gemini IA</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Dicas práticas para dobrar sua taxa de fechamento no WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs text-slate-700 leading-relaxed">
          
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
            <span className="text-xl">🚀</span>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Novidade: Agora com Google Gemini 3.8 Flash!</h4>
              <p className="text-slate-600 mt-0.5">
                Substituímos o modelo anterior (Claude) pela API oficial do <strong>Google Gemini</strong>. O resultado são mensagens de WhatsApp mais rápidas, naturais e contextualizadas com a realidade do mercado brasileiro.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                1. Não envie só o PDF
              </div>
              <p className="text-slate-600">
                A maioria dos clientes abre o WhatsApp no celular e tem preguiça de abrir anexos. Envie o resumo formatado em texto direto na conversa junto com a opção de ver o PDF.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                2. Chame para a ação (CTA)
              </div>
              <p className="text-slate-600">
                Nunca termine uma mensagem com "fico no aguardo". Use chamadas diretas como: <em>"Podemos reservar o início para quinta-feira?"</em> ou <em>"Posso gerar a chave Pix?"</em>.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-500" />
                3. Follow-up após 48 horas
              </div>
              <p className="text-slate-600">
                O silêncio do cliente quase nunca é recusa; é apenas correria do dia a dia. Use a aba "Follow-up" do Gemini para mandar uma mensagem amigável sem parecer chato.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                4. Quebre objeções na hora
              </div>
              <p className="text-slate-600">
                Quando o cliente falar "tá caro", use o <strong>Contornador de Objeções do Gemini</strong>. Ele responde valorizando seu serviço em vez de simplesmente dar desconto.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Entendi
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenIA();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
          >
            <Sparkles className="w-4 h-4" />
            <span>Testar Assistente Gemini Agora</span>
          </button>
        </div>

      </div>
    </div>
  );
};
