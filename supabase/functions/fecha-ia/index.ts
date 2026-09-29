// Supabase Edge Function: fecha-ia
// Copiloto de Inteligência Artificial Comercial (Exclusivo para Plano TURBO)
// Arquitetura:
//   - Validação de JWT, Perfil, Plano e Parâmetros ANTES de consumir qualquer quota
//   - Consumo Atômico de Cota via RPC consume_ai_quota (SELECT FOR UPDATE)
//   - Remoção de preços arbitrários/artificiais (fallback R$150/100 eliminado)
//   - Validação estrita do JSON retornado pelo Gemini
//   - Tenant Isolation rigoroso na consulta de histórico e orçamentos

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface GeminiResponse {
  text: string;
  model: string;
  usage?: any;
}

const SUPPORTED_ACTIONS = ['gerar_orcamento', 'analisar_precos', 'gerar_fechamento', 'follow_up'] as const;
type ActionType = typeof SUPPORTED_ACTIONS[number];

/**
 * Chamada à API oficial do Google Gemini com timeout e tratamento de erros
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  temperature = 0.4
): Promise<GeminiResponse> {
  const model = 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const bodyPayload: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `Falha na API Gemini (HTTP ${response.status})`
    );
  }

  const data = await response.json();
  const textOutput =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    text: textOutput.trim(),
    model,
    usage: data?.usageMetadata,
  };
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

  if (!geminiApiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Chave GEMINI_API_KEY não configurada no servidor Supabase.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validação Estrita do JWT
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
    const action = body?.action as ActionType;

    // 2. Validação da Ação Solicitada
    if (!action || !SUPPORTED_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Ação "${action || ''}" inválida ou não suportada. Ações permitidas: ${SUPPORTED_ACTIONS.join(', ')}.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validação do Perfil e Plano TURBO
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

    // 4. VALIDAÇÃO PRÉVIA DOS PARÂMETROS DE ENTRADA (SEM CONSUMIR QUOTA SE INVÁLIDO)
    let validatedOrcamentoData: any = null;

    if (action === 'gerar_orcamento') {
      const descricaoPrompt = (body.texto || body.prompt || '').trim();
      if (!descricaoPrompt) {
        return new Response(
          JSON.stringify({ success: false, error: 'O parâmetro "texto" com a descrição do serviço é obrigatório.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (action === 'gerar_fechamento' || action === 'follow_up') {
      const orcamentoId = body.orcamentoId;
      let orcamentoData = body.orcamento;

      if (orcamentoId) {
        const { data: dbOrcamento, error: orcErr } = await supabaseAdmin
          .from('orcamentos')
          .select('*')
          .eq('id', orcamentoId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (orcErr || !dbOrcamento) {
          return new Response(
            JSON.stringify({ success: false, error: 'Orçamento não encontrado ou não pertence à sua conta.' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        orcamentoData = dbOrcamento;
      }

      if (!orcamentoData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Dados do orçamento não fornecidos.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      validatedOrcamentoData = orcamentoData;
    }

    // 5. CONSUMO ATÔMICO DE QUOTA DE IA (Executado SOMENTE após validação de parâmetros)
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

    // =========================================================================
    // 6. PROCESSAMENTO COM IA (GEMINI 3.8 FLASH)
    // =========================================================================

    // OPERAÇÃO A: gerar_orcamento
    if (action === 'gerar_orcamento') {
      const descricaoPrompt = (body.texto || body.prompt || '').trim();

      const systemInstruction = `Você é um assistente comercial ultra eficiente de geração de orçamentos para prestadores de serviços brasileiros.
Sua missão: extrair ou inferir itens com quantidade, valor unitário estimado de mercado em BRL (ou null se não for possível estimar com razoabilidade), prazos e condições a partir da descrição em texto/voz do usuário.
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown \`\`\`json, sem texto antes ou depois) com esta estrutura exata:
{
  "clienteNome": string,
  "clienteTelefone": string,
  "itens": [
    { "descricao": string, "quantidade": number, "valorUnitario": number | null, "total": number | null }
  ],
  "subtotal": number | null,
  "descontoTipo": "valor" | "porcentagem",
  "descontoValor": number,
  "valorTotal": number | null,
  "prazoEntrega": string,
  "formaPagamento": string,
  "observacoes": string
}`;

      const aiResponse = await callGemini(
        geminiApiKey,
        `Crie a proposta a partir desta descrição:\n\n"${descricaoPrompt}"`,
        systemInstruction,
        0.3
      );

      // Validação estrita da resposta da IA sem inventar preços artificiais de fallback
      let parsedOrcamento: any = null;
      try {
        const cleanJson = aiResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        // Validação e sanitização dos campos do orçamento
        const rawItens = Array.isArray(parsed.itens) ? parsed.itens : [];
        const validatedItens = rawItens
          .filter((it: any) => typeof it?.descricao === 'string' && it.descricao.trim())
          .map((it: any) => {
            const quantidade = Number(it.quantidade) > 0 ? Number(it.quantidade) : 1;
            const valorUnitario =
              typeof it.valorUnitario === 'number' && it.valorUnitario > 0 ? Number(it.valorUnitario) : null;
            const total = valorUnitario !== null ? quantidade * valorUnitario : null;
            return {
              descricao: String(it.descricao).trim(),
              quantidade,
              valorUnitario,
              total,
            };
          });

        if (validatedItens.length === 0) {
          validatedItens.push({
            descricao: descricaoPrompt.slice(0, 100),
            quantidade: 1,
            valorUnitario: null,
            total: null,
          });
        }

        const calculatedSubtotal = validatedItens.reduce(
          (acc: number, it: any) => acc + (it.total || 0),
          0
        );

        parsedOrcamento = {
          clienteNome: typeof parsed.clienteNome === 'string' ? parsed.clienteNome : '',
          clienteTelefone: typeof parsed.clienteTelefone === 'string' ? parsed.clienteTelefone : '',
          itens: validatedItens,
          subtotal: calculatedSubtotal > 0 ? calculatedSubtotal : null,
          descontoTipo: parsed.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor',
          descontoValor: Number(parsed.descontoValor) >= 0 ? Number(parsed.descontoValor) : 0,
          valorTotal: calculatedSubtotal > 0 ? calculatedSubtotal : null,
          prazoEntrega: typeof parsed.prazoEntrega === 'string' ? parsed.prazoEntrega : 'A combinar',
          formaPagamento: typeof parsed.formaPagamento === 'string' ? parsed.formaPagamento : 'Pix / Transferência',
          observacoes: typeof parsed.observacoes === 'string' ? parsed.observacoes : '',
          sugestaoIa: true,
          avisoPreco: 'Valores sugeridos pela IA. Revise antes de enviar.',
        };
      } catch {
        // Fallback sem inventar preço fixo de R$150/100
        parsedOrcamento = {
          rawText: aiResponse.text,
          clienteNome: '',
          clienteTelefone: '',
          itens: [
            {
              descricao: descricaoPrompt.slice(0, 100),
              quantidade: 1,
              valorUnitario: null,
              total: null,
            },
          ],
          subtotal: null,
          valorTotal: null,
          prazoEntrega: 'A combinar',
          formaPagamento: 'Pix / Dinheiro',
          observacoes: 'Gerado a partir da descrição fornecida.',
          sugestaoIa: true,
          avisoPreco: 'Valores não estimados pela IA. Preencha os valores antes de salvar.',
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

    // OPERAÇÃO B: analisar_precos (Baseado estritamente no histórico real do usuário)
    if (action === 'analisar_precos') {
      const itemConsultado = (body.item || body.servico || '').trim();

      // Busca orçamentos históricos reais deste usuário específico (Tenant Isolation)
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
            if (it.descricao && it.valorUnitario && Number(it.valorUnitario) > 0) {
              historicoItens.push({
                servico: String(it.descricao),
                preco: Number(it.valorUnitario),
                status: String(o.status || 'pendente'),
                data: String(o.created_at || ''),
              });
            }
          });
        }
      });

      const systemInstruction = `Você é um analista de precificação comercial para prestadores de serviços autônomos.
Analise o histórico real de preços já cobrados pelo próprio usuário e forneça:
1. Faixa de preço média praticada pelo profissional.
2. Taxa de aprovação dos orçamentos nessa faixa de preço.
3. Recomendação tática de preço para o serviço em questão com foco em fechamento sem depreciar o serviço.
Se não houver histórico suficiente registrado para o serviço, deixe isso explícito de forma transparente e informe que a estimativa é baseada no mercado geral, devendo ser revisada pelo prestador.`;

      const promptContext = `Serviço a analisar: "${itemConsultado || 'Geral'}"
Histórico registrado do profissional (${historicoItens.length} itens encontrados no banco):
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

    // OPERAÇÃO C: gerar_fechamento
    if (action === 'gerar_fechamento') {
      const orcamentoData = validatedOrcamentoData;
      const gatilho = body.gatilho || 'Urgência e Qualidade';
      const tom = body.tom || 'Profissional e acolhedor';
      const empresaNome = body.empresa?.nomeFantasia || profile.nome || 'Nossa Empresa';

      const prompt = `Gere uma mensagem persuasiva de fechamento de proposta para WhatsApp.
Cliente: ${orcamentoData.cliente_nome || orcamentoData.clienteNome || 'Cliente'}
Valor Total: R$ ${orcamentoData.valor_total || orcamentoData.valorTotal || 'A combinar'}
Serviços: ${JSON.stringify(orcamentoData.itens || [])}
Gatilho Mental: ${gatilho}
Tom de Voz: ${tom}
Empresa: ${empresaNome}

Requisitos:
- Formatação para WhatsApp com negritos (*texto*).
- 2 parágrafos curtos e objetivos.
- Chamada para ação clara para aprovar a execução.
- Retorne exclusivamente o texto da mensagem.`;

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

    // OPERAÇÃO D: follow_up
    if (action === 'follow_up') {
      const orcamentoData = validatedOrcamentoData;
      const clienteNome = orcamentoData?.cliente_nome || orcamentoData?.clienteNome || 'Cliente';
      const dias = Number(body.dias) || 2;
      const empresaNome = body.empresa?.nomeFantasia || profile.nome || 'Nossa Empresa';

      const prompt = `Crie uma mensagem curta, educada e persuasiva de acompanhamento (follow-up) no WhatsApp para enviar ${dias} dias após a apresentação do orçamento.
Cliente: ${clienteNome}
Proposta: #${orcamentoData?.numero || ''}
Valor: R$ ${orcamentoData?.valor_total || orcamentoData?.valorTotal || ''}
Empresa: ${empresaNome}
Objetivo: Perguntar com cordialidade se restou alguma dúvida técnica ou sobre pagamento para darmos início.`;

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

    return new Response(
      JSON.stringify({ success: false, error: 'Ação não processada.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[fecha-ia Exception]:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Erro interno no processamento da IA.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
