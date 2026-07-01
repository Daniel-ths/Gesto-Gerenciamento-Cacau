const toSafeNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseDecimal = toSafeNumber;

export const formatCurrency = (value) => {
  const numberValue = toSafeNumber(value);

  return numberValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

export const formatNumber = (value, options = {}) => {
  const numberValue = toSafeNumber(value);

  return numberValue.toLocaleString('pt-BR', {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
};

export const formatDate = (dateString) => {
  if (!dateString) return '-';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('pt-BR');
};

export const getLocalDateInputValue = (date = new Date()) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const offsetDate = new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().split('T')[0];
};

export const toInputDecimal = (value) => {
  const numberValue = toSafeNumber(value);
  if (!numberValue) return '';

  return numberValue
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace('.', ',');
};
