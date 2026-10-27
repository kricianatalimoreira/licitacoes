# Classificação automática nas tabelas de empenhos

Identificação discreta no nome do órgão em Pendentes, Em andamento e Pagos. Sem nova página, campos, migrations, preenchimento manual ou alteração de registros. O cálculo usa todo o histórico carregado, não apenas o período visível da tabela.

Somente status Paga, datas reais ISO válidas, entrega física <= pagamento <= hoje em America/Sao_Paulo. Dias corridos calculados em UTC evitam variação por horário de verão. Não substitui entrega física por aceite definitivo nem avalia descumprimento contratual. IDs duplicados não são contados duas vezes.

Mínimo de 3 pagamentos válidos. Média até 15: rápido; acima de 15 até 30: regular; acima de 30 até 60: lento; acima de 60: crítico. Sem arredondar a média antes de classificar. Abaixo da amostra mínima, exibe Sem histórico suficiente. As faixas fixas desta identificação seguem o pedido atual, independentemente de configurações experimentais de outro painel.

Não há CNPJ de órgão nos campos atuais de empenhos/contratos: verificação do esquema público em 27/10/2026. Fallback conservador: empresa + nome completo normalizado + UF. Preserva qualificadores de câmara/fundo/secretaria, acentos e pontuação; não usa similaridade ou só o município. UF deve estar explicitamente no nome ou no contrato vinculado com mesmo órgão e empresa. Ausência ou conflito de UF impede agrupamento. HAMATE/GADITA mantidas separadas. A precisão continua limitada pelo nome registrado; duas entidades cadastradas com o mesmo nome completo não podem ser distinguidas sem identificador oficial. Não inventar CNPJ nem extraí-lo de texto livre/fornecedor.

Hover, foco de teclado ou clique mostram somente média, quantidade, menor e maior prazo. Popup fora da tabela evita corte no painel; Escape, clique externo, rolagem e novo render fecham o popup. Botão discreto neutro, sem novas colunas; quebra do conjunto nome/etiqueta permitida sem ampliar a largura da tabela.

Validação: node tests/payer-badges.test.cjs; teste visual local com o HTML/CSS existente e renderer real de Pagos (fixtures sintéticas somente locais), hover/clique/Escape/foco e viewport desktop/tablet. Comparação SQL independente de média, amostra, mínimo e máximo: 47 grupos com UF identificada, 5 com pelo menos 3 pagamentos. Scripts inline compilados. Nenhuma escrita no Supabase.

