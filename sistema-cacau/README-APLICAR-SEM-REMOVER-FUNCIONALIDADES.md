# RCM — Design completo sem remover funcionalidades

Este pacote contém **arquivos completos para substituição**, não trechos de código.

## Garantia de preservação

A alteração foi planejada para ser somente visual. Não foram removidos nem substituídos:

- API, banco de dados, backend, tabelas ou variáveis de ambiente;
- cadastro, edição, exclusão, lixeira e restauração de produtores/compradores;
- conta corrente, lançamentos, tipos de movimentação, estoque, cálculos e simulação de juros;
- filtros, backup, relatório geral, métricas laterais e atualização automática;
- rotas existentes, inclusive `/`, `/cadastros`, `/compra-venda`, `/conta-corrente/:id` e `/relatorio-geral`;
- validações, alertas, componentes e textos funcionais já existentes.

A única mudança em JSX é `Layout.jsx`, que preserva os mesmos links, caminhos e `SidebarMetrics`; ele troca apenas a estrutura visual da barra lateral para usar a logo RCM e a paleta da marca.

## Arquivos completos incluídos

Substitua **somente** estes arquivos no projeto existente, mantendo a mesma estrutura:

- `frontend/public/rcm-logo.jpeg`
- `frontend/src/index.css`
- `frontend/src/App.css`
- `frontend/src/components/Layout.jsx`
- `frontend/src/components/Layout.module.css`
- `frontend/src/components/GeneralDashboard.module.css`
- `frontend/src/pages/ClientList.module.css`
- `frontend/src/pages/ContaCorrente.module.css`
- `frontend/src/pages/GeneralReport.module.css`

Os demais arquivos do projeto ficam exatamente como estão. Isso é proposital: evita qualquer risco de apagar recurso que o cliente aprovou.

## Como aplicar

1. Faça uma cópia da pasta atual `sistema-cacau`.
2. Extraia este ZIP.
3. Copie a pasta `sistema-cacau` extraída por cima da pasta do projeto e confirme a substituição apenas dos arquivos listados acima.
4. No terminal, dentro de `sistema-cacau`, execute:

```bash
npm run dev
```

## Conferência rápida

Teste antes de publicar:

1. Cadastro de produtor e comprador.
2. Edição, lixeira, restauração e backup.
3. Compra/Venda e todos os tipos de lançamento.
4. Conta corrente, cálculo/simulação de juros e exclusão de lançamento.
5. Relatório geral, filtros e métricas da barra lateral.
6. Versão em celular.

## Identidade aplicada

- Preto RCM: `#0E0B08`
- Cacau: `#19130E`
- Bronze: `#B2854C`
- Bronze escuro: `#8E6234`
- Papel: `#F7F1E7`
- Superfície: `#FFFDF9`

A leitura financeira permanece clara: verde indica crédito/positivo; vermelho indica débito/atenção. O bronze fica reservado à marca e às ações principais.
