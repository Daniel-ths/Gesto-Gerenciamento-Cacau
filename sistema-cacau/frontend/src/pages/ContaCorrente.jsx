import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { api } from '../api';
import { formatCurrency, formatDate } from '../utils/formatters';
import styles from './ContaCorrente.module.css';

const TYPE_META = {
  ADIANTAMENTO: { label: 'Adiantamento', badge: 'DÉBITO', tone: 'debito' },
  DEPOSITO: { label: 'Depósito de Cacau', badge: 'ESTOQUE', tone: 'neutro' },
  VENDA_NOVO: { label: 'Compra de Cacau em Reais', badge: 'COMPRA', tone: 'credito' },
  VENDA_DEPOSITO: { label: 'Compra de Cacau (do Depósito)', badge: 'COMPRA', tone: 'saidaEstoque' },
  VENDA_INDUSTRIA: { label: 'Venda para Indústria', badge: 'A RECEBER', tone: 'debito' },
  SAQUE: { label: 'Saque', badge: 'RETIRADA', tone: 'debito' },
  DEPOSITO_DINHEIRO: { label: 'Depósito de Dinheiro', badge: 'ENTRADA', tone: 'credito' },
};

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatKg = (value) => `${safeNumber(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})} Kg`;

const normalizeRegistrationType = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const buildProjection = ({ principal, monthlyRate, months, progressive, increment, everyMonths }) => {
  const debt = Math.abs(safeNumber(principal));
  const rows = [];
  const totalMonths = Math.max(0, Math.floor(safeNumber(months)));
  const baseRate = Math.max(0, safeNumber(monthlyRate));
  let balance = debt;

  for (let month = 1; month <= totalMonths; month += 1) {
    const blocks = progressive ? Math.floor((month - 1) / Math.max(1, safeNumber(everyMonths))) : 0;
    const effectiveRate = baseRate + (blocks * safeNumber(increment));
    const interest = balance * (effectiveRate / 100);
    const startBalance = balance;
    balance += interest;
    rows.push({ month, startBalance, effectiveRate, interest, endBalance: balance });
  }

  return { principal: debt, totalInterest: balance - debt, finalAmount: balance, rows };
};

const getTxValue = (transaction) => Math.abs(safeNumber(transaction?.valor_visual ?? transaction?.valor_total));

const ContaCorrente = () => {
  const navigate = useNavigate();
  const { id: clienteId } = useParams();
  const invalidId = !clienteId || clienteId === 'undefined' || clienteId === 'null';

  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [overdueMonths, setOverdueMonths] = useState(3);
  const [customRate, setCustomRate] = useState('');
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [progressiveInterest, setProgressiveInterest] = useState(false);
  const [stepPercent, setStepPercent] = useState(3);
  const [stepMonths, setStepMonths] = useState(3);
  const [savingRate, setSavingRate] = useState(false);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const string = params.toString();
    return string ? `?${string}` : '';
  }, [startDate, endDate]);

  const fetchAccountData = useCallback(async ({ background = false } = {}) => {
    if (invalidId) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await api.get(`/conta-corrente/${clienteId}${buildQuery()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Não foi possível carregar a conta corrente.');
      }
      const data = await response.json();
      setAccountData(data);
    } catch (requestError) {
      console.error('Erro ao carregar conta corrente:', requestError);
      setError(requestError.message || 'Não foi possível carregar a conta corrente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildQuery, clienteId, invalidId]);

  useEffect(() => {
    if (invalidId) { setLoading(false); return; }
    fetchAccountData();
  }, [fetchAccountData, invalidId]);

  useEffect(() => {
    const rate = safeNumber(accountData?.cliente?.taxa_juros);
    setCustomRate(String(rate || 3));
  }, [accountData?.cliente?.taxa_juros]);

  const handleDelete = useCallback(async (transaction) => {
    const label = TYPE_META[transaction?.tipo]?.label || transaction?.tipo || 'lançamento';
    if (!window.confirm(`Excluir "${label}"? Esta ação recalcula o saldo da conta.`)) return;

    const previous = accountData;
    setAccountData((current) => ({
      ...current,
      extrato: (current?.extrato || []).filter((item) => item.id !== transaction.id),
    }));

    try {
      const response = await api.delete(`/transacoes/${transaction.id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Não foi possível excluir o lançamento.');
      }
      setMessage('Lançamento removido com sucesso.');
      fetchAccountData({ background: true });
    } catch (requestError) {
      setAccountData(previous);
      alert(requestError.message || 'Erro ao excluir lançamento.');
    }
  }, [accountData, fetchAccountData]);

  const saveInterestRate = async () => {
    const client = accountData?.cliente;
    const rate = safeNumber(customRate);
    if (!client) return;
    if (rate < 0 || rate > 100) {
      setError('Informe uma taxa mensal entre 0% e 100%.');
      return;
    }

    setSavingRate(true);
    setError('');
    try {
      const response = await api.put(`/clientes/${client.id ?? clienteId}`, {
        nome: client.nome || '',
        cpf: client.cpf || '',
        telefone: client.telefone || '',
        endereco: client.endereco || '',
        taxa_juros: rate,
        perfil_risco: client.perfil_risco || 'Normal',
        tipo_cadastro: client.tipo_cadastro || client.categoria || 'FORNECEDOR',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Não foi possível salvar a taxa de juros.');
      }
      setAccountData((current) => ({
        ...current,
        cliente: { ...current.cliente, taxa_juros: rate },
      }));
      setUseCustomRate(false);
      setMessage(`Taxa de ${rate}% a.m. salva no cadastro de forma permanente.`);
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível salvar a taxa de juros.');
    } finally {
      setSavingRate(false);
    }
  };

  const summary = useMemo(() => {
    const values = {
      advances: 0,
      purchasesDirect: 0,
      purchasesDeposit: 0,
      stockInKg: 0,
      stockOutKg: 0,
      industrySales: 0,
      industrySalesKg: 0,
      withdrawals: 0,
      moneyDeposits: 0,
    };

    (accountData?.extrato || []).forEach((transaction) => {
      const value = getTxValue(transaction);
      const weight = safeNumber(transaction?.peso_kg);
      switch (transaction?.tipo) {
        case 'ADIANTAMENTO': values.advances += value; break;
        case 'VENDA_NOVO': values.purchasesDirect += value; break;
        case 'VENDA_DEPOSITO': values.purchasesDeposit += value; values.stockOutKg += weight; break;
        case 'DEPOSITO': values.stockInKg += weight; break;
        case 'VENDA_INDUSTRIA': values.industrySales += value; values.industrySalesKg += weight; break;
        case 'SAQUE': values.withdrawals += value; break;
        case 'DEPOSITO_DINHEIRO': values.moneyDeposits += value; break;
        default: break;
      }
    });
    return values;
  }, [accountData]);

  if (invalidId) {
    return <Layout><div className={styles.pageStateError}>ID do cadastro inválido.</div></Layout>;
  }
  if (loading && !accountData) {
    return <Layout><div className={styles.pageState}><Loader2 size={19} className={styles.spinningIcon} /> Carregando conta corrente...</div></Layout>;
  }
  if (error && !accountData) {
    return <Layout><div className={styles.pageStateError}>{error}</div></Layout>;
  }
  if (!accountData?.cliente) {
    return <Layout><div className={styles.pageStateError}>Cadastro não encontrado.</div></Layout>;
  }

  const { cliente } = accountData;
  const extrato = accountData.extrato || [];
  const registrationType = normalizeRegistrationType(cliente.tipo_cadastro || cliente.categoria || cliente.tipo);
  const isIndustry = registrationType.includes('INDUSTRIA') || registrationType.includes('COMPRADOR');
  const balance = safeNumber(cliente.saldo);
  const balanceIsReceivable = balance < 0;
  const permanentRate = safeNumber(cliente.taxa_juros) || 3;
  const effectiveRate = useCustomRate ? safeNumber(customRate) : permanentRate;
  const debt = Math.abs(Math.min(0, balance));
  const projection = buildProjection({
    principal: debt,
    monthlyRate: effectiveRate,
    months: overdueMonths,
    progressive: progressiveInterest,
    increment: stepPercent,
    everyMonths: stepMonths,
  });

  return (
    <Layout>
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <button className={styles.backButton} type="button" onClick={() => navigate(-1)}><ArrowLeft size={17} /> Voltar</button>
            <div className={styles.headerText}>
              <p className={styles.eyebrow}>CONTA CORRENTE</p>
              <h1 className={styles.title}>{isIndustry ? 'Conta Comercial' : 'Conta do Produtor'}: {cliente.nome}</h1>
              <div className={styles.info}>
                <span><b>Tipo:</b> {isIndustry ? 'Comprador / Indústria' : 'Produtor / Fornecedor'}</span>
                <span><b>CPF:</b> {cliente.cpf || '-'}</span>
                <span><b>Telefone:</b> {cliente.telefone || '-'}</span>
                <span><b>Risco:</b> {cliente.perfil_risco || 'Normal'}</span>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.refreshButton} type="button" onClick={() => fetchAccountData({ background: true })} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? styles.spinningIcon : undefined} /> {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
              <button className={styles.transactionButton} type="button" onClick={() => setShowModal(true)}><Plus size={17} /> Novo lançamento</button>
            </div>
          </div>
        </header>

        {error ? <div className={styles.pageStateError}>{error}</div> : null}
        {message ? <div className={styles.successBox}><Check size={17} /> {message}<button type="button" onClick={() => setMessage('')}>×</button></div> : null}

        <section className={styles.summaryGrid}>
          <article className={styles.balanceCard}>
            <p>Saldo Financeiro</p>
            <h3 className={balanceIsReceivable ? styles.saldoDevedor : styles.saldoCredor}>{formatCurrency(Math.abs(balance))}</h3>
            <small>{balanceIsReceivable ? 'A receber deste cadastro' : 'A pagar a este cadastro'}</small>
          </article>
          <article className={styles.balanceCard}>
            <p>Cacau em Depósito</p>
            <h3>{formatKg(cliente.total_depositado)}</h3>
            <small>Estoque líquido vinculado à conta</small>
          </article>
          <article className={styles.balanceCard}>
            <p>Compras em Reais</p>
            <h3>{formatCurrency(summary.purchasesDirect + summary.purchasesDeposit)}</h3>
            <small>Compra direta + compra do depósito</small>
          </article>
          <article className={styles.balanceCard}>
            <p>Venda para Indústria</p>
            <h3>{formatCurrency(summary.industrySales)}</h3>
            <small>{formatKg(summary.industrySalesKg)} registrados no filtro</small>
          </article>
        </section>

        <section className={styles.filterContainer} aria-label="Filtros do extrato">
          <label>Data inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>Data final<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <button className={styles.applyFilterButton} type="button" onClick={() => fetchAccountData({ background: true })}>Aplicar filtros</button>
          <button className={styles.clearFilterButton} type="button" onClick={() => { setStartDate(''); setEndDate(''); }}>Limpar</button>
        </section>

        <section className={styles.quickSummary}>
          <article><span>Adiantamentos</span><strong>{formatCurrency(summary.advances)}</strong></article>
          <article><span>Compra direta</span><strong>{formatCurrency(summary.purchasesDirect)}</strong></article>
          <article><span>Compra do depósito</span><strong>{formatCurrency(summary.purchasesDeposit)}</strong></article>
          <article><span>Saques</span><strong>{formatCurrency(summary.withdrawals)}</strong></article>
          <article><span>Depósito em dinheiro</span><strong>{formatCurrency(summary.moneyDeposits)}</strong></article>
        </section>

        <section className={styles.debtPanel}>
          <header className={styles.debtPanelHeader}>
            <div>
              <div className={styles.debtPanelTitle}><Calculator size={18} /> Taxa de juros e simulação</div>
              <p>Altere a taxa mensal e salve para manter o valor permanentemente no cadastro.</p>
            </div>
            <span className={styles.debtStatusBadge}>{debt > 0 ? 'SALDO A RECEBER' : 'SEM DÉBITO ATUAL'}</span>
          </header>
          <div className={styles.debtPanelBody}>
            <div className={styles.debtFormGrid}>
              <label className={styles.debtField}><span>Taxa de juros mensal (%)</span><input type="number" min="0" max="100" step="0.01" value={customRate} onChange={(event) => setCustomRate(event.target.value)} /></label>
              <label className={styles.debtField}><span>Meses em atraso (simulação)</span><input type="number" min="0" step="1" value={overdueMonths} onChange={(event) => setOverdueMonths(event.target.value)} /></label>
              <label className={styles.debtField}><span>Juros progressivos</span><select value={progressiveInterest ? 'SIM' : 'NAO'} onChange={(event) => setProgressiveInterest(event.target.value === 'SIM')}><option value="NAO">Não</option><option value="SIM">Sim</option></select></label>
              {progressiveInterest ? <><label className={styles.debtField}><span>Acréscimo por etapa (%)</span><input type="number" min="0" step="0.01" value={stepPercent} onChange={(event) => setStepPercent(event.target.value)} /></label><label className={styles.debtField}><span>Intervalo da etapa (meses)</span><input type="number" min="1" step="1" value={stepMonths} onChange={(event) => setStepMonths(event.target.value)} /></label></> : null}
            </div>
            <div className={styles.debtActions}>
              <button className={styles.saveRateButton} type="button" onClick={saveInterestRate} disabled={savingRate}>{savingRate ? <Loader2 size={16} className={styles.spinningIcon} /> : <Save size={16} />} Salvar taxa no cadastro</button>
              <label className={styles.simulationToggle}><input type="checkbox" checked={useCustomRate} onChange={(event) => setUseCustomRate(event.target.checked)} /> Usar taxa digitada somente nesta simulação</label>
              <button className={styles.debtResetButton} type="button" onClick={() => { setCustomRate(String(permanentRate)); setUseCustomRate(false); setOverdueMonths(3); setProgressiveInterest(false); setStepPercent(3); setStepMonths(3); }}><RotateCcw size={16} /> Restaurar padrão</button>
            </div>
            <div className={styles.debtSummaryGrid}>
              <article><span>Dívida base</span><strong>{formatCurrency(projection.principal)}</strong></article>
              <article><span>Taxa usada</span><strong>{effectiveRate}% a.m.</strong></article>
              <article><span>Juros projetados</span><strong>{formatCurrency(projection.totalInterest)}</strong></article>
              <article><span>Total projetado</span><strong>{formatCurrency(projection.finalAmount)}</strong></article>
            </div>
            {debt <= 0 ? <div className={styles.debtNotice}><AlertTriangle size={17} /> Não existe saldo devedor nesta conta para projetar juros.</div> : null}
            {projection.rows.length ? <div className={styles.debtProjectionTableWrap}><div className={styles.debtProjectionHeader}>Projeção mensal</div><div className={styles.debtProjectionScroll}><table className={styles.debtProjectionTable}><thead><tr><th>Mês</th><th>Saldo inicial</th><th>Taxa</th><th>Juros</th><th>Saldo final</th></tr></thead><tbody>{projection.rows.map((row) => <tr key={row.month}><td>{row.month}</td><td>{formatCurrency(row.startBalance)}</td><td>{row.effectiveRate}%</td><td>{formatCurrency(row.interest)}</td><td>{formatCurrency(row.endBalance)}</td></tr>)}</tbody></table></div></div> : null}
          </div>
        </section>

        <section className={styles.tableWrapper}>
          <div className={styles.tableHeader}><div><h2>Extrato da Conta</h2><p>{extrato.length} movimentação(ões) no período.</p></div></div>
          <table className={styles.table}>
            <thead><tr><th>Data</th><th>Tipo</th><th>Peso</th><th>Preço / Kg</th><th>Valor</th><th>Observação</th><th>Ação</th></tr></thead>
            <tbody>
              {extrato.length ? extrato.map((transaction) => {
                const meta = TYPE_META[transaction.tipo] || { label: transaction.tipo || '-', badge: '', tone: 'neutro' };
                const value = getTxValue(transaction);
                const isNegative = ['ADIANTAMENTO', 'SAQUE', 'VENDA_INDUSTRIA'].includes(transaction.tipo);
                return <tr key={transaction.id} className={styles[meta.tone] || ''}>
                  <td>{formatDate(transaction.data_transacao)}</td>
                  <td><div className={styles.typeCell}><span>{meta.label}</span>{meta.badge ? <small>{meta.badge}</small> : null}</div></td>
                  <td>{safeNumber(transaction.peso_kg) ? formatKg(transaction.peso_kg) : '—'}</td>
                  <td>{safeNumber(transaction.preco_kg) ? formatCurrency(transaction.preco_kg) : '—'}</td>
                  <td className={isNegative ? styles.valueNegative : styles.valuePositive}>{transaction.tipo === 'DEPOSITO' ? '—' : `${isNegative ? '− ' : ''}${formatCurrency(value)}`}</td>
                  <td>{transaction.observacao || '—'}</td>
                  <td><button className={styles.deleteButton} type="button" onClick={() => handleDelete(transaction)} title="Excluir lançamento"><Trash2 size={16} /></button></td>
                </tr>;
              }) : <tr><td className={styles.emptyCell} colSpan="7">Nenhuma movimentação encontrada para o período selecionado.</td></tr>}
            </tbody>
          </table>
        </section>
      </main>

      {showModal ? <TransactionModal clienteId={cliente.id ?? clienteId} clienteNome={cliente.nome} tipoCadastro={cliente.tipo_cadastro} onClose={() => setShowModal(false)} onSuccess={() => { setMessage('Lançamento salvo com sucesso.'); fetchAccountData({ background: true }); }} /> : null}
    </Layout>
  );
};

export default ContaCorrente;
