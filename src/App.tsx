/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Orcamento,
  Cliente,
  ConfiguracaoEmpresa,
  ActiveTab,
  StatusOrcamento,
  TipoPlano,
  MensagemWhatsApp,
} from './types';
import {
  INITIAL_ORCAMENTOS,
  INITIAL_CLIENTES,
  INITIAL_EMPRESA_CONFIG,
} from './data/initialData';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { OrcamentosView } from './components/OrcamentosView';
import { ClientesView } from './components/ClientesView';
import { RelatoriosView } from './components/RelatoriosView';
import { MensagensView } from './components/MensagensView';
import { ModalIA } from './components/ModalIA';
import { ModalNovoOrcamento } from './components/ModalNovoOrcamento';
import { ModalDetalhes } from './components/ModalDetalhes';
import { ModalConfiguracoes } from './components/ModalConfiguracoes';
import { ModalPerfilUsuario } from './components/ModalPerfilUsuario';
import { TutorialModal } from './components/TutorialModal';
import { Toast, ToastMessage } from './components/Toast';
import { NotificationBanner } from './components/NotificationBanner';
import { checkGeminiStatus } from './utils/ai';
import {
  fetchServerUserProfileAndQuota,
  fetchMensagensWhatsApp,
  markMensagemAsRead,
  checkAndConsumeGratuitoQuota,
} from './utils/supabase';
import { generateUUID } from './utils/uuid';
import {
  isCloudSyncEnabled,
  fetchCloudData,
  syncSaveOrcamento,
  syncDeleteOrcamento,
  syncSaveCliente,
  syncDeleteCliente,
  flushPendingSyncQueue,
  getSyncQueue,
} from './utils/sync';
import {
  loadUserOrcamentos,
  saveUserOrcamentos,
  loadUserClientes,
  saveUserClientes,
  loadUserEmpresa,
  saveUserEmpresa,
  loadUserMensagens,
  saveUserMensagens,
  checkLegacyData,
  migrateLegacyDataToUser,
  dismissLegacyData,
  resetDemoData,
} from './utils/storage';
import {
  getOrcamentosProximosValidade,
  dispararNotificacaoNativa,
  OrcamentoVencimentoInfo,
} from './utils/validadeNotifications';
import { getCachedUserId } from './utils/supabase';

export default function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getCachedUserId());
  const [userPlano, setUserPlano] = useState<TipoPlano>('GRATUITO');

  // Modo Demonstração (dados fictícios de exemplo isolados, plano simulado GRATUITO)
  const [modoDemonstracao, setModoDemonstracao] = useState<boolean>(false);

  // Contexto ativo para armazenamento e permissões
  const effectiveUserId = modoDemonstracao ? null : currentUserId;
  const effectivePlano: TipoPlano = modoDemonstracao ? 'GRATUITO' : userPlano;

  // State with LocalStorage Persistence isolada por namespace de usuário
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(() =>
    loadUserOrcamentos(getCachedUserId())
  );

  const [clientes, setClientes] = useState<Cliente[]>(() =>
    loadUserClientes(getCachedUserId())
  );

  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa>(() =>
    loadUserEmpresa(getCachedUserId())
  );

  // Navigation & Modals
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isNovoOrcamentoOpen, setIsNovoOrcamentoOpen] = useState<boolean>(false);
  const [isDetalhesOpen, setIsDetalhesOpen] = useState<boolean>(false);
  const [isIAOpen, setIsIAOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [isPerfilOpen, setIsPerfilOpen] = useState<boolean>(false);

  // Alterna Modo Demonstração recarregando imediatamente os dados de contexto
  const toggleModoDemonstracao = () => {
    const nextMode = !modoDemonstracao;
    setModoDemonstracao(nextMode);

    const targetId = nextMode ? null : currentUserId;
    const targetPlano = nextMode ? 'GRATUITO' : userPlano;

    // Recarrega imediatamente os dados correspondentes ao novo contexto
    const newOrcamentos = loadUserOrcamentos(targetId);
    const newClientes = loadUserClientes(targetId);
    const newEmpresa = loadUserEmpresa(targetId);
    const newMensagens = nextMode ? [] : loadUserMensagens(targetId);

    setOrcamentos(newOrcamentos);
    setClientes(newClientes);
    setEmpresa(newEmpresa);
    setMensagens(newMensagens);

    setSelectedOrcamento(null);
    setOrcamentoToEdit(null);

    if (!nextMode && targetId && isCloudSyncEnabled(targetPlano)) {
      syncWithCloud(targetPlano, targetId);
    }

    addToast(
      nextMode ? 'Modo Demonstração Ativado' : 'Retornado à Conta Real',
      nextMode
        ? 'Você está no modo de demonstração com dados de exemplo. Nenhuma alteração afetará sua conta.'
        : 'Seus dados e plano reais foram restaurados com sucesso.',
      'info'
    );
  };

  // Restaura dados originais de exemplo para quem bagunçou o modo demonstração
  const handleRestaurarExemploOriginal = () => {
    resetDemoData();
    setOrcamentos(loadUserOrcamentos(null));
    setClientes(loadUserClientes(null));
    setEmpresa(loadUserEmpresa(null));
    setMensagens([]);
    setSelectedOrcamento(null);
    setOrcamentoToEdit(null);
    addToast(
      'Exemplo restaurado!',
      'Os dados originais de demonstração foram restaurados com sucesso.',
      'success'
    );
  };

  // WhatsApp Inbound Messages isolada no namespace da conta
  const [mensagens, setMensagens] = useState<MensagemWhatsApp[]>(() =>
    loadUserMensagens(getCachedUserId())
  );

  // Detecção e migração controlada de dados legados
  const [legacyNotice, setLegacyNotice] = useState<{
    show: boolean;
    orcamentosCount: number;
    clientesCount: number;
  }>({ show: false, orcamentosCount: 0, clientesCount: 0 });

  useEffect(() => {
    const legacy = checkLegacyData();
    if (legacy.hasLegacy) {
      setLegacyNotice({
        show: true,
        orcamentosCount: legacy.orcamentosCount,
        clientesCount: legacy.clientesCount,
      });
    }
  }, []);

  const handleMigrateLegacy = () => {
    const res = migrateLegacyDataToUser(effectiveUserId);
    if (res.success) {
      setOrcamentos(loadUserOrcamentos(effectiveUserId));
      setClientes(loadUserClientes(effectiveUserId));
      setEmpresa(loadUserEmpresa(effectiveUserId));
      addToast(
        'Dados importados!',
        `${res.migratedOrcamentos} orçamentos e ${res.migratedClientes} clientes foram importados com sucesso para esta conta.`,
        'success'
      );
    }
    setLegacyNotice({ show: false, orcamentosCount: 0, clientesCount: 0 });
  };

  const handleDismissLegacy = () => {
    dismissLegacyData();
    setLegacyNotice({ show: false, orcamentosCount: 0, clientesCount: 0 });
    addToast('Aviso ignorado', 'Os dados de versões anteriores foram descartados deste dispositivo.', 'info');
  };

  const unreadMensagensCount = useMemo(() => {
    if (effectivePlano !== 'TURBO') return 0;
    return mensagens.filter((m) => !m.lida).length;
  }, [mensagens, effectivePlano]);

  const loadMensagens = async (targetUserId?: string | null) => {
    const activeId = targetUserId !== undefined ? targetUserId : effectiveUserId;
    if (effectivePlano === 'TURBO' && activeId) {
      try {
        const msgs = await fetchMensagensWhatsApp(activeId);
        setMensagens(msgs);
      } catch (err) {
        console.warn('Erro ao carregar mensagens:', err);
      }
    }
  };

  const handleMarkMensagemAsRead = async (id: string) => {
    setMensagens((prev) =>
      prev.map((m) => (m.id === id ? { ...m, lida: true } : m))
    );
    await markMensagemAsRead(id, effectiveUserId);
  };

  // Selected items
  const [selectedOrcamento, setSelectedOrcamento] = useState<Orcamento | null>(null);
  const [selectedOrcamentoIdForIA, setSelectedOrcamentoIdForIA] = useState<string>('');
  const [orcamentoToEdit, setOrcamentoToEdit] = useState<Orcamento | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [geminiOnline, setGeminiOnline] = useState<boolean>(true);

  // Gravações estritamente no namespace do usuário ativo (ou anônimo se modo demonstração)
  useEffect(() => {
    saveUserOrcamentos(effectiveUserId, orcamentos);
  }, [orcamentos, effectiveUserId]);

  useEffect(() => {
    saveUserClientes(effectiveUserId, clientes);
  }, [clientes, effectiveUserId]);

  useEffect(() => {
    saveUserEmpresa(effectiveUserId, empresa);
  }, [empresa, effectiveUserId]);

  useEffect(() => {
    saveUserMensagens(effectiveUserId, mensagens);
  }, [mensagens, effectiveUserId]);

  const syncWithCloud = async (plano: TipoPlano, targetUserId?: string | null) => {
    if (modoDemonstracao || !isCloudSyncEnabled(plano)) return;
    const targetEffectiveId = targetUserId || effectiveUserId;
    if (!targetEffectiveId) return; // Não sincroniza dados anônimos

    try {
      // 1. Processa fila pendente offline do próprio usuário
      await flushPendingSyncQueue(plano, targetEffectiveId);

      // 2. Busca dados atualizados da nuvem no Supabase
      const cloud = await fetchCloudData(plano);
      if (cloud) {
        if (cloud.orcamentos.length > 0 || cloud.clientes.length > 0) {
          // Servidor possui dados: mescla preservando criações locais offline pertencentes a este usuário
          setOrcamentos((prev) => {
            const queue = getSyncQueue(targetEffectiveId);
            const pendingDeleteIds = new Set(
              queue.filter((q) => q.type === 'delete_orcamento').map((q) => q.id)
            );
            const pendingSaveIds = new Set(
              queue.filter((q) => q.type === 'save_orcamento').map((q) => q.id)
            );

            // 1. Processa itens vindos da nuvem
            const resolvedCloud: Orcamento[] = [];
            for (const cloudItem of cloud.orcamentos) {
              if (pendingDeleteIds.has(cloudItem.id)) {
                // Exclusão pendente na fila: excluir mesmo que ainda exista na nuvem
                continue;
              }
              if (pendingSaveIds.has(cloudItem.id)) {
                // Edição pendente na fila: usar a versão local (de prev)
                const localItem = prev.find((p) => p.id === cloudItem.id);
                resolvedCloud.push(localItem || cloudItem);
              } else {
                // Sem pendência: nuvem é a fonte de verdade
                resolvedCloud.push(cloudItem);
              }
            }

            // 2. Itens que só existem localmente (em prev)
            const cloudIds = new Set(cloud.orcamentos.map((c) => c.id));
            const localOnly = prev.filter(
              (p) => !cloudIds.has(p.id) && !pendingDeleteIds.has(p.id)
            );
            localOnly.forEach((o) => syncSaveOrcamento(o, plano, targetEffectiveId));

            const merged = [...resolvedCloud, ...localOnly];
            saveUserOrcamentos(targetEffectiveId, merged);
            return merged;
          });

          setClientes((prev) => {
            const queue = getSyncQueue(targetEffectiveId);
            const pendingDeleteIds = new Set(
              queue.filter((q) => q.type === 'delete_cliente').map((q) => q.id)
            );
            const pendingSaveIds = new Set(
              queue.filter((q) => q.type === 'save_cliente').map((q) => q.id)
            );

            // 1. Processa itens vindos da nuvem
            const resolvedCloud: Cliente[] = [];
            for (const cloudItem of cloud.clientes) {
              if (pendingDeleteIds.has(cloudItem.id)) {
                // Exclusão pendente na fila: excluir mesmo que ainda exista na nuvem
                continue;
              }
              if (pendingSaveIds.has(cloudItem.id)) {
                // Edição pendente na fila: usar a versão local (de prev)
                const localItem = prev.find((p) => p.id === cloudItem.id);
                resolvedCloud.push(localItem || cloudItem);
              } else {
                // Sem pendência: nuvem é a fonte de verdade
                resolvedCloud.push(cloudItem);
              }
            }

            // 2. Itens que só existem localmente (em prev)
            const cloudIds = new Set(cloud.clientes.map((c) => c.id));
            const localOnly = prev.filter(
              (p) => !cloudIds.has(p.id) && !pendingDeleteIds.has(p.id)
            );
            localOnly.forEach((c) => syncSaveCliente(c, plano, targetEffectiveId));

            const merged = [...resolvedCloud, ...localOnly];
            saveUserClientes(targetEffectiveId, merged);
            return merged;
          });
        } else {
          // Nuvem vazia: sobe dados do namespace deste usuário
          const userLocalOrcamentos = loadUserOrcamentos(targetEffectiveId);
          const userLocalClientes = loadUserClientes(targetEffectiveId);
          userLocalOrcamentos.forEach((o) => syncSaveOrcamento(o, plano, targetEffectiveId));
          userLocalClientes.forEach((c) => syncSaveCliente(c, plano, targetEffectiveId));
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar com nuvem:', err);
    }
  };

  const loadUserProfile = async () => {
    try {
      const data = await fetchServerUserProfileAndQuota();
      const newUserId = data.authenticated && data.user ? data.user.id : null;
      setCurrentUserId(newUserId);
      setUserPlano(data.user.plano);

      // Se estiver em modo demonstração, mantém os dados de demonstração isolados na tela
      if (!modoDemonstracao) {
        const userOrcamentos = loadUserOrcamentos(newUserId);
        const userClientes = loadUserClientes(newUserId);
        const userEmpresa = loadUserEmpresa(newUserId);
        const userMensagens = loadUserMensagens(newUserId);

        setOrcamentos(userOrcamentos);
        setClientes(userClientes);
        setEmpresa(userEmpresa);
        setMensagens(userMensagens);

        setSelectedOrcamento(null);
        setOrcamentoToEdit(null);

        if (isCloudSyncEnabled(data.user.plano) && newUserId) {
          await syncWithCloud(data.user.plano, newUserId);
        }
        if (data.user.plano === 'TURBO' && newUserId) {
          fetchMensagensWhatsApp(newUserId).then(setMensagens).catch(() => {});
        }
      }
    } catch {
      // Visitante ou logout
      setCurrentUserId(null);
      setUserPlano('GRATUITO');
      if (!modoDemonstracao) {
        setOrcamentos(loadUserOrcamentos(null));
        setClientes(loadUserClientes(null));
        setEmpresa(loadUserEmpresa(null));
        setMensagens([]);
        setSelectedOrcamento(null);
        setOrcamentoToEdit(null);
      }
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  // Polling de mensagens recebidas para plano TURBO (bloqueado em modo demonstração)
  useEffect(() => {
    if (effectivePlano === 'TURBO' && effectiveUserId) {
      loadMensagens();
      const interval = setInterval(loadMensagens, 20000);
      return () => clearInterval(interval);
    }
  }, [effectivePlano, effectiveUserId]);

  // Listener para reprocessar fila quando a conexão cair e voltar
  useEffect(() => {
    const handleOnline = () => {
      if (!modoDemonstracao && isCloudSyncEnabled(effectivePlano)) {
        flushPendingSyncQueue(effectivePlano, effectiveUserId);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [modoDemonstracao, effectivePlano, effectiveUserId]);

  // Initial check of Gemini API Health (Server-side/Worker)
  useEffect(() => {
    checkGeminiStatus()
      .then((res) => {
        setGeminiOnline(res.configured);
      })
      .catch(() => {
        setGeminiOnline(false);
      });
  }, []);

  // Exibe tutorial automaticamente no primeiro acesso da empresa/usuário
  useEffect(() => {
    try {
      const hasSeenTutorial = localStorage.getItem('fechazap_has_seen_tutorial_v1');
      if (!hasSeenTutorial) {
        const timer = setTimeout(() => {
          setIsTutorialOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  // Identifica orçamentos próximos do vencimento (<= 3 dias)
  const vencimentos = useMemo(
    () => getOrcamentosProximosValidade(orcamentos, 3),
    [orcamentos]
  );

  const addToast = (
    title: string,
    description?: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info',
    action?: { label: string; onClick: () => void }
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastMessage = { id, title, description, type, action };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sistema de Notificação Local: Alerta quando orçamentos estiverem próximos da data de validade
  useEffect(() => {
    if (vencimentos.length === 0) return;

    const sessionAlertKey = 'fechazap_alert_validade_alerted';
    const alreadyAlerted = sessionStorage.getItem(sessionAlertKey);

    const maisUrgente = vencimentos[0];

    // Dispara alerta na inicialização da sessão
    if (!alreadyAlerted) {
      sessionStorage.setItem(sessionAlertKey, 'true');

      // Toast local de aviso com ação rápida
      const timer = setTimeout(() => {
        addToast(
          '⚠️ Alerta de Validade!',
          `Orçamento #${maisUrgente.orcamento.numero} de ${maisUrgente.orcamento.clienteNome} ${maisUrgente.textoVencimento.toLowerCase()}. Feche agora antes que expire!`,
          'warning',
          {
            label: '⚡ Fechar com IA',
            onClick: () => handleOpenIAForOrcamento(maisUrgente.orcamento.id),
          }
        );
      }, 1000);

      // Notificação nativa do sistema operacional (se ativada pelo usuário)
      dispararNotificacaoNativa(
        '⚡ FechaZap: Orçamento Próximo do Vencimento!',
        `Orçamento #${maisUrgente.orcamento.numero} (${maisUrgente.orcamento.clienteNome}) ${maisUrgente.textoVencimento.toLowerCase()}. Clique para enviar mensagem persuasiva.`,
        () => {
          handleOpenIAForOrcamento(maisUrgente.orcamento.id);
        }
      );

      return () => clearTimeout(timer);
    }
  }, [vencimentos]);

  // Status Updater
  const handleUpdateStatus = (orcamentoId: string, newStatus: StatusOrcamento) => {
    setOrcamentos((prev) => {
      const updatedList = prev.map((o) => (o.id === orcamentoId ? { ...o, status: newStatus } : o));
      const target = updatedList.find((o) => o.id === orcamentoId);
      if (target && isCloudSyncEnabled(effectivePlano)) {
        syncSaveOrcamento(target, effectivePlano, effectiveUserId);
      }
      return updatedList;
    });
    if (selectedOrcamento && selectedOrcamento.id === orcamentoId) {
      setSelectedOrcamento((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Save quote handler
  const handleSaveOrcamento = async (savedOrcamento: Orcamento, newCliente?: Cliente) => {
    const isEditing = orcamentos.some((o) => o.id === savedOrcamento.id);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const orcamentosMes = orcamentos.filter(
      (o) => o.dataCriacao && o.dataCriacao.startsWith(mesAtual)
    );

    // REGRA DE NEGÓCIO: GRATUITO possui limite estrito de 5 orçamentos/mês (filtro rápido de UX)
    if (!isEditing && effectivePlano === 'GRATUITO' && orcamentosMes.length >= 5) {
      addToast(
        'Limite de Orçamentos Atingido',
        'O plano GRATUITO permite até 5 orçamentos manuais por mês. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados e sincronizar na nuvem.',
        'error',
        {
          label: 'Ver Planos',
          onClick: () => setIsPerfilOpen(true),
        }
      );
      setIsPerfilOpen(true);
      return;
    }

    // Validação real de quota no servidor para plano GRATUITO (apenas na criação com usuário autenticado fora do modo demonstração)
    if (!isEditing && effectivePlano === 'GRATUITO' && effectiveUserId) {
      const quotaCheck = await checkAndConsumeGratuitoQuota();
      if (!quotaCheck.success) {
        if (quotaCheck.quotaExceeded) {
          addToast(
            'Limite de Orçamentos Atingido',
            quotaCheck.errorMessage ||
              'O plano GRATUITO permite até 5 orçamentos manuais por mês. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados e sincronizar na nuvem.',
            'error',
            {
              label: 'Ver Planos',
              onClick: () => setIsPerfilOpen(true),
            }
          );
          setIsPerfilOpen(true);
        } else {
          addToast(
            'Conexão Necessária',
            quotaCheck.errorMessage ||
              'Conecte-se à internet para validar sua cota mensal no plano GRATUITO. Seus orçamentos já salvos permanecem seguros.',
            'warning'
          );
        }
        return;
      }
    }

    if (newCliente) {
      setClientes((prev) => [newCliente, ...prev]);
      if (isCloudSyncEnabled(effectivePlano)) {
        syncSaveCliente(newCliente, effectivePlano, effectiveUserId);
      }
    }

    setOrcamentos((prev) => {
      const exists = prev.some((o) => o.id === savedOrcamento.id);
      if (exists) {
        return prev.map((o) => (o.id === savedOrcamento.id ? savedOrcamento : o));
      }
      return [savedOrcamento, ...prev];
    });

    // Gravação na nuvem Supabase (PRO e TURBO)
    if (isCloudSyncEnabled(effectivePlano)) {
      syncSaveOrcamento(savedOrcamento, effectivePlano, effectiveUserId).then((res) => {
        if (!res.success && res.errorCode === 'QUOTA_EXCEEDED') {
          addToast(
            'Limite de Orçamentos Atingido',
            res.errorMessage ||
              'Você atingiu o limite de 5 orçamentos deste mês. Faça upgrade para continuar criando novos orçamentos.',
            'error',
            {
              label: 'Ver Planos',
              onClick: () => setIsPerfilOpen(true),
            }
          );
          setIsPerfilOpen(true);
        }
      });
    }

    addToast(
      'Orçamento Salvo!',
      `Orçamento #${savedOrcamento.numero} gravado com sucesso.`,
      'success'
    );
  };

  // Delete quote
  const handleDeleteOrcamento = (orcamentoId: string) => {
    setOrcamentos((prev) => prev.filter((o) => o.id !== orcamentoId));
    if (isCloudSyncEnabled(effectivePlano)) {
      syncDeleteOrcamento(orcamentoId, effectivePlano, effectiveUserId);
    }
    addToast('Orçamento Excluído', 'O orçamento foi removido.', 'info');
  };

  // Duplicate quote
  const handleDuplicateOrcamento = async (orc: Orcamento) => {
    const mesAtual = new Date().toISOString().slice(0, 7);
    const orcamentosMes = orcamentos.filter(
      (o) => o.dataCriacao && o.dataCriacao.startsWith(mesAtual)
    );

    // Validação preventiva rápida de quota para duplicação no plano GRATUITO (filtro de UX)
    if (effectivePlano === 'GRATUITO' && orcamentosMes.length >= 5) {
      addToast(
        'Limite de Orçamentos Atingido',
        'O plano GRATUITO permite até 5 orçamentos manuais por mês. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados e sincronizar na nuvem.',
        'error',
        {
          label: 'Ver Planos',
          onClick: () => setIsPerfilOpen(true),
        }
      );
      setIsPerfilOpen(true);
      return;
    }

    // Validação real de quota no servidor para plano GRATUITO (usuário autenticado fora do modo demonstração)
    if (effectivePlano === 'GRATUITO' && effectiveUserId) {
      const quotaCheck = await checkAndConsumeGratuitoQuota();
      if (!quotaCheck.success) {
        if (quotaCheck.quotaExceeded) {
          addToast(
            'Limite de Orçamentos Atingido',
            quotaCheck.errorMessage ||
              'O plano GRATUITO permite até 5 orçamentos manuais por mês. Faça upgrade para PRO ou TURBO para criar orçamentos ilimitados e sincronizar na nuvem.',
            'error',
            {
              label: 'Ver Planos',
              onClick: () => setIsPerfilOpen(true),
            }
          );
          setIsPerfilOpen(true);
        } else {
          addToast(
            'Conexão Necessária',
            quotaCheck.errorMessage ||
              'Conecte-se à internet para validar sua cota mensal no plano GRATUITO. Seus orçamentos já salvos permanecem seguros.',
            'warning'
          );
        }
        return;
      }
    }

    const nextNum = String(Number(orc.numero || 100) + 1);
    const duplicated: Orcamento = {
      ...orc,
      id: generateUUID(),
      numero: nextNum,
      status: 'pendente',
      dataCriacao: new Date().toISOString().split('T')[0],
    };
    setOrcamentos((prev) => [duplicated, ...prev]);
    if (isCloudSyncEnabled(effectivePlano)) {
      syncSaveOrcamento(duplicated, effectivePlano, effectiveUserId).then((res) => {
        if (!res.success && res.errorCode === 'QUOTA_EXCEEDED') {
          addToast(
            'Limite de Orçamentos Atingido',
            res.errorMessage ||
              'Você atingiu o limite de 5 orçamentos deste mês. Faça upgrade para continuar criando novos orçamentos.',
            'error',
            {
              label: 'Ver Planos',
              onClick: () => setIsPerfilOpen(true),
            }
          );
          setIsPerfilOpen(true);
        }
      });
    }
    addToast(
      'Orçamento Duplicado!',
      `Criada a cópia #${duplicated.numero} pronta para edição.`,
      'success'
    );
  };

  // Save client
  const handleSaveCliente = (cliente: Cliente) => {
    setClientes((prev) => {
      const exists = prev.some((c) => c.id === cliente.id);
      if (exists) {
        return prev.map((c) => (c.id === cliente.id ? cliente : c));
      }
      return [cliente, ...prev];
    });
    if (isCloudSyncEnabled(effectivePlano)) {
      syncSaveCliente(cliente, effectivePlano, effectiveUserId);
    }
  };

  // Delete client
  const handleDeleteCliente = (clienteId: string) => {
    setClientes((prev) => prev.filter((c) => c.id !== clienteId));
    if (isCloudSyncEnabled(effectivePlano)) {
      syncDeleteCliente(clienteId, effectivePlano, effectiveUserId);
    }
    addToast('Cliente Excluído', 'O cadastro do cliente foi removido.', 'info');
  };

  // Open IA modal pre-configured for a quote
  const handleOpenIAForOrcamento = (orcamentoId: string) => {
    setSelectedOrcamentoIdForIA(orcamentoId);
    setIsIAOpen(true);
  };

  // View details modal
  const handleViewOrcamento = (orc: Orcamento) => {
    setSelectedOrcamento(orc);
    setIsDetalhesOpen(true);
  };

  // Edit quote
  const handleEditOrcamento = (orc: Orcamento) => {
    setOrcamentoToEdit(orc);
    setIsNovoOrcamentoOpen(true);
  };

  // New quote button
  const handleOpenNovoOrcamento = () => {
    setOrcamentoToEdit(null);
    setIsNovoOrcamentoOpen(true);
  };

  const pendentesCount = orcamentos.filter(
    (o) => o.status === 'pendente' || o.status === 'enviado'
  ).length;

  const nextNumero = String(
    orcamentos.reduce((max, o) => Math.max(max, Number(o.numero) || 100), 100) + 1
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white transition-colors duration-200">
      {/* Banner Fixo de Modo Demonstração */}
      {modoDemonstracao && (
        <aside
          aria-label="Aviso de Modo Demonstração"
          className="sticky top-0 z-50 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-slate-950 px-4 py-2.5 shadow-md border-b border-amber-600/80"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded font-black text-[10px] tracking-wider uppercase bg-slate-950 text-amber-300 shrink-0">
                MODO DEMONSTRAÇÃO
              </span>
              <span className="font-semibold text-slate-950">
                Dados de exemplo, nada aqui é real. Suas alterações não afetam sua conta.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRestaurarExemploOriginal}
                className="px-2.5 py-1 rounded-md bg-amber-400/40 hover:bg-amber-400/60 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer border border-amber-400/50"
              >
                Restaurar exemplo original
              </button>
              <button
                type="button"
                onClick={toggleModoDemonstracao}
                className="px-3 py-1 rounded-md bg-slate-950 hover:bg-slate-900 text-white font-bold text-[11px] transition-colors cursor-pointer shadow-xs"
              >
                Sair da demonstração
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Top Header */}
      <Topbar
        empresa={empresa}
        onOpenNovoOrcamento={handleOpenNovoOrcamento}
        onOpenIA={() => {
          setSelectedOrcamentoIdForIA(vencimentos[0]?.orcamento.id || orcamentos[0]?.id || '');
          setIsIAOpen(true);
        }}
        onOpenConfig={() => setIsConfigOpen(true)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onOpenPerfil={() => setIsPerfilOpen(true)}
        userPlano={effectivePlano}
        geminiOnline={geminiOnline}
        vencimentos={vencimentos}
        onOpenIAForOrcamento={handleOpenIAForOrcamento}
        onViewOrcamento={handleViewOrcamento}
        onShowToast={addToast}
      />

      {/* Local Notification Banner for Quotes Expiring Soon */}
      <NotificationBanner
        vencimentos={vencimentos}
        onOpenIAForOrcamento={handleOpenIAForOrcamento}
        onVerOrcamentos={() => setActiveTab('orcamentos')}
      />

      {/* Banner de Migração Explícita de Dados Legados (se detectados de versões anteriores) */}
      {legacyNotice.show && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Versão anterior detectada:</span>
              <span>
                Encontramos {legacyNotice.orcamentosCount} orçamentos e {legacyNotice.clientesCount} clientes gravados localmente em versão anterior. Deseja importá-los para sua conta atual?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleMigrateLegacy}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
              >
                Importar para esta conta
              </button>
              <button
                onClick={handleDismissLegacy}
                className="px-3 py-1 bg-transparent hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs rounded-lg transition"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'ia') {
              setSelectedOrcamentoIdForIA(orcamentos[0]?.id || '');
              setIsIAOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          onOpenConfig={() => setIsConfigOpen(true)}
          onOpenTutorial={() => setIsTutorialOpen(true)}
          onOpenPerfil={() => setIsPerfilOpen(true)}
          userPlano={effectivePlano}
          pendentesCount={pendentesCount}
          unreadMensagensCount={unreadMensagensCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              orcamentos={orcamentos}
              clientes={clientes}
              empresa={empresa}
              onOpenNovoOrcamento={handleOpenNovoOrcamento}
              onOpenIAForOrcamento={handleOpenIAForOrcamento}
              onViewOrcamento={handleViewOrcamento}
              onUpdateStatus={handleUpdateStatus}
              onShowToast={addToast}
              onOpenTutorial={() => setIsTutorialOpen(true)}
              userPlano={effectivePlano}
              onOpenPerfil={() => setIsPerfilOpen(true)}
            />
          )}

          {activeTab === 'orcamentos' && (
            <OrcamentosView
              orcamentos={orcamentos}
              empresa={empresa}
              onOpenNovoOrcamento={handleOpenNovoOrcamento}
              onEditOrcamento={handleEditOrcamento}
              onViewOrcamento={handleViewOrcamento}
              onDeleteOrcamento={handleDeleteOrcamento}
              onDuplicateOrcamento={handleDuplicateOrcamento}
              onOpenIAForOrcamento={handleOpenIAForOrcamento}
              onUpdateStatus={handleUpdateStatus}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'mensagens' && (
            <MensagensView
              mensagens={mensagens}
              onMarkAsRead={handleMarkMensagemAsRead}
              onRefresh={loadMensagens}
              userPlano={effectivePlano}
              onOpenPerfil={() => setIsPerfilOpen(true)}
              orcamentos={orcamentos}
              onViewOrcamento={handleViewOrcamento}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesView
              clientes={clientes}
              orcamentos={orcamentos}
              onSaveCliente={handleSaveCliente}
              onDeleteCliente={handleDeleteCliente}
              onNovoOrcamentoParaCliente={(clienteId) => {
                setOrcamentoToEdit(null);
                setIsNovoOrcamentoOpen(true);
              }}
              onShowToast={addToast}
            />
          )}

          {activeTab === 'relatorios' && (
            <RelatoriosView
              orcamentos={orcamentos}
              empresa={empresa}
              onShowToast={addToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'ia') {
            setSelectedOrcamentoIdForIA(orcamentos[0]?.id || '');
            setIsIAOpen(true);
          } else {
            setActiveTab(tab);
          }
        }}
        pendentesCount={pendentesCount}
        userPlano={effectivePlano}
        unreadMensagensCount={unreadMensagensCount}
      />

      {/* Modals */}
      <ModalNovoOrcamento
        isOpen={isNovoOrcamentoOpen}
        onClose={() => setIsNovoOrcamentoOpen(false)}
        onSave={handleSaveOrcamento}
        clientes={clientes}
        orcamentoToEdit={orcamentoToEdit}
        nextNumero={nextNumero}
        userPlano={effectivePlano}
        onShowToast={addToast}
        onOpenPerfil={() => setIsPerfilOpen(true)}
      />

      <ModalDetalhes
        isOpen={isDetalhesOpen}
        onClose={() => setIsDetalhesOpen(false)}
        orcamento={selectedOrcamento}
        empresa={empresa}
        onOpenIAForOrcamento={handleOpenIAForOrcamento}
        onUpdateStatus={handleUpdateStatus}
        onShowToast={addToast}
        userPlano={effectivePlano}
        onOpenPerfil={() => setIsPerfilOpen(true)}
      />

      <ModalIA
        isOpen={isIAOpen}
        onClose={() => setIsIAOpen(false)}
        orcamentos={orcamentos}
        selectedOrcamentoId={selectedOrcamentoIdForIA}
        empresa={empresa}
        onShowToast={addToast}
        userPlano={effectivePlano}
        onOpenPerfil={() => setIsPerfilOpen(true)}
      />

      <ModalConfiguracoes
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        empresa={empresa}
        onSave={(newEmpresa) => setEmpresa(newEmpresa)}
        onShowToast={addToast}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onOpenPerfil={() => setIsPerfilOpen(true)}
        userPlano={effectivePlano}
      />

      <ModalPerfilUsuario
        isOpen={isPerfilOpen}
        onClose={() => setIsPerfilOpen(false)}
        onShowToast={addToast}
        onPlanChanged={loadUserProfile}
        modoDemonstracao={modoDemonstracao}
        onToggleModoDemonstracao={toggleModoDemonstracao}
        onRestaurarExemploOriginal={handleRestaurarExemploOriginal}
      />

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onOpenIA={() => {
          setSelectedOrcamentoIdForIA(orcamentos[0]?.id || '');
          setIsIAOpen(true);
        }}
      />

      {/* Toast Notifications Container */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
