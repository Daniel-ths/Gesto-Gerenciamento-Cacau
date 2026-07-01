import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { api } from '../api';
import { formatCurrency } from '../utils/formatters';
import styles from './TransactionModal.module.css';

const TYPES = {
  ADIANTAMENTO: {
    title: 'Adiantamento',
    description: 'Valor antecipado ao fornecedor.',
    needsWeight: false,
    needsPrice: false,
    needsManualValue: true,
  },
  DEPOSITO: {
    title: 'Depósito de Cacau',
    description: 'Entrada de cacau em estoque, sem gerar valor financeiro.',
    needsWeight: true,
    needsPrice: false,
    needsManualValue: false,
  },
  VENDA_NOVO: {
    title: 'Compra de Cacau em Reais',
    description: 'Compra direta de cacau, com peso e preço por kg.',
    needsWeight: true,
    needsPrice: true,
    needsManualValue: false,
  },
  VENDA_DEPOSITO: {
    title: 'Compra de Cacau em Reais (do Depósito)',
    description: 'Paga o cacau já depositado e baixa o estoque vinculado ao cadastro.',
    needsWeight: true,
    needsPrice: true,
    needsManualValue: false,
  },
  VENDA_INDUSTRIA: {
    title: 'Venda de Cacau para Indústria',
    description: 'Registra a venda para comprador/indústria e gera valor a receber.',
    needsWeight: true,
    needsPrice: true,
    needsManualValue: false,
    isNew: true,
  },
  SAQUE: {
    title: 'Saque',
    description: 'Retirada de valor da conta.',
    needsWeight: false,
    needsPrice: false,
    needsManualValue: true,
  },
  DEPOSITO_DINHEIRO: {
    title: 'Depósito de Dinheiro',
    description: 'Entrada de pagamento ou crédito financeiro.',
    needsWeight: false,
    needsPrice: false,
    needsManualValue: true,
  },
};

const safeNumber = (value) => {
  const numeric = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

const today = () => new Date().toISOString().slice(0, 10);

const TransactionModal = ({ onClose, onSuccess, clienteId, clienteNome, tipoCadastro }) => {
  const [form, setForm] = useState({
    tipo: 'ADIANTAMENTO',
    peso_kg: '',
    preco_kg: '',
    valor: '',
    observacao: '',
    data_transacao: today(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedType = TYPES[form.tipo] || TYPES.ADIANTAMENTO;
  const isIndustryAccount = String(tipoCadastro || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('INDUSTRIA');

  const calculatedValue = useMemo(() => {
    if (selectedType.needsPrice) return safeNumber(form.peso_kg) * safeNumber(form.preco_kg);
    return safeNumber(form.valor);
  }, [form.peso_kg, form.preco_kg, form.valor, selectedType.needsPrice]);

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
  };

  const selectType = (type) => {
    setError('');
    setForm((current) => ({
      ...current,
      tipo: type,
      peso_kg: TYPES[type].needsWeight ? current.peso_kg : '',
      preco_kg: TYPES[type].needsPrice ? current.preco_kg : '',
      valor: TYPES[type].needsManualValue ? current.valor : '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const weight = safeNumber(form.peso_kg);
    const price = safeNumber(form.preco_kg);
    const value = calculatedValue;

    if (selectedType.needsWeight && weight <= 0) {
      setError('Informe um peso maior que zero.');
      return;
    }
    if (selectedType.needsPrice && price <= 0) {
      setError('Informe o preço por kg.');
      return;
    }
    if (selectedType.needsManualValue && value <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/transacoes', {
        clienteId,
        tipo: form.tipo,
        peso_kg: selectedType.needsWeight ? weight : 0,
        preco_kg: selectedType.needsPrice ? price : 0,
        valor: value,
        observacao: form.observacao.trim(),
        data_transacao: form.data_transacao,
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
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose?.();
    }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transaction-modal-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>LANÇAMENTO</p>
            <h2 id="transaction-modal-title">Nova movimentação</h2>
            <p>{clienteNome ? `Conta: ${clienteNome}` : 'Selecione os dados do lançamento.'}</p>
          </div>
          <button className={styles.closeButton} type="button" onClick={onClose} disabled={submitting} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.typeGrid}>
            {Object.entries(TYPES).map(([type, definition]) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeButton} ${form.tipo === type ? styles.typeButtonSelected : ''}`}
                onClick={() => selectType(type)}
                disabled={submitting}
              >
                <span className={styles.typeTitle}>{definition.title}{definition.isNew ? <em>Novo</em> : null}</span>
                <small>{definition.description}</small>
              </button>
            ))}
          </div>

          {form.tipo === 'VENDA_INDUSTRIA' && !isIndustryAccount ? (
            <div className={styles.warning}>Use esta opção somente para contas de indústria/comprador.</div>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}

          <div className={styles.fieldGrid}>
            <label>
              <span>Data</span>
              <input type="date" name="data_transacao" value={form.data_transacao} onChange={updateField} disabled={submitting} />
            </label>
            {selectedType.needsWeight ? (
              <label>
                <span>Peso (Kg)</span>
                <input type="number" name="peso_kg" min="0" step="0.01" value={form.peso_kg} onChange={updateField} placeholder="0,00" disabled={submitting} />
              </label>
            ) : null}
            {selectedType.needsPrice ? (
              <label>
                <span>Preço por Kg (R$)</span>
                <input type="number" name="preco_kg" min="0" step="0.01" value={form.preco_kg} onChange={updateField} placeholder="0,00" disabled={submitting} />
              </label>
            ) : null}
            {selectedType.needsManualValue ? (
              <label>
                <span>Valor (R$)</span>
                <input type="number" name="valor" min="0" step="0.01" value={form.valor} onChange={updateField} placeholder="0,00" disabled={submitting} />
              </label>
            ) : null}
            <label className={styles.totalField}>
              <span>Valor do lançamento</span>
              <output>{selectedType.needsWeight || selectedType.needsManualValue ? formatCurrency(calculatedValue) : 'Sem valor financeiro'}</output>
            </label>
          </div>

          <label className={styles.fullField}>
            <span>Observação</span>
            <textarea name="observacao" rows="3" value={form.observacao} onChange={updateField} placeholder="Opcional" disabled={submitting} />
          </label>

          <footer className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>Cancelar</button>
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
