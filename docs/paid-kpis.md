# Indicadores de Empenhos Pagos

Auditoria: 26/10/2026. Fonte: Supabase existente. Nenhuma migration ou alteração de registros.

- empenhos: status, valor, empresa, orgao, data_pagamento, data_entrega. Paga representa quitação integral; não há valor de recebimento parcial ou saldo cancelado.
- compras: empenho_id, vl_total_compra, imposto_total, royalt_total, lucro_total. parcelas é pagamento ao fornecedor, não recebimento do órgão.
- contratos_ativos/encerrados: proposta e percentuais existentes; data_fim é vigência, não vencimento financeiro.

Recebido = soma valor com status Paga, filtrado por data_pagamento. Não é conciliação bancária. Lucro chama calcEmpFinanceiroRealizado sem alterar sua fórmula; fallback da proposta permanece explicitamente PREVISTO. Sem custos disponíveis, apresenta subtotal incompleto. Quantidade usa as mesmas linhas da tabela. Prazo médio = dias corridos entre data_entrega e data_pagamento, excluindo datas inválidas, ausentes ou invertidas; amostra visível. Datas calculadas em UTC evitam efeito de horário de verão.

Total a receber e pagamentos atrasados foram retirados dos cartões a pedido da usuária.

Filtros visíveis mês/ano/empresa e filtros existentes órgão/data exata afetam tabela e indicadores. Limpar limpa todos. Anos adicionais vêm das datas cadastradas. Todos os períodos é a seleção inicial; não se usa data do pedido.

Validação: node tests/paid-kpis.test.cjs. Cenários de períodos, empresas, status, datas inválidas/invertidas, zero/negativo, previsão, ausência de custo, não mutação e sintaxe. Conferência independente com SQL: 23 grupos mês/empresa, valores, quantidades, amostras e médias coincidiram. 127 pagos; 71 pares válidos, 50 sem entrega, 6 invertidos na auditoria. Teste de renderização com DOM simulado aprovado; inspeção visual em navegador não realizada.

## Revisão dos cartões

Valor dos empenhos pagos no período substitui Recebido. Compra e custo somam vlCompraReal e custoReal da mesma função financeira existente, para os empenhos pagos filtrados pela data de pagamento (não pela data da compra). Custo = imposto + royalties. Previsões continuam identificadas. ROI = soma lucro / (soma compra + soma custo) × 100; não é média dos percentuais individuais. Base zero ou informações incompletas tornam ROI indisponível, não zero. Quantidade e prazo médio preservados. Sete cartões responsivos. Nenhum registro ou fórmula de custo/lucro alterado.
