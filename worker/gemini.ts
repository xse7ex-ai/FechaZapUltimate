// Cloudflare Worker - Módulo de Integração com Google Gemini API
// Executado exclusivamente no Edge/Worker sem expor chaves ao frontend

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(status: number, message: string): boolean {
  const msg = (message || '').toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timeout')
  );
}

export async function generateContentWithGemini(
  apiKey: string,
  prompt: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
  } = {}
): Promise<{ text: string; model: string }> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do Worker.');
  }

  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const contents: any[] = [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ];

        const payload: any = {
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
          },
        };

        if (options.systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: options.systemInstruction }],
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data: any = await res.json();
          const candidateText =
            data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (candidateText) {
            return {
              text: candidateText.trim(),
              model,
            };
          }
        }

        const errText = await res.text();
        const isTransient = isTransientError(res.status, errText);

        if (isTransient && attempt < 2) {
          await delay(600 * attempt);
          continue;
        }

        lastError = new Error(`Gemini ${model} HTTP ${res.status}: ${errText}`);
        break; // Tenta o próximo modelo
      } catch (networkErr: any) {
        lastError = networkErr;
        if (attempt < 2) {
          await delay(500);
          continue;
        }
        break;
      }
    }
  }

  throw lastError || new Error('Falha ao comunicar com Google Gemini API após tentativas.');
}

// Motores de Contingência Inteligente FechaZap (Fallback para alta demanda ou rede instável)
export function fallbackFechamento(
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
      : '🔹 *Serviços e materiais descritos na proposta*';

  let gatilhoTexto = '✨ Estamos prontos para iniciar com dedicação total e pontualidade máxima.';
  const gatilhoLower = (gatilho || '').toLowerCase();

  if (gatilhoLower.includes('agenda') || gatilhoLower.includes('urgência')) {
    gatilhoTexto = `⚡ *Importante:* Nossa agenda para esta semana está com pouquíssimas vagas restantes. Confirmando hoje, garanto sua prioridade!`;
  } else if (gatilhoLower.includes('pix') || gatilhoLower.includes('desconto')) {
    gatilhoTexto = `💰 *Condição Especial:* Para confirmação via Pix hoje, garantimos o valor promocional com início imediato!`;
  } else if (gatilhoLower.includes('validade') || gatilhoLower.includes('escassez')) {
    gatilhoTexto = `⏳ *Condição por tempo limitado:* Esta proposta e os valores dos materiais estão assegurados até a data de validade. Posso já deixar reservado?`;
  }

  return `Olá, *${cliente}*! Tudo bem? Aqui é da *${empresaNome}*. 🤝

Conforme conversamos, segue a sua proposta com condições especiais:

📋 *Orçamento #${numero}*
${itensLista}

💵 *Valor Total:* ${total}
💳 *Forma de Pagamento:* ${orcamento?.formaPagamento || 'A combinar'}
⏱️ *Prazo estimado:* ${orcamento?.prazoEntrega || 'A combinar'}${chavePix}

${gatilhoTexto}

Podemos confirmar o início dos trabalhos? Fico no aguardo para agendarmos! 🚀`;
}

export function fallbackObjecao(
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

Aqui na *${empresaNome}*, nosso foco é entregar um trabalho definitivo, com garantia total e sem surpresas.

Para facilitar sua decisão hoje:
🔹 *Opção 1:* Consigo uma condição facilitada no Pix ou parcelamento flexível.
🔹 *Opção 2:* Podemos iniciar pela etapa prioritária para não adiar o projeto.

Qual dessas alternativas funciona melhor para você?`;
  }

  if (objLower.includes('sócio') || objLower.includes('esposa') || objLower.includes('marido')) {
    return `Olá, *${cliente}*! Com certeza, é essencial alinhar essa decisão em conjunto. 👍

Para facilitar, garanto o valor de *${total}* e a vaga na nossa agenda por *24 horas*. Se precisarem tirar qualquer dúvida técnica, estou à disposição!`;
  }

  return `Olá, *${cliente}*! Entendi perfeitamente o seu ponto. 🤝
Nosso objetivo na *${empresaNome}* é garantir segurança e excelência para seu projeto.
O que acha de darmos esse passo juntos com uma condição especial para começarmos esta semana?`;
}

export function fallbackFollowUp(orcamento: any, dias: number, empresa: any): string {
  const cliente = orcamento?.clienteNome || 'Cliente';
  const total = Number(orcamento?.valorTotal || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const empresaNome = empresa?.nomeFantasia || 'Nossa Empresa';

  return `Olá, *${cliente}*! Tudo bem? Aqui é da *${empresaNome}*. 🤝

Passando apenas para saber se conseguiu dar uma olhada na proposta de *${total}* que te enviei há ${dias || 2} dias.

Ficou alguma dúvida sobre os serviços ou condições de pagamento? Posso ajustar para você se precisar.

Me dá um retorno assim que puder! 😊`;
}

export function fallbackChat(_message: string): string {
  return `Dicas táticas de fechamento pelo WhatsApp:

1. *Ancoragem de Valor:* Antes de falar de valores, destaque a segurança e a garantia que você entrega. O cliente compra tranquilidade.
2. *Gatilho de Agenda:* Mencione que sua escala para os próximos dias tem apenas mais 1 ou 2 vagas disponíveis.
3. *Facilite o Primeiro Passo:* Ofereça confirmação com Pix de entrada facilitada.
4. *Chamada para Ação Afirmativa:* Termine sempre com pergunta de avanço: *"Podemos confirmar para quinta-feira?"* ou *"Posso enviar a chave Pix para reservar a vaga?"*.`;
}

export function fallbackDiagnostico(relatorio: any): string {
  return `📊 *Diagnóstico Comercial do FechaZap:*

1. *Volume & Movimento:* Você possui um total de ${relatorio.totalOrcamentos || 0} propostas registradas e ticket médio de R$ ${relatorio.ticketMedio || '0,00'}.
2. *Gargalo de Conversão:* A taxa de conversão atual está em ${relatorio.taxaConversao || 0}%. Propostas que não recebem follow-up em até 48h perdem até 70% de chance de fechamento.
3. *Ação Imediata 1:* Envie a mensagem de follow-up com gatilho de escassez para todos os orçamentos pendentes.
4. *Ação Imediata 2:* Nos orçamentos com objeção de preço, ofereça bônus de agilidade no Pix sem desvalorizar seu serviço.`;
}
