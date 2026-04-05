const toSafeNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const normalized = String(value)
        .trim()
        .replace(/\s+/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrency = (value) => {
    const numberValue = toSafeNumber(value);

    return numberValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
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