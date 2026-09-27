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
import { ModalIA } from './components/ModalIA';
import { ModalNovoOrcamento } from './components/ModalNovoOrcamento';
import { ModalDetalhes } from './components/ModalDetalhes';
import { ModalConfiguracoes } from './components/ModalConfiguracoes';
import { ModalPerfilUsuario } from './components/ModalPerfilUsuario';
import { TutorialModal } from './components/TutorialModal';
import { Toast, ToastMessage } from './components/Toast';
import { NotificationBanner } from './components/NotificationBanner';
import { checkGeminiStatus } from './utils/ai';
import { fetchServerUserProfileAndQuota } from './utils/supabase';
import { generateUUID } from './utils/uuid';
import {
  isCloudSyncEnabled,
  fetchCloudData,
  syncSaveOrcamento,
  syncDeleteOrcamento,
  syncSaveCliente,
  syncDeleteCliente,
  flushPendingSyncQueue,
} from './utils/sync';
import {
  getOrcamentosProximosValidade,
  dispararNotificacaoNativa,
  OrcamentoVencimentoInfo,
} from './utils/validadeNotifications';

export default function App() {
  // State with LocalStorage Persistence
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(() => {
    try {
      const saved = localStorage.getItem('fechazap_orcamentos_v3');
      if (saved) {
        const parsed: Orcamento[] = JSON.parse(saved);
        const missingInitial = INITIAL_ORCAMENTOS.filter(
          (init) => !parsed.some((p) => p.id === init.id)
        );
        if (missingInitial.length > 0) {
          return [...parsed, ...missingInitial];
        }
        return parsed;
      }
      return INITIAL_ORCAMENTOS;
    } catch {
      return INITIAL_ORCAMENTOS;
    }
  });

  const [clientes, setClientes] = useState<Cliente[]>(() => {
    try {
      const saved = localStorage.getItem('fechazap_clientes_v3');
      return saved ? JSON.parse(saved) : INITIAL_CLIENTES;
    } catch {
      return INITIAL_CLIENTES;
    }
  });

  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa>(() => {
    try {
      const saved = localStorage.getItem('fechazap_empresa_v3');
      return saved ? JSON.parse(saved) : INITIAL_EMPRESA_CONFIG;
    } catch {
      return INITIAL_EMPRESA_CONFIG;
    }
  });

  // Navigation & Modals
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isNovoOrcamentoOpen, setIsNovoOrcamentoOpen] = useState<boolean>(false);
  const [isDetalhesOpen, setIsDetalhesOpen] = useState<boolean>(false);
  const [isIAOpen, setIsIAOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [isPerfilOpen, setIsPerfilOpen] = useState<boolean>(false);
  const [userPlano, setUserPlano] = useState<TipoPlano>('GRATUITO');

  // Selected items
  const [selectedOrcamento, setSelectedOrcamento] = useState<Orcamento | null>(null);
  const [selectedOrcamentoIdForIA, setSelectedOrcamentoIdForIA] = useState<string>('');
  const [orcamentoToEdit, setOrcamentoToEdit] = useState<Orcamento | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [geminiOnline, setGeminiOnline] = useState<boolean>(true);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('fechazap_orcamentos_v3', JSON.stringify(orcamentos));
  }, [orcamentos]);

  useEffect(() => {
    localStorage.setItem('fechazap_clientes_v3', JSON.stringify(clientes));
  }, [clientes]);

  useEffect(() => {
    localStorage.setItem('fechazap_empresa_v3', JSON.stringify(empresa));
  }, [empresa]);

  const syncWithCloud = async (plano: TipoPlano) => {
    if (!isCloudSyncEnabled(plano)) return;
    try {
      // 1. Processa fila pendente offline se houver
      await flushPendingSyncQueue(plano);

      // 2. Busca dados atualizados da nuvem no Supabase
      const cloud = await fetchCloudData(plano);
      if (cloud) {
        if (cloud.orcamentos.length > 0 || cloud.clientes.length > 0) {
          // Servidor possui dados: mescla preservando criações locais offline
          setOrcamentos((prev) => {
            const cloudIds = new Set(cloud.orcamentos.map((c) => c.id));
            const localOnly = prev.filter((p) => !cloudIds.has(p.id));
            // Sincroniza em segundo plano os itens que existiam apenas localmente
            localOnly.forEach((o) => syncSaveOrcamento(o, plano));
            return [...cloud.orcamentos, ...localOnly];
          });

          setClientes((prev) => {
            const cloudIds = new Set(cloud.clientes.map((c) => c.id));
            const localOnly = prev.filter((p) => !cloudIds.has(p.id));
            localOnly.forEach((c) => syncSaveCliente(c, plano));
            return [...cloud.clientes, ...localOnly];
          });
        } else {
          // Servidor ainda vazio (primeiro acesso PRO/TURBO): sobe dados locais do usuário para a nuvem
          setOrcamentos((currentOrcamentos) => {
            currentOrcamentos.forEach((o) => syncSaveOrcamento(o, plano));
            return currentOrcamentos;
          });
          setClientes((currentClientes) => {
            currentClientes.forEach((c) => syncSaveCliente(c, plano));
            return currentClientes;
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar com nuvem:', err);
    }
  };

  const loadUserProfile = () => {
    fetchServerUserProfileAndQuota()
      .then((data) => {
        setUserPlano(data.user.plano);
        if (isCloudSyncEnabled(data.user.plano)) {
          syncWithCloud(data.user.plano);
        }
      })
      .catch(() => {
        setUserPlano('GRATUITO');
      });
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  // Listener para reprocessar fila quando a conexão cair e voltar
  useEffect(() => {
    const handleOnline = () => {
      if (isCloudSyncEnabled(userPlano)) {
        flushPendingSyncQueue(userPlano);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userPlano]);

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
      if (target && isCloudSyncEnabled(userPlano)) {
        syncSaveOrcamento(target, userPlano);
      }
      return updatedList;
    });
    if (selectedOrcamento && selectedOrcamento.id === orcamentoId) {
      setSelectedOrcamento((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  // Save quote handler
  const handleSaveOrcamento = (savedOrcamento: Orcamento, newCliente?: Cliente) => {
    const isEditing = orcamentos.some((o) => o.id === savedOrcamento.id);
    const mesAtual = new Date().toISOString().slice(0, 7);
    const orcamentosMes = orcamentos.filter(
      (o) => o.dataCriacao && o.dataCriacao.startsWith(mesAtual)
    );

    // REGRA DE NEGÓCIO: GRATUITO possui limite estrito de 5 orçamentos/mês (100% client-side)
    if (!isEditing && userPlano === 'GRATUITO' && orcamentosMes.length >= 5) {
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

    if (newCliente) {
      setClientes((prev) => [newCliente, ...prev]);
      if (isCloudSyncEnabled(userPlano)) {
        syncSaveCliente(newCliente, userPlano);
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
    if (isCloudSyncEnabled(userPlano)) {
      syncSaveOrcamento(savedOrcamento, userPlano);
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
    if (isCloudSyncEnabled(userPlano)) {
      syncDeleteOrcamento(orcamentoId, userPlano);
    }
    addToast('Orçamento Excluído', 'O orçamento foi removido.', 'info');
  };

  // Duplicate quote
  const handleDuplicateOrcamento = (orc: Orcamento) => {
    const nextNum = String(Number(orc.numero || 100) + 1);
    const duplicated: Orcamento = {
      ...orc,
      id: generateUUID(),
      numero: nextNum,
      status: 'pendente',
      dataCriacao: new Date().toISOString().split('T')[0],
    };
    setOrcamentos((prev) => [duplicated, ...prev]);
    if (isCloudSyncEnabled(userPlano)) {
      syncSaveOrcamento(duplicated, userPlano);
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
    if (isCloudSyncEnabled(userPlano)) {
      syncSaveCliente(cliente, userPlano);
    }
  };

  // Delete client
  const handleDeleteCliente = (clienteId: string) => {
    setClientes((prev) => prev.filter((c) => c.id !== clienteId));
    if (isCloudSyncEnabled(userPlano)) {
      syncDeleteCliente(clienteId, userPlano);
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
        userPlano={userPlano}
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
          userPlano={userPlano}
          pendentesCount={pendentesCount}
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
              userPlano={userPlano}
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
      />

      {/* Modals */}
      <ModalNovoOrcamento
        isOpen={isNovoOrcamentoOpen}
        onClose={() => setIsNovoOrcamentoOpen(false)}
        onSave={handleSaveOrcamento}
        clientes={clientes}
        orcamentoToEdit={orcamentoToEdit}
        nextNumero={nextNumero}
        userPlano={userPlano}
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
        userPlano={userPlano}
        onOpenPerfil={() => setIsPerfilOpen(true)}
      />

      <ModalIA
        isOpen={isIAOpen}
        onClose={() => setIsIAOpen(false)}
        orcamentos={orcamentos}
        selectedOrcamentoId={selectedOrcamentoIdForIA}
        empresa={empresa}
        onShowToast={addToast}
        userPlano={userPlano}
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
        userPlano={userPlano}
      />

      <ModalPerfilUsuario
        isOpen={isPerfilOpen}
        onClose={() => setIsPerfilOpen(false)}
        onShowToast={addToast}
        onPlanChanged={loadUserProfile}
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
