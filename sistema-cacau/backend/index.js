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
  })
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

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  let text = String(value).trim().replace(/\s+/g, '');

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
};

const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const round3 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 1000) / 1000;

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

const isValidTransactionType = (tipo) => Object.values(TIPOS_TRANSACAO).includes(tipo);

const isClientDeleted = (client) => !!client?.deleted_at;

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

  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }

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
  const targetMonthIndex = base.getMonth() + monthsToAdd;
  const target = new Date(base.getFullYear(), targetMonthIndex, 1, 12, 0, 0, 0);
  const day = Math.min(base.getDate(), getDaysInMonth(target.getFullYear(), target.getMonth()));
  target.setDate(day);
  return target;
};

const getCompletedMonthlyCycles = (startDate, endDate = new Date()) => {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  if (end < start) return 0;

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  const anniversary = addMonthsClamped(start, months);

  if (anniversary > end) {
    months -= 1;
  }

  return Math.max(0, months);
};

const calcularEstoqueCliente = (transacoes = []) => {
  let entradas = 0;
  let saidas = 0;

  for (const t of transacoes) {
    if (t.tipo === TIPOS_TRANSACAO.DEPOSITO) entradas += toNumber(t.peso_kg);
    if (t.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) saidas += toNumber(t.peso_kg);
  }

  return round3(entradas - saidas);
};

const calcularSaldoSemJuros = (transacoes = []) => {
  let total = 0;

  for (const t of transacoes) {
    total += toNumber(t.valor_total);
  }

  return round2(total);
};

const calcularResumoFinanceiroCliente = (cliente = {}, transacoes = [], dataReferencia = new Date()) => {
  const taxaMensal = Math.max(0, toNumber(cliente.taxa_juros));
  const taxaDecimal = taxaMensal / 100;

  const transacoesOrdenadas = [...transacoes].sort((a, b) => {
    const dataA = parseLocalDate(a.data_transacao || a.created_at || a.createdAt);
    const dataB = parseLocalDate(b.data_transacao || b.created_at || b.createdAt);

    if (dataA.getTime() !== dataB.getTime()) return dataA - dataB;

    return String(a.created_at || a.createdAt || a.id || '').localeCompare(
      String(b.created_at || b.createdAt || b.id || '')
    );
  });

  const dividas = [];
  let creditoLivre = 0;

  for (const transacao of transacoesOrdenadas) {
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

    if (valorFinanceiro > 0) {
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

      if (valorParaAbater > 0) {
        creditoLivre = round2(creditoLivre + valorParaAbater);
      }
    }
  }

  const dividasAbertas = dividas
    .filter((divida) => divida.baseRestante > 0.009)
    .map((divida) => {
      const ciclos = getCompletedMonthlyCycles(divida.data, dataReferencia);
      const multiplicador = taxaDecimal > 0 ? Math.pow(1 + taxaDecimal, ciclos) : 1;
      const valorAtualizado = round2(divida.baseRestante * multiplicador);
      const juros = round2(valorAtualizado - divida.baseRestante);

      return {
        origemId: divida.origemId,
        tipo: divida.tipo,
        data: toDateOnly(divida.data),
        meses_vencidos: ciclos,
        valor_original: round2(divida.valorOriginal),
        principal_restante: round2(divida.baseRestante),
        juros_acumulados: juros,
        valor_atualizado: valorAtualizado,
      };
    });

  const totalDevedorAtualizado = round2(
    dividasAbertas.reduce((total, divida) => total + divida.valor_atualizado, 0)
  );

  const jurosAcumulados = round2(
    dividasAbertas.reduce((total, divida) => total + divida.juros_acumulados, 0)
  );

  const saldoSemJuros = calcularSaldoSemJuros(transacoes);
  const saldoComJuros = round2(creditoLivre - totalDevedorAtualizado);

  return {
    saldo_sem_juros: saldoSemJuros,
    saldo_total: saldoComJuros,
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
  const map = new Map();

  for (const t of transacoes) {
    const key = String(t.clienteId || t.cliente_id || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }

  return map;
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
    `
      SELECT id
      FROM clientes
      WHERE deleted_at IS NOT NULL
        AND purge_at IS NOT NULL
        AND purge_at <= NOW()
    `
  );

  if (expired.rowCount === 0) return 0;

  const ids = expired.rows.map((row) => row.id);

  await query('DELETE FROM clientes WHERE id = ANY($1)', [ids]);

  console.log(`[LIXEIRA] ${ids.length} cliente(s) apagado(s) definitivamente.`);
  return ids.length;
};

const ensureDatabase = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
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
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
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
    const transacoes = transacoesResult.rows.map(mapTransacao);
    const transacoesPorCliente = agruparTransacoesPorCliente(transacoes);

    const data = clientes.map((cliente) =>
      enrichClient(cliente, transacoesPorCliente.get(String(cliente.id)) || [])
    );

    res.json(data);
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao listar clientes.' });
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
    const transacoes = transacoesResult.rows.map(mapTransacao);
    const transacoesPorCliente = agruparTransacoesPorCliente(transacoes);

    const data = clientes.map((cliente) =>
      enrichClient(cliente, transacoesPorCliente.get(String(cliente.id)) || [])
    );

    res.json(data);
  } catch (err) {
    console.error('Erro ao listar lixeira:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao listar lixeira.' });
  }
});

router.post('/clientes', async (req, res) => {
  try {
    const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro } = req.body || {};
    const nomeLimpo = String(nome || '').trim();

    if (!nomeLimpo) {
      return res.status(400).json({ message: 'O nome é obrigatório.' });
    }

    const id = crypto.randomUUID();

    await query(
      `
        INSERT INTO clientes (id, nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        nomeLimpo,
        cpf || '',
        telefone || '',
        endereco || '',
        toNumber(taxa_juros),
        perfil_risco || 'Normal',
        normalizeTipoCadastro(tipo_cadastro),
      ]
    );

    res.json({ id, message: 'Cliente cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao criar cliente.' });
  }
});

router.put('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro } = req.body || {};

    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente está na lixeira e não pode ser editado.' });
    }

    const nomeLimpo = String(nome || '').trim();

    if (!nomeLimpo) {
      return res.status(400).json({ message: 'O nome é obrigatório.' });
    }

    await query(
      `
        UPDATE clientes
        SET nome = $2,
            cpf = $3,
            telefone = $4,
            endereco = $5,
            taxa_juros = $6,
            perfil_risco = $7,
            tipo_cadastro = $8,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        id,
        nomeLimpo,
        cpf || '',
        telefone || '',
        endereco || '',
        toNumber(taxa_juros),
        perfil_risco || 'Normal',
        normalizeTipoCadastro(tipo_cadastro || cliente.tipo_cadastro),
      ]
    );

    res.json({ message: 'Cliente atualizado!' });
  } catch (err) {
    console.error('Erro ao editar cliente:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao editar cliente.' });
  }
});

router.delete('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente já está na lixeira.' });
    }

    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + TRASH_RETENTION_MS);

    await query(
      `
        UPDATE clientes
        SET deleted_at = $2, purge_at = $3, updated_at = NOW()
        WHERE id = $1
      `,
      [id, deletedAt, purgeAt]
    );

    res.json({ message: 'Cliente movido para a lixeira.', deleted_at: deletedAt, purge_at: purgeAt });
  } catch (err) {
    console.error('Erro ao mover cliente para lixeira:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao mover cliente para lixeira.' });
  }
});

router.post('/clientes/:id/restaurar', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (!isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente não está na lixeira.' });
    }

    await query(
      `
        UPDATE clientes
        SET deleted_at = NULL, purge_at = NULL, updated_at = NOW()
        WHERE id = $1
      `,
      [id]
    );

    res.json({ message: 'Cliente restaurado com sucesso.' });
  } catch (err) {
    console.error('Erro ao restaurar cliente:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao restaurar cliente.' });
  }
});

router.delete('/clientes/:id/definitivo', async (req, res) => {
  try {
    const { id } = req.params;
    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [id]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (!isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente não está na lixeira.' });
    }

    await query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ message: 'Cliente apagado definitivamente.' });
  } catch (err) {
    console.error('Erro ao excluir definitivamente:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao excluir definitivamente.' });
  }
});

router.get('/conta-corrente/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const [clienteResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes WHERE id = $1', [id]),
      query(
        `
          SELECT *
          FROM transacoes
          WHERE cliente_id = $1
          ORDER BY data_transacao DESC, created_at DESC
        `,
        [id]
      ),
    ]);

    const cliente = clienteResult.rows[0] ? mapCliente(clienteResult.rows[0]) : null;

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    const todasTransacoes = transacoesResult.rows.map(mapTransacao);

    let extrato = todasTransacoes;

    if (startDate || endDate) {
      const start = startDate ? parseLocalDate(startDate) : null;
      const end = endDate ? parseLocalDate(endDate) : null;

      if (end) end.setHours(23, 59, 59, 999);

      extrato = todasTransacoes.filter((transacao) => {
        const dataT = parseLocalDate(transacao.data_transacao || transacao.created_at);
        if (start && dataT < start) return false;
        if (end && dataT > end) return false;
        return true;
      });
    }

    const resumoFinanceiro = calcularResumoFinanceiroCliente(cliente, todasTransacoes);
    const totalDepositado = calcularEstoqueCliente(todasTransacoes);

    res.json({
      cliente: {
        ...cliente,
        id: cliente.id,
        _id: cliente.id,
        tipo_cadastro: normalizeTipoCadastro(cliente.tipo_cadastro || cliente.categoria || cliente.tipo),
        saldo: resumoFinanceiro.saldo_total,
        saldo_sem_juros: resumoFinanceiro.saldo_sem_juros,
        juros_acumulados: resumoFinanceiro.juros_acumulados,
        total_devedor_atualizado: resumoFinanceiro.total_devedor,
        total_credito: resumoFinanceiro.total_credito,
        dividas_abertas: resumoFinanceiro.dividas_abertas,
        total_depositado: totalDepositado,
        taxa_juros: toNumber(cliente.taxa_juros),
        deleted_at: cliente.deleted_at || null,
        purge_at: cliente.purge_at || null,
      },
      extrato: extrato.map((t) => ({
        ...t,
        id: t.id,
        _id: t.id,
        is_deposito: t.tipo === TIPOS_TRANSACAO.DEPOSITO,
        is_venda_deposito: t.tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO,
        is_saque: t.tipo === TIPOS_TRANSACAO.SAQUE,
        is_deposito_dinheiro: t.tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO,
      })),
    });
  } catch (err) {
    console.error('Erro ao buscar conta corrente:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao buscar conta corrente.' });
  }
});

router.get('/transacoes', async (req, res) => {
  try {
    await purgeExpiredTrash();

    const result = await query(
      `
        SELECT t.*
        FROM transacoes t
        INNER JOIN clientes c ON c.id = t.cliente_id
        WHERE c.deleted_at IS NULL
        ORDER BY t.data_transacao DESC, t.created_at DESC
      `
    );

    res.json(result.rows.map(mapTransacao).map((t) => ({ ...t, id: t.id, _id: t.id })));
  } catch (err) {
    console.error('Erro ao buscar transações:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao buscar transações.' });
  }
});

router.post('/transacoes', async (req, res) => {
  try {
    const { clienteId, tipo, peso_kg, preco_por_kg, valor_total, observacao, data_transacao } = req.body || {};

    if (!clienteId) {
      return res.status(400).json({ message: 'clienteId é obrigatório.' });
    }

    if (!tipo || !isValidTransactionType(tipo)) {
      return res.status(400).json({ message: 'Tipo de transação inválido.' });
    }

    const clienteResult = await query('SELECT * FROM clientes WHERE id = $1', [String(clienteId)]);
    const cliente = clienteResult.rows[0];

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (isClientDeleted(cliente)) {
      return res.status(400).json({ message: 'Cliente está na lixeira.' });
    }

    const pesoNum = round3(toNumber(peso_kg));
    const precoNum = round2(toNumber(preco_por_kg));
    let valorRaw = round2(toNumber(valor_total));
    let valorFinalFinanceiro = 0;

    if (tipo === TIPOS_TRANSACAO.ADIANTAMENTO) {
      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para o adiantamento.' });
      }

      valorFinalFinanceiro = -Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.DEPOSITO) {
      if (pesoNum <= 0) {
        return res.status(400).json({ message: 'Informe um peso válido para o depósito.' });
      }

      valorRaw = 0;
      valorFinalFinanceiro = 0;
    } else if (tipo === TIPOS_TRANSACAO.VENDA_NOVO) {
      if (pesoNum <= 0 || precoNum <= 0) {
        return res.status(400).json({ message: 'Informe peso e preço válidos para a venda.' });
      }

      valorRaw = valorRaw > 0 ? valorRaw : round2(pesoNum * precoNum);

      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para a venda.' });
      }

      valorFinalFinanceiro = Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.VENDA_DEPOSITO) {
      if (pesoNum <= 0 || precoNum <= 0) {
        return res.status(400).json({ message: 'Informe peso e preço válidos para a venda de depósito.' });
      }

      valorRaw = valorRaw > 0 ? valorRaw : round2(pesoNum * precoNum);

      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para a venda de depósito.' });
      }

      const transacoesClienteResult = await query('SELECT * FROM transacoes WHERE cliente_id = $1', [
        String(clienteId),
      ]);
      const estoqueAtual = calcularEstoqueCliente(transacoesClienteResult.rows.map(mapTransacao));

      if (pesoNum > estoqueAtual) {
        return res.status(400).json({
          message: `Estoque insuficiente. Estoque atual: ${estoqueAtual.toLocaleString('pt-BR')} Kg.`,
        });
      }

      valorFinalFinanceiro = Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.SAQUE) {
      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para o saque.' });
      }

      valorFinalFinanceiro = -Math.abs(valorRaw);
    } else if (tipo === TIPOS_TRANSACAO.DEPOSITO_DINHEIRO) {
      if (valorRaw <= 0) {
        return res.status(400).json({ message: 'Informe um valor válido para o depósito de dinheiro.' });
      }

      valorFinalFinanceiro = Math.abs(valorRaw);
    }

    const id = crypto.randomUUID();
    const dataOperacao = toDateOnly(data_transacao);

    await query(
      `
        INSERT INTO transacoes (
          id, cliente_id, tipo, peso_kg, preco_por_kg, valor_total,
          valor_visual, observacao, data_transacao
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        id,
        String(clienteId),
        tipo,
        pesoNum,
        precoNum,
        valorFinalFinanceiro,
        valorRaw,
        observacao || '',
        dataOperacao,
      ]
    );

    res.json({ id, message: 'Transação registrada!' });
  } catch (err) {
    console.error('Erro ao registrar transação:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao registrar transação.' });
  }
});

router.delete('/transacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transacaoResult = await query('SELECT * FROM transacoes WHERE id = $1', [id]);

    if (transacaoResult.rowCount === 0) {
      return res.status(404).json({ message: 'Transação não encontrada.' });
    }

    await query('DELETE FROM transacoes WHERE id = $1', [id]);
    res.json({ message: 'Transação excluída.' });
  } catch (err) {
    console.error('Erro ao excluir transação:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao excluir transação.' });
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
    const transacoes = transacoesResult.rows.map(mapTransacao);
    const transacoesPorCliente = agruparTransacoesPorCliente(transacoes);

    let totalCredor = 0;
    let totalDevedor = 0;
    let totalEstoque = 0;
    let jurosAcumulados = 0;

    for (const cliente of clientes) {
      const transacoesCliente = transacoesPorCliente.get(String(cliente.id)) || [];
      const resumo = calcularResumoFinanceiroCliente(cliente, transacoesCliente);
      const saldoCliente = resumo.saldo_total;

      if (saldoCliente > 0) {
        totalCredor += saldoCliente;
      } else if (saldoCliente < 0) {
        totalDevedor += Math.abs(saldoCliente);
      }

      jurosAcumulados += resumo.juros_acumulados;
      totalEstoque += calcularEstoqueCliente(transacoesCliente);
    }

    res.json({
      total_credor: round2(totalCredor),
      total_devedor: round2(totalDevedor),
      total_estoque: round3(totalEstoque),
      juros_acumulados: round2(jurosAcumulados),
    });
  } catch (err) {
    console.error('Erro ao calcular métricas:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao calcular métricas.' });
  }
});

router.get('/backup/clientes', async (req, res) => {
  try {
    const [clientesResult, transacoesResult] = await Promise.all([
      query('SELECT * FROM clientes ORDER BY nome ASC'),
      query('SELECT * FROM transacoes ORDER BY data_transacao ASC, created_at ASC'),
    ]);

    const backup = {
      generated_at: new Date().toISOString(),
      database: 'PostgreSQL',
      clientes: clientesResult.rows,
      transacoes: transacoesResult.rows,
    };

    const date = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-cacau-${date}.json"`);
    res.json(backup);
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: err.message, message: 'Erro ao gerar backup.' });
  }
});

app.use('/', router);
app.use('/api', router);

app.use((err, req, res, next) => {
  console.error('Erro geral:', err);
  res.status(500).json({ message: err.message || 'Erro interno do servidor.' });
});

const start = async () => {
  await ensureDatabase();
  await purgeExpiredTrash();

  setInterval(() => {
    purgeExpiredTrash().catch((err) => console.error('Erro ao limpar lixeira:', err));
  }, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Servidor PostgreSQL rodando na porta ${PORT}`);
  });
};

start().catch((err) => {
  console.error('Erro crítico ao iniciar servidor:', err);
  process.exit(1);
});
