import React, {
    useEffect,
    useMemo,
    useState,
    useCallback,
    useDeferredValue,
} from 'react';
import Layout from '../components/Layout';
import { api } from '../api';
import { formatCurrency } from '../utils/formatters';
import styles from './GeneralReport.module.css';

const TRANSACTION_LABELS = {
    ADIANTAMENTO: 'Adiantamento',
    DEPOSITO: 'Compra / Depósito de Cacau',
    VENDA_NOVO: 'Venda de Cacau',
    VENDA_DEPOSITO: 'Venda de Cacau',
};

const safeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const formatKg = (value) => {
    return `${safeNumber(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })} Kg`;
};

const getToday = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
};

const getFirstDayOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
};

const getTxVisualValue = (tx) => {
    if (!tx) return 0;
    return safeNumber(tx.valor_visual ?? tx.valor_total);
};

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const isSaleTransaction = (tipo) =>
    tipo === 'VENDA_NOVO' || tipo === 'VENDA_DEPOSITO';

const getAveragePrice = (totalValue, totalKg) => {
    if (!safeNumber(totalKg)) return 0;
    return safeNumber(totalValue) / safeNumber(totalKg);
};

const getClientEntityType = (client) => {
    const text = normalizeText([
        client?.tipo_cadastro,
        client?.categoria,
        client?.tipo,
        client?.classificacao,
        client?.perfil,
        client?.grupo,
        client?.tags,
        client?.observacao,
        client?.nome,
    ].join(' '));

    if (
        text.includes('industria') ||
        text.includes('indústria') ||
        text.includes('comprador') ||
        text.includes('compradora') ||
        text.includes('fabrica') ||
        text.includes('fábrica')
    ) {
        return 'INDUSTRIA';
    }

    if (
        text.includes('fornecedor') ||
        text.includes('produtor') ||
        text.includes('vendedor')
    ) {
        return 'FORNECEDOR';
    }

    return 'CLIENTE';
};

const formatClientBalanceLabel = (saldo) => {
    const value = safeNumber(saldo);

    if (value < 0) {
        return `${formatCurrency(Math.abs(value))} (A receber)`;
    }

    if (value > 0) {
        return `${formatCurrency(value)} (A pagar)`;
    }

    return formatCurrency(0);
};

const GeneralReport = () => {
    const [clients, setClients] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const [filters, setFilters] = useState({
        startDate: getFirstDayOfMonth(),
        endDate: getToday(),
        search: '',
    });

    const deferredSearch = useDeferredValue(filters.search);

    const fetchData = useCallback(async ({ background = false } = {}) => {
        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError('');

        try {
            const [clientsResponse, transactionsResponse] = await Promise.all([
                api.get('/clientes'),
                api.get('/transacoes'),
            ]);

            if (!clientsResponse.ok) {
                throw new Error('Erro ao buscar clientes.');
            }

            if (!transactionsResponse.ok) {
                throw new Error('Erro ao buscar transações.');
            }

            const clientsData = await clientsResponse.json();
            const transactionsData = await transactionsResponse.json();

            setClients(Array.isArray(clientsData) ? clientsData : []);
            setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Erro ao carregar relatório.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFilterChange = useCallback((e) => {
        const { name, value } = e.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    }, []);

    const clientMap = useMemo(() => {
        const map = new Map();

        for (const client of clients) {
            const id = client.id || client._id;
            if (id) map.set(String(id), client);
        }

        return map;
    }, [clients]);

    const filteredTransactions = useMemo(() => {
        const search = deferredSearch.trim().toLowerCase();
        const start = filters.startDate
            ? new Date(`${filters.startDate}T00:00:00`)
            : null;
        const end = filters.endDate
            ? new Date(`${filters.endDate}T23:59:59`)
            : null;

        return transactions.filter((tx) => {
            const txDate = tx.data_transacao ? new Date(tx.data_transacao) : null;
            const client = clientMap.get(String(tx.clienteId || tx.cliente_id || ''));
            const clientName = String(client?.nome || '').toLowerCase();

            const matchesSearch =
                !search ||
                clientName.includes(search) ||
                String(tx.tipo || '').toLowerCase().includes(search) ||
                String(tx.observacao || '').toLowerCase().includes(search);

            const matchesStart = !start || (txDate && txDate >= start);
            const matchesEnd = !end || (txDate && txDate <= end);

            return matchesSearch && matchesStart && matchesEnd;
        });
    }, [transactions, filters.startDate, filters.endDate, deferredSearch, clientMap]);

    const reportData = useMemo(() => {
        let totalComprasValor = 0;
        let totalComprasKg = 0;

        let totalVendasValor = 0;
        let totalVendasKg = 0;

        const byCategory = {
            COMPRAS: { count: 0, total: 0, peso: 0 },
            VENDAS: { count: 0, total: 0, peso: 0 },
            ADIANTAMENTOS: { count: 0, total: 0, peso: 0 },
        };

        for (const tx of filteredTransactions) {
            const tipo = tx.tipo;
            const valorVisual = getTxVisualValue(tx);
            const peso = safeNumber(tx.peso_kg);

            if (tipo === 'DEPOSITO') {
                byCategory.COMPRAS.count += 1;
                byCategory.COMPRAS.total += valorVisual;
                byCategory.COMPRAS.peso += peso;

                totalComprasValor += valorVisual;
                totalComprasKg += peso;
            } else if (isSaleTransaction(tipo)) {
                byCategory.VENDAS.count += 1;
                byCategory.VENDAS.total += valorVisual;
                byCategory.VENDAS.peso += peso;

                totalVendasValor += valorVisual;
                totalVendasKg += peso;
            } else if (tipo === 'ADIANTAMENTO') {
                byCategory.ADIANTAMENTOS.count += 1;
                byCategory.ADIANTAMENTOS.total += Math.abs(valorVisual);
                byCategory.ADIANTAMENTOS.peso += peso;
            }
        }

        const precoMedioPago = getAveragePrice(totalComprasValor, totalComprasKg);
        const precoMedioVenda = getAveragePrice(totalVendasValor, totalVendasKg);
        const margemMediaPorKg = precoMedioVenda - precoMedioPago;
        const lucroBrutoEstimado = totalVendasValor - totalComprasValor;

        const saldoClientesAReceber = clients.reduce((sum, client) => {
            const saldo = safeNumber(client.saldo_atual);
            return saldo < 0 ? sum + Math.abs(saldo) : sum;
        }, 0);

        const saldoClientesAPagar = clients.reduce((sum, client) => {
            const saldo = safeNumber(client.saldo_atual);
            return saldo > 0 ? sum + saldo : sum;
        }, 0);

        return {
            totalComprasValor,
            totalComprasKg,
            totalVendasValor,
            totalVendasKg,
            precoMedioPago,
            precoMedioVenda,
            margemMediaPorKg,
            lucroBrutoEstimado,
            saldoClientesAReceber,
            saldoClientesAPagar,
            byCategory,
        };
    }, [filteredTransactions, clients]);

    const transactionsByClient = useMemo(() => {
        const map = new Map();

        for (const tx of filteredTransactions) {
            const id = String(tx.clienteId || tx.cliente_id || '');
            if (!map.has(id)) map.set(id, []);
            map.get(id).push(tx);
        }

        return map;
    }, [filteredTransactions]);

    const enrichedClients = useMemo(() => {
        return clients.map((client) => {
            const id = String(client.id || client._id || '');
            const clientTransactions = transactionsByClient.get(id) || [];

            let totalComprasValor = 0;
            let totalComprasKg = 0;
            let totalVendasValor = 0;
            let totalVendasKg = 0;
            let totalAdiantamentos = 0;

            for (const tx of clientTransactions) {
                const tipo = tx.tipo;
                const valorVisual = getTxVisualValue(tx);
                const peso = safeNumber(tx.peso_kg);

                if (tipo === 'DEPOSITO') {
                    totalComprasValor += valorVisual;
                    totalComprasKg += peso;
                } else if (isSaleTransaction(tipo)) {
                    totalVendasValor += valorVisual;
                    totalVendasKg += peso;
                } else if (tipo === 'ADIANTAMENTO') {
                    totalAdiantamentos += Math.abs(valorVisual);
                }
            }

            return {
                ...client,
                safeId: id,
                entityType: getClientEntityType(client),
                totalComprasValor,
                totalComprasKg,
                totalVendasValor,
                totalVendasKg,
                totalAdiantamentos,
                precoMedioCompra: getAveragePrice(totalComprasValor, totalComprasKg),
                precoMedioVenda: getAveragePrice(totalVendasValor, totalVendasKg),
                margemMediaPorKg:
                    getAveragePrice(totalVendasValor, totalVendasKg) -
                    getAveragePrice(totalComprasValor, totalComprasKg),
                totalTransacoes: clientTransactions.length,
            };
        });
    }, [clients, transactionsByClient]);

    const fornecedores = useMemo(() => {
        return enrichedClients
            .filter((client) => client.entityType === 'FORNECEDOR')
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [enrichedClients]);

    const industrias = useMemo(() => {
        return enrichedClients
            .filter((client) => client.entityType === 'INDUSTRIA')
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [enrichedClients]);

    const clientesComSaldoAPagar = useMemo(() => {
        return [...enrichedClients]
            .filter((client) => safeNumber(client.saldo_atual) > 0)
            .sort((a, b) => safeNumber(b.saldo_atual) - safeNumber(a.saldo_atual))
            .slice(0, 20);
    }, [enrichedClients]);

    const topDebtors = useMemo(() => {
        return [...enrichedClients]
            .filter((client) => safeNumber(client.saldo_atual) < 0)
            .sort((a, b) => safeNumber(a.saldo_atual) - safeNumber(b.saldo_atual))
            .slice(0, 10);
    }, [enrichedClients]);

    const topCreditors = useMemo(() => {
        return [...enrichedClients]
            .filter((client) => safeNumber(client.saldo_atual) > 0)
            .sort((a, b) => safeNumber(b.saldo_atual) - safeNumber(a.saldo_atual))
            .slice(0, 10);
    }, [enrichedClients]);

    const recentTransactions = useMemo(() => {
        return [...filteredTransactions]
            .sort((a, b) => new Date(b.data_transacao) - new Date(a.data_transacao))
            .slice(0, 20);
    }, [filteredTransactions]);

    const alerts = useMemo(() => {
        const items = [];

        const debtors = clients.filter((c) => safeNumber(c.saldo_atual) < 0).length;
        const creditors = clients.filter((c) => safeNumber(c.saldo_atual) > 0).length;
        const zeroMov = filteredTransactions.length === 0;

        if (zeroMov) {
            items.push('Nenhuma movimentação encontrada no período selecionado.');
        }

        if (debtors > 0) {
            items.push(`${debtors} cadastro(s) estão com saldo a receber.`);
        }

        if (creditors > 0) {
            items.push(`${creditors} cadastro(s) estão com saldo a pagar.`);
        }

        if (safeNumber(reportData.precoMedioVenda) > 0 && safeNumber(reportData.precoMedioPago) > 0) {
            if (reportData.margemMediaPorKg < 0) {
                items.push('Atenção: o preço médio de venda está abaixo do preço médio pago pelo cacau.');
            } else {
                items.push('O preço médio de venda está acima do preço médio pago pelo cacau.');
            }
        }

        const highRiskClients = clients.filter(
            (c) => normalizeText(c.perfil_risco) === 'alto'
        ).length;

        if (highRiskClients > 0) {
            items.push(`${highRiskClients} cadastro(s) marcados com perfil de risco alto.`);
        }

        return items;
    }, [clients, filteredTransactions, reportData]);

    if (loading && clients.length === 0 && transactions.length === 0) {
        return (
            <Layout>
                <div className={styles.stateBox}>Carregando relatório geral...</div>
            </Layout>
        );
    }

    if (error && clients.length === 0 && transactions.length === 0) {
        return (
            <Layout>
                <div className={styles.stateBoxError}>{error}</div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <div>
                        <h1 className={styles.title}>Relatório Geral do Sistema</h1>
                        <p className={styles.subtitle}>
                            Visão consolidada de compras, vendas de cacau, saldos e cadastros do sistema.
                        </p>
                    </div>

                    <div className={styles.topActions}>
                        <button
                            onClick={() => fetchData({ background: true })}
                            className={styles.secondaryButton}
                            type="button"
                        >
                            {refreshing ? 'Atualizando...' : 'Atualizar'}
                        </button>
                    </div>
                </div>

                {error ? <div className={styles.stateBoxError}>{error}</div> : null}

                <div className={styles.filtersCard}>
                    <div className={styles.filterGroup}>
                        <label>Data Inicial</label>
                        <input
                            type="date"
                            name="startDate"
                            value={filters.startDate}
                            onChange={handleFilterChange}
                        />
                    </div>

                    <div className={styles.filterGroup}>
                        <label>Data Final</label>
                        <input
                            type="date"
                            name="endDate"
                            value={filters.endDate}
                            onChange={handleFilterChange}
                        />
                    </div>

                    <div className={styles.filterGroupSearch}>
                        <label>Buscar</label>
                        <input
                            type="text"
                            name="search"
                            value={filters.search}
                            onChange={handleFilterChange}
                            placeholder="Nome, tipo ou observação"
                        />
                    </div>
                </div>

                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <span>Total de Cadastros</span>
                        <strong>{clients.length}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Fornecedores</span>
                        <strong>{fornecedores.length}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Indústrias</span>
                        <strong>{industrias.length}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>A Receber</span>
                        <strong>{formatCurrency(reportData.saldoClientesAReceber)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Saldo a Pagar</span>
                        <strong>{formatCurrency(reportData.saldoClientesAPagar)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Compra de Cacau</span>
                        <strong>{formatCurrency(reportData.totalComprasValor)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Venda de Cacau</span>
                        <strong>{formatCurrency(reportData.totalVendasValor)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Total Comprado</span>
                        <strong>{formatKg(reportData.totalComprasKg)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Total Vendido</span>
                        <strong>{formatKg(reportData.totalVendasKg)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Preço Médio Pago</span>
                        <strong>{formatCurrency(reportData.precoMedioPago)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Preço Médio de Venda</span>
                        <strong>{formatCurrency(reportData.precoMedioVenda)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Margem Média por Kg</span>
                        <strong>{formatCurrency(reportData.margemMediaPorKg)}</strong>
                    </div>

                    <div className={styles.kpiCard}>
                        <span>Resultado Bruto</span>
                        <strong>{formatCurrency(reportData.lucroBrutoEstimado)}</strong>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2>Alertas do Sistema</h2>
                    <div className={styles.alertList}>
                        {alerts.length > 0 ? (
                            alerts.map((alert, index) => (
                                <div key={index} className={styles.alertItem}>
                                    {alert}
                                </div>
                            ))
                        ) : (
                            <div className={styles.alertItemOk}>
                                Nenhum alerta importante encontrado.
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.section}>
                    <h2>Resumo Consolidado</h2>
                    <div className={styles.summaryGrid}>
                        <div className={styles.summaryCard}>
                            <h3>Compras / Depósito de Cacau</h3>
                            <p><strong>Quantidade:</strong> {reportData.byCategory.COMPRAS.count}</p>
                            <p><strong>Valor:</strong> {formatCurrency(reportData.byCategory.COMPRAS.total)}</p>
                            <p><strong>Peso:</strong> {formatKg(reportData.byCategory.COMPRAS.peso)}</p>
                            <p><strong>Preço Médio Pago:</strong> {formatCurrency(reportData.precoMedioPago)}</p>
                        </div>

                        <div className={styles.summaryCard}>
                            <h3>Vendas de Cacau</h3>
                            <p><strong>Quantidade:</strong> {reportData.byCategory.VENDAS.count}</p>
                            <p><strong>Valor:</strong> {formatCurrency(reportData.byCategory.VENDAS.total)}</p>
                            <p><strong>Peso:</strong> {formatKg(reportData.byCategory.VENDAS.peso)}</p>
                            <p><strong>Preço Médio de Venda:</strong> {formatCurrency(reportData.precoMedioVenda)}</p>
                        </div>

                        <div className={styles.summaryCard}>
                            <h3>Adiantamentos</h3>
                            <p><strong>Quantidade:</strong> {reportData.byCategory.ADIANTAMENTOS.count}</p>
                            <p><strong>Valor:</strong> {formatCurrency(reportData.byCategory.ADIANTAMENTOS.total)}</p>
                            <p><strong>Peso:</strong> {formatKg(reportData.byCategory.ADIANTAMENTOS.peso)}</p>
                            <p><strong>Observação:</strong> usado apenas como histórico, o painel agora prioriza saldo.</p>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.tableCard}>
                        <h2>Clientes com Saldo a Pagar</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Saldo</th>
                                    <th>Comprado</th>
                                    <th>Vendido</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientesComSaldoAPagar.length > 0 ? (
                                    clientesComSaldoAPagar.map((client) => (
                                        <tr key={client.safeId}>
                                            <td>{client.nome}</td>
                                            <td>{client.telefone || '-'}</td>
                                            <td className={styles.positive}>
                                                {formatCurrency(safeNumber(client.saldo_atual))}
                                            </td>
                                            <td>{formatKg(client.totalComprasKg)}</td>
                                            <td>{formatKg(client.totalVendasKg)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5}>Nenhum cliente com saldo a pagar no período.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.sectionGrid}>
                    <div className={styles.tableCard}>
                        <h2>Top 10 Maiores Saldos a Receber</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Saldo</th>
                                    <th>Risco</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topDebtors.length > 0 ? (
                                    topDebtors.map((client) => (
                                        <tr key={client.safeId}>
                                            <td>{client.nome}</td>
                                            <td className={styles.negative}>
                                                {formatCurrency(Math.abs(safeNumber(client.saldo_atual)))} (A receber)
                                            </td>
                                            <td>{client.perfil_risco || 'Normal'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3}>Nenhum saldo a receber encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.tableCard}>
                        <h2>Top 10 Maiores Saldos a Pagar</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Saldo</th>
                                    <th>Risco</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topCreditors.length > 0 ? (
                                    topCreditors.map((client) => (
                                        <tr key={client.safeId}>
                                            <td>{client.nome}</td>
                                            <td className={styles.positive}>
                                                {formatCurrency(Math.abs(safeNumber(client.saldo_atual)))} (A pagar)
                                            </td>
                                            <td>{client.perfil_risco || 'Normal'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3}>Nenhum saldo a pagar encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.sectionGrid}>
                    <div className={styles.tableCard}>
                        <h2>Fornecedores</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Compra (Kg)</th>
                                    <th>Preço Médio Pago</th>
                                    <th>Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fornecedores.length > 0 ? (
                                    fornecedores.map((client) => (
                                        <tr key={client.safeId}>
                                            <td>{client.nome}</td>
                                            <td>{client.telefone || '-'}</td>
                                            <td>{formatKg(client.totalComprasKg)}</td>
                                            <td>{formatCurrency(client.precoMedioCompra)}</td>
                                            <td
                                                className={
                                                    safeNumber(client.saldo_atual) < 0
                                                        ? styles.negative
                                                        : styles.positive
                                                }
                                            >
                                                {formatClientBalanceLabel(client.saldo_atual)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5}>Nenhum fornecedor identificado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.tableCard}>
                        <h2>Indústrias / Compradores</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Compra (Kg)</th>
                                    <th>Preço Médio Venda</th>
                                    <th>Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {industrias.length > 0 ? (
                                    industrias.map((client) => (
                                        <tr key={client.safeId}>
                                            <td>{client.nome}</td>
                                            <td>{client.telefone || '-'}</td>
                                            <td>{formatKg(client.totalVendasKg)}</td>
                                            <td>{formatCurrency(client.precoMedioVenda)}</td>
                                            <td
                                                className={
                                                    safeNumber(client.saldo_atual) < 0
                                                        ? styles.negative
                                                        : styles.positive
                                                }
                                            >
                                                {formatClientBalanceLabel(client.saldo_atual)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5}>Nenhuma indústria identificada.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.tableCard}>
                        <h2>Últimas Movimentações</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Cadastro</th>
                                    <th>Tipo</th>
                                    <th>Peso</th>
                                    <th>Valor</th>
                                    <th>Observação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTransactions.map((tx) => {
                                    const client = clientMap.get(
                                        String(tx.clienteId || tx.cliente_id || '')
                                    );

                                    return (
                                        <tr key={tx.id || tx._id}>
                                            <td>
                                                {tx.data_transacao
                                                    ? new Date(tx.data_transacao).toLocaleDateString('pt-BR')
                                                    : '-'}
                                            </td>
                                            <td>{client?.nome || 'Cadastro não encontrado'}</td>
                                            <td>{TRANSACTION_LABELS[tx.tipo] || tx.tipo}</td>
                                            <td>
                                                {safeNumber(tx.peso_kg) > 0
                                                    ? formatKg(tx.peso_kg)
                                                    : '-'}
                                            </td>
                                            <td>{formatCurrency(getTxVisualValue(tx))}</td>
                                            <td>{tx.observacao || '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.tableCard}>
                        <h2>Relatório Detalhado por Cadastro</h2>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Tipo</th>
                                    <th>CPF</th>
                                    <th>Telefone</th>
                                    <th>Risco</th>
                                    <th>Compra (Kg)</th>
                                    <th>Venda (Kg)</th>
                                    <th>Preço Médio Pago</th>
                                    <th>Preço Médio Venda</th>
                                    <th>Saldo Atual</th>
                                    <th>Mov.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enrichedClients.map((client) => (
                                    <tr key={client.safeId}>
                                        <td>{client.nome}</td>
                                        <td>{client.entityType}</td>
                                        <td>{client.cpf || '-'}</td>
                                        <td>{client.telefone || '-'}</td>
                                        <td>{client.perfil_risco || 'Normal'}</td>
                                        <td>{formatKg(client.totalComprasKg)}</td>
                                        <td>{formatKg(client.totalVendasKg)}</td>
                                        <td>{formatCurrency(client.precoMedioCompra)}</td>
                                        <td>{formatCurrency(client.precoMedioVenda)}</td>
                                        <td
                                            className={
                                                safeNumber(client.saldo_atual) < 0
                                                    ? styles.negative
                                                    : styles.positive
                                            }
                                        >
                                            {formatClientBalanceLabel(client.saldo_atual)}
                                        </td>
                                        <td>{client.totalTransacoes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default GeneralReport;