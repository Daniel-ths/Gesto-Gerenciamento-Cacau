import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { parseDecimal } from '../utils/formatters';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999,
  padding: '18px',
};

const modalStyle = {
  width: '100%',
  maxWidth: '920px',
  maxHeight: '94vh',
  background: '#ffffff',
  borderRadius: '20px',
  boxShadow: '0 25px 60px rgba(15, 23, 42, 0.22)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle = {
  padding: '22px 24px 16px',
  borderBottom: '1px solid #e2e8f0',
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
};

const bodyStyle = {
  padding: '24px',
  overflow: 'auto',
};

const baseGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1.1fr 1.2fr 0.9fr',
  gap: '16px',
};

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  outline: 'none',
  fontSize: '14px',
  background: '#fff',
};

const footerStyle = {
  padding: '18px 24px 24px',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  flexWrap: 'wrap',
};

const secondaryButtonStyle = {
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  borderRadius: '12px',
  padding: '11px 16px',
  fontWeight: 700,
};

const primaryButtonStyle = {
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  borderRadius: '12px',
  padding: '11px 16px',
  fontWeight: 700,
};

const TYPE_OPTIONS = [
  { value: 'FORNECEDOR', label: 'Produtor / Fornecedor' },
  { value: 'INDUSTRIA', label: 'Comprador / Indústria' },
];

const RISK_OPTIONS = ['Normal', 'Bom Pagador (Baixo)', 'Arriscado (Alto)', 'VIP'];

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

  let text = String(value).trim().replace(/\s+/g, '');

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  text = text.replace(/[^\d.]/g, '');

  const firstDot = text.indexOf('.');
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  }

  const [intPart = '', decPart = ''] = text.split('.');
  const normalized = decPart ? `${intPart}.${decPart.slice(0, 2)}` : intPart;

  return normalized;
};

const normalizeTipoCadastro = (value) => {
  const text = String(value || '').trim().toLowerCase();

  if (
    text.includes('industria') ||
    text.includes('indústria') ||
    text.includes('comprador') ||
    text.includes('compradora') ||
    text.includes('fabrica') ||
    text.includes('fábrica')
  ) {
    return 'INDUSTRIA';
  }

  return 'FORNECEDOR';
};

const getInitialState = (defaultType = 'FORNECEDOR') => ({
  id: null,
  nome: '',
  cpf: '',
  telefone: '',
  endereco: '',
  taxa_juros: '0',
  perfil_risco: 'Normal',
  tipo_cadastro: normalizeTipoCadastro(defaultType),
});

const getResponsiveGridStyle = () => {
  if (typeof window === 'undefined') return baseGridStyle;

  if (window.innerWidth <= 760) {
    return {
      ...baseGridStyle,
      gridTemplateColumns: '1fr',
    };
  }

  return baseGridStyle;
};

const ClientForm = ({ onClose, onSave, clientToEdit, defaultType = 'FORNECEDOR' }) => {
  const [clientData, setClientData] = useState(getInitialState(defaultType));
  const [responsiveGrid, setResponsiveGrid] = useState(getResponsiveGridStyle());

  useEffect(() => {
    const handleResize = () => setResponsiveGrid(getResponsiveGridStyle());

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (clientToEdit) {
      setClientData({
        id: clientToEdit.id || clientToEdit._id || null,
        nome: clientToEdit.nome || '',
        cpf: clientToEdit.cpf || '',
        telefone: clientToEdit.telefone || '',
        endereco: clientToEdit.endereco || '',
        taxa_juros: String(clientToEdit.taxa_juros ?? '0').replace('.', ','),
        perfil_risco: clientToEdit.perfil_risco || 'Normal',
        tipo_cadastro: normalizeTipoCadastro(clientToEdit.tipo_cadastro || clientToEdit.categoria || clientToEdit.tipo),
      });
    } else {
      setClientData(getInitialState(defaultType));
    }
  }, [clientToEdit, defaultType]);

  const title = useMemo(() => {
    return clientData.id ? 'Editar Cadastro' : 'Novo Cadastro';
  }, [clientData.id]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    setClientData((prev) => {
      if (name === 'taxa_juros') {
        return {
          ...prev,
          [name]: normalizeInterest(value).replace('.', ','),
        };
      }

      if (name === 'tipo_cadastro') {
        return {
          ...prev,
          [name]: normalizeTipoCadastro(value),
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
        const normalized = normalizeInterest(value);
        return { ...prev, taxa_juros: normalized ? normalized.replace('.', ',') : '0' };
      }

      return prev;
    });
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();

      const nome = String(clientData.nome || '').trim();

      if (!nome) {
        alert('O nome é obrigatório.');
        return;
      }

      onSave({
        ...clientData,
        nome,
        cpf: formatCPF(clientData.cpf),
        telefone: formatPhone(clientData.telefone),
        taxa_juros: Math.max(0, parseDecimal(clientData.taxa_juros)),
        tipo_cadastro: normalizeTipoCadastro(clientData.tipo_cadastro),
      });
    },
    [clientData, onSave]
  );

  const isMobile = responsiveGrid.gridTemplateColumns === '1fr';
  const fullWidth = isMobile ? {} : { gridColumn: '1 / -1' };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#0f172a' }}>{title}</h2>
          <p style={{ margin: 0, color: '#64748b' }}>
            Cadastre produtores, fornecedores e compradores no mesmo fluxo.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={bodyStyle}>
            <div style={responsiveGrid}>
              <label style={fieldStyle}>
                <span>Tipo de Cadastro</span>
                <select name="tipo_cadastro" value={clientData.tipo_cadastro} onChange={handleChange} style={inputStyle}>
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                <span>Nome Completo</span>
                <input
                  name="nome"
                  value={clientData.nome}
                  onChange={handleChange}
                  placeholder="Digite o nome completo"
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span>CPF</span>
                <input
                  name="cpf"
                  value={clientData.cpf}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="000.000.000-00"
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span>Telefone</span>
                <input
                  name="telefone"
                  value={clientData.telefone}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="(00) 00000-0000"
                  style={inputStyle}
                />
              </label>

              <label style={{ ...fieldStyle, ...(isMobile ? {} : { gridColumn: '2 / 4' }) }}>
                <span>Endereço</span>
                <input
                  name="endereco"
                  value={clientData.endereco}
                  onChange={handleChange}
                  placeholder="Digite o endereço"
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span>Taxa de Juros (% a.m.)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="taxa_juros"
                  value={clientData.taxa_juros}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="0"
                  style={inputStyle}
                />
                <small style={{ color: '#64748b' }}>Use 0 para cliente sem juros. Ex: 3 ou 10.</small>
              </label>

              <label style={{ ...fieldStyle, ...(isMobile ? {} : { gridColumn: '2 / 3' }) }}>
                <span>Perfil de Risco</span>
                <select name="perfil_risco" value={clientData.perfil_risco} onChange={handleChange} style={inputStyle}>
                  {RISK_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div style={fullWidth} />
            </div>
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>
              Cancelar
            </button>
            <button type="submit" style={primaryButtonStyle}>
              Salvar Dados
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default memo(ClientForm);
