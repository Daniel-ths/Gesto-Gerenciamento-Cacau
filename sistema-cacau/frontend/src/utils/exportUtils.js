import jsPDF from 'jspdf';
import 'jspdf-autotable';

const TYPE_LABELS = {
  ADIANTAMENTO: 'Adiantamento',
  DEPOSITO: 'Depósito',
  VENDA_NOVO: 'Venda de Cacau Novo',
  VENDA_DEPOSITO: 'Venda de Depósito',
};

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeNumber(value));
};

const formatKg = (value) => {
  return safeNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

const getTxVisualValue = (tx) => {
  if (!tx) return 0;
  return safeNumber(tx.valor_visual ?? tx.valor_total);
};

const getSafeFileName = (value) => {
  return String(value || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
};

const getTransactionLabel = (tipo) => {
  return TYPE_LABELS[tipo] || tipo || '-';
};

const getTransactionFinancialValue = (tx) => {
  const tipo = tx?.tipo;

  if (tipo === 'DEPOSITO') return 0;
  if (tipo === 'ADIANTAMENTO') return -Math.abs(safeNumber(tx?.valor_total));
  if (tipo === 'VENDA_NOVO' || tipo === 'VENDA_DEPOSITO') {
    return getTxVisualValue(tx);
  }

  return safeNumber(tx?.valor_total);
};

const csvEscape = (value) => {
  const stringValue = String(value ?? '');
  if (/[;"\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

// ==========================================
// GERADOR DE PDF
// ==========================================
export const generatePDF = (cliente, transacoes) => {
  const doc = new jsPDF();

  const safeCliente = cliente || {};
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];

  const vendas = safeTransacoes.filter(
    (t) => t.tipo === 'VENDA_NOVO' || t.tipo === 'VENDA_DEPOSITO'
  );

  const depositos = safeTransacoes.filter((t) => t.tipo === 'DEPOSITO');
  const adiantamentos = safeTransacoes.filter((t) => t.tipo === 'ADIANTAMENTO');

  const totalKgVendido = vendas.reduce((acc, curr) => acc + safeNumber(curr.peso_kg), 0);
  const totalValorVendido = vendas.reduce((acc, curr) => acc + getTxVisualValue(curr), 0);
  const totalKgDepositado = depositos.reduce((acc, curr) => acc + safeNumber(curr.peso_kg), 0);
  const totalAdiantamentos = adiantamentos.reduce(
    (acc, curr) => acc + Math.abs(safeNumber(curr.valor_total ?? curr.valor_visual)),
    0
  );

  const precoMedio = totalKgVendido > 0 ? totalValorVendido / totalKgVendido : 0;
  const saldoFinal = safeNumber(
    safeCliente.saldo_atual ?? safeCliente.saldo ?? 0
  );

  doc.setFontSize(18);
  doc.text('EXTRATO DE CONTA CORRENTE - CACAU', 14, 22);

  doc.setFontSize(10);
  doc.text(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

  doc.setFillColor(240, 240, 240);
  doc.rect(14, 35, 182, 30, 'F');

  doc.setFontSize(12);
  doc.text(`Cliente: ${safeCliente.nome || '-'}`, 20, 42);

  doc.setFontSize(10);
  doc.text(`CPF: ${safeCliente.cpf || '-'}`, 20, 48);
  doc.text(`Telefone: ${safeCliente.telefone || '-'}`, 20, 54);

  doc.text(`Total Vendido: ${formatKg(totalKgVendido)} Kg`, 100, 42);
  doc.text(`Depósito no Período: ${formatKg(totalKgDepositado)} Kg`, 100, 48);
  doc.text(`Preço Médio: ${formatMoney(precoMedio)} / Kg`, 100, 54);

  if (saldoFinal < 0) doc.setTextColor(200, 0, 0);
  else doc.setTextColor(0, 100, 0);

  doc.text(`Saldo Atual: ${formatMoney(saldoFinal)}`, 100, 60);
  doc.setTextColor(0);

  const tableColumn = [
    'Data',
    'Tipo',
    'Peso (Kg)',
    'R$/Kg',
    'Valor',
    'Observação',
  ];

  const tableRows = safeTransacoes.map((t) => {
    const tipo = t.tipo;
    const peso = safeNumber(t.peso_kg);
    const preco = safeNumber(t.preco_por_kg);
    const valorVisual = getTxVisualValue(t);

    let valorTexto = '---';

    if (tipo === 'ADIANTAMENTO') {
      valorTexto = `- ${formatMoney(Math.abs(safeNumber(t.valor_total)))}`;
    } else if (tipo === 'VENDA_NOVO' || tipo === 'VENDA_DEPOSITO') {
      valorTexto = formatMoney(valorVisual);
    }

    return [
      formatDate(t.data_transacao),
      getTransactionLabel(tipo),
      peso > 0 ? formatKg(peso) : '-',
      preco > 0 ? formatMoney(preco) : '-',
      valorTexto,
      t.observacao || '-',
    ];
  });

  doc.autoTable({
    startY: 72,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [44, 62, 80] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = doc.lastAutoTable?.finalY || 80;

  doc.setFontSize(10);
  doc.text(`Resumo de Adiantamentos: ${formatMoney(totalAdiantamentos)}`, 14, finalY + 12);
  doc.text(`Resumo de Vendas: ${formatMoney(totalValorVendido)}`, 14, finalY + 18);

  doc.save(`Extrato_${getSafeFileName(safeCliente.nome)}.pdf`);
};

// ==========================================
// GERADOR DE CSV
// ==========================================
export const generateCSV = (cliente, transacoes) => {
  const safeCliente = cliente || {};
  const safeTransacoes = Array.isArray(transacoes) ? transacoes : [];

  const headers = [
    'Data',
    'Tipo',
    'Observacao',
    'Peso (Kg)',
    'Preco por Kg',
    'Valor Visual',
    'Valor Financeiro',
  ];

  const rows = safeTransacoes.map((t) => {
    const valorVisual = getTxVisualValue(t);
    const valorFinanceiro = getTransactionFinancialValue(t);

    return [
      formatDate(t.data_transacao),
      getTransactionLabel(t.tipo),
      t.observacao || '',
      safeNumber(t.peso_kg) || '',
      safeNumber(t.preco_por_kg) || '',
      t.tipo === 'DEPOSITO' ? '' : valorVisual,
      t.tipo === 'DEPOSITO' ? '' : valorFinanceiro,
    ];
  });

  const csvContent = [
    headers.map(csvEscape).join(';'),
    ...rows.map((row) => row.map(csvEscape).join(';')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `Extrato_${getSafeFileName(safeCliente.nome)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};