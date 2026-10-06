# Sincronização protegida de caixas Gmail

## Uso

Entrar em `/gmail.html` com o acesso administrativo e clicar em **Sincronizar GADITA**
ou **Sincronizar HAMATE**. Os lotes continuam enquanto a página estiver aberta e a
sessão válida. **Pausar após este lote** preserva o progresso. Não existe tarefa em
segundo plano nem agendamento externo nesta entrega. Repetir o clique retoma ou
busca alterações desde a última sincronização concluída.

O seletor Empresa mostra somente uma conta por vez. A lista usa paginação de 50
mensagens e texto simples; nunca executa HTML, instruções ou scripts de mensagens.
O link Gmail abre a conta correspondente. Não marca mensagens como lidas no Gmail.

## Backend

Edge Function `gmail-sync`, autenticação explícita com Auth e verificação de sessão
e permissão de empresa no banco, conforme `gmail-accounts`. Nenhum token Google é
enviado ao frontend. Atualiza access tokens no Vault quando necessário.

O bootstrap pagina todas as mensagens com label INBOX em lotes de 20, buscando
metadados com no máximo cinco chamadas simultâneas. Captura um historyId antes de
começar e depois percorre o histórico para capturar mudanças durante o bootstrap.
Sincronizações posteriores usam `history.list`, sem filtro de label, para também
capturar saída de INBOX, exclusões e mudanças de lido/não lido. Cada ID alterado é
consultado novamente para refletir seu estado atual. IDs fora da caixa não são
importados; mensagens que saem dela deixam de aparecer.

HistoryId é string, nunca Number. HTTP 404 de history reinicia a importação completa.
O cursor só avança na mesma transação que grava o lote. Páginas grandes do histórico
guardam IDs pendentes. Lease de dois minutos por empresa impede trabalhadores
concorrentes; callbacks atrasados não podem gravar usando leases antigos.
Falha de rede/rate limit preserva o cursor confirmado e libera a lease quando possível.
Pausas/erros não atualizam a data de conclusão `last_synced_at`.

## Armazenamento

SQL `supabase/sql/gmail_sync.sql`: schema privado `gmail_private`, RLS habilitada e
sem grants para anon/authenticated. `public.gmail_sync_backend` é invoker e exclusivo
de service_role. Valida sessão/empresa em cada chamada.

- `messages`: empresa/conta, gmail_message_id, gmail_thread_id, history_id, Message-ID,
  In-Reply-To, References, remetente, destinatários/Cc, assunto, data interna Gmail,
  preview, labels, lido, presença em INBOX, geração da importação, atualização.
- Chave primária `(company,gmail_message_id)` evita duplicatas e colisões entre contas.
- `sync_state`: empresa, cursor/paginação/IDs pendentes, lease e último erro genérico.
- `tratativa_id` fica obrigatoriamente nulo. Não há cópia para campos JSON públicos
  das tratativas; integração de vínculos depende de permissões por empresa no legado.

Cabeçalhos de destinatários são preservados como recebidos, sem dividir nomes por vírgula.
Não são baixados corpos completos ou anexos. Metadados que saem de INBOX permanecem
privados no cache e ficam ocultos da listagem. Nenhum e-mail é excluído no Google.

## Validação

`node --test tests/gmail-oauth.test.mjs tests/gmail-sync.test.mjs`

`tests/gmail-sync-storage.sql` testa com dados sintéticos e ROLLBACK: unicidade,
isolamento, atualização de labels, autorização, exclusão da listagem e locks.
Não executar a suíte legada OAuth storage com a conta real já existente; ela foi
escrita para o banco inicial sem usuários. A suíte sync usa um usuário de teste separado.

O funcionamento real deve ser confirmado iniciando a sincronização na sessão
administrativa. Testes simulados não representam mensagens reais importadas.

Referência: https://developers.google.com/workspace/gmail/api/guides/sync
