// Cloudflare Worker Principal - FechaZap 3.1.5
// Hardening de Produção: Autenticação Obrigatória, Quota Atômica, Dados no Servidor
import { Env } from './types';
import {
  generateContentWithGemini,
  fallbackFechamento,
  fallbackObjecao,
  fallbackFollowUp,
  fallbackChat,
  fallbackDiagnostico,
} from './gemini';
import {
  validateUserFromToken,
  consumeAtomicAiQuota,
  getReadOnlyUserQuota,
  fetchRealUserSalesContext,
  fetchUserOrcamentoById,
} from './supabase';
import { sendMetaWhatsAppMessage } from './whatsapp';

// Helper de CORS Seguro com Validação de Origem
function resolveCorsOrigin(request: Request, env: Env): string {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '*';

  const allowedCustom = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultAllowedPatterns = [
    /^https:\/\/fechazap\.pages\.dev$/,
    /^https:\/\/[a-z0-9-]+\.fechazap\.pages\.dev$/,
    /^http:\/\/localhost:(3000|5173|4173)$/,
    /^http:\/\/127\.0\.0\.1:(3000|5173|4173)$/,
  ];

  if (allowedCustom.includes(origin)) {
    return origin;
  }

  for (const pattern of defaultAllowedPatterns) {
    if (pattern.test(origin)) {
      return origin;
    }
  }

  // Se estiver em desenvolvimento local
  if (env.APP_ENV !== 'production') {
    return origin;
  }

  return 'https://fechazap.pages.dev';
}

function jsonResponse(data: any, status = 200, origin = '*'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const origin = resolveCorsOrigin(request, env);
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

    // 1. Trata CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    // 2. Health check / Status Seguro da IA (Regra 2: Não revelar segredos ou detalhes internos)
    if (pathname === '/api/ai/status' && method === 'GET') {
      const configured = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
      return jsonResponse(
        {
          ok: configured,
          provider: 'google',
          configured,
        },
        200,
        origin
      );
    }

    // 3. Perfil e Quota do Usuário Autenticado
    if (pathname === '/api/auth/me' && method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      if (!user.isAuthed) {
        return jsonResponse(
          {
            authenticated: false,
            user: {
              id: 'anon',
              email: '',
              plano: 'GRATUITO',
            },
            quota: {
              plano: 'GRATUITO',
              used: 0,
              limit: 10,
              allowed: false,
              month: new Date().toISOString().slice(0, 7),
            },
          },
          200,
          origin
        );
      }

      const quota = await getReadOnlyUserQuota(env, user);

      return jsonResponse(
        {
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            nome: user.nome,
            plano: user.plano,
          },
          quota,
        },
        200,
        origin
      );
    }

    // =========================================================================
    // ROTAS DE IA - EXIGÊNCIA ABSOLUTA DE AUTENTICAÇÃO E QUOTA ATÔMICA
    // =========================================================================

    // 4. Fechamento de Orçamento com Gatilhos
    if (pathname === '/api/ai/fechar-orcamento' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      // REGRA 1: Bloqueia qualquer acesso não autenticado
      if (!user.isAuthed || user.id === 'anon') {
        return jsonResponse(
          {
            success: false,
            error: 'Não autorizado. Faça login para utilizar a inteligência artificial do FechaZap.',
          },
          401,
          origin
        );
      }

      // REGRA 6 & 8 (3.1.6): Verificação e consumo atômico de quota via RPC com fail-closed
      const quota = await consumeAtomicAiQuota(env, user.id, 'fechar_orcamento', 'gemini-3.8-flash');
      if (!quota.ok) {
        return jsonResponse(
          {
            success: false,
            error: quota.error || 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
          },
          503,
          origin
        );
      }
      if (!quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${quota.plano} (${quota.used}/${quota.limit}). Faça upgrade para PRO ou TURBO para continuar gerando orçamentos com IA.`,
            quotaExceeded: true,
            quota,
          },
          429,
          origin
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamentoId, gatilho, tom, empresa } = body;
      let orcamento = body.orcamento;

      // REGRA 10: Se orcamentoId for fornecido, busca a verdade diretamente no banco
      if (orcamentoId) {
        const verifiedOrcamento = await fetchUserOrcamentoById(env, user.id, orcamentoId);
        if (verifiedOrcamento) {
          orcamento = verifiedOrcamento;
        } else {
          return jsonResponse(
            {
              success: false,
              error: 'Orçamento não encontrado ou não pertence à sua conta.',
            },
            404,
            origin
          );
        }
      }

      const systemInstruction = `Você é o "FechaZap IA", o maior especialista do Brasil em fechamento de vendas e orçamentos pelo WhatsApp.
Sua missão é criar mensagens persuasivas, naturais, profissionais e envolventes em português brasileiro para prestadores de serviço e comércios enviarem aos seus clientes pelo WhatsApp.
REGRAS:
1. Use formatação do WhatsApp: use *negrito* para termos de destaque (valores, prazos, chamada para ação).
2. Use quebras de linha limpas e emojis de forma moderada e profissional.
3. Não pareça um robô ou spammer; pareça um profissional dedicado e confiável.
4. Inclua sempre um CTA claro para fechar o pedido (ex: "Podemos fechar para garantir o início nesta semana?", "Me avisa se posso enviar a chave Pix para reservar?").
5. NUNCA mencione que você é uma inteligência artificial.`;

      const prompt = `Gere uma mensagem de fechamento para envio pelo WhatsApp com as seguintes informações:

CLIENTE: ${orcamento?.clienteNome || orcamento?.cliente_nome || 'Cliente'}
NÚMERO DO ORÇAMENTO: #${orcamento?.numero || '001'}
SERVIÇOS / ITENS:
${Array.isArray(orcamento?.itens) ? orcamento.itens.map((i: any) => `- ${i.descricao} (${i.quantidade || 1}x) - R$ ${Number(i.total || i.valorUnitario || 0).toFixed(2)}`).join('\n') : 'Conforme alinhado'}
VALOR TOTAL: R$ ${Number(orcamento?.valorTotal || orcamento?.valor_total || 0).toFixed(2)}
FORMA DE PAGAMENTO: ${orcamento?.formaPagamento || orcamento?.forma_pagamento || 'A combinar'}
PRAZO: ${orcamento?.prazoEntrega || orcamento?.prazo_entrega || 'A combinar'}
EMPRESA: ${empresa?.nomeFantasia || 'Nossa Empresa'}

GATILHO ESCOLHIDO: ${gatilho || 'Urgência e Escassez de agenda'}
TOM DE VOZ: ${tom || 'Profissional, caloroso e direto'}

Crie a mensagem pronta para envio no WhatsApp:`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            systemInstruction,
            temperature: 0.7,
          });

          return jsonResponse(
            {
              success: true,
              text: result.text,
              model: result.model,
            },
            200,
            origin
          );
        } catch (err: any) {
          console.warn('Gemini retornou erro, ativando contingência controlada:', err?.message);
        }
      }

      // Contingência concedida apenas para usuário autenticado com quota válida
      const fallbackText = fallbackFechamento(orcamento, gatilho, tom, empresa);
      return jsonResponse(
        {
          success: true,
          text: fallbackText,
          model: 'fechazap-contingencia',
          contingency: true,
        },
        200,
        origin
      );
    }

    // 5. Contorno de Objeções
    if (pathname === '/api/ai/contornar-objecao' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      if (!user.isAuthed || user.id === 'anon') {
        return jsonResponse(
          {
            success: false,
            error: 'Não autorizado. Faça login para utilizar a inteligência artificial do FechaZap.',
          },
          401,
          origin
        );
      }

      const quota = await consumeAtomicAiQuota(env, user.id, 'contornar_objecao', 'gemini-3.8-flash');
      if (!quota.ok) {
        return jsonResponse(
          {
            success: false,
            error: quota.error || 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
          },
          503,
          origin
        );
      }
      if (!quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${quota.plano} (${quota.used}/${quota.limit}). Faça upgrade para continuar.`,
            quotaExceeded: true,
            quota,
          },
          429,
          origin
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamentoId, objecao, contexto, empresa } = body;
      let orcamento = body.orcamento;

      if (orcamentoId) {
        const verifiedOrcamento = await fetchUserOrcamentoById(env, user.id, orcamentoId);
        if (verifiedOrcamento) {
          orcamento = verifiedOrcamento;
        } else {
          return jsonResponse(
            {
              success: false,
              error: 'Orçamento não encontrado ou não pertence à sua conta.',
            },
            404,
            origin
          );
        }
      }

      const systemInstruction = `Você é o "FechaZap IA", especialista em negociação e quebra de objeções no WhatsApp.
O objetivo é reverter a hesitação do cliente com respeito, validação da preocupação dele, ancoragem de valor e proposta de avanço.
Use formatação de WhatsApp (*negrito*, emojis pontuais, parágrafos curtos).`;

      const prompt = `O cliente recebeu o orçamento e respondeu com a seguinte objeção:
"${objecao || 'Achei o valor um pouco acima do esperado'}"

DADOS DO ORÇAMENTO:
Cliente: ${orcamento?.clienteNome || orcamento?.cliente_nome || 'Cliente'}
Valor Total: R$ ${Number(orcamento?.valorTotal || orcamento?.valor_total || 0).toFixed(2)}
Itens: ${Array.isArray(orcamento?.itens) ? orcamento.itens.map((i: any) => i.descricao).join(', ') : 'Serviços'}
Forma de Pagamento: ${orcamento?.formaPagamento || orcamento?.forma_pagamento || 'Pix/Cartão'}
Contexto adicional: ${contexto || 'Nenhum'}
Empresa: ${empresa?.nomeFantasia || 'Nossa Empresa'}

Crie 2 opções de resposta curtas e persuasivas para enviar pelo WhatsApp:
Opção 1: Resposta empática focada em flexibilidade e benefício.
Opção 2: Resposta focada em custo do erro/qualidade e garantia.`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            systemInstruction,
            temperature: 0.7,
          });

          return jsonResponse(
            {
              success: true,
              text: result.text,
              model: result.model,
            },
            200,
            origin
          );
        } catch (err: any) {
          console.warn('Gemini contingência em contorno de objeção:', err?.message);
        }
      }

      const fallbackText = fallbackObjecao(orcamento, objecao, contexto, empresa);
      return jsonResponse(
        {
          success: true,
          text: fallbackText,
          model: 'fechazap-contingencia',
          contingency: true,
        },
        200,
        origin
      );
    }

    // 6. Follow-up
    if (pathname === '/api/ai/follow-up' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      if (!user.isAuthed || user.id === 'anon') {
        return jsonResponse(
          {
            success: false,
            error: 'Não autorizado. Faça login para utilizar a inteligência artificial do FechaZap.',
          },
          401,
          origin
        );
      }

      const quota = await consumeAtomicAiQuota(env, user.id, 'follow_up', 'gemini-3.8-flash');
      if (!quota.ok) {
        return jsonResponse(
          {
            success: false,
            error: quota.error || 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
          },
          503,
          origin
        );
      }
      if (!quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${quota.plano} (${quota.used}/${quota.limit}).`,
            quotaExceeded: true,
            quota,
          },
          429,
          origin
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamentoId, dias, empresa } = body;
      let orcamento = body.orcamento;

      if (orcamentoId) {
        const verifiedOrcamento = await fetchUserOrcamentoById(env, user.id, orcamentoId);
        if (verifiedOrcamento) {
          orcamento = verifiedOrcamento;
        } else {
          return jsonResponse(
            {
              success: false,
              error: 'Orçamento não encontrado ou não pertence à sua conta.',
            },
            404,
            origin
          );
        }
      }

      const prompt = `Gere uma mensagem de follow-up (acompanhamento de orçamento enviado) para WhatsApp.
O cliente ${orcamento?.clienteNome || orcamento?.cliente_nome || 'Cliente'} recebeu o orçamento de R$ ${Number(orcamento?.valorTotal || orcamento?.valor_total || 0).toFixed(2)} há ${dias || '2'} dias e não respondeu.
Serviços: ${Array.isArray(orcamento?.itens) ? orcamento.itens.map((i: any) => i.descricao).join(', ') : 'Serviços'}
Empresa: ${empresa?.nomeFantasia || 'Nossa Empresa'}

Requisitos:
- Extremamente educada, amigável e despretensiosa.
- Não parecer cobrança chata.
- Perguntar se ficou alguma dúvida sobre os itens ou se o formato de pagamento funcionou.
- Usar formatação WhatsApp (*negrito*, emojis).`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            temperature: 0.65,
          });

          return jsonResponse(
            {
              success: true,
              text: result.text,
              model: result.model,
            },
            200,
            origin
          );
        } catch (err: any) {
          console.warn('Gemini contingência em follow-up:', err?.message);
        }
      }

      const fallbackText = fallbackFollowUp(orcamento, dias, empresa);
      return jsonResponse(
        {
          success: true,
          text: fallbackText,
          model: 'fechazap-contingencia',
          contingency: true,
        },
        200,
        origin
      );
    }

    // 7. Chat Consultivo
    if (pathname === '/api/ai/chat' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      if (!user.isAuthed || user.id === 'anon') {
        return jsonResponse(
          {
            success: false,
            error: 'Não autorizado. Faça login para utilizar o chat consultivo com IA.',
          },
          401,
          origin
        );
      }

      const quota = await consumeAtomicAiQuota(env, user.id, 'chat', 'gemini-3.8-flash');
      if (!quota.ok) {
        return jsonResponse(
          {
            success: false,
            error: quota.error || 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
          },
          503,
          origin
        );
      }
      if (!quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${quota.plano} (${quota.used}/${quota.limit}).`,
            quotaExceeded: true,
            quota,
          },
          429,
          origin
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { message, context, history } = body;

      if (!message || typeof message !== 'string') {
        return jsonResponse({ success: false, error: 'Mensagem inválida ou ausente.' }, 400, origin);
      }

      const systemInstruction = `Você é o consultor de vendas inteligente do aplicativo FechaZap 3.1.5 rodando no Cloudflare Worker.
Você auxilia prestadores de serviços, autônomos e pequenos negócios a aumentar sua taxa de conversão de orçamentos pelo WhatsApp.
Você fornece conselhos táticos, scripts de WhatsApp prontos para copiar e colar, técnicas de precificação, ancoragem de valor e negociação.
Sempre responda em português brasileiro, de forma direta, prática e objetiva.`;

      let prompt = '';
      if (context) {
        prompt += `[CONTEXTO DO NEGÓCIO/ORÇAMENTO]:\n${JSON.stringify(context, null, 2)}\n\n`;
      }
      if (history && Array.isArray(history) && history.length > 0) {
        prompt += `[HISTÓRICO RECENTE]:\n${history.map((h: any) => `${h.role}: ${h.text}`).join('\n')}\n\n`;
      }
      prompt += `Pergunta/Solicitação do Usuário:\n${message}`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            systemInstruction,
            temperature: 0.7,
          });

          return jsonResponse(
            {
              success: true,
              text: result.text,
              model: result.model,
            },
            200,
            origin
          );
        } catch (err: any) {
          console.warn('Gemini contingência em chat:', err?.message);
        }
      }

      const fallbackText = fallbackChat(message);
      return jsonResponse(
        {
          success: true,
          text: fallbackText,
          model: 'fechazap-contingencia',
          contingency: true,
        },
        200,
        origin
      );
    }

    // 8. Copiloto IA: Diagnóstico de Vendas 100% Fundamentado no Banco de Dados
    // REGRA 9: O frontend não é autoridade para números financeiros; o Worker consulta o Supabase
    if (pathname === '/api/ai/diagnostico-vendas' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);

      if (!user.isAuthed || user.id === 'anon') {
        return jsonResponse(
          {
            success: false,
            error: 'Não autorizado. Faça login para acessar o diagnóstico inteligente de vendas.',
          },
          401,
          origin
        );
      }

      const quota = await consumeAtomicAiQuota(env, user.id, 'diagnostico_vendas', 'gemini-3.8-flash');
      if (!quota.ok) {
        return jsonResponse(
          {
            success: false,
            error: quota.error || 'Serviço de quota temporariamente indisponível. Tente novamente em instantes.',
          },
          503,
          origin
        );
      }
      if (!quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${quota.plano} (${quota.used}/${quota.limit}).`,
            quotaExceeded: true,
            quota,
          },
          429,
          origin
        );
      }

      // Consulta a verdade no Supabase
      const realSales = await fetchRealUserSalesContext(env, user.id);
      const relatorio = realSales || {
        totalOrcamentos: 0,
        aprovados: 0,
        pendentes: 0,
        recusados: 0,
        faturamentoAprovado: '0.00',
        ticketMedio: '0.00',
        taxaConversao: 0,
      };

      const prompt = `Analise os dados de vendas REAIS deste prestador de serviços no FechaZap (extraídos do banco de dados Supabase):
- Total de Orçamentos cadastrados: ${relatorio.totalOrcamentos}
- Orçamentos Aprovados: ${relatorio.aprovados}
- Orçamentos Pendentes/Enviados: ${relatorio.pendentes}
- Orçamentos Recusados: ${relatorio.recusados}
- Faturamento Aprovado: R$ ${relatorio.faturamentoAprovado}
- Ticket Médio: R$ ${relatorio.ticketMedio}
- Taxa de Conversão: ${relatorio.taxaConversao}%

Forneça um diagnóstico comercial de 3 a 4 tópicos com:
1. Ponto forte atual baseado nos números concretos.
2. Gargalo comercial identificado.
3. 2 ações práticas para executar hoje no WhatsApp para fechar mais orçamentos.
Use formato limpo com marcadores.`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            temperature: 0.6,
          });

          return jsonResponse(
            {
              success: true,
              text: result.text,
              model: result.model,
              dataSource: 'supabase_database_real',
            },
            200,
            origin
          );
        } catch (err: any) {
          console.warn('Gemini contingência em diagnóstico:', err?.message);
        }
      }

      const fallbackText = fallbackDiagnostico(relatorio);
      return jsonResponse(
        {
          success: true,
          text: fallbackText,
          model: 'fechazap-contingencia',
          contingency: true,
          dataSource: 'supabase_database_real',
        },
        200,
        origin
      );
    }

    // =========================================================================
    // WHATSAPP API (Meta Cloud API Server-side)
    // =========================================================================

    // 9. Envio via Meta WhatsApp Cloud API
    if (pathname === '/api/whatsapp/send' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const body: any = await request.json().catch(() => ({}));

      const result = await sendMetaWhatsAppMessage(
        env,
        user,
        {
          to: body.to,
          text: body.message || body.text,
          orcamentoId: body.orcamentoId,
        },
        clientIp
      );

      return jsonResponse(result, result.statusCode, origin);
    }

    if (pathname === '/api/whatsapp/status' && method === 'GET') {
      const configured = Boolean(env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID);
      return jsonResponse(
        {
          ok: configured,
          provider: 'meta',
          configured,
        },
        200,
        origin
      );
    }

    // 10. Rota não encontrada
    return jsonResponse({ error: 'Endpoint não encontrado no Worker FechaZap' }, 404, origin);
  },
};
