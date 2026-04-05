import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
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

const TYPES = {
  ADIANTAMENTO: {
    label: 'Adiantamento',
    desc: 'Lança débito ao cliente',
    color: '#ef4444',
    icon: <CreditCard size={22} />,
  },
  VENDA_NOVO: {
    label: 'Venda de Cacau',
    desc: 'Venda imediata do cacau entregue',
    color: '#10b981',
    icon: <Banknote size={22} />,
  },
  DEPOSITO: {
    label: 'Depósito',
    desc: 'Somente guarda no estoque',
    color: '#d97706',
    icon: <Package size={22} />,
  },
  VENDA_DEPOSITO: {
    label: 'Venda de Depósito',
    desc: 'Vende do estoque já depositado',
    color: '#0ea5e9',
    icon: <ArrowRightLeft size={22} />,
  },
  SAQUE: {
    label: 'Saque',
    desc: 'Retirada de dinheiro da conta do cliente',
    color: '#7c3aed',
    icon: <Wallet size={22} />,
  },
  DEPOSITO_DINHEIRO: {
    label: 'Depósito de Dinheiro',
    desc: 'Entrada de dinheiro na conta do cliente',
    color: '#14b8a6',
    icon: <Landmark size={22} />,
  },
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.58)',
  backdropFilter: 'blur(2px)',
  zIndex: 1100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
};

const modalStyle = {
  width: '100%',
  maxWidth: '980px',
  background: '#ffffff',
  borderRadius: '22px',
  boxShadow: '0 30px 80px rgba(15, 23, 42, 0.22)',
  overflow: 'hidden',
};

const getInitialState = () => ({
  tipo: 'ADIANTAMENTO',
  data: new Date().toISOString().split('T')[0],
  peso: '',
  preco: '',
  valor_total: '',
  observacao: '',
});

const parseDecimal = (value) => {
  if (value === '' || value == null) return 0;

  const cleaned = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  const parts = cleaned.split('.');
  const normalized = parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;
  const number = parseFloat(normalized);

  return Number.isFinite(number) ? number : 0;
};

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
  }, [isAdiantamento, isVendaDeposito, isVendaNovo, isSaque, isDepositoDinheiro]);

  const valorTotalCalculado = useMemo(() => {
    if (isMoneyOnly) {
      return formData.valor_total;
    }

    if (showPeso && showPreco) {
      const pesoNum = parseDecimal(formData.peso);
      const precoNum = parseDecimal(formData.preco);

      if (pesoNum && precoNum) {
        return (pesoNum * precoNum).toFixed(2);
      }
    }

    return '';
  }, [formData.peso, formData.preco, formData.valor_total, isMoneyOnly, showPeso, showPreco]);

  const validationMessage = useMemo(() => {
    if (!formData.data) return 'Informe a data da operação.';

    if (isAdiantamento && !parseDecimal(formData.valor_total)) {
      return 'Informe o valor do adiantamento.';
    }

    if (isSaque && !parseDecimal(formData.valor_total)) {
      return 'Informe o valor do saque.';
    }

    if (isDepositoDinheiro && !parseDecimal(formData.valor_total)) {
      return 'Informe o valor do depósito de dinheiro.';
    }

    if (isDeposito && !parseDecimal(formData.peso)) {
      return 'Informe o peso do depósito.';
    }

    if ((isVendaNovo || isVendaDeposito) && !parseDecimal(formData.peso)) {
      return 'Informe o peso do cacau.';
    }

    if ((isVendaNovo || isVendaDeposito) && !parseDecimal(formData.preco)) {
      return 'Informe o preço por Kg.';
    }

    return '';
  }, [formData.data, formData.peso, formData.preco, formData.valor_total, isAdiantamento, isDeposito, isDepositoDinheiro, isSaque, isVendaDeposito, isVendaNovo]);

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
    const focusTarget = isMoneyOnly
      ? valorRef.current
      : pesoRef.current || precoRef.current || valorRef.current;

    if (!focusTarget) return;

    const raf = window.requestAnimationFrame(() => {
      focusTarget.focus();
      focusTarget.select?.();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [formData.tipo, isMoneyOnly]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

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
        next.peso =
          prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO' ? prev.peso : '';
        next.preco =
          prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO' ? prev.preco : '';
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
        throw new Error(data.message || 'Erro ao salvar no servidor.');
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

  const quickButtons = isMoneyOnly
    ? [50, 100, 200, 500]
    : showPreco
      ? [0.5, 1, 2, 5]
      : [10, 50, 100, 250];

  return (
    <div style={overlayStyle} onMouseDown={handleOverlayMouseDown}>
      <div style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>Nova Movimentação</h3>
            <p style={{ margin: '8px 0 0', color: '#64748b' }}>
              Cliente: <strong>{clienteNome}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '999px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px', display: 'grid', gap: '22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {Object.entries(TYPES).map(([key, config]) => {
                const active = formData.tipo === key;

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
                      cursor: 'pointer',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <div style={{ color: config.color }}>{config.icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{config.label}</div>
                      <div style={{ color: '#64748b', fontSize: '13px' }}>{config.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              <label style={{ display: 'grid', gap: '8px' }}>
                <span>Data da Operação</span>
                <input
                  type="date"
                  name="data"
                  value={formData.data}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                  }}
                />
              </label>

              {showPeso && (
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span>Peso (Kg)</span>
                  <input
                    ref={pesoRef}
                    type="text"
                    name="peso"
                    value={formData.peso}
                    onChange={handleChange}
                    placeholder="Ex: 120,5"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </label>
              )}

              {showPreco && (
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span>Preço por Kg</span>
                  <input
                    ref={precoRef}
                    type="text"
                    name="preco"
                    value={formData.preco}
                    onChange={handleChange}
                    placeholder="Ex: 18,50"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </label>
              )}

              {showTotal && (
                <label style={{ display: 'grid', gap: '8px' }}>
                  <span>{totalLabel}</span>
                  <input
                    ref={valorRef}
                    key={`${formData.tipo}-valor`}
                    type="text"
                    name="valor_total"
                    value={isMoneyOnly ? formData.valor_total : toInputDecimal(valorTotalCalculado)}
                    onChange={handleChange}
                    placeholder="Ex: 500,00"
                    readOnly={!isMoneyOnly}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      background: isMoneyOnly ? '#fff' : '#f8fafc',
                      cursor: isMoneyOnly ? 'text' : 'default',
                    }}
                  />
                </label>
              )}
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '16px',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#0f172a' }}>Preenchimento rápido</strong>

                <button
                  type="button"
                  onClick={handleClearMainFields}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Eraser size={15} />
                  Limpar
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {quickButtons.map((amount) => {
                  const field = isMoneyOnly ? 'valor_total' : showPreco ? 'preco' : 'peso';

                  return (
                    <button
                      key={`${field}-${amount}`}
                      type="button"
                      onClick={() => handleQuickAdd(field, amount)}
                      style={{
                        borderRadius: '999px',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Plus size={14} />
                      {String(amount).replace('.', ',')}
                    </button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'grid', gap: '8px' }}>
              <span>Observação</span>
              <textarea
                name="observacao"
                value={formData.observacao}
                onChange={handleChange}
                rows={4}
                placeholder="Anotação opcional sobre esta movimentação"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '18px 24px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                borderRadius: '12px',
                padding: '11px 16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
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
