import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Filter,
  RefreshCw,
  AlertTriangle,
  Calculator,
  TrendingUp,
  RotateCcw,
  Store,
} from 'lucide-react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { formatCurrency, formatDate } from '../utils/formatters';
import styles from './ContaCorrente.module.css';
import { api } from '../api';

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

const headerButtonStyle = {
  padding: '10px 14px',
  cursor: 'pointer',
  border: '1px solid #d1d5db',
  borderRadius: '10px',
  background: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontWeight: 600,
};

const TYPE_META = {
  ADIANTAMENTO: { label: 'Adiantamento', badge: 'DÉBITO', tone: 'debito' },
  DEPOSITO: { label: 'Depósito', badge: 'ESTOQUE', tone: 'neutro' },
  VENDA_NOVO: { label: 'Venda de Cacau', badge: 'VENDA', tone: 'credito' },
  VENDA_DEPOSITO: { label: 'Venda de Depósito', badge: 'SAÍDA ESTOQUE', tone: 'credito' },
  SAQUE: { label: 'Saque', badge: 'RETIRADA', tone: 'debito' },
  DEPOSITO_DINHEIRO: { label: 'Depósito de Dinheiro', badge: 'ENTRADA', tone: 'credito' },
};

const DEFAULT_INTEREST_STEP_PERCENT = 3;
const DEFAULT_MONTHS_STEP = 3;
const DEFAULT_INTEREST_MODE = 'FIXO';

const normalizeTipoCadastro = (value) => {
  const text = String(value || '').trim().toUpperCase();

  if (
    text.includes('INDUSTRIA') ||
    text.includes('INDÚSTRIA') ||
    text.includes('COMPRADOR') ||
    text.includes('CLIENTE')
  ) {
    return 'INDUSTRIA';
  }

  return 'FORNECEDOR';
};

const buildDebtProjection = ({
  principal = 0,
  baseMonthlyRate = 0,
  overdueMonths = 0,
  mode = 'FIXO',
  stepPercent = DEFAULT_INTEREST_STEP_PERCENT,
  stepMonths = DEFAULT_MONTHS_STEP,
}) => {
  const debt = Math.abs(safeNumber(principal));
  const baseRate = safeNumber(baseMonthlyRate);
  const months = Math.max(0, Math.floor(safeNumber(overdueMonths)));
  const monthlyRows = [];

  if (!debt || months <= 0 || baseRate <= 0) {
    return {
      principal: debt,
      finalAmount: debt,
      totalInterest: 0,
      monthlyRows,
      effectiveLastRate: baseRate,
    };
  }

  let currentAmount = debt;
  let lastRate = baseRate;

  for (let month = 1; month <= months; month += 1) {
    let monthlyRate = baseRate;

    if (mode === 'PROGRESSIVO') {
      const escalationBlocks = Math.floor((month - 1) / Math.max(1, stepMonths));
      monthlyRate = baseRate + escalationBlocks * safeNumber(stepPercent);
    }

    const interestValue = currentAmount * (monthlyRate / 100);
    const updatedAmount = currentAmount + interestValue;

    monthlyRows.push({
      month,
      monthlyRate,
      startingAmount: currentAmount,
      interestValue,
      endingAmount: updatedAmount,
    });

    currentAmount = updatedAmount;
    lastRate = monthlyRate;
  }

  return {
    principal: debt,
    finalAmount: currentAmount,
    totalInterest: currentAmount - debt,
    monthlyRows,
    effectiveLastRate: lastRate,
  };
};

const ContaCorrente = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const clienteId = id;

  const isIdInvalid = !clienteId || clienteId === 'undefined' || clienteId === 'null';

  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [overdueMonths, setOverdueMonths] = useState(3);
  const [interestMode, setInterestMode] = useState(DEFAULT_INTEREST_MODE);
  const [customMonthlyRate, setCustomMonthlyRate] = useState(0);
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [interestStepPercent, setInterestStepPercent] = useState(DEFAULT_INTEREST_STEP_PERCENT);
  const [interestStepMonths, setInterestStepMonths] = useState(DEFAULT_MONTHS_STEP);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();

    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('time', String(Date.now()));

    return `?${params.toString()}`;
  }, [startDate, endDate]);

  const fetchAccountData = useCallback(
    async ({ background = false } = {}) => {
      if (isIdInvalid) return;

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const response = await api.get(`/conta-corrente/${clienteId}${buildQueryString()}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Falha ao buscar conta corrente.');
        }

        const data = await response.json();
        setAccountData(data);
      } catch (err) {
        console.error('Erro no fetch:', err);
        setError(err.message || 'Erro ao carregar conta corrente.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clienteId, isIdInvalid, buildQueryString]
  );

  useEffect(() => {
    if (!isIdInvalid) {
      fetchAccountData();
    } else {
      setLoading(false);
    }
  }, [fetchAccountData, isIdInvalid]);

  useEffect(() => {
    const taxaInicial = safeNumber(accountData?.cliente?.taxa_juros);
    setCustomMonthlyRate(taxaInicial || 3);
  }, [accountData?.cliente?.taxa_juros]);

  const handleDeleteTransaction = useCallback(
    async (transacao) => {
      const descricao = TYPE_META[transacao.tipo]?.label || transacao.tipo || 'transação';

      if (!window.confirm(`Tem certeza que deseja excluir "${descricao}"?`)) return;

      const previousData = accountData;

      setAccountData((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          extrato: prev.extrato.filter((item) => item.id !== transacao.id),
        };
      });

      try {
        const response = await api.delete(`/transacoes/${transacao.id}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Erro ao excluir transação.');
        }

        fetchAccountData({ background: true });
      } catch (err) {
        setAccountData(previousData);
        alert(err.message || 'Erro de conexão ao excluir.');
      }
    },
    [accountData, fetchAccountData]
  );

  const handleClearFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
  }, []);

  const handleApplyFilters = useCallback(() => {
    fetchAccountData({ background: true });
  }, [fetchAccountData]);

  const handleRefresh = useCallback(() => {
    fetchAccountData({ background: true });
  }, [fetchAccountData]);

  const handleResetInterestSimulation = useCallback(() => {
    const taxaBase = safeNumber(accountData?.cliente?.taxa_juros) || 3;

    setOverdueMonths(3);
    setInterestMode(DEFAULT_INTEREST_MODE);
    setUseCustomRate(false);
    setCustomMonthlyRate(taxaBase);
    setInterestStepPercent(DEFAULT_INTEREST_STEP_PERCENT);
    setInterestStepMonths(DEFAULT_MONTHS_STEP);
  }, [accountData?.cliente?.taxa_juros]);

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

    let totalAdiantamentos = 0;
    let totalVendaNovo = 0;
    let totalVendaDeposito = 0;
    let totalEntradaDepositoKg = 0;
    let totalSaidaDepositoKg = 0;
    let totalSaques = 0;
    let totalDepositosDinheiro = 0;

    for (const transacao of extrato) {
      const tipo = transacao.tipo;
      const peso = safeNumber(transacao.peso_kg);
      const valorVisual = safeNumber(transacao.valor_visual ?? transacao.valor_total);

      if (tipo === 'ADIANTAMENTO') {
        totalAdiantamentos += Math.abs(valorVisual);
      } else if (tipo === 'VENDA_NOVO') {
        totalVendaNovo += valorVisual;
      } else if (tipo === 'VENDA_DEPOSITO') {
        totalVendaDeposito += valorVisual;
        totalSaidaDepositoKg += peso;
      } else if (tipo === 'DEPOSITO') {
        totalEntradaDepositoKg += peso;
      } else if (tipo === 'SAQUE') {
        totalSaques += Math.abs(valorVisual);
      } else if (tipo === 'DEPOSITO_DINHEIRO') {
        totalDepositosDinheiro += valorVisual;
      }
    }

    return {
      totalAdiantamentos,
      totalVendaNovo,
      totalVendaDeposito,
      totalEntradaDepositoKg,
      totalSaidaDepositoKg,
      totalSaques,
      totalDepositosDinheiro,
    };
  }, [accountData]);

  const renderTransactionType = useCallback((transacao) => {
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
  }, []);

  const renderValueCell = useCallback((transacao) => {
    const tipo = transacao.tipo;
    const valorVisual = safeNumber(transacao.valor_visual ?? transacao.valor_total);
    const valorFinanceiro = safeNumber(transacao.valor_total);

    if (tipo === 'DEPOSITO') {
      return <span style={{ color: '#64748b' }}>---</span>;
    }

    if (tipo === 'ADIANTAMENTO' || tipo === 'SAQUE') {
      return (
        <span style={{ color: '#b91c1c', fontWeight: 700 }}>
          - {formatCurrency(Math.abs(valorFinanceiro || valorVisual))}
        </span>
      );
    }

    if (tipo === 'VENDA_NOVO' || tipo === 'VENDA_DEPOSITO' || tipo === 'DEPOSITO_DINHEIRO') {
      return <span style={{ color: '#0f172a', fontWeight: 700 }}>{formatCurrency(valorVisual)}</span>;
    }

    return <span style={{ fontWeight: 700 }}>{formatCurrency(Math.abs(valorFinanceiro || valorVisual))}</span>;
  }, []);

  const getRowStyle = useCallback((transacao) => {
    if (transacao.tipo === 'ADIANTAMENTO' || transacao.tipo === 'SAQUE') {
      return styles.debito;
    }
    if (transacao.tipo === 'DEPOSITO') return styles.neutro;
    if (transacao.tipo === 'VENDA_DEPOSITO') return styles.saidaEstoque;
    return '';
  }, []);

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

  if (loading && !accountData) {
    return (
      <Layout>
        <div className={styles.pageState}>
          <RefreshCw size={18} className={styles.spinningIcon} />
          <span>Carregando dados da conta corrente...</span>
        </div>
      </Layout>
    );
  }

  if (error && !accountData) {
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
          <span>Cliente não encontrado.</span>
        </div>
      </Layout>
    );
  }

  const { cliente, extrato } = accountData;
  const clienteSafeId = cliente.id || cliente._id || clienteId;
  const tipoCadastro = normalizeTipoCadastro(cliente.tipo_cadastro || cliente.categoria || cliente.tipo);
  const isTradeAccount = tipoCadastro === 'INDUSTRIA';
  const pageTitle = isTradeAccount ? `Conta Comercial: ${cliente.nome}` : `Conta do Produtor: ${cliente.nome}`;
  const tipoLabel = isTradeAccount ? 'Comprador / Indústria' : 'Produtor / Fornecedor';

  const saldo = formatBalance(cliente.saldo);

  const totalDepositado = safeNumber(cliente.total_depositado);
  const taxaJurosCadastro = safeNumber(cliente.taxa_juros);
  const taxaJurosEfetiva = useCustomRate ? safeNumber(customMonthlyRate) : taxaJurosCadastro || 3;

  const riscoCredito = cliente.perfil_risco || 'Normal';
  const saldoDevedorAtual = Math.max(0, Math.abs(Math.min(0, safeNumber(cliente.saldo))));

  const debtProjection = buildDebtProjection({
    principal: saldoDevedorAtual,
    baseMonthlyRate: taxaJurosEfetiva,
    overdueMonths,
    mode: interestMode,
    stepPercent: interestStepPercent,
    stepMonths: interestStepMonths,
  });

  const hasDebt = saldoDevedorAtual > 0;
  const showDebtProjection = hasDebt && taxaJurosEfetiva > 0 && overdueMonths > 0;

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
        <button onClick={() => navigate(-1)} style={headerButtonStyle} type="button">
          <ArrowLeft size={16} />
          Voltar
        </button>

        <h2 className={styles.title} style={{ margin: 0 }}>
          {pageTitle}
        </h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={handleRefresh} style={headerButtonStyle} type="button">
            <RefreshCw size={16} className={refreshing ? styles.spinningIcon : undefined} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>

          <button onClick={() => setShowModal(true)} className={styles.transactionButton} type="button">
            <Plus size={16} />
            Novo Lançamento
          </button>
        </div>
      </div>

      {error ? (
        <div className={styles.pageStateError} style={{ marginBottom: '16px' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className={styles.header}>
        <div className={styles.info}>
          <p><strong>Tipo:</strong> {tipoLabel}</p>
          <p><strong>CPF:</strong> {cliente.cpf || '-'}</p>
          <p><strong>Telefone:</strong> {cliente.telefone || '-'}</p>
          <p>
            <strong>Risco:</strong> {riscoCredito} | <strong>Juros Cadastro:</strong> {taxaJurosCadastro}% a.m.
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
          <p>{isTradeAccount ? 'Estoque Vinculado' : 'Cacau em Depósito'}</p>
          <h3>{formatKg(totalDepositado)} Kg</h3>
          <small>{isTradeAccount ? 'Volume disponível nesta conta comercial' : 'Estoque líquido disponível'}</small>
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

      <div
        style={{
          marginTop: '22px',
          marginBottom: '22px',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          background: '#fff',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid #e5e7eb',
            background:
              hasDebt
                ? 'linear-gradient(135deg, #fff7ed 0%, #fef2f2 100%)'
                : 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {isTradeAccount ? (
                <Store size={18} color={hasDebt ? '#b45309' : '#2563eb'} />
              ) : (
                <TrendingUp size={18} color={hasDebt ? '#b45309' : '#2563eb'} />
              )}
              <strong style={{ fontSize: '16px' }}>
                {isTradeAccount ? 'Perfil Comercial' : 'Perfil do Devedor'}
              </strong>
            </div>
            <div style={{ color: '#475569', fontSize: '14px' }}>
              Simulação configurável de juros sobre o saldo devedor.
            </div>
          </div>

          <div
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              background: hasDebt ? '#ffedd5' : '#dbeafe',
              color: hasDebt ? '#9a3412' : '#1d4ed8',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.03em',
            }}
          >
            {hasDebt ? 'CLIENTE DEVEDOR' : 'SEM DÍVIDA ATIVA'}
          </div>
        </div>

        <div style={{ padding: '18px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              marginBottom: '18px',
            }}
          >
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                Meses em atraso
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={overdueMonths}
                onChange={(e) => setOverdueMonths(Math.max(0, safeNumber(e.target.value)))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                Modo de cálculo
              </label>
              <select
                value={interestMode}
                onChange={(e) => setInterestMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: '#fff',
                }}
              >
                <option value="FIXO">Fixo mensal</option>
                <option value="PROGRESSIVO">Progressivo</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                Taxa mensal
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#334155',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useCustomRate}
                    onChange={(e) => setUseCustomRate(e.target.checked)}
                  />
                  Usar taxa manual
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={useCustomRate ? customMonthlyRate : taxaJurosCadastro || 3}
                  onChange={(e) => setCustomMonthlyRate(Math.max(0, safeNumber(e.target.value)))}
                  disabled={!useCustomRate}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    background: useCustomRate ? '#fff' : '#f8fafc',
                  }}
                />
              </div>
            </div>

            {interestMode === 'PROGRESSIVO' && (
              <>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                    Acréscimo por ciclo
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={interestStepPercent}
                    onChange={(e) => setInterestStepPercent(Math.max(0, safeNumber(e.target.value)))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>
                    Meses por ciclo
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={interestStepMonths}
                    onChange={(e) => setInterestStepMonths(Math.max(1, safeNumber(e.target.value)))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '18px',
            }}
          >
            <button
              type="button"
              onClick={handleResetInterestSimulation}
              style={{
                ...headerButtonStyle,
                padding: '9px 12px',
              }}
            >
              <RotateCcw size={14} />
              Resetar Simulação
            </button>

            <div style={{ color: '#64748b', fontSize: '13px' }}>
              {interestMode === 'FIXO' ? (
                <>
                  Padrão atual: <strong>{taxaJurosEfetiva}% ao mês</strong>.
                </>
              ) : (
                <>
                  Progressivo: começa em <strong>{taxaJurosEfetiva}% a.m.</strong> e sobe{' '}
                  <strong>{interestStepPercent}%</strong> a cada <strong>{interestStepMonths} meses</strong>.
                </>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              marginBottom: showDebtProjection ? '18px' : '0',
            }}
          >
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px', background: '#fafafa' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                Saldo devedor base
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#b91c1c' }}>
                {formatCurrency(debtProjection.principal)}
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px', background: '#fafafa' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                Juros acumulados
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#b45309' }}>
                {formatCurrency(debtProjection.totalInterest)}
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px', background: '#fafafa' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                Total projetado
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                {formatCurrency(debtProjection.finalAmount)}
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px', background: '#fafafa' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                Última taxa aplicada
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb' }}>
                {safeNumber(debtProjection.effectiveLastRate).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
                %
              </div>
            </div>
          </div>

          {!hasDebt && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px',
                borderRadius: '12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                fontWeight: 600,
              }}
            >
              <Calculator size={16} />
              Este cliente não possui saldo devedor no momento.
            </div>
          )}

          {hasDebt && taxaJurosEfetiva <= 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px',
                borderRadius: '12px',
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={16} />
              Defina uma taxa mensal válida para usar a simulação.
            </div>
          )}

          {showDebtProjection && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 700,
                }}
              >
                Evolução mês a mês do débito
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr style={{ background: '#fff' }}>
                      <th style={{ textAlign: 'left', padding: '12px', borderBottom: '1px solid #e5e7eb' }}>Mês</th>
                      <th style={{ textAlign: 'right', padding: '12px', borderBottom: '1px solid #e5e7eb' }}>Saldo Inicial</th>
                      <th style={{ textAlign: 'right', padding: '12px', borderBottom: '1px solid #e5e7eb' }}>Taxa do Mês</th>
                      <th style={{ textAlign: 'right', padding: '12px', borderBottom: '1px solid #e5e7eb' }}>Juros do Mês</th>
                      <th style={{ textAlign: 'right', padding: '12px', borderBottom: '1px solid #e5e7eb' }}>Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtProjection.monthlyRows.map((row) => (
                      <tr key={row.month}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>
                          {row.month}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                          {formatCurrency(row.startingAmount)}
                        </td>
                        <td
                          style={{
                            padding: '12px',
                            textAlign: 'right',
                            borderBottom: '1px solid #f1f5f9',
                            fontWeight: 700,
                            color: '#2563eb',
                          }}
                        >
                          {safeNumber(row.monthlyRate).toLocaleString('pt-BR', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                          %
                        </td>
                        <td
                          style={{
                            padding: '12px',
                            textAlign: 'right',
                            borderBottom: '1px solid #f1f5f9',
                            color: '#b45309',
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(row.interestValue)}
                        </td>
                        <td
                          style={{
                            padding: '12px',
                            textAlign: 'right',
                            borderBottom: '1px solid #f1f5f9',
                            fontWeight: 800,
                            color: '#0f172a',
                          }}
                        >
                          {formatCurrency(row.endingAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.filterContainer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} />
          <strong>Filtros</strong>
        </div>

        <label>
          Início:
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>

        <label>
          Fim:
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>

        <button onClick={handleApplyFilters} className={styles.clearFilterButton} type="button">
          Aplicar
        </button>

        <button onClick={handleClearFilters} className={styles.clearFilterButton} type="button">
          Limpar
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Peso (Kg)</th>
              <th style={{ textAlign: 'right' }}>R$/Kg</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th>Obs</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {extrato.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>
                  Nenhum lançamento encontrado para esse período.
                </td>
              </tr>
            )}

            {extrato.map((transacao) => (
              <tr key={transacao.id} className={getRowStyle(transacao)}>
                <td>{formatDate(transacao.data_transacao)}</td>
                <td>{renderTransactionType(transacao)}</td>
                <td style={{ textAlign: 'right' }}>
                  {safeNumber(transacao.peso_kg) > 0 ? `${formatKg(transacao.peso_kg)}` : '-'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {safeNumber(transacao.preco_por_kg) > 0 ? formatCurrency(transacao.preco_por_kg) : '-'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{renderValueCell(transacao)}</td>
                <td>{transacao.observacao || '-'}</td>
                <td>
                  <button
                    onClick={() => handleDeleteTransaction(transacao)}
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
                    type="button"
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

      {showModal && (
        <TransactionModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchAccountData({ background: true });
          }}
          clienteId={clienteSafeId}
          clienteNome={cliente.nome}
          tipoCadastro={tipoCadastro}
          contexto={isTradeAccount ? 'trade' : 'suppliers'}
        />
      )}
    </Layout>
  );
};

export default ContaCorrente;
