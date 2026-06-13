export const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const formatCurrency = (value) => {
  return safeNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatNumber = (value, options = {}) => {
  return safeNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
};

export const formatKg = (value) => {
  return `${formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kg`;
};

export const parseDecimal = (value) => {
  if (value === '' || value == null) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  let text = String(value).trim().replace(/\s+/g, '');

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  text = text.replace(/[^\d.-]/g, '');

  const firstDot = text.indexOf('.');
  if (firstDot !== -1) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
};

export const getLocalDateInputValue = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return getLocalDateInputValue(new Date());
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateString) => {
  if (!dateString) return null;

  if (dateString instanceof Date) {
    return new Date(
      dateString.getFullYear(),
      dateString.getMonth(),
      dateString.getDate(),
      12,
      0,
      0,
      0
    );
  }

  const text = String(dateString).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
};

export const formatDate = (dateString) => {
  const date = parseLocalDate(dateString);

  if (!date) return '-';

  return date.toLocaleDateString('pt-BR');
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '-';

  const parsed = new Date(dateString);

  if (Number.isNaN(parsed.getTime())) {
    return formatDate(dateString);
  }

  return parsed.toLocaleString('pt-BR');
};
