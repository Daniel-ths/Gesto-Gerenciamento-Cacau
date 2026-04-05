import React, { useState, useEffect, useCallback, memo } from 'react';
import { Package, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { formatCurrency } from '../utils/formatters';

const styles = {
    wrapper: {
        padding: '0 15px',
    },

    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '12px',
        marginBottom: '10px',
        marginTop: '20px',
        border: '1px solid rgba(255,255,255,0.06)',
    },

    title: {
        color: '#fff',
        fontSize: '12px',
        margin: '0 0 10px 0',
        opacity: 0.72,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 800,
    },

    item: {
        marginBottom: '12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: '8px',
    },

    lastItem: {
        marginBottom: '4px',
        paddingBottom: '0',
    },

    row: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '2px',
    },

    label: {
        display: 'block',
        fontSize: '11px',
        color: '#cbd5e1',
        marginBottom: '2px',
        lineHeight: 1.3,
    },

    value: {
        display: 'block',
        fontSize: '14px',
        fontWeight: 'bold',
        color: '#fff',
        lineHeight: 1.2,
    },

    loading: {
        padding: '20px',
        color: '#aaa',
        fontSize: '12px',
    },

    error: {
        padding: '10px 12px',
        color: '#fca5a5',
        fontSize: '11px',
        lineHeight: 1.4,
    },

    button: {
        background: 'none',
        border: 'none',
        color: '#94a3b8',
        fontSize: '11px',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '4px 0',
    },
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

const SidebarMetrics = () => {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const fetchMetrics = useCallback(async (background = false) => {
        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const response = await api.get('/metrics/saldo-total');

            if (!response.ok) {
                throw new Error('Falha ao buscar métricas.');
            }

            const data = await response.json();

            setMetrics({
                total_estoque: safeNumber(data.total_estoque),
                total_credor: safeNumber(data.total_credor),
                total_devedor: safeNumber(data.total_devedor),
            });

            setError('');
        } catch (err) {
            console.error('Erro metrics sidebar:', err);
            setError('Não foi possível atualizar agora.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics(false);

        const interval = setInterval(() => {
            fetchMetrics(true);
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchMetrics]);

    if (loading && !metrics) {
        return <div style={styles.loading}>Carregando...</div>;
    }

    if (!metrics) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.error}>Métricas indisponíveis.</div>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.card}>
                <h4 style={styles.title}>Resumo do Negócio</h4>

                <div style={styles.item}>
                    <div style={styles.row}>
                        <Package size={14} color="#f0ad4e" />
                        <span style={styles.label}>Cacau em Depósito</span>
                    </div>
                    <span style={{ ...styles.value, color: '#f0ad4e' }}>
                        {formatKg(metrics.total_estoque)}
                    </span>
                </div>

                <div style={styles.item}>
                    <div style={styles.row}>
                        <TrendingDown size={14} color="#d9534f" />
                        <span style={styles.label}>Crédito dos Produtores</span>
                    </div>
                    <span style={{ ...styles.value, color: '#d9534f' }}>
                        {formatCurrency(metrics.total_credor)}
                    </span>
                </div>

                <div style={styles.lastItem}>
                    <div style={styles.row}>
                        <TrendingUp size={14} color="#5cb85c" />
                        <span style={styles.label}>Adiantamentos em Aberto</span>
                    </div>
                    <span style={{ ...styles.value, color: '#5cb85c' }}>
                        {formatCurrency(metrics.total_devedor)}
                    </span>
                </div>
            </div>

            {error ? <div style={styles.error}>{error}</div> : null}

            <button
                onClick={() => fetchMetrics(true)}
                style={styles.button}
                type="button"
                aria-label="Atualizar métricas"
            >
                <RefreshCw
                    size={11}
                    style={{
                        opacity: refreshing ? 0.7 : 1,
                        animation: refreshing ? 'spinSidebar 1s linear infinite' : 'none',
                    }}
                />
                {refreshing ? 'Atualizando...' : 'Atualizar'}
            </button>

            <style>
                {`
                    @keyframes spinSidebar {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}
            </style>
        </div>
    );
};

export default memo(SidebarMetrics);