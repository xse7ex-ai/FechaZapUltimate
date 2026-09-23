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

// Helper to get GoogleGenAI instance
function getGeminiClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave da API Gemini não configurada. Defina a variável GEMINI_API_KEY no ambiente ou informe nas configurações.');
  }
  return new GoogleGenAI({ apiKey });
}

// Resilient caller with automatic fallback and retry
async function generateWithGemini(
  ai: GoogleGenAI,
  prompt: string,
  options: { systemInstruction?: string; temperature?: number } = {}
) {
  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of modelsToTry) {
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
        setTimeout(() => reject(new Error(`Timeout de espera no modelo ${model}`)), 6000)
      );

      const response: any = await Promise.race([callPromise, timeoutPromise]);
      if (response && response.text) {
        return { text: response.text.trim(), model };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Tentativa com ${model} retornou:`, err?.message);
    }
  }

  throw lastError || new Error('Falha ao comunicar com a API Google Gemini.');
}

// Check Gemini API Status
app.get('/api/ai/status', async (req: Request, res: Response) => {
  try {
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.json({
        configured: false,
        model: 'gemini-3.8-flash',
        message: 'GEMINI_API_KEY não encontrada no servidor.',
      });
    }

    const ai = getGeminiClient(customKey);
    const result = await generateWithGemini(ai, 'Diga apenas ONLINE', { temperature: 0.1 });

    return res.json({
      configured: true,
      model: result.model,
      status: 'active',
      sample: result.text || 'ONLINE',
      provider: 'Google Gemini'
    });
  } catch (error: any) {
    console.error('Erro ao testar Gemini API:', error);
    return res.json({
      configured: false,
      model: 'gemini-3.8-flash',
      error: error?.message || 'Erro ao conectar com a API Gemini',
    });
  }
});

// Fechamento de Orçamento com Gatilhos Persuasivos
app.post('/api/ai/fechar-orcamento', async (req: Request, res: Response) => {
  try {
    const { orcamento, gatilho, tom, empresa } = req.body;
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGeminiClient(customKey);

    const systemInstruction = `Você é o "FechaZap IA", o maior especialista do Brasil em fechamento de vendas e orçamentos pelo WhatsApp.
Sua missão é criar mensagens persuasivas, naturais, profissionais e envolventes em português brasileiro para prestadores de serviço e comércios enviarem aos seus clientes pelo WhatsApp.
REGRAS:
1. Use formatação do WhatsApp: use *negrito* para termos de destaque (valores, prazos, chamada para ação).
2. Use quebras de linha limpas e emojis de forma moderada e profissional.
3. Não pareça um robô ou spammer; pareça um profissional dedicado e confiável.
4. Inclua sempre um CTA (Call to Action / Chamada para ação) claro para fechar o pedido (ex: "Podemos fechar para garantir o início nesta semana?", "Me avisa se posso enviar a chave Pix para reservar?").
5. NUNCA mencione que você é uma inteligência artificial.`;

    const prompt = `Gere uma mensagem de fechamento para envio pelo WhatsApp com as seguintes informações:

CLIENTE: ${orcamento.clienteNome || 'Cliente'}
NÚMERO DO ORÇAMENTO: #${orcamento.numero || '001'}
SERVIÇOS / ITENS:
${orcamento.itens?.map((i: any) => `- ${i.descricao} (${i.quantidade}x) - R$ ${Number(i.total || i.valorUnitario).toFixed(2)}`).join('\n') || 'Conforme alinhado'}
VALOR TOTAL: R$ ${Number(orcamento.valorTotal || 0).toFixed(2)}
FORMA DE PAGAMENTO: ${orcamento.formaPagamento || 'A combinar'}
PRAZO: ${orcamento.prazoEntrega || 'A combinar'}
EMPRESA: ${empresa?.nomeFantasia || 'Nossa Empresa'}

GATILHO ESCOLHIDO: ${gatilho || 'Urgência e Escassez de agenda'}
TOM DE VOZ: ${tom || 'Profissional, caloroso e direto'}

Crie a mensagem pronta para envio no WhatsApp:`;

    const result = await generateWithGemini(ai, prompt, {
      systemInstruction,
      temperature: 0.7,
    });

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/fechar-orcamento:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha ao processar com Gemini',
    });
  }
});

// Contornador de Objeções (ex: "Tá caro", "Vou falar com sócio")
app.post('/api/ai/contornar-objecao', async (req: Request, res: Response) => {
  try {
    const { orcamento, objecao, contexto, empresa } = req.body;
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGeminiClient(customKey);

    const systemInstruction = `Você é o "FechaZap IA", especialista em negociação e quebra de objeções no WhatsApp.
O objetivo é reverter a hesitação do cliente com respeito, validação da preocupação dele, ancoragem de valor e proposta de avanço.
Use formatação de WhatsApp (*negrito*, emojis pontuais, parágrafos curtos).`;

    const prompt = `O cliente recebeu o orçamento e respondeu com a seguinte objeção:
"${objecao}"

DADOS DO ORÇAMENTO:
Cliente: ${orcamento.clienteNome || 'Cliente'}
Valor Total: R$ ${Number(orcamento.valorTotal || 0).toFixed(2)}
Itens: ${orcamento.itens?.map((i: any) => i.descricao).join(', ') || 'Serviços'}
Forma de Pagamento: ${orcamento.formaPagamento || 'Pix/Cartão'}
Contexto adicional: ${contexto || 'Nenhum'}
Empresa: ${empresa?.nomeFantasia || 'Nossa Empresa'}

Crie 2 opções de resposta curtas e persuasivas para enviar pelo WhatsApp:
Opção 1: Resposta empática focada em flexibilidade e benefício.
Opção 2: Resposta focada em custo do erro/qualidade e garantia.`;

    const result = await generateWithGemini(ai, prompt, {
      systemInstruction,
      temperature: 0.7,
    });

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/contornar-objecao:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha ao contornar objeção com Gemini',
    });
  }
});

// Follow-up inteligente após dias sem resposta
app.post('/api/ai/follow-up', async (req: Request, res: Response) => {
  try {
    const { orcamento, dias, empresa } = req.body;
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGeminiClient(customKey);

    const prompt = `Gere uma mensagem de follow-up (acompanhamento de orçamento enviado) para WhatsApp.
O cliente ${orcamento.clienteNome || 'Cliente'} recebeu o orçamento de R$ ${Number(orcamento.valorTotal || 0).toFixed(2)} há ${dias || '2'} dias e não respondeu.
Serviços: ${orcamento.itens?.map((i: any) => i.descricao).join(', ') || 'Serviços acordados'}
Empresa: ${empresa?.nomeFantasia || 'Nossa Empresa'}

Requisitos:
- Extremamente educada, amigável e despretensiosa.
- Não parecer cobrança chata.
- Perguntar se ficou alguma dúvida sobre os itens ou se o formato de pagamento funcionou.
- Usar formatação WhatsApp (*negrito*, emojis).`;

    const result = await generateWithGemini(ai, prompt, {
      temperature: 0.65,
    });

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/follow-up:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha no follow-up com Gemini',
    });
  }
});

// Chat interativo livre com Gemini focado em estratégias de vendas e negociação
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, context, history } = req.body;
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGeminiClient(customKey);

    const systemInstruction = `Você é o consultor de vendas inteligente do aplicativo FechaZap 3.1.2.
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

    const result = await generateWithGemini(ai, prompt, {
      systemInstruction,
      temperature: 0.7,
    });

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/chat:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha no chat com Gemini',
    });
  }
});

// Diagnóstico inteligente de Relatórios
app.post('/api/ai/diagnostico-vendas', async (req: Request, res: Response) => {
  try {
    const { relatorio } = req.body;
    const customKey = req.headers['x-gemini-key'] as string | undefined;
    const ai = getGeminiClient(customKey);

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

    const result = await generateWithGemini(ai, prompt, {
      temperature: 0.6,
    });

    return res.json({
      success: true,
      text: result.text,
      model: result.model,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/ai/diagnostico-vendas:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha no diagnóstico com Gemini',
    });
  }
});

// In development, mount Vite middleware. In production, serve dist.
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
    console.log(`🚀 FechaZap Server rodando em http://0.0.0.0:${PORT} com Google Gemini API`);
  });
}

startServer().catch((err) => {
  console.error('Erro ao iniciar servidor:', err);
});
