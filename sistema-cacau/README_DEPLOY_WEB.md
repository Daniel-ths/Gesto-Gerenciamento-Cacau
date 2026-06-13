# Deploy web sem dor de cabeça

Arquitetura escolhida:

- Frontend React/Vite: Vercel
- Backend Node/Express: Render
- Banco de dados: Neon PostgreSQL

## 1. Criar banco no Neon

1. Acesse o Neon.
2. Crie um projeto PostgreSQL.
3. Copie a connection string do banco.
4. Use a URL no backend como `DATABASE_URL`.

Exemplo local em `backend/.env`:

```env
PORT=3001
DATABASE_URL=postgresql://usuario:senha@host/neondb?sslmode=require
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

## 2. Rodar local

Na pasta `sistema-cacau`:

```bash
npm install
cd backend
npm install
cp .env.example .env
# edite o .env e coloque a DATABASE_URL real do Neon
npm run db:init
cd ../frontend
npm install
cp .env.example .env
cd ..
npm run dev
```

## 3. Migrar dados antigos do NeDB para PostgreSQL

Se você ainda tiver a pasta antiga:

```txt
sistema-cacau/backend/database/clientes.db
sistema-cacau/backend/database/transacoes.db
```

rode:

```bash
cd sistema-cacau/backend
npm run db:migrate:nedb
```

Se a pasta do banco antigo estiver em outro lugar:

```bash
set NEDB_DATABASE_PATH=C:\caminho\para\database
npm run db:migrate:nedb
```

## 4. Deploy backend no Render

Crie um Web Service no Render apontando para o repositório.

Configuração recomendada:

- Root Directory: `sistema-cacau/backend`
- Build Command: `npm install`
- Start Command: `npm start`

Variáveis de ambiente no Render:

```env
DATABASE_URL=postgresql://usuario:senha@host/neondb?sslmode=require
FRONTEND_URL=https://seu-frontend.vercel.app
NODE_ENV=production
```

Depois do deploy, teste:

```txt
https://sua-api.onrender.com/health
```

## 5. Deploy frontend na Vercel

Crie um projeto na Vercel apontando para o repositório.

Configuração recomendada:

- Root Directory: `sistema-cacau/frontend`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Variável de ambiente na Vercel:

```env
VITE_API_BASE_URL=https://sua-api.onrender.com
```

Depois faça redeploy.

## 6. O que foi corrigido

- Banco local NeDB substituído por PostgreSQL.
- Datas salvas como `DATE` para não jogar lançamento para o dia anterior.
- Juros calculado por dívida individual, não sobre o saldo inteiro.
- Cliente com taxa 0% não gera juros.
- Venda calcula automaticamente `peso * preço` se o valor total não vier preenchido.
- API aceita `/clientes` e `/api/clientes`.
- Backup agora baixa JSON com clientes e transações.
