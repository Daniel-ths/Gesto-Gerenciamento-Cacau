CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  taxa_juros NUMERIC(10, 4) DEFAULT 0,
  perfil_risco TEXT DEFAULT 'Normal',
  tipo_cadastro TEXT DEFAULT 'FORNECEDOR',
  deleted_at TIMESTAMPTZ,
  purge_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacoes (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  peso_kg NUMERIC(14, 3) DEFAULT 0,
  preco_por_kg NUMERIC(14, 4) DEFAULT 0,
  valor_total NUMERIC(14, 2) DEFAULT 0,
  valor_visual NUMERIC(14, 2) DEFAULT 0,
  observacao TEXT DEFAULT '',
  data_transacao DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_clientes_deleted_at ON clientes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_transacoes_cliente_id ON transacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes(data_transacao);
