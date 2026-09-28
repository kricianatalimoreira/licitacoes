-- Tratativas independentes: nenhum campo/status financeiro existente é alterado.
-- Contratos mudam entre tabelas ao encerrar/reativar; o vínculo lógico usa seu ID estável.
begin;
create schema if not exists km_private;
revoke all on schema km_private from public, anon, authenticated;
create table if not exists public.tratativas_administrativas (
  id uuid primary key default gen_random_uuid(),
  contrato_id text not null,
  tipo text not null,
  situacao text not null,
  data_ocorrencia date not null,
  descricao text not null,
  abrangencia text not null default 'contrato' check (abrangencia in ('contrato','empenhos','contrato_empenhos')),
  empenho_ids text[] not null default '{}',
  observacoes text not null default '',
  link_externo text not null default '',
  link_gmail text not null default '',
  link_documento text not null default '',
  proxima_acao text not null default '',
  acompanhar_em date,
  resultado text not null default '',
  encerrada_em date,
  nota_atualizacao text not null default '',
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (length(trim(tipo)) > 0 and length(trim(descricao)) > 0),
  check (situacao in ('AGUARDANDO ENVIO','ENVIADO','AGUARDANDO RESPOSTA','EM ANÁLISE PELO ÓRGÃO','DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA','DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO')),
  check ((situacao in ('DEFERIDO','INDEFERIDO','PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO')) = (encerrada_em is not null)),
  check (encerrada_em is null or (encerrada_em >= data_ocorrencia and length(trim(resultado)) > 0)),
  check ((abrangencia = 'contrato' and cardinality(empenho_ids) = 0) or (abrangencia <> 'contrato' and cardinality(empenho_ids) > 0)),
  check (link_externo = '' or link_externo ~* '^https?://[^[:space:]]+$'),
  check (link_gmail = '' or link_gmail ~* '^https?://[^[:space:]]+$'),
  check (link_documento = '' or link_documento ~* '^https?://[^[:space:]]+$')
);
create index if not exists tratativas_contrato_idx on public.tratativas_administrativas(contrato_id);
create index if not exists tratativas_acompanhamento_idx on public.tratativas_administrativas(acompanhar_em) where encerrada_em is null;
create index if not exists tratativas_empenhos_idx on public.tratativas_administrativas using gin(empenho_ids);
create table if not exists public.tratativas_historico (
  id uuid primary key default gen_random_uuid(),
  tratativa_id uuid not null references public.tratativas_administrativas(id) on delete restrict,
  data_hora timestamptz not null default now(),
  usuario_id uuid,
  descricao text not null,
  status_anterior text,
  novo_status text not null,
  observacao text not null default '',
  link_documento text not null default '',
  antes jsonb,
  depois jsonb not null
);
create index if not exists tratativas_historico_tratativa_idx on public.tratativas_historico(tratativa_id,data_hora);

create or replace function public.validar_tratativa_administrativa() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.contrato_id <> old.contrato_id then
      raise exception 'Não é permitido trocar o contrato de uma tratativa.';
    end if;
    if length(trim(new.nota_atualizacao)) = 0 then
      raise exception 'Descreva a atualização para preservar o histórico.';
    end if;
    new.criado_em := old.criado_em;
    new.versao := old.versao + 1;
  else
    new.versao := 1;
    new.criado_em := now();
  end if;
  if not exists (select 1 from public.contratos_ativos c where c.id::text = new.contrato_id)
     and not exists (select 1 from public.contratos_encerrados c where c.id::text = new.contrato_id) then
    raise exception 'Contrato não encontrado ou indisponível.';
  end if;
  if exists (select 1 from unnest(new.empenho_ids) e_id where not exists
    (select 1 from public.empenhos e where e.id::text = e_id and e.contrato_id::text = new.contrato_id)) then
    raise exception 'Selecione apenas empenhos pertencentes a este contrato.';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists validar_tratativa on public.tratativas_administrativas;
create trigger validar_tratativa before insert or update on public.tratativas_administrativas
for each row execute function public.validar_tratativa_administrativa();

create or replace function km_private.registrar_historico_tratativa() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.tratativas_historico(tratativa_id,usuario_id,descricao,status_anterior,novo_status,observacao,link_documento,antes,depois)
  values(new.id,auth.uid(),coalesce(nullif(trim(new.nota_atualizacao),''),'Tratativa cadastrada'),
    case when tg_op = 'UPDATE' then old.situacao else null end,new.situacao,new.observacoes,new.link_documento,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
revoke all on function km_private.registrar_historico_tratativa() from public, anon, authenticated;
drop trigger if exists registrar_historico_tratativa on public.tratativas_administrativas;
create trigger registrar_historico_tratativa after insert or update on public.tratativas_administrativas
for each row execute function km_private.registrar_historico_tratativa();

alter table public.tratativas_administrativas enable row level security;
alter table public.tratativas_historico enable row level security;
-- A visibilidade segue os contratos que o usuário já consegue consultar.
create policy tratativas_leitura on public.tratativas_administrativas for select to anon, authenticated using (
  exists(select 1 from public.contratos_ativos c where c.id::text = contrato_id)
  or exists(select 1 from public.contratos_encerrados c where c.id::text = contrato_id)
);
create policy tratativas_criacao on public.tratativas_administrativas for insert to anon, authenticated with check (
  exists(select 1 from public.contratos_ativos c where c.id::text = contrato_id)
  or exists(select 1 from public.contratos_encerrados c where c.id::text = contrato_id)
);
create policy tratativas_atualizacao on public.tratativas_administrativas for update to anon, authenticated using (
  exists(select 1 from public.contratos_ativos c where c.id::text = contrato_id)
  or exists(select 1 from public.contratos_encerrados c where c.id::text = contrato_id)
) with check (
  exists(select 1 from public.contratos_ativos c where c.id::text = contrato_id)
  or exists(select 1 from public.contratos_encerrados c where c.id::text = contrato_id)
);
create policy tratativas_historico_leitura on public.tratativas_historico for select to anon, authenticated using (
  exists(select 1 from public.tratativas_administrativas t where t.id = tratativa_id)
);
-- Não concede exclusão nem escrita direta no histórico; acompanha os privilégios já existentes.
revoke all on public.tratativas_administrativas, public.tratativas_historico from anon, authenticated;
do $$ declare papel text; begin
  foreach papel in array array['anon','authenticated'] loop
    if has_table_privilege(papel,'public.contratos_ativos','SELECT') then
      execute format('grant select on public.tratativas_administrativas, public.tratativas_historico to %I',papel);
    end if;
    if has_table_privilege(papel,'public.contratos_ativos','INSERT') then
      execute format('grant insert on public.tratativas_administrativas to %I',papel);
    end if;
    if has_table_privilege(papel,'public.contratos_ativos','UPDATE') then
      execute format('grant update on public.tratativas_administrativas to %I',papel);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;

