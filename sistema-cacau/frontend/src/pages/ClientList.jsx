import React, { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Download,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  AlertTriangle,
  RotateCcw,
  XCircle,
  ArrowRightLeft,
} from 'lucide-react';

import Layout from '../components/Layout';
import ClientForm from '../components/ClientForm';
import GeneralDashboard from '../components/GeneralDashboard';
import { formatCurrency } from '../utils/formatters';
import styles from './ClientList.module.css';
import { api, API_BASE_URL } from '../api';

const LAST_BACKUP_KEY = 'last_backup_timestamp';

const headerButtonStyle = {
  padding: '10px 14px',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
};

const cardStyle = {
  background: '#fff',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
  border: '1px solid #e2e8f0',
};

const helperCardStyle = {
  ...cardStyle,
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
};

const searchInputStyle = {
  padding: '10px 12px 10px 38px',
  width: '100%',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  outline: 'none',
  background: '#fff',
};

const typeBadgeBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
};

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeTipoCadastro = (value) => {
  const text = String(value || '').trim().toLowerCase();

  if (
    text.includes('industria') ||
    text.includes('indústria') ||
    text.includes('comprador') ||
    text.includes('compradora') ||
    text.includes('cliente')
  ) {
    return 'INDUSTRIA';
  }

  return 'FORNECEDOR';
};

const mergeClient = (oldClient, incoming) => {
  const id = incoming.id || incoming._id || oldClient.id || oldClient._id;

  return {
    ...oldClient,
    ...incoming,
    id,
    _id: incoming._id || oldClient._id || id,
  };
};

const getScreenConfig = (screen) => {
  if (screen === 'trade') {
    return {
      title: 'Compra e Venda',
      subtitle:
        'Cadastre o Cliente para quem você vende e acompanhe essas contas separadamente dos produtores/fornecedores.',
      emptyTitle: 'Nenhum comprador / indústria cadastrado',
      emptyText:
        'Assim que você cadastrar compradores ou indústrias, eles aparecerão aqui nessa área comercial.',
      newLabel: 'Novo Cadastro',
      defaultType: 'INDUSTRIA',
      filterType: 'INDUSTRIA',
      badgeLabel: 'Comprador / Indústria',
      badgeStyle: {
        ...typeBadgeBaseStyle,
        color: '#7c3aed',
        background: '#f3e8ff',
      },
    };
  }

  return {
    title: 'Cadastro de Produtores',
    subtitle:
      'Cadastre produtores e fornecedores que entregam cacau.',
    emptyTitle: 'Nenhum produtor cadastrado',
    emptyText:
      'Assim que você cadastrar produtores e fornecedores.',
    newLabel: 'Novo Cadastro',
    defaultType: 'FORNECEDOR',
    filterType: 'FORNECEDOR',
    badgeLabel: 'Produtor / Fornecedor',
    badgeStyle: {
      ...typeBadgeBaseStyle,
      color: '#166534',
      background: '#dcfce7',
    },
  };
};

const shouldIncludeClient = (client, screen) => {
  const tipo = normalizeTipoCadastro(client?.tipo_cadastro || client?.categoria || client?.tipo);

  if (screen === 'trade') {
    return tipo === 'INDUSTRIA';
  }

  return tipo !== 'INDUSTRIA';
};

const buildFilteredTrash = (trashClients, screen) =>
  trashClients.filter((client) => shouldIncludeClient(client, screen));

const ClientList = ({ screen = 'suppliers' }) => {
  const [clients, setClients] = useState([]);
  const [trashClients, setTrashClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showBackupWarning, setShowBackupWarning] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const screenConfig = useMemo(() => getScreenConfig(screen), [screen]);

  const fetchClients = useCallback(async ({ background = false } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const [activeResponse, trashResponse] = await Promise.all([
        api.get('/clientes'),
        api.get('/clientes/lixeira'),
      ]);

      if (!activeResponse.ok) {
        const errorData = await activeResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Falha ao buscar clientes.');
      }

      if (!trashResponse.ok) {
        const errorData = await trashResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Falha ao buscar lixeira.');
      }

      const activeData = await activeResponse.json();
      const trashData = await trashResponse.json();

      const clientesValidos = (Array.isArray(activeData) ? activeData : []).filter((c) => c.id || c._id);
      const clientesLixeira = (Array.isArray(trashData) ? trashData : []).filter((c) => c.id || c._id);

      setClients(clientesValidos);
      setTrashClients(clientesLixeira);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
      setError(err.message || 'Erro ao buscar clientes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();

    const lastBackupTime = localStorage.getItem(LAST_BACKUP_KEY);

    if (lastBackupTime) {
      const lastBackupDate = new Date(parseInt(lastBackupTime, 10));
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      setShowBackupWarning(lastBackupDate < sevenDaysAgo);
    } else {
      setShowBackupWarning(true);
    }
  }, [fetchClients]);

  const handleOpenNew = useCallback(() => {
    setClientToEdit(null);
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setClientToEdit(null);
  }, []);

  const handleEdit = useCallback((client) => {
    setClientToEdit(client);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(
    async (clientData) => {
      const idToEdit = clientData.id || clientData._id;
      const isEditing = !!idToEdit;

      try {
        const payload = {
          ...clientData,
          tipo_cadastro: clientData.tipo_cadastro || screenConfig.defaultType,
        };

        let response;

        if (isEditing) {
          response = await api.put(`/clientes/${idToEdit}`, payload);
        } else {
          response = await api.post('/clientes', payload);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Erro ao salvar.');
        }

        if (isEditing) {
          setClients((prev) =>
            prev.map((client) => {
              const currentId = client.id || client._id;
              return currentId === idToEdit ? mergeClient(client, payload) : client;
            })
          );
        } else {
          const createdClient = {
            ...payload,
            id: data.id,
            _id: data.id,
            saldo_atual: 0,
            total_depositado: 0,
          };

          setClients((prev) => [createdClient, ...prev]);
        }

        setShowForm(false);
        setClientToEdit(null);
        alert(`Cadastro ${isEditing ? 'editado' : 'criado'} com sucesso!`);
        fetchClients({ background: true });
      } catch (err) {
        alert(err.message || 'Erro ao salvar cliente.');
      }
    },
    [fetchClients, screenConfig.defaultType]
  );

  const handleDeleteClient = useCallback(
    async (id, nome) => {
      if (
        !window.confirm(`Mover ${nome} para a lixeira? Ele será apagado definitivamente após 3 dias.`)
      ) {
        return;
      }

      try {
        const response = await api.delete(`/clientes/${id}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || 'Erro ao mover cliente para lixeira.');
        }

        alert('Cadastro movido para a lixeira.');
        fetchClients({ background: true });
      } catch (err) {
        alert(err.message || 'Erro ao excluir.');
      }
    },
    [fetchClients]
  );

  const handleRestoreClient = useCallback(
    async (id, nome) => {
      try {
        const response = await api.post(`/clientes/${id}/restaurar`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || `Erro ao restaurar ${nome}.`);
        }

        alert('Cadastro restaurado com sucesso.');
        fetchClients({ background: true });
      } catch (err) {
        alert(err.message || 'Erro ao restaurar cadastro.');
      }
    },
    [fetchClients]
  );

  const handlePermanentDelete = useCallback(
    async (id, nome) => {
      if (!window.confirm(`Excluir ${nome} definitivamente agora? Esta ação não poderá ser desfeita.`)) {
        return;
      }

      try {
        const response = await api.delete(`/clientes/${id}/definitivo`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || `Erro ao excluir ${nome} definitivamente.`);
        }

        alert('Cadastro excluído definitivamente.');
        fetchClients({ background: true });
      } catch (err) {
        alert(err.message || 'Erro ao excluir definitivamente.');
      }
    },
    [fetchClients]
  );

  const handleBackupClick = useCallback(() => {
    localStorage.setItem(LAST_BACKUP_KEY, String(new Date().getTime()));
    setShowBackupWarning(false);
    window.open(`${API_BASE_URL}/backup/clientes`, '_self');
  }, []);

  const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

  const visibleClients = useMemo(
    () => clients.filter((client) => shouldIncludeClient(client, screen)),
    [clients, screen]
  );

  const filteredClients = useMemo(() => {
    if (!normalizedSearch) return visibleClients;

    return visibleClients.filter((client) => {
      const nome = String(client.nome || '').toLowerCase();
      const cpf = String(client.cpf || '');
      const telefone = String(client.telefone || '');

      return (
        nome.includes(normalizedSearch) ||
        cpf.includes(deferredSearchTerm) ||
        telefone.includes(deferredSearchTerm)
      );
    });
  }, [visibleClients, normalizedSearch, deferredSearchTerm]);

  const visibleTrashClients = useMemo(
    () => buildFilteredTrash(trashClients, screen),
    [trashClients, screen]
  );

  const filteredTrashClients = useMemo(() => {
    if (!normalizedSearch) return visibleTrashClients;

    return visibleTrashClients.filter((client) => {
      const nome = String(client.nome || '').toLowerCase();
      const cpf = String(client.cpf || '');
      const telefone = String(client.telefone || '');

      return (
        nome.includes(normalizedSearch) ||
        cpf.includes(deferredSearchTerm) ||
        telefone.includes(deferredSearchTerm)
      );
    });
  }, [visibleTrashClients, normalizedSearch, deferredSearchTerm]);

  const formatTrashDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR');
  };

  const renderTypeBadge = () => (
    <span style={screenConfig.badgeStyle}>{screenConfig.badgeLabel}</span>
  );

  return (
    <Layout>
      <div style={{ display: 'grid', gap: '22px' }}>
        <section style={helperCardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', color: '#0f172a' }}>
                {screenConfig.title}
              </h1>
              <p style={{ margin: 0, color: '#475569', maxWidth: '820px', lineHeight: 1.6 }}>
                {screenConfig.subtitle}
              </p>
            </div>

            {renderTypeBadge()}
          </div>
        </section>

        <GeneralDashboard clientes={filteredClients} loading={loading && clients.length === 0} />

        <section style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '18px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => fetchClients({ background: true })}
                style={{
                  ...headerButtonStyle,
                  background: '#fff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                }}
                type="button"
              >
                <RefreshCw size={16} />
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>

              <button
                onClick={() => setShowTrash((prev) => !prev)}
                style={{
                  ...headerButtonStyle,
                  background: showTrash ? '#334155' : '#fff',
                  color: showTrash ? '#fff' : '#334155',
                  border: '1px solid #cbd5e1',
                }}
                type="button"
              >
                <Trash2 size={16} />
                Lixeira ({visibleTrashClients.length})
              </button>
            </div>

            <button
              onClick={handleOpenNew}
              style={{
                ...headerButtonStyle,
                background: '#2563eb',
                color: '#fff',
              }}
              type="button"
            >
              <Plus size={16} />
              {screenConfig.newLabel}
            </button>
          </div>
          <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '18px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, CPF ou telefone"
              style={searchInputStyle}
            />
          </div>

          {loading && clients.length === 0 && (
            <div style={{ color: '#64748b', padding: '8px 0 16px' }}>Carregando...</div>
          )}

          {error && (
            <div
              style={{
                color: '#991b1b',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '18px',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>CPF</th>
                    <th>Telefone</th>
                    <th>Estoque (Kg)</th>
                    <th>Saldo Financeiro</th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredClients.map((client) => {
                    const safeId = client.id || client._id;

                    if (!safeId) return null;

                    const saldo = safeNumber(client.saldo_atual);
                    const saldoColor = saldo < 0 ? '#dc2626' : '#15803d';

                    return (
                      <tr key={safeId}>
                        <td style={{ fontWeight: 700 }}>{client.nome}</td>
                        <td>{renderTypeBadge()}</td>
                        <td>{client.cpf || '-'}</td>
                        <td>{client.telefone || '-'}</td>
                        <td>
                          {safeNumber(client.total_depositado).toLocaleString('pt-BR', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{' '}
                          Kg
                        </td>
                        <td style={{ color: saldoColor, fontWeight: 700 }}>
                          {formatCurrency(Math.abs(saldo))} {saldo < 0 ? '(D)' : '(C)'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <Link
                              to={`/conta-corrente/${safeId}`}
                              style={{
                                textDecoration: 'none',
                                color: '#0f766e',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ArrowRightLeft size={14} />
                              Conta Corrente
                            </Link>

                            <button
                              onClick={() => handleEdit(client)}
                              style={{
                                cursor: 'pointer',
                                border: 'none',
                                background: 'none',
                                color: '#2563eb',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0,
                              }}
                              type="button"
                            >
                              <Pencil size={14} />
                              Editar
                            </button>

                            <button
                              onClick={() => handleDeleteClient(safeId, client.nome)}
                              style={{
                                color: '#dc2626',
                                cursor: 'pointer',
                                border: 'none',
                                background: 'none',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0,
                              }}
                              type="button"
                            >
                              <Trash2 size={14} />
                              Lixeira
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          <strong>{screenConfig.emptyTitle}</strong>
                          <span style={{ color: '#64748b' }}>{screenConfig.emptyText}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {showTrash && (
            <div style={{ marginTop: '28px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <h3 style={{ margin: 0 }}>Lixeira</h3>
                <span style={{ color: '#64748b', fontSize: '14px' }}>
                  Itens são apagados automaticamente após 3 dias.
                </span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>Excluído em</th>
                      <th>Apagar em</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredTrashClients.map((client) => {
                      const safeId = client.id || client._id;

                      return (
                        <tr key={safeId}>
                          <td style={{ fontWeight: 700 }}>{client.nome}</td>
                          <td>{renderTypeBadge()}</td>
                          <td>{formatTrashDate(client.deleted_at)}</td>
                          <td>{formatTrashDate(client.purge_at)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {formatCurrency(Math.abs(safeNumber(client.saldo_atual)))}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleRestoreClient(safeId, client.nome)}
                                style={{
                                  cursor: 'pointer',
                                  border: 'none',
                                  background: 'none',
                                  color: '#16a34a',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: 0,
                                }}
                                type="button"
                              >
                                <RotateCcw size={14} />
                                Restaurar
                              </button>

                              <button
                                onClick={() => handlePermanentDelete(safeId, client.nome)}
                                style={{
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  border: 'none',
                                  background: 'none',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: 0,
                                }}
                                type="button"
                              >
                                <XCircle size={14} />
                                Excluir Definitivamente
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredTrashClients.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                          A lixeira está vazia para esta seção.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <ClientForm
          onClose={handleCloseForm}
          onSave={handleSave}
          clientToEdit={clientToEdit}
          defaultType={clientToEdit?.tipo_cadastro || screenConfig.defaultType}
        />
      )}
    </Layout>
  );
};

export default ClientList;
