import React, { useState, useEffect, memo } from 'react';
import {
    X,
    Save,
    Package,
    CreditCard,
    Banknote,
    ArrowRightLeft,
    Plus,
    Eraser,
    Wallet,
    Landmark,
} from 'lucide-react';
import styles from './TransactionModal.module.css';
import { api } from '../api';

const TYPES = {
    ADIANTAMENTO: {
        label: 'Adiantamento',
        desc: 'Lança débito ao cliente',
        color: '#ef4444',
        icon: <CreditCard size={22} />
    },
    VENDA_NOVO: {
        label: 'Venda de Cacau',
        desc: 'Venda imediata do cacau entregue',
        color: '#10b981',
        icon: <Banknote size={22} />
    },
    DEPOSITO: {
        label: 'Depósito',
        desc: 'Somente guarda no estoque',
        color: '#d97706',
        icon: <Package size={22} />
    },
    VENDA_DEPOSITO: {
        label: 'Venda de Depósito',
        desc: 'Vende do estoque já depositado',
        color: '#0ea5e9',
        icon: <ArrowRightLeft size={22} />
    },
    SAQUE: {
        label: 'Saque',
        desc: 'Retirada de dinheiro da conta do cliente',
        color: '#7c3aed',
        icon: <Wallet size={22} />
    },
    DEPOSITO_DINHEIRO: {
        label: 'Depósito de Dinheiro',
        desc: 'Entrada de dinheiro na conta do cliente',
        color: '#14b8a6',
        icon: <Landmark size={22} />
    }
};

const getInitialState = () => ({
    tipo: 'ADIANTAMENTO',
    data: new Date().toISOString().split('T')[0],
    peso: '',
    preco: '',
    valor_total: '',
    observacao: ''
});

const parseDecimal = (value) => {
    if (value === '' || value == null) return 0;

    const cleaned = String(value)
        .trim()
        .replace(/\s+/g, '')
        .replace(',', '.')
        .replace(/[^\d.]/g, '');

    const parts = cleaned.split('.');
    const normalized =
        parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;

    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
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

    let totalLabel = 'Valor Total';
    if (isAdiantamento) totalLabel = 'Valor do Adiantamento';
    if (isVendaDeposito) totalLabel = 'Valor Total da Venda de Depósito';
    if (isVendaNovo) totalLabel = 'Valor Total da Venda';
    if (isSaque) totalLabel = 'Valor do Saque';
    if (isDepositoDinheiro) totalLabel = 'Valor do Depósito de Dinheiro';

    let valorTotalCalculado = '';
    if (isMoneyOnly) {
        valorTotalCalculado = formData.valor_total;
    } else if (showPeso && showPreco) {
        const pesoNum = parseDecimal(formData.peso);
        const precoNum = parseDecimal(formData.preco);

        if (pesoNum && precoNum) {
            valorTotalCalculado = (pesoNum * precoNum).toFixed(2);
        }
    }

    let validationMessage = '';
    if (!formData.data) {
        validationMessage = 'Informe a data da operação.';
    } else if (isAdiantamento) {
        if (!parseDecimal(formData.valor_total)) {
            validationMessage = 'Informe o valor do adiantamento.';
        }
    } else if (isSaque) {
        if (!parseDecimal(formData.valor_total)) {
            validationMessage = 'Informe o valor do saque.';
        }
    } else if (isDepositoDinheiro) {
        if (!parseDecimal(formData.valor_total)) {
            validationMessage = 'Informe o valor do depósito de dinheiro.';
        }
    } else if (isDeposito) {
        if (!parseDecimal(formData.peso)) {
            validationMessage = 'Informe o peso do depósito.';
        }
    } else if (isVendaNovo || isVendaDeposito) {
        if (!parseDecimal(formData.peso)) {
            validationMessage = 'Informe o peso do cacau.';
        } else if (!parseDecimal(formData.preco)) {
            validationMessage = 'Informe o preço por Kg.';
        }
    }

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

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));

        if (error) setError('');
    };

    const handleTypeSelect = (newType) => {
        setFormData((prev) => {
            const next = {
                ...prev,
                tipo: newType,
                observacao: prev.observacao,
                data: prev.data
            };

            if (newType === 'ADIANTAMENTO' || newType === 'SAQUE' || newType === 'DEPOSITO_DINHEIRO') {
                next.peso = '';
                next.preco = '';
                next.valor_total =
                    prev.tipo === newType ? prev.valor_total : '';
            } else if (newType === 'DEPOSITO') {
                next.peso = prev.tipo === 'DEPOSITO' ? prev.peso : '';
                next.preco = '';
                next.valor_total = '';
            } else {
                next.peso =
                    prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO'
                        ? prev.peso
                        : '';
                next.preco =
                    prev.tipo === 'VENDA_NOVO' || prev.tipo === 'VENDA_DEPOSITO'
                        ? prev.preco
                        : '';
                next.valor_total = '';
            }

            return next;
        });

        if (error) setError('');
    };

    const handleQuickAdd = (field, amount) => {
        setFormData((prev) => ({
            ...prev,
            [field]: addToField(prev[field], amount)
        }));

        if (error) setError('');
    };

    const handleClearMainFields = () => {
        setFormData((prev) => ({
            ...prev,
            peso: '',
            preco: '',
            valor_total: ''
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
                observacao: (formData.observacao || '').trim()
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

    return (
        <div className={styles.overlay} onMouseDown={handleOverlayMouseDown}>
            <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerText}>
                        <h3>Nova Movimentação</h3>
                        <small>Cliente: {clienteNome}</small>
                    </div>

                    <button
                        onClick={onClose}
                        className={styles.closeButton}
                        type="button"
                        disabled={loading}
                        aria-label="Fechar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.formWrap}>
                    <div className={styles.typeGrid}>
                        {Object.entries(TYPES).map(([key, config]) => (
                            <button
                                key={key}
                                type="button"
                                className={`${styles.typeCard} ${formData.tipo === key ? styles.active : ''}`}
                                onClick={() => handleTypeSelect(key)}
                                style={{ color: formData.tipo === key ? config.color : '' }}
                                aria-pressed={formData.tipo === key}
                            >
                                <div className={styles.typeIcon}>{config.icon}</div>
                                <div className={styles.typeContent}>
                                    <span className={styles.typeLabel}>{config.label}</span>
                                    <small>{config.desc}</small>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className={styles.formBody}>
                        <div className={styles.sectionBlock}>
                            <div className={styles.formGroup}>
                                <label>Data da Operação</label>
                                <input
                                    type="date"
                                    name="data"
                                    value={formData.data}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles.sectionBlock}>
                            <div className={styles.sectionHeader}>
                                <strong>Preenchimento rápido</strong>
                                <button
                                    type="button"
                                    className={styles.quickClearButton}
                                    onClick={handleClearMainFields}
                                >
                                    <Eraser size={14} />
                                    Limpar
                                </button>
                            </div>

                            <div className={styles.quickActions}>
                                {showPeso && (
                                    <>
                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('peso', 1)}
                                        >
                                            <Plus size={14} />
                                            +1 Kg
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('peso', 0.5)}
                                        >
                                            <Plus size={14} />
                                            +0,5 Kg
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('peso', 0.1)}
                                        >
                                            <Plus size={14} />
                                            +0,1 Kg
                                        </button>
                                    </>
                                )}

                                {showPreco && (
                                    <>
                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('preco', 5)}
                                        >
                                            <Plus size={14} />
                                            +5 R$
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('preco', 1)}
                                        >
                                            <Plus size={14} />
                                            +1 R$
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('preco', 0.1)}
                                        >
                                            <Plus size={14} />
                                            +0,1 R$
                                        </button>
                                    </>
                                )}

                                {isMoneyOnly && (
                                    <>
                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('valor_total', 5)}
                                        >
                                            <Plus size={14} />
                                            +5 R$
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('valor_total', 1)}
                                        >
                                            <Plus size={14} />
                                            +1 R$
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.quickButton}
                                            onClick={() => handleQuickAdd('valor_total', 0.1)}
                                        >
                                            <Plus size={14} />
                                            +0,1 R$
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className={styles.sectionBlock}>
                            <div className={styles.row}>
                                {showPeso && (
                                    <div className={styles.formGroup}>
                                        <label>
                                            {isDeposito
                                                ? 'Peso do Depósito'
                                                : isVendaDeposito
                                                    ? 'Peso Vendido do Depósito'
                                                    : 'Peso do Cacau'}
                                        </label>
                                        <div className={styles.inputWrapper}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                name="peso"
                                                value={formData.peso}
                                                onChange={handleChange}
                                                placeholder="0,00"
                                                autoComplete="off"
                                                spellCheck={false}
                                                autoFocus={!isMoneyOnly}
                                            />
                                            <span className={styles.suffix}>Kg</span>
                                        </div>
                                    </div>
                                )}

                                {showPreco && (
                                    <div className={styles.formGroup}>
                                        <label>Preço por Kg</label>
                                        <div className={styles.inputWrapper}>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                name="preco"
                                                value={formData.preco}
                                                onChange={handleChange}
                                                placeholder="0,00"
                                                autoComplete="off"
                                                spellCheck={false}
                                            />
                                            <span className={styles.suffix}>R$</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {showTotal && (
                                <div className={styles.formGroup}>
                                    <label>{totalLabel}</label>

                                    <div className={styles.inputWrapper}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            name="valor_total"
                                            value={
                                                isMoneyOnly
                                                    ? formData.valor_total
                                                    : toInputDecimal(valorTotalCalculado)
                                            }
                                            onChange={handleChange}
                                            placeholder="0,00"
                                            readOnly={!isMoneyOnly}
                                            autoComplete="off"
                                            spellCheck={false}
                                            autoFocus={isMoneyOnly}
                                            style={{
                                                fontWeight: 'bold',
                                                color: currentTypeConfig.color,
                                                backgroundColor: !isMoneyOnly ? '#f8fafc' : '#fff'
                                            }}
                                        />
                                        <span className={styles.suffix}>R$</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.sectionBlock}>
                            <div className={styles.formGroup}>
                                <label>Observação (Opcional)</label>
                                <input
                                    type="text"
                                    name="observacao"
                                    value={formData.observacao}
                                    onChange={handleChange}
                                    placeholder="Detalhes..."
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        {!!error && <div className={styles.errorBox}>{error}</div>}

                        {(isVendaNovo || isVendaDeposito) && formData.peso && formData.preco && (
                            <div className={styles.totalHighlight}>
                                <small>
                                    {isVendaDeposito
                                        ? 'Resumo da Venda de Depósito'
                                        : 'Resumo da Venda de Cacau'}
                                </small>

                                <div className={styles.highlightLine}>
                                    <span>{formData.peso} Kg</span>
                                    <X size={12} />
                                    <span>R$ {formData.preco}</span>
                                    <span>=</span>
                                    <span
                                        className={styles.totalValue}
                                        style={{ color: currentTypeConfig.color }}
                                    >
                                        R$ {toInputDecimal(valorTotalCalculado || '0.00')}
                                    </span>
                                </div>
                            </div>
                        )}

                        {isDeposito && (
                            <div
                                className={styles.totalHighlight}
                                style={{ background: '#fff7ed', borderColor: '#fdba74' }}
                            >
                                <Package size={22} color="#d97706" />
                                <div
                                    className={styles.totalValue}
                                    style={{ color: '#d97706' }}
                                >
                                    + {formData.peso || '0'} Kg
                                </div>
                                <small style={{ color: '#9a3412' }}>
                                    Será adicionado ao estoque do cliente.
                                </small>
                            </div>
                        )}

                        {isAdiantamento && formData.valor_total && (
                            <div
                                className={styles.totalHighlight}
                                style={{ background: '#fef2f2', borderColor: '#fca5a5' }}
                            >
                                <CreditCard size={22} color="#ef4444" />
                                <div
                                    className={styles.totalValue}
                                    style={{ color: '#ef4444' }}
                                >
                                    R$ {formData.valor_total || '0,00'}
                                </div>
                                <small style={{ color: '#991b1b' }}>
                                    Será lançado como débito na conta corrente do cliente.
                                </small>
                            </div>
                        )}

                        {isSaque && formData.valor_total && (
                            <div
                                className={styles.totalHighlight}
                                style={{ background: '#f5f3ff', borderColor: '#c4b5fd' }}
                            >
                                <Wallet size={22} color="#7c3aed" />
                                <div
                                    className={styles.totalValue}
                                    style={{ color: '#7c3aed' }}
                                >
                                    R$ {formData.valor_total || '0,00'}
                                </div>
                                <small style={{ color: '#5b21b6' }}>
                                    Será lançado como saque da conta corrente do cliente.
                                </small>
                            </div>
                        )}

                        {isDepositoDinheiro && formData.valor_total && (
                            <div
                                className={styles.totalHighlight}
                                style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}
                            >
                                <Landmark size={22} color="#14b8a6" />
                                <div
                                    className={styles.totalValue}
                                    style={{ color: '#14b8a6' }}
                                >
                                    R$ {formData.valor_total || '0,00'}
                                </div>
                                <small style={{ color: '#115e59' }}>
                                    Será lançado como depósito de dinheiro na conta do cliente.
                                </small>
                            </div>
                        )}
                    </div>

                    <div className={styles.footer}>
                        <button
                            type="button"
                            onClick={onClose}
                            className={styles.cancelBtn}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className={styles.saveBtn}
                            disabled={isSubmitDisabled}
                            style={{ backgroundColor: currentTypeConfig.color }}
                        >
                            <Save size={18} />
                            {loading ? 'Salvando...' : 'Confirmar Lançamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default memo(TransactionModal);