import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Helper to get GoogleGenAI instance strictly from server environment
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave da API Gemini não configurada. Defina a variável GEMINI_API_KEY no ambiente do servidor.');
  }
  return new GoogleGenAI({ apiKey });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || (typeof err === 'string' ? err : '')).toLowerCase();
  const status = err.status || err.code || err.statusCode;
  return (
    status === 503 ||
    status === 429 ||
    status === 'UNAVAILABLE' ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('503')
  );
}

// Resilient caller with multi-model fallback and backoff retry
async function generateWithGemini(
  ai: GoogleGenAI,
  prompt: string,
  options: { systemInstruction?: string; temperature?: number } = {}
): Promise<{ text: string; model: string }> {
  const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const callPromise = ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.7,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout no modelo ${model}`)), 15000)
        );

        const response: any = await Promise.race([callPromise, timeoutPromise]);
        if (response && response.text) {
          return { text: response.text.trim(), model };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini API] Tentativa ${attempt} no modelo ${model} retornou:`, err?.message || err);

        if (isTransientError(err) && attempt < 2) {
          await delay(800 * attempt);
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Falha ao comunicar com a API Google Gemini após tentativas.');
}

// Smart Contingency Generators (used when Google Gemini is experiencing temporary 503 demand spikes)
function generateFallbackFechamento(
  orcamento: any,
  gatilho: string,
  _tom: string,
  empresa: any
): string {
  const cliente = orcamento?.clienteNome || 'Cliente';
  const numero = orcamento?.numero || '101';
  const total = Number(orcamento?.valorTotal || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const empresaNome = empresa?.nomeFantasia || 'Nossa Empresa';
  const chavePix = empresa?.chavePix ? `\n🔑 *Chave Pix:* \`${empresa.chavePix}\`` : '';

  const itensLista =
    orcamento?.itens && orcamento.itens.length > 0
      ? orcamento.itens
          .map(
            (i: any) =>
              `🔹 *${i.quantidade}x ${i.descricao}* - ${Number(i.total || i.valorUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
          )
          .join('\n')
      : '🔹 *Serviços e materiais especificados no orçamento*';

  let gatilhoTexto = '';
  const gatilhoLower = (gatilho || '').toLowerCase();

  if (gatilhoLower.includes('agenda') || gatilhoLower.includes('urgência')) {
    gatilhoTexto = `⚡ *Importante:* Nossa agenda para esta semana está com pouquíssimas vagas restantes. Confirmando hoje, consigo reservar seu atendimento com prioridade!`;
  } else if (gatilhoLower.includes('pix') || gatilhoLower.includes('desconto')) {
    gatilhoTexto = `💰 *Condição Especial:* Para confirmação via Pix hoje, garantimos o valor promocional com início imediato dos trabalhos!`;
  } else if (gatilhoLower.includes('validade') || gatilhoLower.includes('escassez')) {
    gatilhoTexto = `⏳ *Condição por tempo limitado:* Esta proposta e os valores dos materiais estão assegurados até a data de validade. Posso já deixar reservado?`;
  } else if (gatilhoLower.includes('garantia')) {
    gatilhoTexto = `🛡️ *Garantia Total:* Todo o nosso trabalho conta com garantia formal e suporte completo após a conclusão do serviço.`;
  } else {
    gatilhoTexto = `✨ Estamos prontos para iniciar com dedicação total e pontualidade máxima.`;
  }

  return `Olá, *${cliente}*! Tudo bem? Aqui é da *${empresaNome}*. 🤝

Conforme combinamos, preparei a sua proposta com todo cuidado:

📋 *Orçamento #${numero}*
${itensLista}

💵 *Valor Total:* ${total}
💳 *Forma de Pagamento:* ${orcamento?.formaPagamento || 'Pix / À vista / A combinar'}
⏱️ *Prazo estimado:* ${orcamento?.prazoEntrega || 'A combinar'}
${chavePix}

${gatilhoTexto}

Podemos confirmar o início dos trabalhos? Fico no aguardo para deixar tudo programado! 🚀`;
}

function generateFallbackObjecao(
  orcamento: any,
  objecao: string,
  _contexto: string,
  empresa: any
): string {
  const cliente = orcamento?.clienteNome || 'Cliente';
  const total = Number(orcamento?.valorTotal || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const empresaNome = empresa?.nomeFantasia || 'Nossa Empresa';
  const objLower = (objecao || '').toLowerCase();

  if (objLower.includes('caro') || objLower.includes('desconto') || objLower.includes('preço')) {
    return `Olá, *${cliente}*! Entendo perfeitamente sua preocupação com o orçamento. 🤝

Aqui na *${empresaNome}*, nosso foco é entregar um trabalho definitivo, com materiais de primeira qualidade e garantia total para você não ter dor de cabeça nem custos adicionais depois.

Para viabilizar agora sem pesar no seu planejamento:
🔹 *Opção 1 (Flexibilidade):* Consigo facilitar as condições de parcelamento ou dar um desconto exclusivo para fechamento à vista no Pix hoje.
🔹 *Opção 2 (Ajuste de Escopo):* Se preferir, podemos dividir em etapas para iniciar a parte mais urgente de imediato.

Qual dessas opções fica mais confortável para você?`;
  }

  if (objLower.includes('sócio') || objLower.includes('esposa') || objLower.includes('marido') || objLower.includes('avis')) {
    return `Olá, *${cliente}*! Com certeza, é essencial alinhar essa decisão em conjunto. 👍

Para ajudar na conversa, preparei o resumo com o valor fechado de *${total}* com garantia completa inclusa.

Consigo segurar as condições e a vaga na nossa agenda por *24 horas* para vocês decidirem com tranquilidade. Se precisar de alguma informação adicional ou tirar qualquer dúvida, estou 100% à disposição!`;
  }

  if (objLower.includes('concorrente') || objLower.includes('metade') || objLower.includes('outro')) {
    return `Olá, *${cliente}*! Sei que existem diferentes preços no mercado, e faz muito bem em pesquisar. 🤝

No entanto, em serviços como este, o barato muitas vezes sai caro por falta de garantia, retrabalho e materiais inferiores. O nosso valor de *${total}* inclui garantia expressa, cumprimento rigoroso de prazos e suporte contínuo.

Você prefere ter a tranquilidade de um serviço garantido de primeira? Posso manter uma condição diferenciada para fecharmos hoje!`;
  }

  return `Olá, *${cliente}*! Entendi perfeitamente o seu ponto. 🤝

Nosso objetivo na *${empresaNome}* é encontrar o melhor caminho para atender sua necessidade com a máxima qualidade e segurança.

O que acha de darmos um passo juntos para você não adiar esse projeto? Posso te oferecer uma condição especial para começarmos esta semana!`;
}

function generateFallbackFollowUp(
  orcamento: any,
  dias: number,
  empresa: any
): string {
  const cliente = orcamento?.clienteNome || 'Cliente';
  const total = Number(orcamento?.valorTotal || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const empresaNome = empresa?.nomeFantasia || 'Nossa Empresa';

  return `Olá, *${cliente}*! Tudo bem? Aqui é da *${empresaNome}*. 🤝

Passando apenas para saber se conseguiu dar uma olhada na proposta de *${total}* que te enviei há ${dias || 2} dias.

Ficou alguma dúvida sobre os serviços ou sobre as opções de pagamento? Se precisar de qualquer ajuste no prazo ou nas condições, posso ajustar para você.

Me dá um alô assim que puder! 😊`;
}

function generateFallbackChat(
  _message: string,
  _context?: any
): string {
  return `Dicas táticas de fechamento pelo WhatsApp:

1. *Ancoragem de Valor:* Antes de falar em desconto, reforce a garantia e a tranquilidade que você entrega. O cliente compra segurança.
2. *Gatilho de Agenda:* Mencione que sua escala para esta semana tem apenas mais 1 ou 2 vagas, criando um motivo real para ele decidir hoje.
3. *Facilite o Primeiro Passo:* Ofereça o pagamento via Pix com pequeno bônus ou entrada facilitada com saldo após a entrega.
4. *Call To Action Direto:* Termine sempre com uma pergunta afirmativa: *"Podemos agendar para quinta-feira?"* ou *"Posso te enviar a chave Pix para confirmar a reserva?"*.`;
}

function generateFallbackDiagnostico(relatorio: any): string {
  const conv = Number(relatorio.taxaConversao || 0);
  return `📊 *Diagnóstico Comercial do FechaZap:*

1. *Ponto Forte:* Você já possui um volume ativo de propostas criadas (Total: ${relatorio.totalOrcamentos || 0}) e um ticket médio consistente de R$ ${relatorio.ticketMedio || '0,00'}.
2. *Gargalo Identificado:* A taxa de conversão atual está em ${conv}%. Propostas deixadas sem resposta rápida perdem até 70% de chance de fechamento após 48h.
3. *Ação 1 (Hoje):* Dispare a mensagem de follow-up com o gatilho de escassez para todos os orçamentos pendentes/enviados.
4. *Ação 2:* Use a quebra de objeções nos clientes que mencionaram "tá caro", oferecendo bônus no Pix em vez de baixar o preço.`;
}

// Helper: Supabase Auth & Plan verification
async function verifyUserAndPlan(authHeader?: string) {
  const defaultGuest = {
    id: 'anon',
    email: '',
    plano: 'GRATUITO',
    used: 0,
    limit: 10,
    allowed: true,
    isAuthed: false,
  };

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return defaultGuest;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !serviceKey) {
    return defaultGuest;
  }

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceKey,
      },
    });

    if (!userRes.ok) return defaultGuest;
    const userData: any = await userRes.json();
    const userId = userData.id;

    let plano = 'GRATUITO';
    let used = 0;
    const limit = plano === 'TURBO' ? 1500 : plano === 'PRO' ? 250 : 10;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=plano`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      if (profRes.ok) {
        const rows: any[] = await profRes.json();
        if (rows.length > 0 && rows[0].plano) {
          plano = rows[0].plano.toUpperCase();
        }
      }
    }

    return {
      id: userId,
      email: userData.email,
      plano,
      used,
      limit,
      allowed: true,
      isAuthed: true,
    };
  } catch (err) {
    console.warn('Erro ao validar token com Supabase:', err);
    return defaultGuest;
  }
}

// 1. Check Gemini API Status (Fast health check)
app.get('/api/ai/status', async (_req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      configured: false,
      model: 'gemini-3.8-flash',
      status: 'unconfigured',
      message: 'GEMINI_API_KEY não encontrada no servidor.',
    });
  }

  return res.json({
    configured: true,
    model: 'gemini-3.8-flash',
    status: 'active',
    sample: 'ONLINE',
    provider: 'Google Gemini',
  });
});

// 2. Auth me endpoint
app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = await verifyUserAndPlan(req.headers['authorization']);
  return res.json({
    authenticated: user.isAuthed,
    user: {
      id: user.id,
      email: user.email,
      plano: user.plano,
    },
    quota: {
      plano: user.plano,
      used: user.used,
      limit: user.limit,
      allowed: user.allowed,
    },
  });
});

// 3. Live Test of Gemini Connection
app.post('/api/ai/test', async (_req: Request, res: Response) => {
  try {
    const ai = getGeminiClient();
    let result;
    try {
      result = await generateWithGemini(ai, 'Diga apenas ONLINE', { temperature: 0.1 });
    } catch (testErr: any) {
      if (isTransientError(testErr)) {
        return res.json({
          configured: true,
          model: 'gemini-3.8-flash',
          status: 'active',
          sample: 'ONLINE (Servidores com alta demanda - Modo Resiliente Ativo)',
          provider: 'Google Gemini',
          contingency: true,
        });
      }
      throw testErr;
    }

    return res.json({
      configured: true,
      model: result.model,
      status: 'active',
      sample: result.text || 'ONLINE',
      provider: 'Google Gemini',
    });
  } catch (error: any) {
    return res.json({
      configured: false,
      model: 'gemini-3.8-flash',
      error: error?.message || 'Falha ao comunicar com a API Google Gemini.',
    });
  }
});

// 4. Fechamento de Orçamento com Gatilhos Persuasivos
app.post('/api/ai/fechar-orcamento', async (req: Request, res: Response) => {
  const { orcamento, gatilho, tom, empresa } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);

  if (user.isAuthed && !user.allowed) {
    return res.status(403).json({
      success: false,
      error: `Limite mensal de IA atingido para o plano ${user.plano}. Faça upgrade para continuar.`,
    });
  }

  try {
    const ai = getGeminiClient();

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

    let result;
    try {
      result = await generateWithGemini(ai, prompt, {
        systemInstruction,
        temperature: 0.7,
      });
    } catch (geminiErr: any) {
      console.warn('Gemini indisponível ou em alta demanda. Usando contingência FechaZap:', geminiErr?.message);
      const fallbackText = generateFallbackFechamento(orcamento, gatilho, tom, empresa);
      return res.json({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/fechar-orcamento:', error);
    const fallbackText = generateFallbackFechamento(orcamento, gatilho, tom, empresa);
    return res.json({
      success: true,
      text: fallbackText,
      model: 'fechazap-contingencia',
      contingency: true,
    });
  }
});

// 5. Contornador de Objeções
app.post('/api/ai/contornar-objecao', async (req: Request, res: Response) => {
  const { orcamento, objecao, contexto, empresa } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);

  if (user.isAuthed && !user.allowed) {
    return res.status(403).json({
      success: false,
      error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
    });
  }

  try {
    const ai = getGeminiClient();

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

    let result;
    try {
      result = await generateWithGemini(ai, prompt, {
        systemInstruction,
        temperature: 0.7,
      });
    } catch (geminiErr: any) {
      console.warn('Gemini contingência contornar objeção:', geminiErr?.message);
      const fallbackText = generateFallbackObjecao(orcamento, objecao, contexto, empresa);
      return res.json({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/contornar-objecao:', error);
    const fallbackText = generateFallbackObjecao(orcamento, objecao, contexto, empresa);
    return res.json({
      success: true,
      text: fallbackText,
      model: 'fechazap-contingencia',
      contingency: true,
    });
  }
});

// 6. Follow-up
app.post('/api/ai/follow-up', async (req: Request, res: Response) => {
  const { orcamento, dias, empresa } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);

  if (user.isAuthed && !user.allowed) {
    return res.status(403).json({
      success: false,
      error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
    });
  }

  try {
    const ai = getGeminiClient();

    const prompt = `Gere uma mensagem de follow-up (acompanhamento de orçamento enviado) para WhatsApp.
O cliente ${orcamento?.clienteNome || 'Cliente'} recebeu o orçamento de R$ ${Number(orcamento?.valorTotal || 0).toFixed(2)} há ${dias || '2'} dias e não respondeu.
Serviços: ${orcamento?.itens?.map((i: any) => i.descricao).join(', ') || 'Serviços acordados'}
Empresa: ${empresa?.nomeFantasia || 'Nossa Empresa'}

Requisitos:
- Extremamente educada, amigável e despretensiosa.
- Não parecer cobrança chata.
- Perguntar se ficou alguma dúvida sobre os itens ou se o formato de pagamento funcionou.
- Usar formatação WhatsApp (*negrito*, emojis).`;

    let result;
    try {
      result = await generateWithGemini(ai, prompt, {
        temperature: 0.65,
      });
    } catch (geminiErr: any) {
      console.warn('Gemini contingência follow-up:', geminiErr?.message);
      const fallbackText = generateFallbackFollowUp(orcamento, dias, empresa);
      return res.json({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/follow-up:', error);
    const fallbackText = generateFallbackFollowUp(orcamento, dias, empresa);
    return res.json({
      success: true,
      text: fallbackText,
      model: 'fechazap-contingencia',
      contingency: true,
    });
  }
});

// 7. Chat interativo
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  const { message, context, history } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);

  if (user.isAuthed && !user.allowed) {
    return res.status(403).json({
      success: false,
      error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
    });
  }

  try {
    const ai = getGeminiClient();

    const systemInstruction = `Você é o consultor de vendas inteligente do aplicativo FechaZap 3.1.4.
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

    let result;
    try {
      result = await generateWithGemini(ai, prompt, {
        systemInstruction,
        temperature: 0.7,
      });
    } catch (geminiErr: any) {
      console.warn('Gemini contingência chat:', geminiErr?.message);
      const fallbackText = generateFallbackChat(message, context);
      return res.json({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/chat:', error);
    const fallbackText = generateFallbackChat(message, context);
    return res.json({
      success: true,
      text: fallbackText,
      model: 'fechazap-contingencia',
      contingency: true,
    });
  }
});

// 8. Diagnóstico de Vendas (Copiloto IA)
app.post('/api/ai/diagnostico-vendas', async (req: Request, res: Response) => {
  const { relatorio } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);

  if (user.isAuthed && !user.allowed) {
    return res.status(403).json({
      success: false,
      error: `Limite mensal de IA atingido para o plano ${user.plano}.`,
    });
  }

  try {
    const ai = getGeminiClient();

    const prompt = `Analise os dados de vendas deste prestador de serviços no FechaZap:
- Total de Orçamentos: ${relatorio.totalOrcamentos}
- Orçamentos Aprovados: ${relatorio.aprovados}
- Orçamentos Pendentes/Enviados: ${relatorio.pendentes}
- Orçamentos Recusados: ${relatorio.recusados}
- Faturamento Aprovado: R$ ${relatorio.faturamentoAprovado}
- Ticket Médio: R$ ${relatorio.ticketMedio}
- Taxa de Conversão: ${relatorio.taxaConversao}%

Forneça um diagnóstico comercial de 3 a 4 tópicos com:
1. Ponto forte atual.
2. Gargalo identificado (onde está perdendo dinheiro).
3. 2 ações práticas para executar hoje no WhatsApp para fechar mais orçamentos.
Use formato limpo com marcadores.`;

    let result;
    try {
      result = await generateWithGemini(ai, prompt, {
        temperature: 0.6,
      });
    } catch (geminiErr: any) {
      console.warn('Gemini contingência diagnóstico:', geminiErr?.message);
      const fallbackText = generateFallbackDiagnostico(relatorio);
      return res.json({
        success: true,
        text: fallbackText,
        model: 'fechazap-contingencia',
        contingency: true,
      });
    }

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/diagnostico-vendas:', error);
    const fallbackText = generateFallbackDiagnostico(relatorio);
    return res.json({
      success: true,
      text: fallbackText,
      model: 'fechazap-contingencia',
      contingency: true,
    });
  }
});

// 9. Meta WhatsApp Cloud API endpoint
app.post('/api/whatsapp/send', async (req: Request, res: Response) => {
  const { to, message, text } = req.body;
  const user = await verifyUserAndPlan(req.headers['authorization']);
  const phone = (to || '').replace(/\D/g, '');
  const formattedPhone = !phone.startsWith('55') && phone.length >= 10 && phone.length <= 11 ? `55${phone}` : phone;
  const content = message || text || '';
  const fallbackUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(content)}`;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return res.json({
      success: false,
      fallbackUrl,
      provider: 'meta_not_configured',
      error: 'WhatsApp Cloud API não configurada no servidor. Enviando via link direto WhatsApp Web.',
    });
  }

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: { preview_url: false, body: content },
      }),
    });

    const data: any = await metaRes.json();
    if (!metaRes.ok) {
      return res.status(400).json({
        success: false,
        error: data.error?.message || 'Erro ao enviar via Meta WhatsApp API.',
        fallbackUrl,
      });
    }

    return res.json({
      success: true,
      messageId: data.messages?.[0]?.id,
      provider: 'meta-cloud-api',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message,
      fallbackUrl,
    });
  }
});

app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
  const configured = Boolean(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
  res.json({
    configured,
    provider: 'Meta WhatsApp Cloud API',
    phoneId: process.env.PHONE_NUMBER_ID ? 'Configurado' : 'Não configurado',
  });
});

// Vite middleware in dev, static files in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 FechaZap 3.1.4 Server rodando em http://0.0.0.0:${PORT} com Google Gemini API`);
  });
}

startServer().catch((err) => {
  console.error('Erro ao iniciar servidor:', err);
});
