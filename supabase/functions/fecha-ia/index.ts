// Supabase Edge Function: fecha-ia
// Executado exclusivamente no backend Supabase Deno Edge Runtime
// Modelo de Negócio: IA 100% EXCLUSIVA PARA O PLANO TURBO (0 créditos em GRATUITO e PRO)
// Operações Suportadas: 'gerar_orcamento', 'analisar_precos', 'gerar_fechamento', 'follow_up', 'status'

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

async function callGemini(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.65
): Promise<{ text: string; model: string }> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no servidor Supabase.');
  }

  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const payload: any = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature },
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text: text.trim(), model };
        }
      }

      const errText = await res.text();
      lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Falha ao conectar com o Google Gemini.');
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

  // 1. Health check / status sem autenticação obrigatória
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        configured: Boolean(geminiApiKey),
        model: 'gemini-3.8-flash',
        runtime: 'Supabase Edge Functions',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 2. Validação Estrita de JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'gerar_fechamento';

    // 3. Validação de Plano Exclusivo no Servidor (Tabela public.profiles)
    // REGRA CRÍTICA DO MODELO DE NEGÓCIO: IA 100% EXCLUSIVA DO PLANO TURBO
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, nome, plano')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil de usuário não encontrado.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPlano = (profile.plano || 'GRATUITO').toUpperCase();

    if (userPlano !== 'TURBO') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'A Inteligência Artificial é exclusiva para assinantes do plano TURBO.',
          code: 'PLAN_TURBO_REQUIRED',
          planoAtual: userPlano,
          planoNecessario: 'TURBO',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Consumo Atômico de Quota de IA (Prevenção de Race Conditions via SELECT FOR UPDATE)
    // Política: Falha Fechada (HTTP 503 se o serviço falhar)
    const { data: quota, error: quotaErr } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_user_id: user.id,
      p_tipo_operacao: action,
      p_modelo: 'gemini-3.8-flash',
    });

    if (quotaErr || !quota) {
      console.error('[consume_ai_quota RPC Error]:', quotaErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: quota.error || `Limite mensal de IA atingido (${quota.used}/${quota.limit}).`,
          quotaExceeded: true,
          quota,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Execução das Operações do Copiloto TURBO
    // -------------------------------------------------------------
    // OPERAÇÃO A: gerar_orcamento (Texto ou Voz)
    // Transforma áudio transcrito ou briefing em proposta estruturada
    if (action === 'gerar_orcamento') {
      const descricaoPrompt = body.texto || body.prompt || '';
      if (!descricaoPrompt.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: 'Texto ou transcrição do serviço é obrigatório.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const systemInstruction = `Você é um assistente comercial ultra eficiente de geração de orçamentos para prestadores de serviços brasileiros.
Sua missão: extrair ou inferir itens com quantidade, valor unitário estimado de mercado em BRL, subtotal, prazos e condições a partir da descrição em texto/voz do usuário.
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código, sem blocos de texto antes ou depois) com esta estrutura exata:
{
  "clienteNome": string,
  "clienteTelefone": string,
  "itens": [
    { "descricao": string, "quantidade": number, "valorUnitario": number, "total": number }
  ],
  "subtotal": number,
  "descontoTipo": "valor" | "porcentagem",
  "descontoValor": number,
  "valorTotal": number,
  "prazoEntrega": string,
  "formaPagamento": string,
  "observacoes": string
}`;

      const aiResponse = await callGemini(
        geminiApiKey,
        `Crie o orçamento completo a partir desta solicitação de serviço:\n\n"${descricaoPrompt}"`,
        systemInstruction,
        0.3
      );

      let parsedOrcamento = null;
      try {
        const cleanJson = aiResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedOrcamento = JSON.parse(cleanJson);
      } catch {
        parsedOrcamento = {
          rawText: aiResponse.text,
          itens: [{ descricao: descricaoPrompt.slice(0, 80), quantidade: 1, valorUnitario: 150, total: 150 }],
          subtotal: 150,
          valorTotal: 150,
          prazoEntrega: '3 dias úteis',
          formaPagamento: '50% de entrada + 50% na conclusão',
        };
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: parsedOrcamento,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------
    // OPERAÇÃO B: analisar_precos (Baseado no Histórico Real do Usuário)
    if (action === 'analisar_precos') {
      const itemConsultado = body.item || body.servico || '';

      // Busca orçamentos históricos reais do próprio usuário para isolamento de locatário
      const { data: orcamentosPassados } = await supabaseAdmin
        .from('orcamentos')
        .select('numero, cliente_nome, valor_total, status, itens, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60);

      const historicoItens: Array<{ servico: string; preco: number; status: string; data: string }> = [];

      (orcamentosPassados || []).forEach((o: any) => {
        if (Array.isArray(o.itens)) {
          o.itens.forEach((it: any) => {
            if (it.descricao && it.valorUnitario) {
              historicoItens.push({
                servico: it.descricao,
                preco: Number(it.valorUnitario),
                status: o.status,
                data: o.created_at,
              });
            }
          });
        }
      });

      const systemInstruction = `Você é um analista de precificação comercial para prestadores de serviços autônomos e PMEs.
Analise o histórico real de preços já cobrados pelo usuário e forneça:
1. Faixa de preço média praticada pelo profissional.
2. Taxa de sucesso/aprovação dos orçamentos nessa faixa de preço.
3. Recomendação tática de preço para o serviço em questão com foco em maximizar fechamento sem depreciar o serviço.
Seja direto, prático, encorajador e forneça números claros em Reais (R$).`;

      const promptContext = `Serviço a analisar: "${itemConsultado || 'Geral'}"
Histórico recente do próprio usuário (${historicoItens.length} itens registrados):
${JSON.stringify(historicoItens.slice(0, 30), null, 2)}`;

      const aiResponse = await callGemini(geminiApiKey, promptContext, systemInstruction, 0.4);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          model: aiResponse.model,
          totalAmostras: historicoItens.length,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------
    // OPERAÇÃO C: gerar_fechamento (Mensagem de fechamento personalizada)
    if (action === 'gerar_fechamento') {
      const orcamentoId = body.orcamentoId;
      let orcamentoData = body.orcamento;

      // Se passou ID, busca e valida no banco para garantir isolamento de locatário
      if (orcamentoId) {
        const { data: dbOrcamento } = await supabaseAdmin
          .from('orcamentos')
          .select('*')
          .eq('id', orcamentoId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (dbOrcamento) {
          orcamentoData = dbOrcamento;
        }
      }

      if (!orcamentoData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Dados do orçamento não fornecidos.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const gatilho = body.gatilho || 'Urgência e Qualidade';
      const tom = body.tom || 'Profissional e acolhedor';
      const empresaNome = body.empresa?.nomeFantasia || profile.nome || 'Nossa Empresa';

      const prompt = `Gere uma copy altamente persuasiva de fechamento de orçamento pelo WhatsApp.
Cliente: ${orcamentoData.cliente_nome || orcamentoData.clienteNome}
Valor Total: R$ ${orcamentoData.valor_total || orcamentoData.valorTotal}
Serviços: ${JSON.stringify(orcamentoData.itens)}
Gatilho Mental: ${gatilho}
Tom de Voz: ${tom}
Empresa: ${empresaNome}
Chave Pix: ${body.empresa?.chavePix || 'Disponível após confirmação'}

Requisitos:
- Formatação perfeita para WhatsApp com negritos (*texto*).
- 2 a 3 parágrafos curtos.
- Chamada para ação clara para aprovar agora.
- Retorne apenas a mensagem pronta.`;

      const aiResponse = await callGemini(geminiApiKey, prompt, undefined, 0.65);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------
    // OPERAÇÃO D: follow_up (Mensagem de acompanhamento de orçamento enviado)
    if (action === 'follow_up') {
      const orcamentoId = body.orcamentoId;
      let orcamentoData = body.orcamento;

      if (orcamentoId) {
        const { data: dbOrcamento } = await supabaseAdmin
          .from('orcamentos')
          .select('*')
          .eq('id', orcamentoId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (dbOrcamento) {
          orcamentoData = dbOrcamento;
        }
      }

      const clienteNome = orcamentoData?.cliente_nome || orcamentoData?.clienteNome || 'Cliente';
      const dias = body.dias || 2;
      const empresaNome = body.empresa?.nomeFantasia || profile.nome || 'Nossa Empresa';

      const prompt = `Crie uma mensagem curta, educada e persuasiva de follow-up no WhatsApp para enviar ${dias} dias após a apresentação do orçamento.
Cliente: ${clienteNome}
Proposta: #${orcamentoData?.numero || ''}
Valor: R$ ${orcamentoData?.valor_total || orcamentoData?.valorTotal || ''}
Empresa: ${empresaNome}
Objetivo: Saber com simpatia se restou alguma dúvida técnica ou sobre condições de pagamento para fecharmos o serviço.`;

      const aiResponse = await callGemini(geminiApiKey, prompt, undefined, 0.6);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ação desconhecida
    return new Response(
      JSON.stringify({ success: false, error: `Ação "${action}" não reconhecida.` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[fecha-ia Edge Function Exception]:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Erro interno no processamento da IA.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
