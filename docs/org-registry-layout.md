# Layout do cadastro de órgãos

Segue o padrão visual de Contratos ativos: sete indicadores, filtros por empresa/UF/tipo e pesquisa, tabela com cabeçalho fixo, rolagem interna e rodapé de totais. Ordenação A–Z/Z–A e limpar filtros. Visões por município e registros para vincular preservadas.

Indicadores e colunas reutilizam o cálculo existente do cadastro. Compra/custo/lucro são dos empenhos pagos, com cobertura e indicação de previstos. Valores de contratos não são somados aos empenhos. Sem alteração em dados, vínculos ou backend.

Validação Playwright: fluxo de login/cadastro/vínculo/detalhe, filtros, 35 linhas simuladas apenas no teste, sete cards, rolagem interna, rodapé no viewport e ausência de rolagem horizontal. Conferência visual em desktop/tablet.
