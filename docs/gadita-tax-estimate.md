# Imposto estimado da GADITA

Regra gerencial autorizada em 21/10/2026 para vendas com emissão por estabelecimento em MG.

- MG: 23,93%.
- SP, RJ, PR, SC e RS: 17,93%.
- Norte, Nordeste, Centro-Oeste e ES: 12,93%.

É estimativa para custo e lucro, não apuração fiscal nem garantia da carga efetiva (DIFAL, produtos, créditos e adicionais não são calculados).

A UF cadastrada é prioritária. Na ausência dela, uma sigla explícita no órgão é reconhecida; cidade isolada ou UF ambígua não é presumida. Novos cadastros/edições GADITA exigem uma UF identificável. Contratos antigos sem UF mantêm os valores anteriores e mostram aviso.

Contratos ativos e encerrados recalculam imposto, custo e lucro ao carregar, renderizar e salvar. Custo inclui royalties existentes. Imposto por item, previsão de empenho e modo automático de novas/edições de compras usam o mesmo percentual. Valores de compras já registrados não são regravados por essa atualização; a opção manual das compras continua disponível.

HAMATE mantém sua regra existente. Não há alteração de schema, credenciais ou permissões.

Testes: `node tests/gadita-tax.test.cjs`.
