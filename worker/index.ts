// Cloudflare Worker Principal - FechaZap 3.1.4
// Compatível com Cloudflare Workers e Cloudflare Pages Functions
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
  checkQuota,
  recordAiUsage,
  fetchRealUserSalesContext,
} from './supabase';
import { sendMetaWhatsAppMessage } from './whatsapp';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Trata CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Health check / Status da IA
    if (pathname === '/api/ai/status' && method === 'GET') {
      const hasKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
      return jsonResponse({
        configured: hasKey,
        model: 'gemini-3.8-flash',
        status: hasKey ? 'active' : 'unconfigured',
        provider: 'Google Gemini (@google/genai)',
        runtime: 'cloudflare-worker',
        message: hasKey
          ? 'Motor Google Gemini 3.8 ativo e protegido no Cloudflare Worker.'
          : 'GEMINI_API_KEY não configurada nas variáveis de ambiente do Worker.',
      });
    }

    // 3. Teste de Conexão com Gemini
    if (pathname === '/api/ai/test' && method === 'POST') {
      if (!env.GEMINI_API_KEY) {
        return jsonResponse(
          {
            configured: false,
            model: 'gemini-3.8-flash',
            error: 'GEMINI_API_KEY não configurada no servidor.',
          },
          400
        );
      }

      try {
        const res = await generateContentWithGemini(env.GEMINI_API_KEY, 'Responda apenas com a palavra: ONLINE', {
          temperature: 0.1,
        });
        return jsonResponse({
          configured: true,
          model: res.model,
          status: 'active',
          sample: res.text,
          provider: 'Google Gemini',
        });
      } catch (err: any) {
        return jsonResponse({
          configured: true,
          model: 'gemini-3.8-flash',
          status: 'contingency',
          sample: 'ONLINE (Modo Resiliente / Alta demanda)',
          provider: 'Google Gemini',
          contingency: true,
          error: err?.message,
        });
      }
    }

    // 4. Perfil e Quota do Usuário Autenticado
    if (pathname === '/api/auth/me' && method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      return jsonResponse({
        authenticated: user.isAuthed,
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          plano: user.plano,
        },
        quota,
      });
    }

    // 5. Fechamento de Orçamento com Gatilhos
    if (pathname === '/api/ai/fechar-orcamento' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      if (user.isAuthed && !quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${user.plano} (${quota.used}/${quota.limit}). Faça upgrade para PRO ou TURBO para continuar.`,
            quotaExceeded: true,
          },
          403
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamento, gatilho, tom, empresa } = body;

      const systemInstruction = `Você é o "FechaZap IA", o maior especialista do Brasil em fechamento de vendas e orçamentos pelo WhatsApp.
Sua missão é criar mensagens persuasivas, naturais, profissionais e envolventes em português brasileiro para prestadores de serviço e comércios enviarem aos seus clientes pelo WhatsApp.
REGRAS:
1. Use formatação do WhatsApp: use *negrito* para termos de destaque (valores, prazos, chamada para ação).
2. Use quebras de linha limpas e emojis de forma moderada e profissional.
3. Não pareça um robô ou spammer; pareça um profissional dedicado e confiável.
4. Inclua sempre um CTA (Call to Action / Chamada para ação) claro para fechar o pedido (ex: "Podemos fechar para garantir o início nesta semana?", "Me avisa se posso enviar a chave Pix para reservar?").
5. NUNCA mencione que você é uma inteligência artificial.`;

      const prompt = `Gere uma mensagem de fechamento para envio pelo WhatsApp com as seguintes informações:

CLIENTE: ${orcamento?.clienteNome || 'Cliente'}
NÚMERO DO ORÇAMENTO: #${orcamento?.numero || '001'}
SERVIÇOS / ITENS:
${orcamento?.itens?.map((i: any) => `- ${i.descricao} (${i.quantidade}x) - R$ ${Number(i.total || i.valorUnitario).toFixed(2)}`).join('\n') || 'Conforme alinhado'}
VALOR TOTAL: R$ ${Number(orcamento?.valorTotal || 0).toFixed(2)}
FORMA DE PAGAMENTO: ${orcamento?.formaPagamento || 'A combinar'}
PRAZO: ${orcamento?.prazoEntrega || 'A combinar'}
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

          await recordAiUsage(env, user.id, 'fechar_orcamento', result.model);

          return jsonResponse({
            success: true,
            text: result.text,
            model: result.model,
          });
        } catch (err: any) {
          console.warn('Gemini indisponível, ativando contingência FechaZap:', err?.message);
        }
      }

      // Contingência resiliente
      const fallbackText = fallbackFechamento(orcamento, gatilho, tom, empresa);
      return jsonResponse({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    // 6. Contorno de Objeções
    if (pathname === '/api/ai/contornar-objecao' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      if (user.isAuthed && !quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${user.plano} (${quota.used}/${quota.limit}). Faça upgrade para continuar.`,
            quotaExceeded: true,
          },
          403
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamento, objecao, contexto, empresa } = body;

      const systemInstruction = `Você é o "FechaZap IA", especialista em negociação e quebra de objeções no WhatsApp.
O objetivo é reverter a hesitação do cliente com respeito, validação da preocupação dele, ancoragem de valor e proposta de avanço.
Use formatação de WhatsApp (*negrito*, emojis pontuais, parágrafos curtos).`;

      const prompt = `O cliente recebeu o orçamento e respondeu com a seguinte objeção:
"${objecao}"

DADOS DO ORÇAMENTO:
Cliente: ${orcamento?.clienteNome || 'Cliente'}
Valor Total: R$ ${Number(orcamento?.valorTotal || 0).toFixed(2)}
Itens: ${orcamento?.itens?.map((i: any) => i.descricao).join(', ') || 'Serviços'}
Forma de Pagamento: ${orcamento?.formaPagamento || 'Pix/Cartão'}
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

          await recordAiUsage(env, user.id, 'contornar_objecao', result.model);

          return jsonResponse({
            success: true,
            text: result.text,
            model: result.model,
          });
        } catch (err: any) {
          console.warn('Gemini contingência em contornar objeção:', err?.message);
        }
      }

      const fallbackText = fallbackObjecao(orcamento, objecao, contexto, empresa);
      return jsonResponse({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    // 7. Follow-up
    if (pathname === '/api/ai/follow-up' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      if (user.isAuthed && !quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
            quotaExceeded: true,
          },
          403
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { orcamento, dias, empresa } = body;

      const prompt = `Gere uma mensagem de follow-up (acompanhamento de orçamento enviado) para WhatsApp.
O cliente ${orcamento?.clienteNome || 'Cliente'} recebeu o orçamento de R$ ${Number(orcamento?.valorTotal || 0).toFixed(2)} há ${dias || '2'} dias e não respondeu.
Serviços: ${orcamento?.itens?.map((i: any) => i.descricao).join(', ') || 'Serviços acordados'}
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

          await recordAiUsage(env, user.id, 'follow_up', result.model);

          return jsonResponse({
            success: true,
            text: result.text,
            model: result.model,
          });
        } catch (err: any) {
          console.warn('Gemini contingência em follow-up:', err?.message);
        }
      }

      const fallbackText = fallbackFollowUp(orcamento, dias, empresa);
      return jsonResponse({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    // 8. Chat Consultivo
    if (pathname === '/api/ai/chat' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      if (user.isAuthed && !quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
            quotaExceeded: true,
          },
          403
        );
      }

      const body: any = await request.json().catch(() => ({}));
      const { message, context, history } = body;

      const systemInstruction = `Você é o consultor de vendas inteligente do aplicativo FechaZap 3.1.4 rodando no Cloudflare Worker.
Você auxilia prestadores de serviços, autônomos e pequenos negócios a aumentar sua taxa de conversão de orçamentos pelo WhatsApp.
Você fornece conselhos táticos, scripts de WhatsApp prontos para copiar e colar, técnicas de precificação, ancoragem de valor e negociação.
Sempre responda em português brasileiro, de forma direta, prática e objetiva.`;

      let prompt = '';
      if (context) {
        prompt += `[CONTEXTO ATUAL DO ORÇAMENTO/NEGÓCIO]:\n${JSON.stringify(context, null, 2)}\n\n`;
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

          await recordAiUsage(env, user.id, 'chat', result.model);

          return jsonResponse({
            success: true,
            text: result.text,
            model: result.model,
          });
        } catch (err: any) {
          console.warn('Gemini contingência em chat:', err?.message);
        }
      }

      const fallbackText = fallbackChat(message);
      return jsonResponse({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    // 9. Copiloto IA: Diagnóstico de Vendas Baseado no Banco Supabase
    if (pathname === '/api/ai/diagnostico-vendas' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const quota = checkQuota(user);

      if (user.isAuthed && !quota.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
            quotaExceeded: true,
          },
          403
        );
      }

      const body: any = await request.json().catch(() => ({}));
      let relatorio = body.relatorio || {};
      let dadosBancados = false;

      // Se usuário autenticado no Supabase, consulta os orçamentos reais no banco!
      if (user.isAuthed) {
        const realSales = await fetchRealUserSalesContext(env, user.id);
        if (realSales) {
          relatorio = realSales;
          dadosBancados = true;
        }
      }

      const prompt = `Analise os dados de vendas deste prestador de serviços no FechaZap:
- Origem dos dados: ${dadosBancados ? 'Banco de Dados Supabase (Autenticado)' : 'Payload Local (Demonstração)'}
- Total de Orçamentos: ${relatorio.totalOrcamentos || 0}
- Orçamentos Aprovados: ${relatorio.aprovados || 0}
- Orçamentos Pendentes/Enviados: ${relatorio.pendentes || 0}
- Orçamentos Recusados: ${relatorio.recusados || 0}
- Faturamento Aprovado: R$ ${relatorio.faturamentoAprovado || '0,00'}
- Ticket Médio: R$ ${relatorio.ticketMedio || '0,00'}
- Taxa de Conversão: ${relatorio.taxaConversao || 0}%

Forneça um diagnóstico comercial de 3 a 4 tópicos com:
1. Ponto forte atual baseado nos números.
2. Gargalo identificado (onde está perdendo dinheiro).
3. 2 ações práticas para executar hoje no WhatsApp para fechar mais orçamentos.
Use formato limpo com marcadores.`;

      if (env.GEMINI_API_KEY) {
        try {
          const result = await generateContentWithGemini(env.GEMINI_API_KEY, prompt, {
            temperature: 0.6,
          });

          await recordAiUsage(env, user.id, 'diagnostico_vendas', result.model);

          return jsonResponse({
            success: true,
            text: result.text,
            model: result.model,
            dataSource: dadosBancados ? 'supabase_real' : 'client_local',
          });
        } catch (err: any) {
          console.warn('Gemini contingência em diagnóstico:', err?.message);
        }
      }

      const fallbackText = fallbackDiagnostico(relatorio);
      return jsonResponse({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
        dataSource: dadosBancados ? 'supabase_real' : 'client_local',
      });
    }

    // 10. WhatsApp API Server-side (Meta Cloud API)
    if (pathname === '/api/whatsapp/send' && method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const user = await validateUserFromToken(env, authHeader);
      const body: any = await request.json().catch(() => ({}));

      const result = await sendMetaWhatsAppMessage(env, user, {
        to: body.to,
        text: body.message || body.text,
        orcamentoId: body.orcamentoId,
      });

      return jsonResponse(result, result.success ? 200 : 400);
    }

    if (pathname === '/api/whatsapp/status' && method === 'GET') {
      const configured = Boolean(env.WHATSAPP_TOKEN && env.PHONE_NUMBER_ID);
      return jsonResponse({
        configured,
        provider: 'Meta WhatsApp Cloud API',
        phoneId: env.PHONE_NUMBER_ID ? 'Configurado' : 'Não configurado',
      });
    }

    // 11. Rota não encontrada
    return jsonResponse({ error: 'Endpoint não encontrado no Worker FechaZap' }, 404);
  },
};
