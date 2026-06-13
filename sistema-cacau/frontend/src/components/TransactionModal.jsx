import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Eraser,
  Landmark,
  Package,
  Plus,
  Save,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../api';
import { formatCurrency, getLocalDateInputValue, parseDecimal } from '../utils/formatters';

const TYPES = {
  ADIANTAMENTO: {
    label: 'Adiantamento',
    desc: 'Lança débito ao cliente com juros pelo cadastro',
    color: '#ef4444',
    Icon: CreditCard,
  },
  VENDA_NOVO: {
    label: 'Venda de Cacau',
    desc: 'Venda imediata do cacau entregue',
    color: '#10b981',
    Icon: Banknote,
  },
  DEPOSITO: {
    label: 'Depósito',
    desc: 'Somente guarda no estoque',
    color: '#d97706',
    Icon: Package,
  },
  VENDA_DEPOSITO: {
    label: 'Venda de Depósito',
    desc: 'Vende do estoque já depositado',
    color: '#0ea5e9',
    Icon: Landmark,
  },
  SAQUE: {
    label: 'Saque',
    desc: 'Retirada de dinheiro da conta do cliente',
    color: '#7c3aed',
    Icon: Wallet,
  },
  DEPOSITO_DINHEIRO: {
    label: 'Depósito de Dinheiro',
    desc: 'Entrada de dinheiro para abater saldo/debito',
    color: '#14b8a6',
    Icon: Plus,
  },
};

const getInitialState = () => ({
  tipo: 'ADIANTAMENTO',
  data: getLocalDateInputValue(),
  peso: '',
  preco: '',
  valor_total: '',
  observacao: '',
});

const toInputDecimal = (value) => {
  if (value === '' || value == null || Number(value) === 0) return '';

  return Number(value)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace('.', ',');
};

const addToField = (currentValue, increment) => {
  const next = parseDecimal(currentValue) + increment;
  return toInputDecimal(next);
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.58)',
    backdropFilter: 'blur(2px)',
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '18px',
  },
  modal: {
    width: '100%',
    maxWidth: '980px',
    maxHeight: '94vh',
    background: '#ffffff',
    borderRadius: '22px',
    boxShadow: '0 30px 80px rgba(15, 23, 42, 0.22)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '22px 24px',
    borderBottom: '1px solid #e2e8f0',
    background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
  },
  title: {
    margin: '0 0 6px',
    fontSize: '20px',
    color: '#0f172a',
  },
  subtitle: {
    margin: 0,
    color: '#64748b',
    fontSize: '14px',
  },
  closeButton: {
    border: 'none',
    background: '#f1f5f9',
    color: '#0f172a',
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    padding: '22px 24px',
    overflow: 'auto',
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontWeight: 700,
    color: '#334155',
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    outline: 'none',
    fontSize: '15px',
    background: '#fff',
  },
  hint: {
    margin: 0,
    color: '#64748b',
    fontSize: '12px',
  },
  quickArea: {
    marginTop: '18px',
    padding: '14px',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  quickButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  quickButton: {
    borderRadius: '999px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    padding: '8px 12px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  error: {
    marginTop: '16px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
    fontWeight: 600,
  },
  footer: {
    padding: '18px 24px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    flexWrap: 'wrap',
  },
  secondaryButton: {
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#334155',
    borderRadius: '12px',
    padding: '11px 16px',
    fontWeight: 700,
  },
};

function TransactionModal({ onClose, onSuccess, clienteId, clienteNome }) {
  const [formData, setFormData] = useState(getInitialState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pesoRef = useRef(null);
  const precoRef = useRef(null);
  const valorRef = useRef(null);

  const currentTypeConfig = TYPES[formData.tipo];

  const isAdiantamento = formData.tipo === 'ADIANTAMENTO';
  const isDeposito = formData.tipo === 'DEPOSITO';
  const isVendaNovo = formData.tipo === 'VENDA_NOVO';
  const isVendaDeposito = formData.tipo === 'VENDA_DEPOSITO';
  const isSaque = formData.tipo === 'SAQUE';
  const isDepositoDinheiro = formData.tipo === 'DEPOSITO_DINHEIRO';
  const isMoneyOnly = isAdiantamento || isSaque || isDepositoDinheiro;
  const showPeso = isDeposito || isVendaNovo || isVendaDeposito;
  const showPreco = isVendaNovo || isVendaDeposito;
  const showTotal = isMoneyOnly || isVendaNovo || isVendaDeposito;

  const totalLabel = useMemo(() => {
    if (isAdiantamento) return 'Valor do Adiantamento';
    if (isVendaDeposito) return 'Valor Total da Venda de Depósito';
    if (isVendaNovo) return 'Valor Total da Venda';
    if (isSaque) return 'Valor do Saque';
    if (isDepositoDinheiro) return 'Valor do Depósito de Dinheiro';
    return 'Valor Total';
  }, [isAdiantamento, isDepositoDinheiro, isSaque, isVendaDeposito, isVendaNovo]);

  const valorTotalCalculado = useMemo(() => {
    if (isMoneyOnly) {
      return formData.valor_total;
    }

    if (showPeso && showPreco) {
      const pesoNum = parseDecimal(formData.peso);
      const precoNum = parseDecimal(formData.preco);

      if (pesoNum > 0 && precoNum > 0) {
        return toInputDecimal(pesoNum * precoNum);
      }
    }

    return '';
  }, [formData.peso, formData.preco, formData.valor_total, isMoneyOnly, showPeso, showPreco]);

  const validationMessage = useMemo(() => {
    if (!formData.data) return 'Informe a data da operação.';

    if (isAdiantamento && parseDecimal(formData.valor_total) <= 0) {
      return 'Informe o valor do adiantamento.';
    }

    if (isSaque && parseDecimal(formData.valor_total) <= 0) {
      return 'Informe o valor do saque.';
    }

    if (isDepositoDinheiro && parseDecimal(formData.valor_total) <= 0) {
      return 'Informe o valor do depósito de dinheiro.';
    }

    if (isDeposito && parseDecimal(formData.peso) <= 0) {
      return 'Informe o peso do depósito.';
    }

    if ((isVendaNovo || isVendaDeposito) && parseDecimal(formData.peso) <= 0) {
      return 'Informe o peso do cacau.';
    }

    if ((isVendaNovo || isVendaDeposito) && parseDecimal(formData.preco) <= 0) {
      return 'Informe o preço por Kg.';
    }

    return '';
  }, [
    formData.data,
    formData.peso,
    formData.preco,
    formData.valor_total,
    isAdiantamento,
    isDeposito,
    isDepositoDinheiro,
    isSaque,
    isVendaDeposito,
    isVendaNovo,
  ]);

  const isSubmitDisabled = loading || !!validationMessage;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  useEffect(() => {
    const focusTarget = isMoneyOnly ? valorRef.current : pesoRef.current || precoRef.current || valorRef.current;

    if (!focusTarget) return undefined;

    const raf = window.requestAnimationFrame(() => {
      focusTarget.focus();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [formData.tipo, isMoneyOnly]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) setError('');
  };

  const handleTypeSelect = (newType) => {
    setFormData((prev) => {
      const next = {
        ...prev,
        tipo: newType,
        observacao: prev.observacao,
        data: prev.data,
      };

      if (newType === 'ADIANTAMENTO' || newType === 'SAQUE' || newType === 'DEPOSITO_DINHEIRO') {
        next.peso = '';
        next.preco = '';
        next.valor_total = prev.tipo === newType ? prev.valor_total : '';
      } else if (newType === 'DEPOSITO') {
        next.peso = prev.tipo === 'DEPOSITO' ? prev.peso : '';
        next.preco = '';
        next.valor_total = '';
      } else {
        next.peso = prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO' ? prev.peso : '';
        next.preco = prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO' ? prev.preco : '';
        next.valor_total = '';
      }

      return next;
    });

    if (error) setError('');
  };

  const handleQuickAdd = (field, amount) => {
    setFormData((prev) => ({
      ...prev,
      [field]: addToField(prev[field], amount),
    }));

    if (error) setError('');
  };

  const handleClearMainFields = () => {
    setFormData((prev) => ({
      ...prev,
      peso: '',
      preco: '',
      valor_total: '',
    }));

    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        clienteId,
        tipo: formData.tipo,
        data_transacao: formData.data,
        peso_kg: showPeso ? parseDecimal(formData.peso) : 0,
        preco_por_kg: showPreco ? parseDecimal(formData.preco) : 0,
        valor_total: showTotal ? parseDecimal(valorTotalCalculado) : 0,
        observacao: (formData.observacao || '').trim(),
      };

      const response = await api.post('/transacoes', payload);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Erro ao salvar no servidor.');
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Falha desconhecida.');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose?.();
    }
  };

  const quickButtons = isMoneyOnly ? [50, 100, 200, 500] : showPreco ? [0.5, 1, 2, 5] : [10, 50, 100, 250];
  const quickField = isMoneyOnly ? 'valor_total' : showPreco ? 'preco' : 'peso';
  const CurrentIcon = currentTypeConfig.Icon;

  return (
    <div style={styles.overlay} onMouseDown={handleOverlayMouseDown}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Nova Movimentação</h2>
            <p style={styles.subtitle}>Cliente: {clienteNome || 'cliente selecionado'}</p>
          </div>

          <button type="button" onClick={onClose} disabled={loading} style={styles.closeButton}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.body}>
            <div style={styles.typeGrid}>
              {Object.entries(TYPES).map(([key, config]) => {
                const active = formData.tipo === key;
                const Icon = config.Icon;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTypeSelect(key)}
                    aria-pressed={active}
                    style={{
                      textAlign: 'left',
                      borderRadius: '16px',
                      border: active ? `1px solid ${config.color}` : '1px solid #e2e8f0',
                      background: active ? `${config.color}15` : '#fff',
                      padding: '14px',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <Icon size={22} color={config.color} />
                    <strong style={{ color: '#0f172a' }}>{config.label}</strong>
                    <span style={{ color: '#64748b', fontSize: '13px' }}>{config.desc}</span>
                  </button>
                );
              })}
            </div>

            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.label}>Data da Operação</span>
                <input
                  type="date"
                  name="data"
                  value={formData.data}
                  onChange={handleChange}
                  style={styles.input}
                />
              </label>

              {showPeso && (
                <label style={styles.field}>
                  <span style={styles.label}>Peso (Kg)</span>
                  <input
                    ref={pesoRef}
                    type="text"
                    inputMode="decimal"
                    name="peso"
                    value={formData.peso}
                    onChange={handleChange}
                    placeholder="Ex: 100,50"
                    style={styles.input}
                  />
                </label>
              )}

              {showPreco && (
                <label style={styles.field}>
                  <span style={styles.label}>Preço por Kg</span>
                  <input
                    ref={precoRef}
                    type="text"
                    inputMode="decimal"
                    name="preco"
                    value={formData.preco}
                    onChange={handleChange}
                    placeholder="Ex: 12,50"
                    style={styles.input}
                  />
                </label>
              )}

              {showTotal && (
                <label style={styles.field}>
                  <span style={styles.label}>{totalLabel}</span>
                  <input
                    ref={valorRef}
                    type="text"
                    inputMode="decimal"
                    name="valor_total"
                    value={valorTotalCalculado}
                    onChange={handleChange}
                    readOnly={!isMoneyOnly}
                    placeholder="Ex: 1.000,00"
                    style={{
                      ...styles.input,
                      background: !isMoneyOnly ? '#f8fafc' : '#fff',
                      fontWeight: !isMoneyOnly ? 700 : 400,
                    }}
                  />
                  {!isMoneyOnly && valorTotalCalculado ? (
                    <p style={styles.hint}>Total calculado automaticamente: {formatCurrency(parseDecimal(valorTotalCalculado))}</p>
                  ) : null}
                </label>
              )}
            </div>

            <div style={styles.quickArea}>
              <strong>Preenchimento rápido</strong>

              <div style={styles.quickButtons}>
                {quickButtons.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => handleQuickAdd(quickField, amount)}
                    style={styles.quickButton}
                  >
                    <Plus size={14} />
                    {String(amount).replace('.', ',')}
                  </button>
                ))}

                <button type="button" onClick={handleClearMainFields} style={styles.quickButton}>
                  <Eraser size={14} />
                  Limpar
                </button>
              </div>
            </div>

            <label style={{ ...styles.field, marginTop: '18px' }}>
              <span style={styles.label}>Observação</span>
              <textarea
                name="observacao"
                value={formData.observacao}
                onChange={handleChange}
                rows={3}
                placeholder="Opcional"
                style={{ ...styles.input, resize: 'vertical' }}
              />
            </label>

            {error && <div style={styles.error}>{error}</div>}
          </div>

          <div style={styles.footer}>
            <button type="button" onClick={onClose} disabled={loading} style={styles.secondaryButton}>
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitDisabled}
              style={{
                border: 'none',
                background: isSubmitDisabled ? '#93c5fd' : currentTypeConfig.color,
                color: '#fff',
                borderRadius: '12px',
                padding: '11px 16px',
                fontWeight: 700,
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {loading ? null : <CurrentIcon size={16} />}
              <Save size={16} />
              {loading ? 'Salvando...' : 'Salvar Movimentação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(TransactionModal);
