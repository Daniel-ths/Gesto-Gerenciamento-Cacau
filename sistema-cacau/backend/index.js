const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { pool, query } = require('./db');

dotenv.config();

const app = express();
const router = express.Router();
const PORT = Number(process.env.PORT || 3001);
const TRASH_RETENTION_DAYS = 3;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const allowedOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: '10mb' }));

const TIPOS_TRANSACAO = {
  ADIANTAMENTO: 'ADIANTAMENTO',
  VENDA_NOVO: 'VENDA_NOVO',
  DEPOSITO: 'DEPOSITO',
  VENDA_DEPOSITO: 'VENDA_DEPOSITO',
  SAQUE: 'SAQUE',
  DEPOSITO_DINHEIRO: 'DEPOSITO_DINHEIRO',
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let text = String(value).trim().replace(/\s+/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
};

const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
const round3 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 1000) / 1000;
const isValidTransactionType = (tipo) => Object.values(TIPOS_TRANSACAO).includes(tipo);
const isClientDeleted = (client) => Boolean(client?.deleted_at);

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

const parseLocalDate = (value) => {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return parseLocalDate(null);

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
};

const toDateOnly = (value) => {
  const date = parseLocalDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

const addMonthsClamped = (date, monthsToAdd) => {
  const base = parseLocalDate(date);
  const target = new Date(base.getFullYear(), base.getMonth() + monthsToAdd, 1, 12, 0, 0, 0);
  target.setDate(Math.min(base.getDate(), getDaysInMonth(target.getFullYear(), target.getMonth())));
  return target;
};

const getCompletedMonthlyCycles = (startDate, endDate = new Date()) => {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (end < start) return 0;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (addMonthsClamped(start, months) > end) months -= 1;

  return Math.max(0, months);
};

const sortTransactionsChronologically = (transactions = []) =>
  [...transactions].sort((a, b) => {
    const dateA = parseLocalDate(a.data_transacao || a.created_at || a.createdAt);
    const dateB = parseLocalDate(b.data_transacao || b.created_at || b.createdAt);
    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;

    return String(a.created_at || a.createdAt || a.id || '')
      .localeCompare(String(b.created_at || b.createdAt || b.id || ''));
  });

/*
  Uma venda de depósito agora pode ser cadastrada sem existir um depósito anterior.
  Assim, uma saída sem estoque não deixa o estoque negativo nem "consome" depósitos
  adicionados no futuro. Quando houver estoque, a venda continua baixando normalmente.
*/
const calcularEstoqueCliente = (transacoes = []) => {
  let estoque = 0;

  for (const transacao of sortTransactionsChronologically(transacoes)) {
    const peso = Math.max(0, toNumber(transacao.peso_kg));
    if (transacao.tipo === TIPOS_TRANSACAO.DEPOSITO) estoque += peso;
    if (transacao.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) estoque = Math.max(0, estoque - peso);
  }

  return round3(estoque);
};

const calcularSaldoSemJuros = (transacoes = []) =>
  round2(transacoes.reduce((total, transacao) => total + toNumber(transacao.valor_total), 0));

const calcularResumoFinanceiroCliente = (cliente = {}, transacoes = [], dataReferencia = new Date()) => {
  const taxaMensal = Math.max(0, toNumber(cliente.taxa_juros));
  const taxaDecimal = taxaMensal / 100;
  const dividas = [];
  let creditoLivre = 0;

  for (const transacao of sortTransactionsChronologically(transacoes)) {
    const dataOperacao = parseLocalDate(transacao.data_transacao || transacao.created_at || transacao.createdAt);
    const valorFinanceiro = round2(toNumber(transacao.valor_total));

    if (valorFinanceiro < 0) {
      dividas.push({
        origemId: transacao.id || transacao._id || null,
        tipo: transacao.tipo,
        data: dataOperacao,
        baseRestante: Math.abs(valorFinanceiro),
        valorOriginal: Math.abs(valorFinanceiro),
      });
      continue;
    }

    if (valorFinanceiro <= 0) continue;

    let valorParaAbater = valorFinanceiro;

    for (const divida of dividas) {
      if (valorParaAbater <= 0) break;
      if (divida.baseRestante <= 0) continue;

      const ciclos = getCompletedMonthlyCycles(divida.data, dataOperacao);
      const multiplicador = taxaDecimal > 0 ? Math.pow(1 + taxaDecimal, ciclos) : 1;
      const saldoAtualizadoNaData = round2(divida.baseRestante * multiplicador);
      const abatimento = Math.min(valorParaAbater, saldoAtualizadoNaData);
      const saldoAtualizadoAposAbatimento = round2(saldoAtualizadoNaData - abatimento);

      divida.baseRestante = round2(saldoAtualizadoAposAbatimento / multiplicador);
      valorParaAbater = round2(valorParaAbater - abatimento);
    }

    if (valorParaAbater > 0) creditoLivre = round2(creditoLivre + valorParaAbater);
  }

  const dividasAbertas = dividas
    .filter((divida) => divida.baseRestante > 0.009)
    .map((divida) => {
      const ciclos = getCompletedMonthlyCycles(divida.data, dataReferencia);
      const multiplicador = taxaDecimal > 0 ? Math.pow(1 + taxaDecimal, ciclos) : 1;
      const valorAtualizado = round2(divida.baseRestante * multiplicador);

      return {
        origemId: divida.origemId,
        tipo: divida.tipo,
        data: toDateOnly(divida.data),
        meses_vencidos: ciclos,
        valor_original: round2(divida.valorOriginal),
        principal_restante: round2(divida.baseRestante),
        juros_acumulados: round2(valorAtualizado - divida.baseRestante),
        valor_atualizado: valorAtualizado,
      };
    });

  const totalDevedorAtualizado = round2(
    dividasAbertas.reduce((total, divida) => total + divida.valor_atualizado, 0),
  );
  const jurosAcumulados = round2(
    dividasAbertas.reduce((total, divida) => total + divida.juros_acumulados, 0),
  );

  return {
    saldo_sem_juros: calcularSaldoSemJuros(transacoes),
    saldo_total: round2(creditoLivre - totalDevedorAtualizado),
    total_credito: creditoLivre,
    total_devedor: totalDevedorAtualizado,
    juros_acumulados: jurosAcumulados,
    dividas_abertas: dividasAbertas,
  };
};

const mapCliente = (row = {}) => ({
  ...row,
  _id: row.id,
  taxa_juros: toNumber(row.taxa_juros),
  tipo_cadastro: normalizeTipoCadastro(row.tipo_cadastro),
});

const mapTransacao = (row = {}) => ({
  ...row,
  _id: row.id,
  clienteId: row.cliente_id,
  peso_kg: toNumber(row.peso_kg),
  preco_por_kg: toNumber(row.preco_por_kg),
  valor_total: toNumber(row.valor_total),
  valor_visual: toNumber(row.valor_visual),
});

const agruparTransacoesPorCliente = (transacoes = []) => {
  const grouped = new Map();

  for (const transacao of transacoes) {
    const key = String(transacao.clienteId || transacao.cliente_id || '');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(transacao);
  }

  return grouped;
};

const enrichClient = (cliente, transacoesDoCliente = []) => {
  const resumoFinanceiro = calcularResumoFinanceiroCliente(cliente, transacoesDoCliente);

  return {
    ...cliente,
    id: cliente.id || cliente._id,
    _id: cliente._id || cliente.id,
    tipo_cadastro: normalizeTipoCadastro(cliente.tipo_cadastro || cliente.categoria || cliente.tipo),
    saldo_atual: resumoFinanceiro.saldo_total,
    saldo_sem_juros: resumoFinanceiro.saldo_sem_juros,
    juros_acumulados: resumoFinanceiro.juros_acumulados,
    total_devedor_atualizado: resumoFinanceiro.total_devedor,
    total_depositado: calcularEstoqueCliente(transacoesDoCliente),
  };
};

const purgeExpiredTrash = async () => {
  const expired = await query(
    'SELECT id FROM clientes WHERE deleted_at IS NOT NULL AND purge_at IS NOT NULL AND purge_at <= NOW()',
  );

  if (expired.rowCount === 0) return 0;

  const ids = expired.rows.map((row) => row.id);
  await query('DELETE FROM clientes WHERE id = ANY($1)', [ids]);
  console.log(`[LIXEIRA] ${ids.length} cliente(s) apagado(s) definitivamente.`);
  return ids.length;
};

const ensureDatabase = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
};

router.get('/', (req, res) => {
  res.json({
    status: 'online',
    database: 'PostgreSQL',
    transaction_types: Object.values(TIPOS_TRANSACAO),
    trash_retention_days: TRASH_RETENTION_DAYS,
  });
});

router.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/clientes', async (req, res) => {
  try {
    await purgeExpiredTrash();
    const [clientesResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes WHERE deleted_at IS NULL ORDER BY nome ASC'),
      query('SELECT * FROM transacoes ORDER BY data_transacao ASC, created_at ASC'),
    ]);

    const clientes = clientesResult.rows.map(mapCliente);
    const porCliente = agruparTransacoesPorCliente(transacoesResult.rows.map(mapTransacao));

    res.json(clientes.map((cliente) => enrichClient(cliente, porCliente.get(String(cliente.id)) || [])));
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao listar clientes.' });
  }
});

router.get('/clientes/lixeira', async (req, res) => {
  try {
    await purgeExpiredTrash();
    const [clientesResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
      query('SELECT * FROM transacoes ORDER BY data_transacao ASC, created_at ASC'),
    ]);

    const clientes = clientesResult.rows.map(mapCliente);
    const porCliente = agruparTransacoesPorCliente(transacoesResult.rows.map(mapTransacao));

    res.json(clientes.map((cliente) => enrichClient(cliente, porCliente.get(String(cliente.id)) || [])));
  } catch (error) {
    console.error('Erro ao listar lixeira:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao listar lixeira.' });
  }
});

router.post('/clientes', async (req, res) => {
  try {
    const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro } = req.body || {};
    const nomeLimpo = String(nome || '').trim();

    if (!nomeLimpo) return res.status(400).json({ message: 'O nome é obrigatório.' });

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO clientes
        (id, nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        nomeLimpo,
        cpf || '',
        telefone || '',
        endereco || '',
        toNumber(taxa_juros),
        perfil_risco || 'Normal',
        normalizeTipoCadastro(tipo_cadastro),
      ],
    );

    res.json({ id, message: 'Cliente cadastrado com sucesso!' });
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao criar cliente.' });
  }
});

router.put('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro } = req.body || {};
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente está na lixeira e não pode ser editado.' });
    }

    const nomeLimpo = String(nome || '').trim();
    if (!nomeLimpo) return res.status(400).json({ message: 'O nome é obrigatório.' });

    await query(
      `UPDATE clientes
       SET nome = $2, cpf = $3, telefone = $4, endereco = $5,
           taxa_juros = $6, perfil_risco = $7, tipo_cadastro = $8, updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        nomeLimpo,
        cpf || '',
        telefone || '',
        endereco || '',
        toNumber(taxa_juros),
        perfil_risco || 'Normal',
        normalizeTipoCadastro(tipo_cadastro || cliente.tipo_cadastro),
      ],
    );

    res.json({ message: 'Cliente atualizado!' });
  } catch (error) {
    console.error('Erro ao editar cliente:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao editar cliente.' });
  }
});

router.delete('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (isClientDeleted(cliente)) return res.status(400).json({ message: 'Cliente já está na lixeira.' });

    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + TRASH_RETENTION_MS);

    await query(
      'UPDATE clientes SET deleted_at = $2, purge_at = $3, updated_at = NOW() WHERE id = $1',
      [id, deletedAt, purgeAt],
    );

    res.json({ message: 'Cliente movido para a lixeira.', deleted_at: deletedAt, purge_at: purgeAt });
  } catch (error) {
    console.error('Erro ao mover cliente para lixeira:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao mover cliente para lixeira.' });
  }
});

router.post('/clientes/:id/restaurar', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (!isClientDeleted(cliente)) return res.status(400).json({ message: 'Cliente não está na lixeira.' });

    await query('UPDATE clientes SET deleted_at = NULL, purge_at = NULL, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'Cliente restaurado com sucesso.' });
  } catch (error) {
    console.error('Erro ao restaurar cliente:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao restaurar cliente.' });
  }
});

router.delete('/clientes/:id/definitivo', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (!isClientDeleted(cliente)) return res.status(400).json({ message: 'Cliente não está na lixeira.' });

    await query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ message: 'Cliente apagado definitivamente.' });
  } catch (error) {
    console.error('Erro ao excluir definitivamente:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao excluir definitivamente.' });
  }
});

router.get('/conta-corrente/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const [clienteResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes WHERE id = $1', [id]),
      query('SELECT * FROM transacoes WHERE cliente_id = $1 ORDER BY data_transacao DESC, created_at DESC', [id]),
    ]);

    const cliente = clienteResult.rows[0] ? mapCliente(clienteResult.rows[0]) : null;
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });

    const todasTransacoes = transacoesResult.rows.map(mapTransacao);
    let extrato = todasTransacoes;

    if (startDate || endDate) {
      const start = startDate ? parseLocalDate(startDate) : null;
      const end = endDate ? parseLocalDate(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      extrato = todasTransacoes.filter((transacao) => {
        const data = parseLocalDate(transacao.data_transacao || transacao.created_at);
        if (start && data < start) return false;
        if (end && data > end) return false;
        return true;
      });
    }

    const resumo = calcularResumoFinanceiroCliente(cliente, todasTransacoes);

    res.json({
      cliente: {
        ...cliente,
        id: cliente.id,
        _id: cliente.id,
        tipo_cadastro: normalizeTipoCadastro(cliente.tipo_cadastro || cliente.categoria || cliente.tipo),
        saldo: resumo.saldo_total,
        saldo_sem_juros: resumo.saldo_sem_juros,
        juros_acumulados: resumo.juros_acumulados,
        total_devedor_atualizado: resumo.total_devedor,
        total_credito: resumo.total_credito,
        dividas_abertas: resumo.dividas_abertas,
        total_depositado: calcularEstoqueCliente(todasTransacoes),
        taxa_juros: toNumber(cliente.taxa_juros),
        deleted_at: cliente.deleted_at || null,
        purge_at: cliente.purge_at || null,
      },
      extrato: extrato.map((transacao) => ({
        ...transacao,
        id: transacao.id,
        _id: transacao.id,
        is_deposito: transacao.tipo === TIPOS_TRANSACAO.DEPOSITO,
        is_venda_deposito: transacao.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO,
        is_saque: transacao.tipo === TIPOS_TRANSACAO.SAQUE,
        is_deposito_dinheiro: transacao.tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO,
      })),
    });
  } catch (error) {
    console.error('Erro ao buscar conta corrente:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao buscar conta corrente.' });
  }
});

router.get('/transacoes', async (req, res) => {
  try {
    await purgeExpiredTrash();
    const result = await query(
      `SELECT t.*
       FROM transacoes t
       INNER JOIN clientes c ON c.id = t.cliente_id
       WHERE c.deleted_at IS NULL
       ORDER BY t.data_transacao DESC, t.created_at DESC`,
    );

    res.json(result.rows.map(mapTransacao).map((transacao) => ({ ...transacao, id: transacao.id, _id: transacao.id })));
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao buscar transações.' });
  }
});

router.post('/transacoes', async (req, res) => {
  try {
    const body = req.body || {};
    const clienteId = body.clienteId;
    const tipo = body.tipo;

    // Compatibilidade com versões anteriores do frontend que enviavam preco_kg e valor.
    const pesoNum = round3(toNumber(body.peso_kg));
    const precoNum = round2(toNumber(body.preco_por_kg ?? body.preco_kg));
    let valorRaw = round2(toNumber(body.valor_total ?? body.valor));

    if (!clienteId) return res.status(400).json({ message: 'clienteId é obrigatório.' });
    if (!tipo || !isValidTransactionType(tipo)) {
      return res.status(400).json({ message: 'Tipo de transação inválido.' });
    }

    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [String(clienteId)]);
    const cliente = clienteResult.rows[0];

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (isClientDeleted(cliente)) return res.status(400).json({ message: 'Cliente está na lixeira.' });

    let valorFinalFinanceiro = 0;

    if (tipo === TIPOS_TRANSACAO.ADIANTAMENTO) {
      if (valorRaw <= 0) return res.status(400).json({ message: 'Informe um valor válido para o adiantamento.' });
      valorFinalFinanceiro = -Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.DEPOSITO) {
      if (pesoNum <= 0) return res.status(400).json({ message: 'Informe um peso válido para o depósito.' });
      valorRaw = 0;
      valorFinalFinanceiro = 0;
    } else if (tipo === TIPOS_TRANSACAO.VENDA_NOVO || tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) {
      if (pesoNum <= 0) return res.status(400).json({ message: 'Informe um peso válido para a compra de cacau.' });

      // PREÇO NÃO É MAIS OBRIGATÓRIO.
      // Quando não há valor manual, calcula apenas se existir preço; caso contrário salva valor zero.
      if (valorRaw <= 0 && precoNum > 0) valorRaw = round2(pesoNum * precoNum);
      valorFinalFinanceiro = Math.abs(valorRaw);

      // VENDA_DEPOSITO NÃO EXIGE MAIS ESTOQUE/DEPÓSITO PRÉVIO.
      // Não há verificação de saldo de depósito aqui.
    } else if (tipo === TIPOS_TRANSACAO.SAQUE) {
      if (valorRaw <= 0) return res.status(400).json({ message: 'Informe um valor válido para o saque.' });
      valorFinalFinanceiro = -Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO) {
      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para o depósito de dinheiro.' });
      }
      valorFinalFinanceiro = Math.abs(valorRaw);
    }

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO transacoes
        (id, cliente_id, tipo, peso_kg, preco_por_kg, valor_total, valor_visual, observacao, data_transacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        String(clienteId),
        tipo,
        pesoNum,
        precoNum,
        valorFinalFinanceiro,
        valorRaw,
        body.observacao || '',
        toDateOnly(body.data_transacao),
      ],
    );

    res.json({ id, message: 'Transação registrada!' });
  } catch (error) {
    console.error('Erro ao registrar transação:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao registrar transação.' });
  }
});

router.delete('/transacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM transacoes WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Transação não encontrada.' });

    await query('DELETE FROM transacoes WHERE id = $1', [id]);
    res.json({ message: 'Transação excluída.' });
  } catch (error) {
    console.error('Erro ao excluir transação:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao excluir transação.' });
  }
});

router.get('/metrics/saldo-total', async (req, res) => {
  try {
    await purgeExpiredTrash();
    const [clientesResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes WHERE deleted_at IS NULL'),
      query('SELECT * FROM transacoes ORDER BY data_transacao ASC, created_at ASC'),
    ]);

    const clientes = clientesResult.rows.map(mapCliente);
    const porCliente = agruparTransacoesPorCliente(transacoesResult.rows.map(mapTransacao));

    let totalCredor = 0;
    let totalDevedor = 0;
    let totalEstoque = 0;
    let jurosAcumulados = 0;

    for (const cliente of clientes) {
      const transacoesCliente = porCliente.get(String(cliente.id)) || [];
      const resumo = calcularResumoFinanceiroCliente(cliente, transacoesCliente);

      if (resumo.saldo_total > 0) totalCredor += resumo.saldo_total;
      if (resumo.saldo_total < 0) totalDevedor += Math.abs(resumo.saldo_total);

      jurosAcumulados += resumo.juros_acumulados;
      totalEstoque += calcularEstoqueCliente(transacoesCliente);
    }

    res.json({
      total_credor: round2(totalCredor),
      total_devedor: round2(totalDevedor),
      total_estoque: round3(totalEstoque),
      juros_acumulados: round2(jurosAcumulados),
    });
  } catch (error) {
    console.error('Erro ao calcular métricas:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao calcular métricas.' });
  }
});

router.get('/backup/clientes', async (req, res) => {
  try {
    const [clientesResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes ORDER BY nome ASC'),
      query('SELECT * FROM transacoes ORDER BY data_transacao ASC, created_at ASC'),
    ]);

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-cacau-${date}.json"`);
    res.json({
      generated_at: new Date().toISOString(),
      database: 'PostgreSQL',
      clientes: clientesResult.rows,
      transacoes: transacoesResult.rows,
    });
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.status(500).json({ error: error.message, message: 'Erro ao gerar backup.' });
  }
});

app.use('/', router);
app.use('/api', router);

app.use((error, req, res, next) => {
  console.error('Erro geral:', error);
  res.status(500).json({ message: error.message || 'Erro interno do servidor.' });
});

const start = async () => {
  await ensureDatabase();
  await purgeExpiredTrash();

  setInterval(() => {
    purgeExpiredTrash().catch((error) => console.error('Erro ao limpar lixeira:', error));
  }, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Servidor PostgreSQL rodando na porta ${PORT}`);
  });
};

start().catch((error) => {
  console.error('Erro crítico ao iniciar servidor:', error);
  process.exit(1);
});
