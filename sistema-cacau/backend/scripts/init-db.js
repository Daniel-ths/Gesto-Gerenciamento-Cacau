const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  await pool.query(schema);
  console.log('Banco inicializado com sucesso.');
}

main()
  .catch((err) => {
    console.error('Erro ao inicializar banco:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
