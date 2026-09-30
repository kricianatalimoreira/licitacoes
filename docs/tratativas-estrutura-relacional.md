# Estrutura relacional de Tratativas Administrativas

Migration aplicada: `20260929185155_tratativas_estrutura_relacional`.

## Schema analisado e entidades reaproveitadas

O banco já tinha `tratativas_administrativas` e `tratativas_historico`. A migration amplia essas estruturas, sem criar outro cadastro de tratativas.

Empresas, órgãos e processos são campos dos contratos existentes, não tabelas próprias. Não existe tabela separada de atas. A referência ata/contrato usa `contrato_id` e o número armazenado em `contrato`. A view `tratativas_administrativas_detalhes` consulta essas informações sem copiá-las para outro cadastro.

Contratos passam entre `contratos_ativos` e `contratos_encerrados`, mantendo ID textual. O vínculo continua validado pelo trigger existente sobre ambas as tabelas. Uma FK para apenas uma delas impediria o encerramento/reativação. Há IDs presentes nas duas tabelas no schema atual; a view prioriza o registro ativo, retornando uma linha por tratativa, sem alterar esses registros. Nesta arquitetura a tratativa continua vinculada a um contrato existente; não foi criado um cadastro independente de processos, empresas ou atas.

`responsavel_id` referencia a chave primária `auth.users.id`. O projeto não tinha usuários cadastrados no momento da aplicação; o responsável pode ficar nulo. Não foram criados usuários nem implantado login.

## Tabelas criadas

| Tabela | Campos | Finalidade |
| --- | --- | --- |
| `tratativas_tipos` | `nome text PK`, `ordem smallint UNIQUE NOT NULL` | Os 13 tipos solicitados, na ordem informada |
| `tratativas_status` | `nome text PK`, `ordem smallint UNIQUE NOT NULL` | Os 8 status solicitados, na ordem informada |
| `tratativas_empenhos` | `tratativa_id uuid FK`, `empenho_id text FK`, `created_at timestamptz` | Relação muitos para muitos; PK composta impede apenas repetir o mesmo par |

## Campos da tratativa

| Informação | Campo/interface | Armazenamento |
| --- | --- | --- |
| ID | `id` | UUID existente |
| Empresa, órgão, processo | `empresa`, `orgao`, `processo` na view | Lidos do contrato, sem duplicação |
| Ata/contrato | `contrato_id`; `ata_contrato` na view | ID estável existente e número do contrato |
| Empenhos | `tratativas_empenhos` | N:N com `empenhos.id`; aceita zero, um ou vários conforme abrangência |
| Tipo | `tipo_tratativa` | FK para os 13 tipos; `tipo` legado preservado e sincronizado |
| Responsável | `responsavel_id` | FK opcional para `auth.users.id`; exclusão do usuário referenciado é restrita |
| Prioridade | `prioridade` | Baixa, Normal, Alta ou Urgente; padrão Normal |
| Status | `status` | FK para os 8 status; `situacao` legada sincronizada |
| Abertura | `data_abertura` | Alias gerado de `data_ocorrencia` |
| Última movimentação | `ultima_movimentacao` | Alias gerado de `atualizado_em` |
| Próxima ação | `proxima_acao` | Texto existente |
| Data da próxima ação | `data_proxima_acao` | Alias gerado de `acompanhar_em` |
| Prazo | `prazo` | Data opcional |
| Observações | `observacoes` | Texto existente |
| Criação | `created_at` | Alias gerado de `criado_em` |
| Atualização | `updated_at` | Alias gerado de `atualizado_em` |

Aliases gerados são somente leitura: gravações usam `data_ocorrencia` e `acompanhar_em`. Timestamps são mantidos pelo banco. `descricao`, `abrangencia`, `versao`, `resultado`, `encerrada_em`, exclusão recuperável e demais campos legados continuam disponíveis. A view é somente leitura para os papéis da aplicação.

## Compatibilidade e escrita dos vínculos

Para criar/alterar vínculos, gravar `empenho_ids` na própria tratativa, usando o controle de versão existente. O trigger sincroniza a tabela N:N na mesma transação; uma falha desfaz toda a operação. Não há escrita direta no relacionamento pelos papéis da aplicação, evitando divergência entre a tabela e o array usado pelo frontend atual. Atualizações continuam exigindo `nota_atualizacao` e gerando histórico. Tipos/status novos podem ser enviados pelos campos canônicos; chamadas antigas continuam usando `tipo`/`situacao`. Se ambos forem enviados com valores conflitantes, a operação falha.

Exemplo de PATCH: filtrar `id` e `versao` atuais e enviar `empenho_ids`, `abrangencia` e `nota_atualizacao`. Empenhos de outro contrato, inexistentes, nulos ou repetidos são rejeitados. O mesmo empenho pode aparecer em várias tratativas, inclusive de tipos diferentes. A exclusão de empenho vinculado é bloqueada pela FK; a troca de contrato desse empenho também é bloqueada para preservar integridade.

O backfill mantém `tipo` e `situacao` originais. `CANCELAMENTO` do módulo contratual existente corresponde a Extinção consensual (o frontend já apresentava `EXTINÇÃO CONSENSUAL` como `CANCELAMENTO`); Cancelamento de empenho permanece tipo distinto. `ENVIADO`/`AGUARDANDO RESPOSTA` correspondem a Aguardando órgão. Concluído/Cancelado correspondem a Encerrado; Parcialmente deferido corresponde a Deferido, mantendo o resultado detalhado e a situação original. Nenhum evento de histórico ou timestamp de alteração foi fabricado pelo backfill.

As regras existentes de conclusão permanecem: Deferido, Indeferido e Encerrado exigem `resultado` e `encerrada_em`. Resposta recebida e Follow-up foram acrescentados como situações abertas compatíveis com a regra atual.

## Permissões e índices

RLS habilitada nas três tabelas novas. Catálogos têm leitura pública dos valores predefinidos; a tabela N:N só é visível quando a tratativa e o empenho do contrato estão visíveis. A view usa `security_invoker=true`, respeitando as políticas das tabelas consultadas. A função de sincronização fica em schema privado, sem execução pública; opera exclusivamente como trigger da escrita já validada na tratativa.

O projeto mantém seu acesso atual sem login; essa migration não transforma o sistema em uma aplicação com isolamento por usuário. As políticas existentes de contratos/empenhos não foram ampliadas. Índices cobrem tipo, status, responsável, prazo de tratativas abertas e a consulta inversa por empenho. A PK composta cobre consultas por tratativa.

## Validação executada

- Migration validada primeiro em Postgres local (PGlite), incluindo preservação de um registro legado e histórico.
- `tests/tratativas-estrutura.sql` executado no Supabase como `anon`, dentro de uma transação encerrada com ROLLBACK.
- Testados os 13 tipos, 8 status, campos derivados, N:N nos dois sentidos, retirada de vínculo, versão/histórico, usuários inexistentes, prioridade/status inválidos, empenho de outro contrato, duplicidade, exclusão/revinculação de empenho, permissões e contrato encerrado.
- Após a aplicação: 4 tratativas, 4 vínculos, 6 eventos de histórico; nenhuma diferença entre os vínculos antigos e a tabela N:N. Hashes dos campos legados, do histórico e dos dados de contratos/empenhos permaneceram idênticos.
- Advisors: nenhum novo aviso de segurança. Permanece o aviso preexistente de search_path em `public.set_updated_at`: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable . Há também um índice ausente preexistente em `contrato_aditivos_historico`, fora do escopo: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys . Índices novos ainda não utilizados são esperados antes da implementação das telas.

Não houve alteração no Dashboard, no menu, no frontend ou em integrações Gmail. Campos antigos relacionados a e-mail foram preservados, sem nova integração.

O arquivo foi inicialmente gerado pelo CLI (`migration new`), depois renomeado para a versão efetivamente registrada pelo Supabase MCP. Ele documenta uma migration já aplicada: não executá-la novamente nesse projeto. Para um banco vazio, aplicar primeiro o schema legado e as migrations anteriores, que já existiam no projeto remoto.
