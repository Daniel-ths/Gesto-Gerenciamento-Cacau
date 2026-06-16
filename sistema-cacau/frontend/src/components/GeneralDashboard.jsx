import React, { memo, useMemo } from 'react';
import {
    Package,
    TrendingUp,
    TrendingDown,
    Users,
    AlertTriangle,
    Percent,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import styles from './GeneralDashboard.module.css';

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const formatKg = (value) => {
    return `${toNumber(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })} Kg`;
};

const EMPTY_RESUMO = {
    totalEstoque: 0,
    totalPagar: 0,
    totalReceber: 0,
    clientesComJuros: 0,
    clientesRiscoAlto: 0,
    totalClientes: 0,
};

function GeneralDashboardComponent({ clientes = [], loading = false }) {
    const resumo = useMemo(() => {
        if (!Array.isArray(clientes) || clientes.length === 0) {
            return EMPTY_RESUMO;
        }

        let totalEstoque = 0;
        let totalPagar = 0;
        let totalReceber = 0;
        let clientesComJuros = 0;
        let clientesRiscoAlto = 0;
        const totalClientes = clientes.length;

        for (let i = 0; i < clientes.length; i++) {
            const cliente = clientes[i];

            const estoque = toNumber(cliente.total_depositado);
            const saldo = toNumber(cliente.saldo_atual);
            const juros = toNumber(cliente.taxa_juros);
            const risco = String(cliente.perfil_risco || '').toLowerCase();

            totalEstoque += estoque;

            // saldo positivo = crédito do produtor
            if (saldo > 0) {
                totalPagar += saldo;
            }
            // saldo negativo = adiantamento em aberto / valor a receber
            else if (saldo < 0) {
                totalReceber += Math.abs(saldo);
            }

            if (juros > 0) clientesComJuros++;
            if (risco === 'alto') clientesRiscoAlto++;
        }

        return {
            totalEstoque,
            totalPagar,
            totalReceber,
            clientesComJuros,
            clientesRiscoAlto,
            totalClientes,
        };
    }, [clientes]);

    const saldoLiquido = resumo.totalPagar - resumo.totalReceber;

    if (loading) {
        return (
            <div className={styles.stateBox}>
                <div className={styles.loadingDot}></div>
                <span>Atualizando visão geral...</span>
            </div>
        );
    }

    if (!clientes || clientes.length === 0) {
        return (
            <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                    <Users size={22} />
                </div>
                <div>
                    <h3>Nenhum produtor cadastrado</h3>
                    <p>Assim que você cadastrar produtores, os indicadores gerais aparecerão aqui.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.grid}>
                <div className={`${styles.card} ${styles.cardEstoque}`}>
                    <div className={styles.iconArea}>
                        <Package size={22} color="#fff" />
                    </div>
                    <div className={styles.infoArea}>
                        <span>Cacau em Depósito</span>
                        <h3>{formatKg(resumo.totalEstoque)}</h3>
                        <small>Estoque líquido disponível</small>
                    </div>
                </div>

                <div className={`${styles.card} ${styles.cardPagar}`}>
                    <div className={styles.iconArea}>
                        <TrendingDown size={22} color="#fff" />
                    </div>
                    <div className={styles.infoArea}>
                        <span>Crédito dos Produtores</span>
                        <h3>{formatCurrency(resumo.totalPagar)}</h3>
                        <small>Vendas</small>
                    </div>
                </div>

                <div className={`${styles.card} ${styles.cardReceber}`}>
                    <div className={styles.iconArea}>
                        <TrendingUp size={22} color="#fff" />
                    </div>
                    <div className={styles.infoArea}>
                        <span>Adiantamentos em Aberto</span>
                        <h3>{formatCurrency(resumo.totalReceber)}</h3>
                        <small>Valor ainda a compensar</small>
                    </div>
                </div>

                <div className={`${styles.card} ${styles.cardTotal}`}>
                    <div className={styles.iconAreaNeutral}>
                        <Users size={22} color="#475569" />
                    </div>
                    <div className={styles.infoArea}>
                        <span>Total de Produtores</span>
                        <h3>{resumo.totalClientes}</h3>
                        <small>Base total</small>
                    </div>
                </div>
            </div>

            <div className={styles.secondaryGrid}>
                <div className={styles.miniCard}>
                    <div className={styles.miniIconWarning}>
                        <Percent size={18} />
                    </div>
                    <div>
                        <strong>{resumo.clientesComJuros}</strong>
                        <span>com juros ativos</span>
                    </div>
                </div>

                <div className={styles.miniCard}>
                    <div className={styles.miniIconDanger}>
                        <AlertTriangle size={18} />
                    </div>
                    <div>
                        <strong>{resumo.clientesRiscoAlto}</strong>
                        <span>com risco alto</span>
                    </div>
                </div>

                <div className={styles.miniCard}>
                    <div className={styles.miniIconInfo}>
                        <TrendingUp size={18} />
                    </div>
                    <div>
                        <strong>{formatCurrency(Math.abs(saldoLiquido))}</strong>
                        <span>
                            {saldoLiquido >= 0
                                ? 'saldo líquido a pagar'
                                : 'saldo líquido a receber'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

const areEqual = (prevProps, nextProps) => {
    return (
        prevProps.loading === nextProps.loading &&
        prevProps.clientes === nextProps.clientes
    );
};

export default memo(GeneralDashboardComponent, areEqual);