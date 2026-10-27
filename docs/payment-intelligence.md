# Inteligência de pagamentos dos órgãos

## Dados e significado

Emissão/pedido (`empenhos.data`) NÃO é recebimento do empenho. Entrega física (`data_entrega`) NÃO é aceite definitivo. Confirmação expressa da usuária em 27/10/2026. Os novos campos iniciam nulos; não há conversão nem preenchimento de registros históricos.

Campos opcionais adicionados em `public.empenhos`: `data_recebimento_empenho`, `data_recebimento_definitivo`, `data_liquidacao`, `data_vencimento_pagamento`, `fonte_prazo_pagamento`, `saldo_pendente_confirmado`, `data_saldo_confirmado`. Migração remota registrada: `20261027124039_payment_intelligence_optional_milestones`. SQL de referência em `docs/payment-intelligence-schema.sql`. Restrições: saldo entre zero e valor do empenho, com data de conferência; vencimento exige fonte documental. Nenhuma tabela ou permissão nova. Políticas de acesso existentes do projeto não foram ampliadas nem substituídas.

## Cálculos

- Cinco intervalos independentes até o pagamento: emissão, recebimento do empenho, entrega física, aceite definitivo, liquidação. Datas ISO estritas, dias corridos em UTC; referência atual America/Sao_Paulo. Não há conversão de dias úteis.
- Apenas status Paga para histórico; pagamento futuro, data ausente/invertida ou inválida não compõe a amostra do intervalo. Mostra quantidade de observações de cada média. Status ativos permitidos: Pendente, Compra Feita, Ag. Liquidação. Cancelados e status desconhecidos ficam fora de previsões e atrasos.
- Agrupamento conservador: empresa + nome completo do órgão. Normaliza caixa e espaços, preserva UF, prefeitura/câmara/fundos e demais qualificadores. Nomes diferentes não são fundidos automaticamente. HAMATE e GADITA continuam separadas mesmo na seleção Todas.
- Classificação pela média do intervalo escolhido: até 15 rápido, até 30 regular, até 60 lento, acima crítico. Limites configuráveis, crescentes. São faixas históricas, não critérios legais de atraso.
- Ranking ordenado pela média, somente com amostra mínima (padrão 3); empates mantêm posição. Demais órgãos mostram amostra insuficiente e ficam sem posição.
- Previsão = data-base do empenho ativo + mediana arredondada dos dias do mesmo órgão/empresa/intervalo/período. Exige data-base válida não futura e amostra mínima. Não mistura referências quando falta aceite/liquidação. Previsão passada não equivale a vencimento contratual.
- Histórico de atrasos = pagos após vencimento / pagos com vencimento documentado e data de pagamento válida. Sem vencimento, percentual não apurado, nunca zero implícito.
- Valores em atraso = soma de saldos positivos confirmados e datados, de empenhos ativos com vencimento documentado anterior à referência. Quantidade de dias = referência - vencimento. Saldo parcial não é inferido pelo valor nominal. Conferência manual desconta pagamentos parciais e cancelamentos; data da última conferência sempre visível. Não é conciliação/ledger automático. Sem cobertura total, resumo informa registros não apurados; pode mostrar soma parcial dos conhecidos.
- Mês e ano filtram pagamentos usados no histórico; órgão e empresa filtram todo o painel. Pendências são independentes do período histórico. Aba cadastro mostra todos os períodos, com aviso explícito. Datas vencidas não são automaticamente prorrogadas até hoje.
- Aviso no novo empenho usa histórico de entrega física, explicitamente identificado, mesma empresa/órgão e amostra mínima. Não impede cadastro e ressalta que não garante novo prazo nem comprova atraso.

## Persistência e interface

Menu Empenhos → Inteligência de pagamentos. Abas Histórico e ranking; Previsões e pendências; Registrar datas e prazos. Configuração de limites e amostra salva somente neste navegador. Dados reais vêm das linhas já carregadas do Supabase. Edição salva apenas os sete campos via PATCH; verifica resposta antes de atualizar memória. Guarda `updated_at` evita sobrescrever edição concorrente quando versão carregada disponível. Campos financeiros anteriores e funções de lucro, imposto, royalties e custo não são alterados. O salvamento geral existente não inclui os novos campos, evitando que uma sessão antiga os limpe.

## Verificação

`node tests/payment-intelligence.test.cjs`: isolamento, faixas, filtros, amostras, mediana, previsões, zero/ausência, datas inválidas/futuras, saldos parciais, cancelamentos, vencimentos e validações de edição. Nenhum dado sintético é usado no painel real.

Conferência independente com SQL em 79 grupos órgão/empresa: médias e amostras desde emissão e entrega física coincidiram. Na auditoria: 198 empenhos, 127 pagos, 71 pares entrega/pagamento válidos, 5 grupos com ao menos 3 pares. Novos campos vazios em todos os 198 registros após a migração.

UI validada em Chromium local, com cópia de leitura dos dados reais (não versionada), nas larguras 1366, 768 e 390px: filtros, mudança de base, edição, rejeição de prazo sem fonte, ausência de erros JavaScript e de rolagem horizontal da página. Gravações testadas com adaptador simulado, sem alterar registros reais. Scripts inline e novos módulos compilados; função financeira existente comparada e preservada. Permissões/advisories conferidos antes/depois; avisos preexistentes de search_path e proteção de senha fora do escopo desta funcionalidade.

## Limitações conhecidas

Para análise exata desde recebimento, aceite e liquidação é necessário registrar esses eventos. Para saldos/atrasos, registrar vencimento documental e saldo atualizado; não há regra universal de 30 dias. Revisar saldo após cada pagamento parcial ou cancelamento. Para unificar grafias diferentes do mesmo órgão com segurança será necessário cadastro mestre validado pelo usuário. Histórico de poucos pagamentos, mudanças de gestão, orçamento e condições contratuais limitam a previsão.

