// ==============================================================================
// Fecha CRM - Progressive Web App (PWA) Service Worker
// Versão do Cache do Shell: fechacrm-shell-v1
// Estratégia:
//   - HTML de Navegação: Network-First com fallback para o Shell offline
//   - Assets Estáticos (JS/CSS/Imagens/Ícones): Stale-While-Revalidate
//   - APIs e Supabase: EXCLUSIVAMENTE Rede (ZERO cache de dados privados ou tokens)
// ==============================================================================

const CACHE_NAME = 'fechacrm-shell-v1';

// Recursos mínimos necessários para carregar o shell da aplicação offline
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// 1. Instalação: Pré-cache dos ativos estruturais do shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Fecha CRM SW] Pré-cache do shell da aplicação iniciado.');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Fecha CRM SW] Aviso no pré-cache inicial (ignorado em dev):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Ativação: Limpeza de caches obsoletos e controle imediato de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[Fecha CRM SW] Removendo cache obsoleto:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Interceptação de Requisições com Proteção Estrita de Dados Privados
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // REGRA DE SEGURANÇA 1: Apenas métodos GET são avaliados para cache
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // REGRA DE SEGURANÇA 2: NUNCA interceptar ou cachear requisições para o Supabase,
  // APIs REST, autenticação, Edge Functions ou serviços externos com dados sensíveis
  const isSupabaseRequest =
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/functions/v1/');

  if (isSupabaseRequest) {
    // Passagem direta para a rede sem tocar CacheStorage
    return;
  }

  // REGRA DE SEGURANÇA 3: NUNCA cachear requisições que carreguem header Authorization
  if (request.headers.has('Authorization')) {
    return;
  }

  // Cenário A: Navegação (documentos HTML da SPA)
  // Estratégia: Network-First com fallback para o shell cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Quando estiver sem conexão, serve o shell index.html em cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          return (await caches.match('/index.html')) || (await caches.match('/'));
        })
    );
    return;
  }

  // Cenário B: Assets Estáticos locais da aplicação (Vite JS, CSS, Fontes, Ícones)
  // Estratégia: Stale-While-Revalidate (resposta rápida + atualização em background)
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.woff'));

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Para qualquer outra requisição, tenta a rede e fallback no cache se disponível
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(request).catch(() => {
          // Se for imagem e falhar offline, retorna resposta vazia
          if (request.headers.get('accept')?.includes('image/')) {
            return new Response('', { status: 408, headers: { 'Content-Type': 'image/svg+xml' } });
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
      );
    })
  );
});

// 4. Mensagens para forçar atualização do Service Worker quando necessário
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
