# Gmail OAuth: conexão individual das empresas

## Escopo entregue

Tela `/gmail.html`, acessível por **Conectar contas de e-mail** na caixa de entrada.
Login administrativo usando Supabase Auth; OAuth Google independente para HAMATE e GADITA;
armazenamento criptografado e verificação/renovação de credenciais somente no backend.
Não importa mensagens, não envia e-mails, não muda status lido e não cria vínculos em tratativas.
`last_synced_at` permanece nulo até existir sincronização real.

## Configuração

Projeto Google `bright-arc-510714-d4`, Gmail API habilitada, cliente web configurado.
Contas de teste: `hamateeletroinfo@gmail.com`, `gaditaempreendimentos@gmail.com`.
Secrets das Edge Functions:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`: `https://inaunswiwxfonhhdznkh.supabase.co/functions/v1/gmail-oauth-callback`
- `APP_ORIGIN`: `https://km-licitacoes.vercel.app`

Os secrets `SUPABASE_URL` e `SUPABASE_SECRET_KEYS` são fornecidos pelo Supabase;
há compatibilidade com `SUPABASE_SERVICE_ROLE_KEY` no runtime legado.
Nunca incluir o JSON baixado do Google, tokens, senhas ou arquivos `.env` no repositório.
Esta implementação usa Vault; não depende de `GMAIL_TOKEN_ENCRYPTION_KEY`.
O Vault gerencia a chave de criptografia autenticada fora das tabelas de aplicação.
Administradores do projeto e o backend privilegiado continuam sendo a fronteira de confiança.

## Primeiro acesso

No Supabase, **Authentication → Users → Add user → Create new user**, cadastrar
`kricianatalimoreira@gmail.com` com senha exclusiva para o SISTEMA e confirmar o e-mail
no cadastro administrativo. O proprietário insere essa senha diretamente no painel.
Não usar a senha do Gmail. Não enviar convite ou mensagem automaticamente.
O cadastro administrativo confirma a identidade já verificada pelo proprietário;
cadastros públicos sem confirmação não são aceitos.

A tabela privada `operators` autoriza inicialmente somente esse endereço nas duas empresas.
Cada requisição valida o token Supabase com Auth, depois confirma usuário, sessão ativa,
e-mail confirmado, ausência de bloqueio e permissão da empresa no banco.
Não confia em `user_metadata` nem aceita chave pública como autenticação.

A tela guarda apenas o access token do SISTEMA em memória. Ao retornar do Google é
necessário entrar novamente; não armazena sessões Google no navegador.

## Fluxo

1. `POST /functions/v1/gmail-accounts` com sessão Supabase e `{action:"connect",company:"HAMATE"}`
   (ou `GADITA`) cria estado aleatório de 256 bits, nonce e PKCE S256.
2. Estado vinculado ao usuário, sessão, empresa e tentativa; validade 10 minutos.
   Apenas o hash do estado é armazenado; o verificador PKCE também fica no Vault.
3. Google recebe `openid email gmail.readonly`, `access_type=offline`, seleção de conta e consentimento.
4. Callback consome estado atomicamente, checa sessão/permissões novamente e troca código no backend.
5. `jose` valida assinatura RS256, emissor, audiência, expiração e claims obrigatórias do ID token.
   Backend confere nonce, e-mail verificado exato, Google `sub` e perfil Gmail.
6. Somente após todas as verificações os tokens são gravados no Vault e a conta fica `connected`.
   Reconexão mantém o Google `sub` original. Uma tentativa antiga não substitui uma mais recente.
7. Navegador recebe apenas resultado fixo, sem código, tokens ou erro bruto do provedor.
8. `action:"check"` renova token vencido no servidor e consulta o perfil Gmail. `invalid_grant`
   marca somente aquela empresa como `reconnect_required`. Revisões evitam sobrescritas antigas.

`action:"list"` retorna metadados permitidos, nunca IDs de segredos ou tokens.
As funções usam `verify_jwt=false` porque a autenticação é explícita no código:
Auth + sessão/permissão em `gmail-accounts`, estado de uso único em `gmail-oauth-callback`.
Isso não permite operações anônimas de gerenciamento.

## Banco

SQL aditivo `supabase/sql/gmail_oauth.sql`, aplicado via migration `gmail_oauth_private_vault`.
Schema não exposto `gmail_private`: companies, operators, accounts, oauth_states.
RLS habilitada; nenhuma permissão concedida a `anon`/`authenticated`.
RPC `public.gmail_backend` é SECURITY INVOKER, executável apenas por `service_role`.
Somente colunas necessárias de Auth são concedidas ao backend. Vault armazena os tokens
criptografados; a conta guarda apenas referência ao segredo, revisão e expiração.
Não foram ampliadas permissões de usuários nem alteradas as tabelas de negócio existentes.

## Validação e limites

- `node --test tests/gmail-oauth.test.mjs`
- `deno check --config supabase/functions/deno.json supabase/functions/gmail-accounts/index.ts supabase/functions/gmail-oauth-callback/index.ts`
- `tests/gmail-storage.sql`: executar como administrador; usa fixtures e ROLLBACK.
- Testes HTTP publicados: sem sessão → 401; origem indevida → 403; callback sem estado → erro seguro.

O teste real com Google exige consentimento individual do proprietário de cada caixa.
Em modo Testando, autorizações Gmail de contas externas normalmente expiram em sete dias;
publicação/verificação Google é uma etapa separada, necessária para operação duradoura conforme o caso.
Não registrar corpos das chamadas de token, cabeçalhos Authorization, códigos ou segredos em logs.
O gateway pode reter URLs dos callbacks; controlar acesso e retenção dos logs do projeto.

As tabelas legadas ainda aceitam acesso anônimo. Nenhum e-mail deve ser copiado para elas.
Antes da sincronização/vinculação, implementar isolamento por empresa também nas tratativas
e armazenar mensagens em estrutura protegida com chave composta conta + Gmail message ID.

Revogação pode ser feita na conta Google (permissões de apps). Esta versão detecta a revogação
na próxima verificação; a interface de desconexão e a importação de mensagens ficam fora deste incremento.
