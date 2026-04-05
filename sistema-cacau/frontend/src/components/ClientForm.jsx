import React, { useState, useEffect, useCallback, memo } from 'react';
import styles from './ClientForm.module.css';

const formatCPF = (value) => {
    let v = String(value || '').replace(/\D/g, '').slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return v;
};

const formatPhone = (value) => {
    let v = String(value || '').replace(/\D/g, '').slice(0, 11);

    if (v.length <= 10) {
        v = v.replace(/^(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
        return v;
    }

    v = v.replace(/^(\d{2})(\d)/, '($1) $2');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    return v;
};

const normalizeInterest = (value) => {
    if (value == null) return '';

    let v = String(value)
        .replace(',', '.')
        .replace(/[^\d.]/g, '');

    const firstDot = v.indexOf('.');
    if (firstDot !== -1) {
        v =
            v.slice(0, firstDot + 1) +
            v.slice(firstDot + 1).replace(/\./g, '');
    }

    const [intPart = '', decPart = ''] = v.split('.');
    return decPart ? `${intPart}.${decPart.slice(0, 2)}` : intPart;
};

const getInitialState = () => ({
    id: null,
    nome: '',
    cpf: '',
    telefone: '',
    endereco: '',
    taxa_juros: '0',
    perfil_risco: 'Normal',
});

const ClientForm = ({ onClose, onSave, clientToEdit }) => {
    const [clientData, setClientData] = useState(getInitialState);

    useEffect(() => {
        if (clientToEdit) {
            setClientData({
                id: clientToEdit.id || clientToEdit._id || null,
                nome: clientToEdit.nome || '',
                cpf: clientToEdit.cpf || '',
                telefone: clientToEdit.telefone || '',
                endereco: clientToEdit.endereco || '',
                taxa_juros: String(clientToEdit.taxa_juros ?? '0'),
                perfil_risco: clientToEdit.perfil_risco || 'Normal',
            });
        } else {
            setClientData(getInitialState());
        }
    }, [clientToEdit]);

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;

        setClientData((prev) => {
            if (name === 'taxa_juros') {
                return {
                    ...prev,
                    [name]: normalizeInterest(value),
                };
            }

            return {
                ...prev,
                [name]: value,
            };
        });
    }, []);

    const handleBlur = useCallback((e) => {
        const { name, value } = e.target;

        setClientData((prev) => {
            if (name === 'cpf') {
                return { ...prev, cpf: formatCPF(value) };
            }

            if (name === 'telefone') {
                return { ...prev, telefone: formatPhone(value) };
            }

            if (name === 'taxa_juros') {
                return { ...prev, taxa_juros: normalizeInterest(value) || '0' };
            }

            return prev;
        });
    }, []);

    const handleSubmit = useCallback((e) => {
        e.preventDefault();

        const nome = String(clientData.nome || '').trim();
        if (!nome) {
            alert('O Nome é obrigatório.');
            return;
        }

        onSave({
            ...clientData,
            nome,
            cpf: formatCPF(clientData.cpf),
            telefone: formatPhone(clientData.telefone),
            taxa_juros: parseFloat(normalizeInterest(clientData.taxa_juros) || '0'),
        });
    }, [clientData, onSave]);

    return (
        <div className={styles.modalBackdrop}>
            <div className={styles.modalContent}>
                <h3>{clientData.id ? 'Editar Produtor' : 'Novo Produtor'}</h3>

                <form onSubmit={handleSubmit}>
                    <label>Nome Completo:</label>
                    <input
                        type="text"
                        name="nome"
                        value={clientData.nome}
                        onChange={handleChange}
                        required
                        autoFocus
                        autoComplete="off"
                        style={{ marginBottom: '10px', width: '100%', padding: '8px' }}
                    />

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label>CPF:</label>
                            <input
                                type="text"
                                name="cpf"
                                value={clientData.cpf}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                maxLength={14}
                                inputMode="numeric"
                                placeholder="000.000.000-00"
                                autoComplete="off"
                                style={{ width: '100%', padding: '8px' }}
                            />
                        </div>

                        <div style={{ flex: 1 }}>
                            <label>Telefone:</label>
                            <input
                                type="text"
                                name="telefone"
                                value={clientData.telefone}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                maxLength={15}
                                inputMode="tel"
                                placeholder="(00) 00000-0000"
                                autoComplete="off"
                                style={{ width: '100%', padding: '8px' }}
                            />
                        </div>
                    </div>

                    <label>Endereço:</label>
                    <input
                        type="text"
                        name="endereco"
                        value={clientData.endereco}
                        onChange={handleChange}
                        autoComplete="off"
                        style={{ marginBottom: '15px', width: '100%', padding: '8px' }}
                    />

                    <div
                        style={{
                            borderTop: '1px solid #ccc',
                            paddingTop: '10px',
                            marginTop: '10px',
                            marginBottom: '20px',
                        }}
                    >
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <label>Taxa de Juros (% a.m.):</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    name="taxa_juros"
                                    value={clientData.taxa_juros}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    placeholder="0.00"
                                    autoComplete="off"
                                    style={{ width: '100%', padding: '8px' }}
                                />
                            </div>

                            <div style={{ flex: 1 }}>
                                <label>Perfil de Risco:</label>
                                <select
                                    name="perfil_risco"
                                    value={clientData.perfil_risco}
                                    onChange={handleChange}
                                    style={{ width: '100%', padding: '8px' }}
                                >
                                    <option value="Normal">Normal</option>
                                    <option value="Baixo">Bom Pagador (Baixo)</option>
                                    <option value="Alto">Arriscado (Alto)</option>
                                    <option value="VIP">VIP</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div
                        className={styles.actions}
                        style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}
                    >
                        <button type="button" onClick={onClose} className={styles.cancelButton}>
                            Cancelar
                        </button>
                        <button type="submit" className={styles.saveButton}>
                            Salvar Dados
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default memo(ClientForm);