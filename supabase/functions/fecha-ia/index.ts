// Supabase Edge Function: fecha-ia
// Copiloto de Inteligência Artificial Comercial (Exclusivo para Plano TURBO)
// Arquitetura:
//   - Validação de JWT, Perfil, Plano e Parâmetros ANTES de consumir qualquer quota
//   - Consumo Atômico de Cota via RPC consume_ai_quota (SELECT FOR UPDATE)
//   - Remoção de preços arbitrários/artificiais (fallback R$150/100 eliminado)
//   - Validação estrita do JSON retornado pelo Gemini
//   - Tenant Isolation rigoroso na consulta de histórico e orçamentos

import { getCorsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface GeminiResponse {
  text: string;
  model: string;
  usage?: any;
}

const SUPPORTED_ACTIONS = [
  'gerar_orcamento',
  'analisar_precos',
  'gerar_fechamento',
  'follow_up',
  'test_connection',
] as const;
type ActionType = typeof SUPPORTED_ACTIONS[number];

/**
 * Chamada à API oficial do Google Gemini com timeout (20s), retry inteligente e tratamento de erros
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
  temperature = 0.4
): Promise<GeminiResponse> {
  const model = 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  if (prompt.length > 4000) {
    throw new Error('Entrada excede o limite máximo permitido de 4.000 caracteres.');
  }

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

  let lastError: any = null;
  // Até 2 tentativas (1 tentativa inicial + 1 retry para erros transitórios)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(20000), // Timeout rígido de 20s
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        const msg = errorData?.error?.message || `Falha na API Gemini (HTTP ${status})`;

        // Se for erro transitório e for a 1ª tentativa, tenta novamente após 800ms
        if ((status === 503 || status === 429 || status >= 500) && attempt === 1) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        throw new Error(msg);
      }

      const data = await response.json();
      const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        text: textOutput.trim(),
        model,
        usage: data?.usageMetadata,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt === 1 && (err.name === 'TimeoutError' || err.message?.includes('timeout'))) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      break;
    }
  }

  if (lastError?.name === 'TimeoutError' || lastError?.message?.includes('timeout')) {
    throw new Error('Tempo limite excedido na resposta da IA (timeout de 20s). Tente uma descrição mais concisa.');
  }

  throw lastError || new Error('Falha ao comunicar com o Google Gemini.');
}

Deno.serve(async (req) => {
  const currentCorsHeaders = getCorsHeaders(req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: currentCorsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';

  try {
    // 1. Validação Estrita do JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado. JWT ausente ou inválido.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.startsWith('local-')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida. Faça login com sua conta.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token expirado ou não autorizado.' }),
        { status: 401, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 404, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verificação Segura da Configuração do GEMINI_API_KEY
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Chave GEMINI_API_KEY não configurada no servidor Supabase.',
        }),
        { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // AÇÃO ESPECIAL: Teste de Conexão com Google Gemini (NÃO consome quota de usuário)
    // =========================================================================
    if (action === 'test_connection') {
      try {
        const pingTest = await callGemini(
          geminiApiKey,
          'Responda com uma única palavra: OK',
          'Você é um verificador de conectividade operacional.',
          0.1
        );

        if (!pingTest.text) {
          throw new Error('Sem resposta da API Google Gemini.');
        }

        return new Response(
          JSON.stringify({
            success: true,
            provider: 'Google Gemini',
            model: 'gemini-3.8-flash',
          }),
          { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (testErr: any) {
        console.warn('[fecha-ia test_connection Error]:', testErr?.message);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Serviço do Google Gemini temporariamente indisponível.',
          }),
          { status: 502, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. VALIDAÇÃO PRÉVIA DOS PARÂMETROS DE ENTRADA (SEM CONSUMIR QUOTA SE INVÁLIDO)
    let validatedOrcamentoData: any = null;

    if (action === 'gerar_orcamento') {
      const descricaoPrompt = (body.texto || body.prompt || '').trim();
      if (!descricaoPrompt) {
        return new Response(
          JSON.stringify({ success: false, error: 'O parâmetro "texto" com a descrição do serviço é obrigatório.' }),
          { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (descricaoPrompt.length > 4000) {
        return new Response(
          JSON.stringify({ success: false, error: 'A descrição excede o limite máximo permitido de 4.000 caracteres.' }),
          { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (action === 'analisar_precos') {
      const itemConsultado = (body.item || body.servico || '').trim();
      if (itemConsultado.length > 500) {
        return new Response(
          JSON.stringify({ success: false, error: 'O termo de busca excede o limite máximo de 500 caracteres.' }),
          { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
            { status: 404, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        orcamentoData = dbOrcamento;
      }

      if (!orcamentoData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Dados do orçamento não fornecidos.' }),
          { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 503, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 429, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // 6. PROCESSAMENTO COM IA (GEMINI 3.8 FLASH)
    // =========================================================================

    // OPERAÇÃO A: gerar_orcamento
    if (action === 'gerar_orcamento') {
      const descricaoPrompt = (body.texto || body.prompt || '').trim();

      const systemInstruction = `Você é um copiloto de inteligência comercial para prestadores de serviços autônomos no Brasil (eletricistas, pintores, encanadores, marceneiros, pedreiros, técnicos, consultores, etc.).
A partir da descrição livre do usuário (ex: "pintura de dois quartos e sala, parede já tem reboco"), sua missão é estruturar uma proposta profissional completa e cuidadosa.
Diretrizes fundamentais:
1. Nunca invente preços como fatos consumados. Se sugerir valores em BRL para mão de obra ou itens, eles devem ser explicitamente marcados como estimativas para revisão do prestador.
2. Divida claramente entre mão de obra, etapas e materiais.
3. Identifique possíveis "itens esquecidos" ou custos ocultos que o prestador ou cliente possam ter esquecido (ex: lixas, fita crepe, selador, caçamba de entulho, limpeza pós-obra).
4. Elabore 2 a 3 "perguntas de alinhamento" úteis para o prestador fazer ao cliente antes de bater o martelo.
5. Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown \`\`\`json, sem texto antes ou depois) com esta estrutura exata:
{
  "clienteNome": string,
  "clienteTelefone": string,
  "servico": string,
  "itens": [
    { "descricao": string, "quantidade": number, "valorUnitario": number | null, "total": number | null }
  ],
  "etapas": string[],
  "materiaisSugeridos": string[],
  "itensEsquecidos": string[],
  "perguntasAlinhamento": string[],
  "subtotal": number | null,
  "descontoTipo": "valor" | "porcentagem",
  "descontoValor": number,
  "valorTotal": number | null,
  "prazoEntrega": string,
  "formaPagamento": string,
  "observacoes": string,
  "avisoPreco": "Valor sugerido pela IA. Revise antes de enviar."
}`;

      const aiResponse = await callGemini(
        geminiApiKey,
        `Crie a proposta detalhada a partir desta descrição:\n\n"${descricaoPrompt}"`,
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
          servico: typeof parsed.servico === 'string' ? parsed.servico : descricaoPrompt.slice(0, 60),
          itens: validatedItens,
          etapas: Array.isArray(parsed.etapas) ? parsed.etapas : [],
          materiaisSugeridos: Array.isArray(parsed.materiaisSugeridos) ? parsed.materiaisSugeridos : [],
          itensEsquecidos: Array.isArray(parsed.itensEsquecidos) ? parsed.itensEsquecidos : [],
          perguntasAlinhamento: Array.isArray(parsed.perguntasAlinhamento) ? parsed.perguntasAlinhamento : [],
          subtotal: calculatedSubtotal > 0 ? calculatedSubtotal : null,
          descontoTipo: parsed.descontoTipo === 'porcentagem' ? 'porcentagem' : 'valor',
          descontoValor: Number(parsed.descontoValor) >= 0 ? Number(parsed.descontoValor) : 0,
          valorTotal: calculatedSubtotal > 0 ? calculatedSubtotal : null,
          prazoEntrega: typeof parsed.prazoEntrega === 'string' ? parsed.prazoEntrega : 'A combinar',
          formaPagamento: typeof parsed.formaPagamento === 'string' ? parsed.formaPagamento : '50% entrada + 50% na conclusão',
          observacoes: typeof parsed.observacoes === 'string' ? parsed.observacoes : '',
          sugestaoIa: true,
          avisoPreco: 'Valor sugerido pela IA. Revise antes de enviar.',
        };
      } catch {
        // Fallback sem inventar preço fixo artificial
        parsedOrcamento = {
          rawText: aiResponse.text,
          clienteNome: '',
          clienteTelefone: '',
          servico: descricaoPrompt.slice(0, 60),
          itens: [
            {
              descricao: descricaoPrompt.slice(0, 100),
              quantidade: 1,
              valorUnitario: null,
              total: null,
            },
          ],
          etapas: ['Alinhamento e preparação', 'Execução do serviço', 'Finalização e entrega'],
          materiaisSugeridos: [],
          itensEsquecidos: ['Verificar descarte de entulho e limpeza final'],
          perguntasAlinhamento: ['Qual o prazo ideal desejado para a conclusão?'],
          subtotal: null,
          valorTotal: null,
          prazoEntrega: 'A combinar',
          formaPagamento: 'Pix / Dinheiro',
          observacoes: 'Gerado a partir da descrição fornecida.',
          sugestaoIa: true,
          avisoPreco: 'Valor sugerido pela IA. Revise antes de enviar.',
        };
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: parsedOrcamento,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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

      const temHistorico = historicoItens.length > 0;
      const aprovados = historicoItens.filter((h) => h.status === 'aprovado');
      const recusados = historicoItens.filter((h) => h.status === 'recusado');

      const precosAprovados = aprovados.map((a) => a.preco);
      const minAprovado = precosAprovados.length > 0 ? Math.min(...precosAprovados) : 0;
      const maxAprovado = precosAprovados.length > 0 ? Math.max(...precosAprovados) : 0;
      const mediaAprovado =
        precosAprovados.length > 0
          ? Math.round(precosAprovados.reduce((acc, v) => acc + v, 0) / precosAprovados.length)
          : 0;

      const systemInstruction = `Você é um analista de precificação comercial para prestadores de serviços autônomos.
Analise os dados reais do usuário com rigor:
1. Se houver histórico: cite especificamente a faixa real cobrada pelo usuário.
   Exemplo de padrão analítico: "Nos últimos X orçamentos registrados, sua faixa mais aceita ficou entre R$ ${minAprovado} e R$ ${maxAprovado} (média de R$ ${mediaAprovado})."
   Não transforme correlação em certeza absoluta. Apresente insights de competitividade.
2. Se NÃO houver histórico suficiente: declare com total transparência que não há registros anteriores deste serviço na conta do usuário no FechaZap. Apresente uma faixa estimativa de mercado geral e inclua obrigatoriamente a advertência: "Valor sugerido pela IA. Revise antes de enviar."
3. Seja conciso (2 a 3 parágrafos curtos) e focado em lucro justo sem desvalorizar o trabalho.`;

      const promptContext = `Serviço a analisar: "${itemConsultado || 'Geral'}"
Tem histórico no banco: ${temHistorico ? 'SIM' : 'NÃO'}
Total de itens no histórico: ${historicoItens.length} (${aprovados.length} aprovados, ${recusados.length} recusados)
Faixa dos aprovados: R$ ${minAprovado} até R$ ${maxAprovado} (Média: R$ ${mediaAprovado})
Amostras recentes:
${JSON.stringify(historicoItens.slice(0, 20), null, 2)}`;

      const aiResponse = await callGemini(geminiApiKey, promptContext, systemInstruction, 0.4);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          temHistorico,
          model: aiResponse.model,
          totalAmostras: historicoItens.length,
          avisoPreco: temHistorico ? undefined : 'Valor sugerido pela IA. Revise antes de enviar.',
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
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
- Retorne exclusivamente o texto da mensagem para que o usuário possa revisar e editar antes do envio.`;

      const aiResponse = await callGemini(geminiApiKey, prompt, undefined, 0.65);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // OPERAÇÃO D: follow_up (Com suporte a cenários comerciais específicos)
    if (action === 'follow_up') {
      const orcamentoData = validatedOrcamentoData;
      const clienteNome = orcamentoData?.cliente_nome || orcamentoData?.clienteNome || 'Cliente';
      const empresaNome = body.empresa?.nomeFantasia || profile.nome || 'Nossa Empresa';
      const cenario = body.cenario || body.tipo || 'primeiro'; // 'primeiro' | 'segundo' | 'sem_resposta' | 'proximo_vencimento' | 'pedido_desconto' | 'interesse' | 'recusa'
      const dias = Number(body.dias) || 2;

      let instrucaoCenario = '';
      switch (cenario) {
        case 'primeiro':
          instrucaoCenario = `Primeiro contato pós-envio (${dias} dias). Pergunte com cordialidade se o cliente conseguiu avaliar o orçamento #${orcamentoData?.numero} e se tem alguma dúvida sobre os itens descritos.`;
          break;
        case 'segundo':
          instrucaoCenario = `Segundo acompanhamento. Reforce a disponibilidade de agenda para a realização dos serviços e confirme se as condições de pagamento atendem.`;
          break;
        case 'sem_resposta':
          instrucaoCenario = `Cliente não responde há vários dias. Seja muito simpático, evite parecer insistente ou spam. Diga que compreende a rotina corrida e pergunte se o projeto ainda segue nos planos.`;
          break;
        case 'proximo_vencimento':
          instrucaoCenario = `Orçamento próximo da data de validade (${orcamentoData?.data_validade || 'em breve'}). Lembre com elegância que as condições e valores combinados estão garantidos até a data limite.`;
          break;
        case 'pedido_desconto':
          instrucaoCenario = `O cliente solicitou desconto ou negociação. Apresente alternativas cordiais (ex: pequena condição especial no pagamento à vista via Pix ou parcelamento flexível) sem desvalorizar a qualidade da mão de obra.`;
          break;
        case 'interesse':
          instrucaoCenario = `O cliente demonstrou interesse no serviço. Mostre entusiasmo e proponha o próximo passo direto: fechar a data de início ou formalizar o agendamento.`;
          break;
        case 'recusa':
          instrucaoCenario = `O cliente informou que não fechará no momento. Responda com agradecimento sincero pelo tempo e deixe a porta 100% aberta para oportunidades futuras.`;
          break;
        default:
          instrucaoCenario = `Acompanhamento geral educado e persuasivo de ${dias} dias.`;
      }

      const prompt = `Crie uma mensagem curta para WhatsApp com foco comercial ético.
Cliente: ${clienteNome}
Orçamento: #${orcamentoData?.numero || ''}
Valor Total: R$ ${orcamentoData?.valor_total || orcamentoData?.valorTotal || ''}
Empresa: ${empresaNome}
Cenário do follow-up: ${instrucaoCenario}

Requisitos:
- Linguagem natural em português brasileiro.
- Máximo 2 parágrafos curtos.
- Use formatação simples de WhatsApp (*negrito*).
- Não seja robótico nem invasivo.
- Retorne apenas o texto da mensagem.`;

      const aiResponse = await callGemini(geminiApiKey, prompt, undefined, 0.6);

      return new Response(
        JSON.stringify({
          success: true,
          text: aiResponse.text,
          cenario,
          model: aiResponse.model,
          quotaRemaining: quota.remaining,
        }),
        { status: 200, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Ação não processada.' }),
      { status: 400, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[fecha-ia Exception]:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Erro interno no processamento da IA.',
      }),
      { status: 500, headers: { ...currentCorsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
