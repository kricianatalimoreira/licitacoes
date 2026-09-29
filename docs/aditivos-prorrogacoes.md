# Aditivos / Prorrogações

## Uso
Abra um contrato/ARP. A nova seção fica após o resumo **Empenhos** e antes de **Tratativas Administrativas**, no modal existente. Use **+ Novo aditivo**, escolha o tipo e preencha os campos. O formulário reaproveita a tipografia, botões, cards, badges e responsividade das Tratativas.

Tipos: Prorrogação de vigência, Acréscimo quantitativo, Supressão quantitativa, Reequilíbrio econômico-financeiro, Reajuste, Repactuação, Alteração de valor, Alteração contratual e Outro.
Situações: Em tratativa, Solicitado pelo órgão, Manifestação enviada, Aguardando formalização, Formalizado, Indeferido e Cancelado.

Somente **Formalizado** produz efeitos. Data do aditivo e dados de vigência/valor pertinentes são obrigatórios para formalizar. Documento, número e protocolo são opcionais. A tratativa relacionada deve pertencer ao mesmo contrato; vinculá-la não muda seu status.

## Cálculo e preservação
- O primeiro registro captura início, vencimento e valor então cadastrados como base original imutável. Não se reconstrói histórico anterior que não exista no sistema.
- A data inicial permanece original. O vencimento vigente é a nova vigência do último termo formalizado com efeito de prazo, em ordem de data do aditivo, criação e ID.
- O valor vigente é o original mais as diferenças `novo_valor - valor_anterior` dos termos formalizados. Acréscimo e supressão têm o novo valor calculado no formulário e a igualdade validada no banco.
- Exemplo: original 1.000, acréscimo de 200, reajuste de 1.200 para 1.320. Atual 1.320. Excluir o acréscimo deixa 1.120, preservando o efeito de 120 do reajuste. O valor declarado em cada termo continua no histórico.
- Editar, excluir ou retirar a formalização recalcula tudo atomicamente. Valor total negativo é rejeitado.
- Original, termos excluídos e versões anteriores permanecem no histórico. A exclusão é lógica e pede “Tem certeza que deseja excluir este aditivo?”.
- Após existir uma base de aditivos, início/valor/vencimento são protegidos contra salvamentos antigos do cadastro principal. Novas alterações desses dados devem ser feitas via aditivos.
- Contratos sem aditivos seguem as regras anteriores sem modificação de seus dados.
- Impostos, custos, itens, quantidades e empenhos não são alterados pelo módulo. Os indicadores existentes usam o valor contratual vigente.

## Integração
`index.html` mantém o modal e recebe somente a seção, a carga do script e chamadas de integração. Os mapeadores de persistência e renderização aplicam o estado calculado. O banco também protege contra clientes antigos que não tenham o script.
`aditivos.js` implementa formulário, cards, histórico, vinculação opcional, CRUD por REST, leitura paginada e controle de versão.
A lógica de Tratativas e e-mails permanece em seus arquivos, sem alterações.
Alertas de vencimento usam a data efetiva já armazenada no contrato. Prorrogações em negociação, inclusive tipos de prorrogação legados nas Tratativas, exibem aviso sem mudar a data. Uma tratativa vinculada a um aditivo formalizado deixa de gerar o aviso de pendência; seu registro não é alterado.

## Banco
Migration `contrato_aditivos_prorrogacoes`, registrada pelo Supabase MCP. SQL versionado em `supabase/sql/contrato_aditivos.sql`, seguindo o padrão existente (CLI não disponível neste ambiente).

Novas tabelas:
- `contrato_aditivos`: dados do termo, versão, exclusão lógica.
- `contrato_aditivos_base`: originais e estado vigente, escrita apenas por triggers.
- `contrato_aditivos_historico`: antes/depois de cada alteração, escrita apenas por trigger.

RLS segue o acesso já existente aos contratos. Nenhuma permissão de exclusão física é concedida. Funções privilegiadas ficam em `km_private`, sem execução externa, com search_path definido. A validação inicial usa permissões do chamador. Triggers serializam alterações por contrato, validam o vínculo e recalculam em transação. Contratos ativos/encerrados preservam o mesmo vínculo lógico por ID, inclusive ao mover entre tabelas.
Nenhuma tabela ou relacionamento anterior foi removido.

## Validação
- SQL transacional com rollback: prorrogações sucessivas, formalização, cancelamento, edição/exclusão de termos anteriores, acréscimo + reajuste + supressão, preservação de originais, bloqueio de versão obsoleta, proteção de salvamentos antigos, transição para encerrados, permissões e isolamento de empenhos/Tratativas.
- Interface com dados fictícios: CRUD, campos condicionais, validação, histórico, vínculo opcional, falha de rede, conflito, telas de 390px e 1366px.
- Regressão: suite existente de Tratativas, e-mails e exclusão.
- O advisor de segurança manteve somente o aviso preexistente de `public.set_updated_at` ([referência](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)); o módulo não o modifica.

## Executar testes
```
node tests/aditivos-ui.cjs
```
Instale Playwright no ambiente de testes, ou informe PLAYWRIGHT_MODULE. ADITIVOS_ROOT pode apontar para a raiz dos arquivos. Chrome deve estar disponível. A suite intercepta REST e não grava na produção. Execute `supabase/tests/aditivos.sql` em sessão transacional; o próprio arquivo termina com rollback.
