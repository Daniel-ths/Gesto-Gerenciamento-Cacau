import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { api } from '../api';
import { formatCurrency, getLocalDateInputValue, parseDecimal } from '../utils/formatters';
import styles from './TransactionModal.module.css';

const TYPES = {
  ADIANTAMENTO: {
    title: 'Adiantamento',
    description: 'Valor antecipado ao fornecedor.',
    needsWeight: false,
    allowsPrice: false,
    needsManualValue: true,
  },
  DEPOSITO: {
    title: 'Depósito de Cacau',
    description: 'Entrada de cacau em estoque, sem gerar valor financeiro.',
    needsWeight: true,
    allowsPrice: false,
    needsManualValue: false,
  },
  VENDA_NOVO: {
    title: 'Compra de Cacau em Reais',
    description: 'Compra direta. Informe o peso; preço e valor são opcionais.',
    needsWeight: true,
    allowsPrice: true,
    needsManualValue: false,
  },
  VENDA_DEPOSITO: {
    title: 'Compra de Cacau em Reais (do Depósito)',
    description: 'Pode ser lançada mesmo sem depósito anterior. Preço e valor são opcionais.',
    needsWeight: true,
    allowsPrice: true,
    needsManualValue: false,
  },
  SAQUE: {
    title: 'Saque',
    description: 'Retirada de valor da conta.',
    needsWeight: false,
    allowsPrice: false,
    needsManualValue: true,
  },
  DEPOSITO_DINHEIRO: {
    title: 'Depósito de Dinheiro',
    description: 'Entrada de pagamento ou crédito financeiro.',
    needsWeight: false,
    allowsPrice: false,
    needsManualValue: true,
  },
};

const getInitialForm = () => ({
  tipo: 'ADIANTAMENTO',
  peso_kg: '',
  preco_por_kg: '',
  valor_total: '',
  observacao: '',
  data_transacao: getLocalDateInputValue(),
});

const hasValue = (value) => String(value ?? '').trim() !== '';

const TransactionModal = ({ onClose, onSuccess, clienteId, clienteNome }) => {
  const [form, setForm] = useState(getInitialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedType = TYPES[form.tipo] || TYPES.ADIANTAMENTO;
  const isSale = form.tipo === 'VENDA_NOVO' || form.tipo === 'VENDA_DEPOSITO';

  const weight = useMemo(() => parseDecimal(form.peso_kg), [form.peso_kg]);
  const price = useMemo(() => parseDecimal(form.preco_por_kg), [form.preco_por_kg]);
  const manualValue = useMemo(() => parseDecimal(form.valor_total), [form.valor_total]);

  const calculatedValue = useMemo(() => {
    if (selectedType.needsManualValue) return manualValue;

    // Para vendas, o valor informado manualmente prevalece. Caso ele não exista,
    // o sistema calcula somente quando há peso e preço preenchidos.
    if (isSale) {
      if (hasValue(form.valor_total)) return manualValue;
      if (weight > 0 && price > 0) return weight * price;
      return 0;
    }

    return 0;
  }, [form.valor_total, isSale, manualValue, price, selectedType.needsManualValue, weight]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError('');
  };

  const selectType = (tipo) => {
    const definition = TYPES[tipo];

    setError('');
    setForm((current) => ({
      ...current,
      tipo,
      peso_kg: definition.needsWeight ? current.peso_kg : '',
      preco_por_kg: definition.allowsPrice ? current.preco_por_kg : '',
      valor_total:
        definition.needsManualValue || definition.allowsPrice
          ? current.valor_total
          : '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.data_transacao) {
      setError('Informe a data da operação.');
      return;
    }

    if (selectedType.needsWeight && weight <= 0) {
      setError('Informe um peso maior que zero.');
      return;
    }

    if (selectedType.needsManualValue && calculatedValue <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/transacoes', {
        clienteId,
        tipo: form.tipo,
        data_transacao: form.data_transacao,
        peso_kg: selectedType.needsWeight ? weight : 0,
        // O preço pode ficar vazio/zero nas vendas, sem bloquear o lançamento.
        preco_por_kg: selectedType.allowsPrice ? price : 0,
        // O valor pode ser manual ou calculado; também pode ser zero nas vendas.
        valor_total: calculatedValue,
        observacao: form.observacao.trim(),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Não foi possível salvar o lançamento.');
      }

      onSuccess?.();
      onClose?.();
    } catch (requestError) {
      console.error('Erro ao salvar transação:', requestError);
      setError(requestError.message || 'Não foi possível salvar o lançamento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose?.();
      }}
    >
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Nova movimentação">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>LANÇAMENTO</p>
            <h2>Nova movimentação</h2>
            <p>{clienteNome ? `Conta: ${clienteNome}` : 'Selecione os dados do lançamento.'}</p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar"
          >
            <X size={19} />
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.typeGrid}>
            {Object.entries(TYPES).map(([tipo, definition]) => {
              const selected = form.tipo === tipo;

              return (
                <button
                  key={tipo}
                  type="button"
                  className={`${styles.typeButton} ${selected ? styles.typeButtonSelected : ''}`}
                  onClick={() => selectType(tipo)}
                  disabled={submitting}
                >
                  <span className={styles.typeTitle}>{definition.title}</span>
                  <small>{definition.description}</small>
                </button>
              );
            })}
          </div>

          {form.tipo === 'VENDA_DEPOSITO' ? (
            <div className={styles.warning}>
              A venda de depósito não exige mais saldo prévio de depósito. O lançamento será salvo normalmente.
            </div>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.fieldGrid}>
            <label>
              Data
              <input
                type="date"
                name="data_transacao"
                value={form.data_transacao}
                onChange={updateField}
                disabled={submitting}
              />
            </label>

            {selectedType.needsWeight ? (
              <label>
                Peso (Kg)
                <input
                  type="text"
                  inputMode="decimal"
                  name="peso_kg"
                  value={form.peso_kg}
                  onChange={updateField}
                  disabled={submitting}
                  placeholder="Ex.: 150,5"
                />
              </label>
            ) : null}

            {selectedType.allowsPrice ? (
              <label>
                Preço por Kg (R$) — opcional
                <input
                  type="text"
                  inputMode="decimal"
                  name="preco_por_kg"
                  value={form.preco_por_kg}
                  onChange={updateField}
                  disabled={submitting}
                  placeholder="Pode deixar vazio"
                />
              </label>
            ) : null}

            {selectedType.needsManualValue || selectedType.allowsPrice ? (
              <label>
                {selectedType.needsManualValue ? 'Valor (R$)' : 'Valor total (R$) — opcional'}
                <input
                  type="text"
                  inputMode="decimal"
                  name="valor_total"
                  value={form.valor_total}
                  onChange={updateField}
                  disabled={submitting}
                  placeholder={selectedType.needsManualValue ? 'Ex.: 1.000,00' : 'Pode deixar vazio'}
                />
              </label>
            ) : null}

            <label className={styles.totalField}>
              Valor do lançamento
              <output>
                {selectedType.needsWeight || selectedType.needsManualValue
                  ? formatCurrency(calculatedValue)
                  : 'Sem valor financeiro'}
              </output>
            </label>
          </div>

          <label className={styles.fullField}>
            Observação
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={updateField}
              disabled={submitting}
              placeholder="Opcional"
            />
          </label>

          <footer className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveButton} disabled={submitting}>
              {submitting ? <Loader2 size={17} className={styles.spin} /> : <CheckCircle2 size={17} />}
              {submitting ? 'Salvando...' : 'Salvar lançamento'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default TransactionModal;
