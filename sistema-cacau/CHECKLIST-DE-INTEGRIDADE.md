# Checklist de integridade do redesign

## Alterado

- Tema global, fundo, tipografia, foco e tabelas.
- Barra lateral, logo, navegação e visual das métricas laterais.
- Cores, bordas, sombras e estados visuais dos módulos de dashboard, conta corrente e relatório.

## Preservado sem alteração de comportamento

- Endpoints e lógica de `api.js`.
- Regras e validações de formulários.
- Cálculos de estoque, saldos, juros e projeções.
- Ações de criar, editar, excluir, restaurar, baixar backup e atualizar.
- Todas as páginas JSX, exceto o contêiner visual `Layout.jsx`.
- Backend, banco de dados, `package.json`, `.env`, Vercel e Render.

`Layout.jsx` continua usando as mesmas três páginas e os mesmos caminhos do projeto original. A alteração é exclusivamente estrutural/estética para aplicar a marca RCM.
