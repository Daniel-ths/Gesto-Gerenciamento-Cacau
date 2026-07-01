# Conferência dos comentários do cliente

| Nº | Pedido | Alteração aplicada |
|---:|---|---|
| 1–5 | Indicadores aprovados | Mantidos, com fonte de dados única na API. |
| 6 | “Compra de cacau” ficava R$ 0,00 | Alterado para **Cacau em depósito**, mostrando o peso físico em estoque. |
| 7 | Trocar “Venda de Cacau” | Alterado para **Compra de cacau em reais**. |
| 8 | Total comprado não incluía operação direta | Agora soma **depósito + compra direta**. |
| 9 | Total vendido | Mantido para vendas diretas e vendas de depósito. |
| 10 | Preço médio pago zerava | Calcula somente sobre compras com custo lançado, sem dividir depósitos sem custo por zero. |
| 11 | Preço médio de venda | Mantido como receita ÷ Kg vendido. |
| 12 | Margem sem explicação | Renomeado para **Margem bruta por Kg** e calculado como resultado bruto ÷ Kg vendido. |
| 13 | Resultado bruto repetia a venda | Corrigido para **receita de vendas − custo do cacau vendido**. |

## Critério único de relatórios

O relatório geral e o relatório interno de cada cadastro chamam os endpoints `/relatorios/geral` e `/relatorios/cliente/:id`, que utilizam a mesma função de cálculo no backend. Assim não há uma conta diferente no painel e outra na ficha do cadastro.
