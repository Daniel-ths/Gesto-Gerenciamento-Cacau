const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');

const databaseFolder = process.env.NEDB_DATABASE_PATH || path.join(__dirname, '..', 'database');

const readNedbFile = (filename) => {
  const filePath = path.join(databaseFolder, filename);

  if (!fs.existsSync(filePath)) {
    console.warn(`Arquivo não encontrado: ${filePath}`);
    return [];
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const docs = [];

  for (const line of lines) {
    try {
      const doc = JSON.parse(line);
      if (doc && doc._id && !doc.$$deleted) docs.push(doc);
    } catch (err) {
      console.warn('Linha ignorada no arquivo NeDB:', line);
    }
  }

  return docs;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toDateOnly = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

async function main() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));

  const clientes = readNedbFile('clientes.db');
  const transacoes = readNedbFile('transacoes.db');

  console.log(`Clientes encontrados: ${clientes.length}`);
  console.log(`Transações encontradas: ${transacoes.length}`);

  for (const cliente of clientes) {
    await pool.query(
      `
        INSERT INTO clientes (
          id, nome, cpf, telefone, endereco, taxa_juros, perfil_risco, tipo_cadastro,
          deleted_at, purge_at, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, NOW()),COALESCE($12, NOW()))
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          cpf = EXCLUDED.cpf,
          telefone = EXCLUDED.telefone,
          endereco = EXCLUDED.endereco,
          taxa_juros = EXCLUDED.taxa_juros,
          perfil_risco = EXCLUDED.perfil_risco,
          tipo_cadastro = EXCLUDED.tipo_cadastro,
          deleted_at = EXCLUDED.deleted_at,
          purge_at = EXCLUDED.purge_at,
          updated_at = NOW()
      `,
      [
        String(cliente._id || crypto.randomUUID()),
        String(cliente.nome || '').trim() || 'Sem nome',
        cliente.cpf || '',
        cliente.telefone || '',
        cliente.endereco || '',
        toNumber(cliente.taxa_juros || 0),
        cliente.perfil_risco || 'Normal',
        cliente.tipo_cadastro || 'FORNECEDOR',
        cliente.deleted_at || null,
        cliente.purge_at || null,
        cliente.createdAt || null,
        cliente.updatedAt || null,
      ]
    );
  }

  for (const transacao of transacoes) {
    const clienteId = String(transacao.clienteId || transacao.cliente_id || '');
    if (!clienteId) continue;

    await pool.query(
      `
        INSERT INTO transacoes (
          id, cliente_id, tipo, peso_kg, preco_por_kg, valor_total, valor_visual,
          observacao, data_transacao, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, NOW()),COALESCE($11, NOW()))
        ON CONFLICT (id) DO UPDATE SET
          cliente_id = EXCLUDED.cliente_id,
          tipo = EXCLUDED.tipo,
          peso_kg = EXCLUDED.peso_kg,
          preco_por_kg = EXCLUDED.preco_por_kg,
          valor_total = EXCLUDED.valor_total,
          valor_visual = EXCLUDED.valor_visual,
          observacao = EXCLUDED.observacao,
          data_transacao = EXCLUDED.data_transacao,
          updated_at = NOW()
      `,
      [
        String(transacao._id || crypto.randomUUID()),
        clienteId,
        transacao.tipo || 'ADIANTAMENTO',
        toNumber(transacao.peso_kg),
        toNumber(transacao.preco_por_kg),
        toNumber(transacao.valor_total),
        toNumber(transacao.valor_visual ?? transacao.valor_total),
        transacao.observacao || '',
        toDateOnly(transacao.data_transacao || transacao.createdAt),
        transacao.createdAt || null,
        transacao.updatedAt || null,
      ]
    );
  }

  console.log('Migração NeDB -> PostgreSQL concluída.');
}

main()
  .catch((err) => {
    console.error('Erro na migração:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
