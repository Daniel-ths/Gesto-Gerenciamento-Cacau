const dotenv = require('dotenv');
const { Pool, types } = require('pg');

dotenv.config();

// Evita bug de fuso horário em colunas DATE do PostgreSQL.
// Em vez de transformar 2026-06-03 em Date UTC, mantém como string "2026-06-03".
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL não configurada. Configure o Neon/PostgreSQL no .env ou no Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : undefined,
});

const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
