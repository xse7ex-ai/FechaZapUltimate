// ==============================================================================
// Fecha CRM - Registro e Ciclo de Vida do Service Worker
// Registra o Service Worker oficial /sw.js e gerencia detecção de atualizações
// ==============================================================================

export interface SWRegistrationCallbacks {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: unknown) => void;
}

export function registerServiceWorker(callbacks?: SWRegistrationCallbacks): void {
  // Executa apenas em ambiente de navegador com suporte a Service Worker
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Em navegadores modernos, aguarda o carregamento completo da página
  // para evitar impactar as métricas de performance (LCP/FCP)
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[Fecha CRM PWA] Service Worker registrado com sucesso:', registration.scope);
        callbacks?.onSuccess?.(registration);

        // Detecta novas versões disponíveis publicadas no servidor
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // Conteúdo novo disponível para atualização
                console.log('[Fecha CRM PWA] Nova versão do Fecha CRM disponível.');
                callbacks?.onUpdate?.(registration);
              } else {
                // Conteúdo inicial pré-armazenado em cache para uso offline
                console.log('[Fecha CRM PWA] Conteúdo pronto para uso offline.');
              }
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[Fecha CRM PWA] Falha no registro do Service Worker:', error);
        callbacks?.onError?.(error);
      });

    // Recarrega suavemente se o controlador mudar após skipWaiting
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        // Opcional: window.location.reload();
      }
    });
  });
}

/**
 * Envia mensagem para o Service Worker ativo aplicar a atualização imediatamente
 */
export function skipWaitingAndReload(): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
}
