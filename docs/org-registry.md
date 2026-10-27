# Cadastro de órgãos públicos

Menu Contratos → Órgãos públicos. Requer a sessão Supabase do sistema (o módulo de sessão existente é reutilizado; não solicita conexão Gmail).

## Uso
1. Abra **Registros para vincular**: lista contratos e empenhos existentes sem alterar seus nomes.
2. Escolha **Vincular**, selecione uma entidade já cadastrada ou **Cadastrar este órgão**.
3. Confira nome oficial, CNPJ, município, UF e tipo. Não agrupe Prefeitura, Câmara, fundos ou secretarias apenas pela cidade.
4. Confirme o vínculo. Empenhos compatíveis da mesma empresa herdam o vínculo do contrato. Um vínculo direto do empenho é uma exceção explícita e tem precedência.
5. Consulte **Órgãos** para histórico e contatos; **Por município** para totais consolidados. O filtro HAMATE/GADITA afeta os totais e mantém a classificação separada por empresa.

O cadastro começa vazio: não foram atribuídos CNPJs nem confirmados agrupamentos por suposição. Criar um cadastro não confirma o vínculo automaticamente; volte ao registro e confirme a entidade. “Somente não vinculados” filtra a lista de registros; desmarque para conferir ou corrigir vínculos existentes.

## Identidade e dados
- CNPJ opcional, único quando informado, com validação dos dígitos (numérico e alfanumérico). A validação não comprova titularidade. Referência: [manual da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf).
- Vínculos usam IDs estáveis, empresa, tipo do registro e fotografia do nome original. Movimentação de contrato ativo para encerrado preserva o vínculo por ID.
- Mudança de nome original, empresa ou identificação ambígua impede herança silenciosa; requer nova conferência.
- Nenhum nome, contato, valor, imposto, royalty, data ou saldo original é alterado.
- Totais de contratos e empenhos são separados para evitar dupla contagem. Compra/custo/lucro referem-se aos empenhos pagos vinculados e chamam `calcEmpFinanceiroRealizado` existente, com cobertura e quantidade de valores previstos. Sem valores disponíveis, o detalhe mostra “—”.
- Prazos usam entrega física → pagamento válido, excluem datas futuras/invertidas e exigem 3 amostras para classificar. Não representam aceite definitivo ou atraso contratual.
- Badges e inteligência de pagamentos preferem a entidade confirmada quando a sessão protegida está carregada. Sem cadastro/vínculo/sessão, preservam o agrupamento conservador anterior por nome/empresa; não inferem CNPJ.

## Backend
`registry_private.orgaos`, `registry_private.links`, `registry_private.audit`: RLS habilitado, sem grants de leitura/escrita para anon/authenticated. A ausência de policies é intencional: acesso exclusivo do backend, conforme [orientação do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

`org-registry` verifica o bearer na Auth API, exige usuário confirmado não anônimo, depois a RPC `org_registry_backend` valida sessão ativa e permissões em `gmail_private.operators`. Não usa user_metadata para autorização. A função SQL é SECURITY INVOKER com search_path vazio; EXECUTE apenas service_role. Edição de cadastro compartilhado exige operador das duas empresas. Vínculo exige permissão na empresa correspondente, confirmação explícita, correspondência ao registro original e revisão para concorrência. Eventos são auditados. Contatos não são persistidos no armazenamento local.

Variáveis existentes reutilizadas: SUPABASE_URL, SUPABASE_SECRET_KEYS.default (ou SUPABASE_SERVICE_ROLE_KEY), APP_ORIGIN. Nenhuma chave privada enviada ao navegador. Nenhuma configuração OAuth adicional.

SQL aplicado por migration MCP; cópia revisável em `supabase/sql/org_registry.sql`. Não houve geração de arquivo CLI com versão inventada.

## Validação
- Testes de unidade: CNPJ, URLs, empresas/entidades, vínculo direto/herdado, registros duplicados, datas inválidas/futuras, cobertura financeira.
- Backend: rejeição de ausência de login/origem indevida/usuário anônimo/dados inválidos; validação de sessão e retorno sem segredo.
- SQL em transação revertida: criação, CNPJ duplicado, revisão concorrente, exigência de confirmação, fonte alterada, vínculo/listagem/remoção. Zero cadastros, vínculos ou auditorias de teste persistidos.
- Playwright: login, formulário, confirmação, herança, detalhes, escape HTML, logout e larguras de desktop/tablet.
- Regressão dos testes existentes de classificação e inteligência de pagamentos.
- Advisors: nenhum novo aviso de segurança/performance acionável no cadastro. Avisos anteriores `set_updated_at` e proteção de senhas vazadas permanecem fora do escopo: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

