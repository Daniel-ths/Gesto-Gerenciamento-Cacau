import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { RefreshCw, Search, TriangleAlert } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api';
import { formatCurrency } from '../utils/formatters';
import styles from './GeneralReport.module.css';

const TRANSACTION_LABELS = {
  ADIANTAMENTO: 'Adiantamento',
  DEPOSITO: 'Depósito de cacau',
  VENDA_NOVO: 'Compra de cacau em reais',
  VENDA_DEPOSITO: 'Compra de cacau em reais (do depósito)',
  VENDA_INDUSTRIA: 'Venda de cacau para indústria',
  SAQUE: 'Saque',
  DEPOSITO_DINHEIRO: 'Depósito de dinheiro',
};

const PURCHASE_TYPES = new Set(['VENDA_NOVO', 'VENDA_DEPOSITO']);
const DIRECT_PURCHASE_TYPE = 'VENDA_NOVO';
const STOCK_ENTRY_TYPE = 'DEPOSITO';
const INDUSTRY_SALE_TYPE = 'VENDA_INDUSTRIA';

const safeNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getTxValue = (transaction) => Math.abs(
  safeNumber(transaction?.valor_visual ?? transaction?.valor_total),
);

const getTxDate = (transaction) => {
  const rawDate = transaction?.data_transacao || transaction?.created_at || transaction?.data;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatKg = (value) => `${safeNumber(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})} Kg`;

const formatDate = (value) => {
  const date = getTxDate({ data_transacao: value });
  return date ? date.toLocaleDateString('pt-BR') : '-';
};

const getToday = () => new Date().toISOString().slice(0, 10);

const getFirstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const average = (total, quantity) => (safeNumber(quantity) > 0 ? safeNumber(total) / safeNumber(quantity) : 0);

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getEntityType = (client) => {
  const text = normalizeText([
    client?.tipo_cadastro,
    client?.categoria,
    client?.tipo,
    client?.classificacao,
    client?.perfil,
    client?.grupo,
    client?.observacao,
    client?.nome,
  ].join(' '));

  if (text.includes('industria') || text.includes('comprador') || text.includes('fabrica')) {
    return 'INDUSTRIA';
  }

  if (text.includes('fornecedor') || text.includes('produtor') || text.includes('vendedor')) {
    return 'FORNECEDOR';
  }

  return 'CLIENTE';
};

const getBalanceLabel = (balance) => {
  const value = safeNumber(balance);
  if (value < 0) return `${formatCurrency(Math.abs(value))} (a receber)`;
  if (value > 0) return `${formatCurrency(value)} (a pagar)`;
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
    if (background) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const [clientsResponse, transactionsResponse] = await Promise.all([
        api.get('/clientes'),
        api.get('/transacoes'),
      ]);

      if (!clientsResponse.ok) throw new Error('Não foi possível buscar os cadastros.');
      if (!transactionsResponse.ok) throw new Error('Não foi possível buscar as movimentações.');

      const [clientsData, transactionsData] = await Promise.all([
        clientsResponse.json(),
        transactionsResponse.json(),
      ]);

      setClients(Array.isArray(clientsData) ? clientsData : []);
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
    } catch (requestError) {
      console.error('Erro ao carregar relatório geral:', requestError);
      setError(requestError.message || 'Não foi possível carregar o relatório.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clientMap = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      const id = client?.id ?? client?._id;
      if (id !== undefined && id !== null) map.set(String(id), client);
    });
    return map;
  }, [clients]);

  const filteredTransactions = useMemo(() => {
    const search = normalizeText(deferredSearch);
    const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
    const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`) : null;

    return transactions.filter((transaction) => {
      const transactionDate = getTxDate(transaction);
      const client = clientMap.get(String(transaction?.clienteId ?? transaction?.cliente_id ?? ''));
      const searchableText = normalizeText([
        client?.nome,
        transaction?.tipo,
        TRANSACTION_LABELS[transaction?.tipo],
        transaction?.observacao,
      ].join(' '));

      const matchesSearch = !search || searchableText.includes(search);
      const matchesStart = !start || (transactionDate && transactionDate >= start);
      const matchesEnd = !end || (transactionDate && transactionDate <= end);

      return matchesSearch && matchesStart && matchesEnd;
    });
  }, [transactions, filters.startDate, filters.endDate, deferredSearch, clientMap]);

  const reportData = useMemo(() => {
    const totals = {
      stockKg: 0,
      directPurchaseKg: 0,
      purchaseKg: 0,
      purchaseValue: 0,
      legacySoldKg: 0,
      industrySaleKg: 0,
      industrySaleValue: 0,
      advancesValue: 0,
      categories: {
        ESTOQUE: { count: 0, peso: 0, total: 0 },
        COMPRAS: { count: 0, peso: 0, total: 0 },
        VENDAS_INDUSTRIA: { count: 0, peso: 0, total: 0 },
        ADIANTAMENTOS: { count: 0, peso: 0, total: 0 },
      },
    };

    filteredTransactions.forEach((transaction) => {
      const type = transaction?.tipo;
      const peso = safeNumber(transaction?.peso_kg);
      const value = getTxValue(transaction);

      if (type === STOCK_ENTRY_TYPE) {
        totals.stockKg += peso;
        totals.categories.ESTOQUE.count += 1;
        totals.categories.ESTOQUE.peso += peso;
        return;
      }

      if (PURCHASE_TYPES.has(type)) {
        totals.purchaseKg += peso;
        totals.purchaseValue += value;
        totals.legacySoldKg += peso;
        totals.categories.COMPRAS.count += 1;
        totals.categories.COMPRAS.peso += peso;
        totals.categories.COMPRAS.total += value;
        if (type === DIRECT_PURCHASE_TYPE) totals.directPurchaseKg += peso;
        return;
      }

      if (type === INDUSTRY_SALE_TYPE) {
        totals.industrySaleKg += peso;
        totals.industrySaleValue += value;
        totals.categories.VENDAS_INDUSTRIA.count += 1;
        totals.categories.VENDAS_INDUSTRIA.peso += peso;
        totals.categories.VENDAS_INDUSTRIA.total += value;
        return;
      }

      if (type === 'ADIANTAMENTO') {
        totals.advancesValue += value;
        totals.categories.ADIANTAMENTOS.count += 1;
        totals.categories.ADIANTAMENTOS.total += value;
      }
    });

    // Depósito é peso físico. Compra direta é peso comprado já pago em reais.
    // A compra a partir do depósito não entra de novo para evitar duplicar o mesmo cacau.
    const totalPurchasedKg = totals.stockKg + totals.directPurchaseKg;
    const averagePaid = average(totals.purchaseValue, totals.purchaseKg);
    const averageSold = average(totals.industrySaleValue, totals.industrySaleKg);
    const canCalculateMargin = totals.industrySaleKg > 0 && totals.purchaseKg > 0;
    const marginPerKg = canCalculateMargin ? averageSold - averagePaid : null;
    const grossResult = totals.industrySaleValue > 0 && totals.purchaseValue > 0
      ? totals.industrySaleValue - totals.purchaseValue
      : null;

    const balances = clients.reduce((accumulator, client) => {
      const balance = safeNumber(client?.saldo_atual ?? client?.saldo);
      if (balance < 0) accumulator.receivable += Math.abs(balance);
      if (balance > 0) accumulator.payable += balance;
      return accumulator;
    }, { receivable: 0, payable: 0 });

    return {
      ...totals,
      totalPurchasedKg,
      averagePaid,
      averageSold,
      canCalculateMargin,
      marginPerKg,
      grossResult,
      receivable: balances.receivable,
      payable: balances.payable,
    };
  }, [filteredTransactions, clients]);

  const transactionsByClient = useMemo(() => {
    const map = new Map();
    filteredTransactions.forEach((transaction) => {
      const clientId = String(transaction?.clienteId ?? transaction?.cliente_id ?? '');
      if (!map.has(clientId)) map.set(clientId, []);
      map.get(clientId).push(transaction);
    });
    return map;
  }, [filteredTransactions]);

  const enrichedClients = useMemo(() => clients.map((client) => {
    const id = String(client?.id ?? client?._id ?? '');
    const clientTransactions = transactionsByClient.get(id) || [];
    let purchaseKg = 0;
    let purchaseValue = 0;
    let directPurchaseKg = 0;
    let depositKg = 0;
    let industrySaleKg = 0;
    let industrySaleValue = 0;

    clientTransactions.forEach((transaction) => {
      const type = transaction?.tipo;
      const weight = safeNumber(transaction?.peso_kg);
      const value = getTxValue(transaction);
      if (type === STOCK_ENTRY_TYPE) depositKg += weight;
      if (PURCHASE_TYPES.has(type)) {
        purchaseKg += weight;
        purchaseValue += value;
        if (type === DIRECT_PURCHASE_TYPE) directPurchaseKg += weight;
      }
      if (type === INDUSTRY_SALE_TYPE) {
        industrySaleKg += weight;
        industrySaleValue += value;
      }
    });

    return {
      ...client,
      safeId: id,
      entityType: getEntityType(client),
      depositKg,
      purchaseKg,
      purchaseValue,
      directPurchaseKg,
      industrySaleKg,
      industrySaleValue,
      averagePaid: average(purchaseValue, purchaseKg),
      averageSold: average(industrySaleValue, industrySaleKg),
      transactionCount: clientTransactions.length,
    };
  }), [clients, transactionsByClient]);

  const suppliers = useMemo(() => enrichedClients
    .filter((client) => client.entityType === 'FORNECEDOR')
    .sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR')),
  [enrichedClients]);

  const industries = useMemo(() => enrichedClients
    .filter((client) => client.entityType === 'INDUSTRIA')
    .sort((first, second) => String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR')),
  [enrichedClients]);

  const clientsToReceive = useMemo(() => enrichedClients
    .filter((client) => safeNumber(client?.saldo_atual ?? client?.saldo) < 0)
    .sort((first, second) => safeNumber(first?.saldo_atual ?? first?.saldo) - safeNumber(second?.saldo_atual ?? second?.saldo))
    .slice(0, 10), [enrichedClients]);

  const clientsToPay = useMemo(() => enrichedClients
    .filter((client) => safeNumber(client?.saldo_atual ?? client?.saldo) > 0)
    .sort((first, second) => safeNumber(second?.saldo_atual ?? second?.saldo) - safeNumber(first?.saldo_atual ?? first?.saldo))
    .slice(0, 10), [enrichedClients]);

  const recentTransactions = useMemo(() => [...filteredTransactions]
    .sort((first, second) => (getTxDate(second)?.getTime() || 0) - (getTxDate(first)?.getTime() || 0))
    .slice(0, 20), [filteredTransactions]);

  const alerts = useMemo(() => {
    const items = [];
    if (filteredTransactions.length === 0) items.push('Nenhuma movimentação foi encontrada para o período selecionado.');
    if (reportData.marginPerKg !== null && reportData.marginPerKg < 0) {
      items.push('Atenção: o preço médio de venda está abaixo do preço médio pago.');
    }
    return items;
  }, [filteredTransactions.length, reportData.purchaseKg, reportData.industrySaleKg, reportData.marginPerKg]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const kpis = [
    { label: 'Fornecedores', value: suppliers.length, hint: 'Produtores / fornecedores' },
    { label: 'A Receber', value: formatCurrency(reportData.receivable), hint: 'Saldos devedores' },
    { label: 'Saldo a Pagar', value: formatCurrency(reportData.payable), hint: 'Saldos credores' },
    { label: 'Cacau em Depósito', value: formatKg(reportData.stockKg), hint: 'Peso físico depositado' },
    { label: 'Compra de Cacau em Reais', value: formatCurrency(reportData.purchaseValue), hint: 'Compras diretas e de depósito' },
    { label: 'Total Comprado', value: formatKg(reportData.totalPurchasedKg), hint: 'Depósito + compra direta, sem duplicar' },
    { label: 'Total Vendido', value: formatKg(reportData.legacySoldKg), hint: 'Volume registrado nas compras em reais' },
  ];

  const renderMetric = (metric) => (
    <article className={styles.kpiCard} key={metric.label}>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.hint}</small>
    </article>
  );

  if (loading && !clients.length && !transactions.length) {
    return (
      <Layout>
        <div className={styles.stateBox}>Carregando relatório geral...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className={styles.page}>
        <header className={styles.topBar}>
          <div>
            <p className={styles.eyebrow}>GESTÃO RCM</p>
            <h1 className={styles.title}>Relatório Geral</h1>
            <p className={styles.subtitle}>Indicadores de compras, estoque, vendas, saldos e cadastros.</p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => fetchData({ background: true })}
            disabled={refreshing}
          >
            <RefreshCw size={17} className={refreshing ? styles.spinningIcon : undefined} />
            {refreshing ? 'Atualizando...' : 'Atualizar dados'}
          </button>
        </header>

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <section className={styles.filtersCard} aria-label="Filtros do relatório">
          <label className={styles.filterGroup}>
            <span>Data inicial</span>
            <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
          </label>
          <label className={styles.filterGroup}>
            <span>Data final</span>
            <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
          </label>
          <label className={styles.filterGroupSearch}>
            <span>Buscar</span>
            <span className={styles.searchControl}>
              <Search size={17} />
              <input
                type="search"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="Nome, tipo ou observação"
              />
            </span>
          </label>
        </section>

        <section className={styles.kpiGrid}>{kpis.map(renderMetric)}</section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Resumo Consolidado</h2>
              <p>Leitura financeira separada do estoque físico para evitar valores duplicados.</p>
            </div>
          </div>
          <div className={styles.summaryGrid}>
            <article className={styles.summaryCard}>
              <h3>Estoque / Depósito</h3>
              <p><b>Lançamentos:</b> {reportData.categories.ESTOQUE.count}</p>
              <p><b>Peso:</b> {formatKg(reportData.categories.ESTOQUE.peso)}</p>
              <p>Depósito é controle de peso; não entra como compra em reais.</p>
            </article>
            <article className={styles.summaryCard}>
              <h3>Compras em Reais</h3>
              <p><b>Lançamentos:</b> {reportData.categories.COMPRAS.count}</p>
              <p><b>Valor:</b> {formatCurrency(reportData.categories.COMPRAS.total)}</p>
              <p><b>Peso:</b> {formatKg(reportData.categories.COMPRAS.peso)}</p>
              <p><b>Preço médio pago:</b> {reportData.purchaseKg ? formatCurrency(reportData.averagePaid) : '—'}</p>
            </article>
            <article className={styles.summaryCard}>
              <h3>Vendas para Indústria</h3>
              <p><b>Lançamentos:</b> {reportData.categories.VENDAS_INDUSTRIA.count}</p>
              <p><b>Valor:</b> {formatCurrency(reportData.categories.VENDAS_INDUSTRIA.total)}</p>
              <p><b>Peso:</b> {formatKg(reportData.categories.VENDAS_INDUSTRIA.peso)}</p>
              <p><b>Preço médio:</b> {reportData.industrySaleKg ? formatCurrency(reportData.averageSold) : '—'}</p>
            </article>
            <article className={styles.summaryCard}>
              <h3>Adiantamentos</h3>
              <p><b>Lançamentos:</b> {reportData.categories.ADIANTAMENTOS.count}</p>
              <p><b>Valor:</b> {formatCurrency(reportData.categories.ADIANTAMENTOS.total)}</p>
              <p>Valores antecipados aos fornecedores no período.</p>
            </article>
          </div>
        </section>

        {alerts.length ? (
          <section className={styles.alertList} aria-label="Avisos do relatório">
            {alerts.map((alert) => (
              <div className={styles.alertItem} key={alert}>
                <TriangleAlert size={18} />
                <span>{alert}</span>
              </div>
            ))}
          </section>
        ) : null}

        <section className={styles.tableCard}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Cadastros com Saldo a Pagar</h2>
              <p>Maiores saldos credores do período.</p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Nome</th><th>Telefone</th><th>Saldo</th><th>Comprado</th><th>Em depósito</th></tr></thead>
              <tbody>
                {clientsToPay.length ? clientsToPay.map((client) => (
                  <tr key={client.safeId}>
                    <td>{client.nome || '-'}</td><td>{client.telefone || '-'}</td>
                    <td className={styles.positive}>{formatCurrency(safeNumber(client.saldo_atual ?? client.saldo))}</td>
                    <td>{formatKg(client.purchaseKg)}</td><td>{formatKg(client.depositKg)}</td>
                  </tr>
                )) : <tr><td colSpan="5" className={styles.emptyCell}>Nenhum saldo a pagar encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.twoColumns}>
          <section className={styles.tableCard}>
            <h2>Maiores Saldos a Receber</h2>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Cadastro</th><th>Saldo</th><th>Risco</th></tr></thead>
                <tbody>
                  {clientsToReceive.length ? clientsToReceive.map((client) => (
                    <tr key={client.safeId}>
                      <td>{client.nome || '-'}</td>
                      <td className={styles.negative}>{formatCurrency(Math.abs(safeNumber(client.saldo_atual ?? client.saldo)))}</td>
                      <td>{client.perfil_risco || 'Normal'}</td>
                    </tr>
                  )) : <tr><td colSpan="3" className={styles.emptyCell}>Nenhum saldo a receber encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.tableCard}>
            <h2>Fornecedores</h2>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Nome</th><th>Compra (Kg)</th><th>Preço médio pago</th><th>Saldo</th></tr></thead>
                <tbody>
                  {suppliers.length ? suppliers.slice(0, 20).map((client) => (
                    <tr key={client.safeId}>
                      <td>{client.nome || '-'}</td><td>{formatKg(client.purchaseKg + client.depositKg)}</td>
                      <td>{client.purchaseKg ? formatCurrency(client.averagePaid) : '—'}</td>
                      <td>{getBalanceLabel(client.saldo_atual ?? client.saldo)}</td>
                    </tr>
                  )) : <tr><td colSpan="4" className={styles.emptyCell}>Nenhum fornecedor identificado.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className={styles.twoColumns}>
          <section className={styles.tableCard}>
            <h2>Indústrias / Compradores</h2>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Nome</th><th>Vendido (Kg)</th><th>Preço médio venda</th><th>Saldo</th></tr></thead>
                <tbody>
                  {industries.length ? industries.slice(0, 20).map((client) => (
                    <tr key={client.safeId}>
                      <td>{client.nome || '-'}</td><td>{formatKg(client.industrySaleKg)}</td>
                      <td>{client.industrySaleKg ? formatCurrency(client.averageSold) : '—'}</td>
                      <td>{getBalanceLabel(client.saldo_atual ?? client.saldo)}</td>
                    </tr>
                  )) : <tr><td colSpan="4" className={styles.emptyCell}>Nenhuma indústria identificada.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.tableCard}>
            <h2>Últimas Movimentações</h2>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Data</th><th>Cadastro</th><th>Tipo</th><th>Peso</th><th>Valor</th></tr></thead>
                <tbody>
                  {recentTransactions.length ? recentTransactions.map((transaction) => {
                    const client = clientMap.get(String(transaction?.clienteId ?? transaction?.cliente_id ?? ''));
                    return (
                      <tr key={transaction?.id ?? `${transaction?.tipo}-${transaction?.data_transacao}-${transaction?.clienteId}`}>
                        <td>{formatDate(transaction?.data_transacao)}</td>
                        <td>{client?.nome || 'Cadastro não encontrado'}</td>
                        <td>{TRANSACTION_LABELS[transaction?.tipo] || transaction?.tipo || '-'}</td>
                        <td>{safeNumber(transaction?.peso_kg) ? formatKg(transaction?.peso_kg) : '—'}</td>
                        <td>{getTxValue(transaction) ? formatCurrency(getTxValue(transaction)) : '—'}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan="5" className={styles.emptyCell}>Nenhuma movimentação encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className={styles.tableCard}>
          <h2>Relatório Detalhado por Cadastro</h2>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Nome</th><th>Tipo</th><th>CPF</th><th>Telefone</th><th>Depósito</th><th>Comprado</th><th>Vendido à indústria</th><th>Preço pago</th><th>Preço venda</th><th>Saldo</th><th>Mov.</th></tr></thead>
              <tbody>
                {enrichedClients.length ? enrichedClients.map((client) => (
                  <tr key={client.safeId}>
                    <td>{client.nome || '-'}</td><td>{client.entityType}</td><td>{client.cpf || '-'}</td><td>{client.telefone || '-'}</td>
                    <td>{formatKg(client.depositKg)}</td><td>{formatKg(client.purchaseKg)}</td><td>{formatKg(client.industrySaleKg)}</td>
                    <td>{client.purchaseKg ? formatCurrency(client.averagePaid) : '—'}</td>
                    <td>{client.industrySaleKg ? formatCurrency(client.averageSold) : '—'}</td>
                    <td>{getBalanceLabel(client.saldo_atual ?? client.saldo)}</td><td>{client.transactionCount}</td>
                  </tr>
                )) : <tr><td colSpan="11" className={styles.emptyCell}>Nenhum cadastro encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </Layout>
  );
};

export default GeneralReport;
