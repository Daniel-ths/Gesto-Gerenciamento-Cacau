import React, {
    useState,
    useEffect,
    useCallback,
    useMemo,
    useDeferredValue,
} from 'react';
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
    Archive,
    XCircle,
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

const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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

const ClientList = () => {
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

            const clientesValidos = (Array.isArray(activeData) ? activeData : []).filter(
                (c) => c.id || c._id
            );

            const clientesLixeira = (Array.isArray(trashData) ? trashData : []).filter(
                (c) => c.id || c._id
            );

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

    const handleSave = useCallback(async (clientData) => {
        const idToEdit = clientData.id || clientData._id;
        const isEditing = !!idToEdit;

        try {
            let response;

            if (isEditing) {
                response = await api.put(`/clientes/${idToEdit}`, clientData);
            } else {
                response = await api.post('/clientes', clientData);
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao salvar.');
            }

            if (isEditing) {
                setClients((prev) =>
                    prev.map((client) => {
                        const currentId = client.id || client._id;
                        return currentId === idToEdit
                            ? mergeClient(client, clientData)
                            : client;
                    })
                );
            } else {
                const createdClient = {
                    ...clientData,
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
    }, [fetchClients]);

    const handleDeleteClient = useCallback(async (id, nome) => {
        if (!window.confirm(`Mover ${nome} para a lixeira? Ele será apagado definitivamente após 3 dias.`)) {
            return;
        }

        try {
            const response = await api.delete(`/clientes/${id}`);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao mover cliente para lixeira.');
            }

            alert('Cliente movido para a lixeira.');
            fetchClients({ background: true });
        } catch (err) {
            alert(err.message || 'Erro ao excluir.');
        }
    }, [fetchClients]);

    const handleRestoreClient = useCallback(async (id, nome) => {
        try {
            const response = await api.post(`/clientes/${id}/restaurar`);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || `Erro ao restaurar ${nome}.`);
            }

            alert('Cliente restaurado com sucesso.');
            fetchClients({ background: true });
        } catch (err) {
            alert(err.message || 'Erro ao restaurar cliente.');
        }
    }, [fetchClients]);

    const handlePermanentDelete = useCallback(async (id, nome) => {
        if (!window.confirm(`Excluir ${nome} definitivamente agora? Esta ação não poderá ser desfeita.`)) {
            return;
        }

        try {
            const response = await api.delete(`/clientes/${id}/definitivo`);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || `Erro ao excluir ${nome} definitivamente.`);
            }

            alert('Cliente excluído definitivamente.');
            fetchClients({ background: true });
        } catch (err) {
            alert(err.message || 'Erro ao excluir definitivamente.');
        }
    }, [fetchClients]);

    const handleBackupClick = useCallback(() => {
        localStorage.setItem(LAST_BACKUP_KEY, String(new Date().getTime()));
        setShowBackupWarning(false);
        window.open(`${API_BASE_URL}/backup/clientes`, '_self');
    }, []);

    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    const filteredClients = useMemo(() => {
        if (!normalizedSearch) return clients;

        return clients.filter((client) => {
            const nome = String(client.nome || '').toLowerCase();
            const cpf = String(client.cpf || '');
            const telefone = String(client.telefone || '');

            return (
                nome.includes(normalizedSearch) ||
                cpf.includes(deferredSearchTerm) ||
                telefone.includes(deferredSearchTerm)
            );
        });
    }, [clients, normalizedSearch, deferredSearchTerm]);

    const formatTrashDate = (value) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('pt-BR');
    };

    return (
        <Layout>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                    Gestão de Cadastros
                </h2>

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
                        <Archive size={16} />
                        Lixeira ({trashClients.length})
                    </button>

                    <button
                        onClick={handleBackupClick}
                        style={{
                            ...headerButtonStyle,
                            background: '#16a34a',
                            color: '#fff',
                        }}
                        type="button"
                    >
                        <Download size={16} />
                        Backup Dados
                    </button>

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
                        Novo Cadastro
                    </button>
                </div>
            </div>

            {showBackupWarning && (
                <div
                    style={{
                        padding: '12px 14px',
                        marginBottom: '20px',
                        backgroundColor: '#fff7ed',
                        border: '1px solid #fdba74',
                        color: '#9a3412',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <AlertTriangle size={16} />
                    <span>
                        <strong>Atenção:</strong> Você não faz backup há mais de 7 dias.
                    </span>
                </div>
            )}

            <div style={{ marginBottom: '30px' }}>
                <GeneralDashboard clientes={clients} loading={loading && clients.length === 0} />
            </div>

            <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '420px' }}>
                <Search
                    size={16}
                    style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#94a3b8',
                    }}
                />
                <input
                    type="text"
                    placeholder="Buscar por nome, CPF ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        padding: '10px 12px 10px 36px',
                        width: '100%',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        outline: 'none',
                    }}
                />
            </div>

            {loading && clients.length === 0 && <p>Carregando...</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}

            {!loading && !error && (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>CPF</th>
                                <th>Telefone</th>
                                <th style={{ textAlign: 'right' }}>Estoque (Kg)</th>
                                <th style={{ textAlign: 'right' }}>Saldo Financeiro</th>
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
                                        <td>
                                            <Link
                                                to={`/conta-corrente/${safeId}`}
                                                style={{
                                                    fontWeight: 'bold',
                                                    color: '#2563eb',
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                {client.nome}
                                            </Link>
                                        </td>

                                        <td>{client.cpf || '-'}</td>
                                        <td>{client.telefone || '-'}</td>

                                        <td style={{ textAlign: 'right', fontWeight: '500' }}>
                                            {safeNumber(client.total_depositado).toLocaleString('pt-BR', {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            Kg
                                        </td>

                                        <td
                                            style={{
                                                textAlign: 'right',
                                                fontWeight: 'bold',
                                                color: saldoColor,
                                            }}
                                        >
                                            {formatCurrency(Math.abs(saldo))} {saldo < 0 ? '(D)' : '(C)'}
                                        </td>

                                        <td>
                                            <button
                                                onClick={() => handleEdit(client)}
                                                style={{
                                                    marginRight: '10px',
                                                    cursor: 'pointer',
                                                    border: 'none',
                                                    background: 'none',
                                                    color: '#2563eb',
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
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
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                }}
                                                type="button"
                                            >
                                                <Trash2 size={14} />
                                                Lixeira
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {filteredClients.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                                        Nenhum cadastro encontrado.
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
                                    <th>Excluído em</th>
                                    <th>Apagar em</th>
                                    <th style={{ textAlign: 'right' }}>Saldo</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trashClients.map((client) => {
                                    const safeId = client.id || client._id;

                                    return (
                                        <tr key={safeId}>
                                            <td>{client.nome}</td>
                                            <td>{formatTrashDate(client.deleted_at)}</td>
                                            <td>{formatTrashDate(client.purge_at)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                {formatCurrency(Math.abs(safeNumber(client.saldo_atual)))}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleRestoreClient(safeId, client.nome)}
                                                    style={{
                                                        marginRight: '10px',
                                                        cursor: 'pointer',
                                                        border: 'none',
                                                        background: 'none',
                                                        color: '#16a34a',
                                                        fontWeight: 600,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
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
                                                        fontWeight: 600,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}
                                                    type="button"
                                                >
                                                    <XCircle size={14} />
                                                    Excluir Definitivamente
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {trashClients.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                                            A lixeira está vazia.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showForm && (
                <ClientForm
                    onClose={handleCloseForm}
                    onSave={handleSave}
                    clientToEdit={clientToEdit}
                />
            )}
        </Layout>
    );
};

export default ClientList;