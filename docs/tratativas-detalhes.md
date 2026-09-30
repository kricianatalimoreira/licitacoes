# Detalhes e timeline de tratativas

A página abre pelo nome do órgão nas tabelas do Dashboard e de Todas as tratativas. Reutiliza contratos, empenhos, responsável, prioridade e status existentes, sem duplicar entidades. Mostra situação atual, próxima ação/data e histórico em ordem cronológica crescente, com desempate pela data de registro e ID.

O aplicativo ainda não possui diretório de nomes de usuários disponível ao cliente. O responsável é exibido como “Não atribuído” quando vazio ou pelo identificador existente quando preenchido. Não há usuário fictício nem acesso do cliente a `auth.users`.

## Persistência

Migration aplicada ao Supabase: `20260930174909_tratativas_timeline_manual.sql`.

Amplia `tratativas_historico` com `tipo_movimentacao`, `ocorrida_em`, `origem`, `link_referencia`, `requisicao_id` e `requisicao`. Mantém todos os campos e eventos anteriores. Tipos: e-mail enviado/recebido, documento, ligação, WhatsApp, protocolo, observação, alteração de status e follow-up. Documentos podem ter descrição e link de referência; não foi introduzido armazenamento de anexos.

A função `registrar_movimentacao_tratativa` usa as permissões existentes da tratativa (SECURITY INVOKER), bloqueio da linha e versão esperada. O gatilho de auditoria privado acrescenta exatamente um evento na mesma transação da atualização. Não há permissão de inserção, edição ou exclusão direta do histórico para o cliente.

A chave de requisição garante que uma repetição com os mesmos dados retorne o evento já salvo. Reutilizar a chave com dados diferentes é rejeitado. Mudanças de status exigem o tipo correspondente; encerramentos preservam a validação de resultado/data. Datas futuras e links que não sejam HTTP/HTTPS são rejeitados. O contexto temporário da movimentação é restaurado após a operação.

`ocorrida_em` representa a data da ação e `data_hora` representa o registro no banco. A contagem DIAS usa a última ação relevante, inclusive movimentos manuais retroativos sem substituir ações mais recentes.

Não há conexão, leitura ou envio pelo Gmail. Tipos de e-mail permitem apenas registrar manualmente algo que já ocorreu.

## Validação

- `tests/tratativas-timeline.sql`: testes transacionais com ROLLBACK, nove tipos, preservação, repetição segura, status, versão, validações e permissões. Executado no PostgreSQL local e no Supabase.
- `tests/tratativas-detalhes.cjs`: interface com serviços isolados, cabeçalho, cronologia, escape de conteúdo, erro de conexão/repetição, status, conflito, responsividade e recuperação de erro.
- Regressão: `tests/tratativas-dashboard.cjs` e `tests/tratativas-ui.cjs`.
- Comparação de contagens e hashes antes/depois da migration confirmou preservação integral das quatro tratativas e dos sete eventos existentes. Testes não deixaram registros no banco.

Os assessores do Supabase não identificaram novos alertas de segurança. Permanecem alertas anteriores fora deste escopo: [search_path de set_updated_at](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) e [índice de FK em contrato_aditivos_historico](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
