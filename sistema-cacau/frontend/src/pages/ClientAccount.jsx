import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Plus,
    Filter,
    RefreshCw,
    AlertTriangle,
    Trash2,
} from 'lucide-react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { formatCurrency, formatDate } from '../utils/formatters';
import { api } from '../api';
import styles from './ContaCorrente.module.css';

const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const formatKg = (value) => {
    return safeNumber(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};

const TYPE_META = {
    ADIANTAMENTO: {
        label: 'Adiantamento',
        badge: 'DÉBITO',
        tone: 'debito',
    },
    DEPOSITO: {
        label: 'Depósito',
        badge: 'ESTOQUE',
        tone: 'neutro',
    },
    VENDA_NOVO: {
        label: 'Venda de Cacau Novo',
        badge: 'VENDA',
        tone: 'neutro',
    },
    VENDA_DEPOSITO: {
        label: 'Venda de Depósito',
        badge: 'SAÍDA ESTOQUE',
        tone: 'neutro',
    },
};

const ClientAccount = () => {
    const { clientId } = useParams();
    const navigate = useNavigate();

    const isIdInvalid = !clientId || clientId === 'undefined' || clientId === 'null';

    const [accountData, setAccountData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showTransactionForm, setShowTransactionForm] = useState(false);

    const [filterDates, setFilterDates] = useState({
        startDate: '',
        endDate: '',
    });

    const buildQueryString = useCallback((filter) => {
        const params = new URLSearchParams();

        if (filter.startDate) params.set('startDate', filter.startDate);
        if (filter.endDate) params.set('endDate', filter.endDate);
        params.set('t', String(Date.now()));

        return `?${params.toString()}`;
    }, []);

    const fetchClientAccount = useCallback(async (filter = filterDates) => {
        if (isIdInvalid) return;

        setLoading(true);
        setError('');

        try {
            const response = await api.get(
                `/conta-corrente/${clientId}${buildQueryString(filter)}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.message || 'Cliente não encontrado ou erro no servidor.'
                );
            }

            const data = await response.json();
            setAccountData(data);
        } catch (err) {
            console.error('Erro ao buscar conta corrente:', err);
            setError(err.message || 'Erro ao carregar conta corrente.');
        } finally {
            setLoading(false);
        }
    }, [clientId, filterDates, buildQueryString, isIdInvalid]);

    useEffect(() => {
        if (clientId && !isIdInvalid) {
            fetchClientAccount(filterDates);
        } else {
            setLoading(false);
        }
    }, [clientId, isIdInvalid, fetchClientAccount, filterDates]);

    const handleFilterChange = useCallback((e) => {
        const { name, value } = e.target;
        setFilterDates((prev) => ({
            ...prev,
            [name]: value,
        }));
    }, []);

    const handleFilterSubmit = useCallback((e) => {
        e.preventDefault();
        fetchClientAccount(filterDates);
    }, [fetchClientAccount, filterDates]);

    const handleClearFilters = useCallback(() => {
        const empty = { startDate: '', endDate: '' };
        setFilterDates(empty);
        fetchClientAccount(empty);
    }, [fetchClientAccount]);

    const handleDeleteTransaction = useCallback(async (transacao) => {
        const descricao = TYPE_META[transacao.tipo]?.label || transacao.tipo || 'transação';

        if (!window.confirm(`Tem certeza que deseja excluir "${descricao}"?`)) return;

        try {
            const response = await api.delete(`/transacoes/${transacao.id}`);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Erro ao excluir transação.');
            }

            await fetchClientAccount(filterDates);
        } catch (err) {
            alert(err.message || 'Erro ao excluir.');
        }
    }, [fetchClientAccount, filterDates]);

    const formatBalance = useCallback((balance) => {
        const value = safeNumber(balance);

        return {
            display: formatCurrency(Math.abs(value)),
            className: value < 0 ? styles.saldoDevedor : styles.saldoCredor,
            nature: value < 0 ? 'D (Deve)' : '(Crédito)',
        };
    }, []);

    const resumoExtrato = useMemo(() => {
        const extrato = accountData?.extrato || [];

        return extrato.reduce(
            (acc, transacao) => {
                const tipo = transacao.tipo;
                const peso = safeNumber(transacao.peso_kg);
                const valorVisual = safeNumber(
                    transacao.valor_visual ?? transacao.valor_total
                );

                if (tipo === 'ADIANTAMENTO') {
                    acc.totalAdiantamentos += Math.abs(valorVisual);
                }

                if (tipo === 'VENDA_NOVO') {
                    acc.totalVendaNovo += valorVisual;
                }

                if (tipo === 'VENDA_DEPOSITO') {
                    acc.totalVendaDeposito += valorVisual;
                    acc.totalSaidaDepositoKg += peso;
                }

                if (tipo === 'DEPOSITO') {
                    acc.totalEntradaDepositoKg += peso;
                }

                return acc;
            },
            {
                totalAdiantamentos: 0,
                totalVendaNovo: 0,
                totalVendaDeposito: 0,
                totalEntradaDepositoKg: 0,
                totalSaidaDepositoKg: 0,
            }
        );
    }, [accountData]);

    const renderTransactionType = (transacao) => {
        const meta = TYPE_META[transacao.tipo] || {
            label: transacao.tipo || '-',
            badge: '',
            tone: 'neutro',
        };

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>{meta.label}</span>
                {meta.badge && (
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 6px',
                            borderRadius: '999px',
                            background:
                                meta.tone === 'debito'
                                    ? '#fee2e2'
                                    : meta.tone === 'credito'
                                    ? '#dcfce7'
                                    : '#e5e7eb',
                            color:
                                meta.tone === 'debito'
                                    ? '#991b1b'
                                    : meta.tone === 'credito'
                                    ? '#166534'
                                    : '#374151',
                            letterSpacing: '0.02em',
                        }}
                    >
                        {meta.badge}
                    </span>
                )}
            </div>
        );
    };

    const renderValueCell = (transacao) => {
        const tipo = transacao.tipo;
        const valorVisual = safeNumber(transacao.valor_visual ?? transacao.valor_total);
        const valorFinanceiro = safeNumber(transacao.valor_total);

        if (tipo === 'DEPOSITO') {
            return <span style={{ color: '#64748b' }}>---</span>;
        }

        if (tipo === 'ADIANTAMENTO') {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                    - {formatCurrency(Math.abs(valorFinanceiro || valorVisual))}
                </span>
            );
        }

        if (tipo === 'VENDA_NOVO' || tipo === 'VENDA_DEPOSITO') {
            return (
                <span style={{ color: '#0f172a', fontWeight: 700 }}>
                    {formatCurrency(valorVisual)}
                </span>
            );
        }

        return (
            <span style={{ fontWeight: 700 }}>
                {formatCurrency(Math.abs(valorFinanceiro || valorVisual))}
            </span>
        );
    };

    const getRowStyle = (transacao) => {
        if (transacao.tipo === 'ADIANTAMENTO') return styles.debito;
        if (transacao.tipo === 'DEPOSITO') return styles.neutro;
        if (transacao.tipo === 'VENDA_DEPOSITO') return styles.saidaEstoque;
        return '';
    };

    if (isIdInvalid) {
        return (
            <Layout>
                <div className={styles.pageState}>
                    <AlertTriangle size={18} />
                    <span>Erro: ID inválido.</span>
                </div>
            </Layout>
        );
    }

    if (loading) {
        return (
            <Layout>
                <div className={styles.pageState}>
                    <RefreshCw size={18} className={styles.spinningIcon} />
                    <span>Carregando dados da conta corrente...</span>
                </div>
            </Layout>
        );
    }

    if (error) {
        return (
            <Layout>
                <div className={styles.pageStateError}>
                    <AlertTriangle size={18} />
                    <span>Erro: {error}</span>
                </div>
            </Layout>
        );
    }

    if (!accountData || !accountData.cliente) {
        return (
            <Layout>
                <div className={styles.pageState}>
                    <span>Cliente não encontrado. Verifique o ID.</span>
                </div>
            </Layout>
        );
    }

    const { cliente, extrato } = accountData;
    const saldo = formatBalance(cliente.saldo);

    return (
        <Layout>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    onClick={() => navigate(-1)}
                    style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        border: '1px solid #d1d5db',
                        borderRadius: '10px',
                        background: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 600,
                    }}
                >
                    <ArrowLeft size={16} />
                    Voltar
                </button>

                <h2 className={styles.title} style={{ margin: 0 }}>
                    Conta Corrente: {cliente.nome}
                </h2>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => fetchClientAccount(filterDates)}
                        style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            border: '1px solid #d1d5db',
                            borderRadius: '10px',
                            background: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 600,
                        }}
                    >
                        <RefreshCw size={16} />
                        Atualizar
                    </button>

                    <button
                        onClick={() => setShowTransactionForm(true)}
                        className={styles.transactionButton}
                    >
                        <Plus size={16} />
                        Nova Movimentação
                    </button>
                </div>
            </div>

            <div className={styles.header}>
                <div className={styles.info}>
                    <p><strong>CPF:</strong> {cliente.cpf || '-'}</p>
                    <p><strong>Telefone:</strong> {cliente.telefone || '-'}</p>
                    <p>
                        <strong>Risco:</strong> {cliente.perfil_risco || 'Normal'} |{' '}
                        <strong>Juros:</strong> {safeNumber(cliente.taxa_juros)}% a.m.
                    </p>
                </div>
            </div>

            <div className={styles.summary} style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div className={styles.balanceCard}>
                    <p>Saldo Financeiro</p>
                    <h3 className={saldo.className}>
                        {saldo.display} {saldo.nature}
                    </h3>
                </div>

                <div className={styles.balanceCard} style={{ backgroundColor: '#e9ecef', color: '#333' }}>
                    <p>Cacau em Depósito</p>
                    <h3>{formatKg(cliente.total_depositado)} Kg</h3>
                    <small>Estoque líquido disponível</small>
                </div>

                <div className={styles.balanceCard} style={{ backgroundColor: '#f8fafc', color: '#333' }}>
                    <p>Adiantamentos no Filtro</p>
                    <h3>{formatCurrency(resumoExtrato.totalAdiantamentos)}</h3>
                    <small>Período selecionado</small>
                </div>

                <div className={styles.balanceCard} style={{ backgroundColor: '#ecfeff', color: '#333' }}>
                    <p>Venda de Depósito no Filtro</p>
                    <h3>{formatKg(resumoExtrato.totalSaidaDepositoKg)} Kg</h3>
                    <small>Saída do estoque no período</small>
                </div>
            </div>

            <form
                onSubmit={handleFilterSubmit}
                className={styles.filterContainer}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={16} />
                    <strong>Filtros</strong>
                </div>

                <label>
                    Data Início:
                    <input
                        type="date"
                        name="startDate"
                        value={filterDates.startDate}
                        onChange={handleFilterChange}
                    />
                </label>

                <label>
                    Data Fim:
                    <input
                        type="date"
                        name="endDate"
                        value={filterDates.endDate}
                        onChange={handleFilterChange}
                    />
                </label>

                <button type="submit" className={styles.clearFilterButton}>
                    Filtrar
                </button>

                <button
                    type="button"
                    onClick={handleClearFilters}
                    className={styles.clearFilterButton}
                >
                    Limpar
                </button>
            </form>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th style={{ textAlign: 'right' }}>Peso (Kg)</th>
                            <th style={{ textAlign: 'right' }}>Preço (R$/Kg)</th>
                            <th style={{ textAlign: 'right' }}>Valor</th>
                            <th>Obs</th>
                            <th>Ações</th>
                        </tr>
                    </thead>

                    <tbody>
                        {extrato.length === 0 && (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                    Nenhuma transação encontrada.
                                </td>
                            </tr>
                        )}

                        {extrato.map((t) => (
                            <tr key={t.id} className={getRowStyle(t)}>
                                <td>{formatDate(t.data_transacao)}</td>
                                <td>{renderTransactionType(t)}</td>
                                <td style={{ textAlign: 'right' }}>
                                    {safeNumber(t.peso_kg) > 0 ? `${formatKg(t.peso_kg)}` : '-'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {safeNumber(t.preco_por_kg) > 0
                                        ? formatCurrency(t.preco_por_kg)
                                        : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                    {renderValueCell(t)}
                                </td>
                                <td>{t.observacao || '-'}</td>
                                <td>
                                    <button
                                        onClick={() => handleDeleteTransaction(t)}
                                        style={{
                                            color: '#dc2626',
                                            border: 'none',
                                            background: 'none',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontWeight: 600,
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        Excluir
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showTransactionForm && (
                <TransactionModal
                    onClose={() => setShowTransactionForm(false)}
                    onSuccess={() => {
                        setShowTransactionForm(false);
                        fetchClientAccount(filterDates);
                    }}
                    clienteId={cliente.id}
                    clienteNome={cliente.nome}
                />
            )}
        </Layout>
    );
};

export default ClientAccount;