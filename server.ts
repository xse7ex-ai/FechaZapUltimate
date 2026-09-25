// ==============================================================================
// FechaZap 3.1.5 - Servidor de Desenvolvimento e Preview Local (Node.js / Express)
//
// NOTA ARQUITETURAL:
// A implementação CANÔNICA de produção das rotas de backend (IA, WhatsApp, Auth, Quotas)
// reside em "worker/index.ts", projetada para o ecossistema Cloudflare Workers.
//
// Para garantir 100% de paridade entre o ambiente de desenvolvimento local e a
// produção Cloudflare (sem qualquer duplicação de lógica ou discrepância de regras),
// este servidor Express atua como um runtime adapter que despacha todas as rotas
// "/api/*" diretamente para o handler do Cloudflare Worker ("worker/index.ts").
// ==============================================================================

import express, { type Request as ExpressRequest, type Response as ExpressResponse } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import workerHandler from './worker/index';
import { Env } from './worker/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function getPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const val = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(val)) return val;
  }
  return Number(process.env.PORT) || 3000;
}

function getHost(): string {
  const hostArgIdx = process.argv.indexOf('--host');
  if (hostArgIdx !== -1 && process.argv[hostArgIdx + 1]) {
    return process.argv[hostArgIdx + 1];
  }
  return '0.0.0.0';
}

const PORT = getPort();
const HOST = getHost();

app.use(express.json());

// Constrói o contexto de variáveis de ambiente tipado do Worker a partir do process.env
function getWorkerEnv(): Env {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
    PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
    APP_ENV: process.env.NODE_ENV || 'development',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };
}

// Ponte Unificada: Encaminha todas as requisições /api/* diretamente para o Worker
app.all('/api/*', async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const fullUrl = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}${req.originalUrl}`;
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    let body: any = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
      body = JSON.stringify(req.body);
    }

    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers,
      body,
    });

    const env = getWorkerEnv();
    const workerResponse = await workerHandler.fetch(webRequest, env);

    res.status(workerResponse.status);
    workerResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const text = await workerResponse.text();
    res.send(text);
  } catch (err: any) {
    console.error('[Worker Adapter Error]:', err);
    res.status(500).json({
      error: 'Erro no processamento da API pelo Worker',
      message: err?.message,
    });
  }
});

// Inicialização do servidor Vite / Express
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false, // Desativa HMR WebSocket para evitar conflito de portas no container
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 FechaZap 3.1.5 Server rodando em http://${HOST}:${PORT} (Worker Adapter Ativo)`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar FechaZap Server:', err);
});
