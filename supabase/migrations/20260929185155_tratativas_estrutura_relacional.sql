-- Evolução aditiva: mantém as telas legadas e os dados existentes.
begin;
set local lock_timeout = '5s';

create table public.tratativas_tipos (
  nome text primary key,
  ordem smallint not null unique
);
insert into public.tratativas_tipos(nome,ordem) values
('Cancelamento de empenho',1),('Extinção consensual',2),
('Reequilíbrio econômico-financeiro',3),('Substituição de produto',4),
('Prorrogação de prazo',5),('Defesa administrativa',6),
('Recurso administrativo',7),('Resposta à notificação',8),
('Advertência',9),('Multa',10),('Cobrança de pagamento',11),
('Regularização documental',12),('Outros',13);

create table public.tratativas_status (
  nome text primary key,
  ordem smallint not null unique
);
insert into public.tratativas_status(nome,ordem) values
('Em andamento',1),('Aguardando órgão',2),('Resposta recebida',3),
('Follow-up',4),('Em análise',5),('Deferido',6),('Indeferido',7),('Encerrado',8);

alter table public.tratativas_administrativas
  add column tipo_tratativa text references public.tratativas_tipos(nome) on delete restrict,
  add column status text references public.tratativas_status(nome) on delete restrict,
  add column responsavel_id uuid references auth.users(id) on delete restrict,
  add column prioridade text not null default 'Normal'
    check (prioridade in ('Baixa','Normal','Alta','Urgente')),
  add column prazo date,
  add column data_abertura date generated always as (data_ocorrencia) stored,
  add column ultima_movimentacao timestamptz generated always as (atualizado_em) stored,
  add column data_proxima_acao date generated always as (acompanhar_em) stored,
  add column created_at timestamptz generated always as (criado_em) stored,
  add column updated_at timestamptz generated always as (atualizado_em) stored;

-- Não transforma a classificação antiga nem fabrica eventos no histórico.
alter table public.tratativas_administrativas disable trigger validar_tratativa;
alter table public.tratativas_administrativas disable trigger registrar_historico_tratativa;
update public.tratativas_administrativas t set
  tipo_tratativa = case upper(t.tipo)
    when 'CANCELAMENTO' then 'Extinção consensual'
    when 'NOTIFICAÇÃO' then 'Resposta à notificação'
    else (select nome from public.tratativas_tipos where upper(nome)=upper(t.tipo)) end,
  status = case t.situacao
    when 'AGUARDANDO ENVIO' then 'Em andamento'
    when 'ENVIADO' then 'Aguardando órgão'
    when 'AGUARDANDO RESPOSTA' then 'Aguardando órgão'
    when 'EM ANÁLISE PELO ÓRGÃO' then 'Em análise'
    when 'DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA' then 'Em análise'
    when 'DEFERIDO' then 'Deferido'
    when 'PARCIALMENTE DEFERIDO' then 'Deferido'
    when 'INDEFERIDO' then 'Indeferido'
    when 'CANCELADO' then 'Encerrado'
    when 'CONCLUÍDO' then 'Encerrado' end;
alter table public.tratativas_administrativas enable trigger validar_tratativa;
alter table public.tratativas_administrativas enable trigger registrar_historico_tratativa;
alter table public.tratativas_administrativas
  alter column tipo_tratativa set not null,
  alter column status set not null;

-- As duas situações novas continuam abertas nas telas legadas.
alter table public.tratativas_administrativas drop constraint tratativas_administrativas_situacao_check;
alter table public.tratativas_administrativas add constraint tratativas_administrativas_situacao_check
check (situacao in ('AGUARDANDO ENVIO','ENVIADO','AGUARDANDO RESPOSTA',
  'EM ANÁLISE PELO ÓRGÃO','DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA',
  'RESPOSTA RECEBIDA','FOLLOW-UP','DEFERIDO','INDEFERIDO',
  'PARCIALMENTE DEFERIDO','CANCELADO','CONCLUÍDO'));

create or replace function public.validar_tratativa_administrativa() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  tipo_mapeado text;
  status_mapeado text;
  novo_tipo boolean;
  novo_status boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.contrato_id is distinct from old.contrato_id then
      raise exception 'Não é permitido trocar o contrato de uma tratativa.';
    end if;
    if coalesce(length(trim(new.nota_atualizacao)),0) = 0 then
      raise exception 'Descreva a atualização para preservar o histórico.';
    end if;
    new.criado_em := old.criado_em;
    new.versao := old.versao + 1;
    novo_tipo := new.tipo_tratativa is distinct from old.tipo_tratativa;
    novo_status := new.status is distinct from old.status;
  else
    new.versao := 1;
    new.criado_em := now();
    novo_tipo := new.tipo_tratativa is not null;
    novo_status := new.status is not null;
  end if;

  if novo_tipo and ((tg_op = 'INSERT' and new.tipo is null)
      or (tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo)) then
    new.tipo := upper(new.tipo_tratativa);
  end if;
  tipo_mapeado := case upper(new.tipo)
    when 'CANCELAMENTO' then 'Extinção consensual'
    when 'NOTIFICAÇÃO' then 'Resposta à notificação'
    else (select nome from public.tratativas_tipos where upper(nome)=upper(new.tipo)) end;
  if tipo_mapeado is null then raise exception 'Tipo de tratativa inválido.'; end if;
  if novo_tipo and new.tipo_tratativa is distinct from tipo_mapeado then
    raise exception 'Tipo de tratativa conflitante com o campo legado.';
  end if;
  new.tipo_tratativa := tipo_mapeado;

  if novo_status and ((tg_op = 'INSERT' and new.situacao is null)
      or (tg_op = 'UPDATE' and new.situacao is not distinct from old.situacao)) then
    new.situacao := case new.status
      when 'Em andamento' then 'AGUARDANDO ENVIO'
      when 'Aguardando órgão' then 'AGUARDANDO RESPOSTA'
      when 'Resposta recebida' then 'RESPOSTA RECEBIDA'
      when 'Follow-up' then 'FOLLOW-UP'
      when 'Em análise' then 'EM ANÁLISE PELO ÓRGÃO'
      when 'Deferido' then 'DEFERIDO'
      when 'Indeferido' then 'INDEFERIDO'
      when 'Encerrado' then 'CONCLUÍDO' end;
  end if;
  status_mapeado := case new.situacao
    when 'AGUARDANDO ENVIO' then 'Em andamento'
    when 'ENVIADO' then 'Aguardando órgão'
    when 'AGUARDANDO RESPOSTA' then 'Aguardando órgão'
    when 'RESPOSTA RECEBIDA' then 'Resposta recebida'
    when 'FOLLOW-UP' then 'Follow-up'
    when 'EM ANÁLISE PELO ÓRGÃO' then 'Em análise'
    when 'DOCUMENTAÇÃO COMPLEMENTAR SOLICITADA' then 'Em análise'
    when 'DEFERIDO' then 'Deferido'
    when 'PARCIALMENTE DEFERIDO' then 'Deferido'
    when 'INDEFERIDO' then 'Indeferido'
    when 'CANCELADO' then 'Encerrado'
    when 'CONCLUÍDO' then 'Encerrado' end;
  if status_mapeado is null then raise exception 'Status de tratativa inválido.'; end if;
  if novo_status and new.status is distinct from status_mapeado then
    raise exception 'Status conflitante com a situação legada.';
  end if;
  new.status := status_mapeado;

  if not exists (select 1 from public.contratos_ativos c where c.id = new.contrato_id)
     and not exists (select 1 from public.contratos_encerrados c where c.id = new.contrato_id) then
    raise exception 'Contrato não encontrado ou indisponível.';
  end if;
  if exists (select 1 from unnest(new.empenho_ids) e_id where e_id is null or not exists
    (select 1 from public.empenhos e where e.id = e_id and e.contrato_id = new.contrato_id)) then
    raise exception 'Selecione apenas empenhos pertencentes a este contrato.';
  end if;
  if cardinality(new.empenho_ids) <> (select count(distinct e_id) from unnest(new.empenho_ids) e_id) then
    raise exception 'Não repita um empenho na mesma tratativa.';
  end if;
  new.atualizado_em := clock_timestamp();
  return new;
end $$;

create table public.tratativas_empenhos (
  tratativa_id uuid not null references public.tratativas_administrativas(id) on delete restrict,
  empenho_id text not null references public.empenhos(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (tratativa_id,empenho_id)
);
create index tratativas_empenhos_empenho_idx on public.tratativas_empenhos(empenho_id);
insert into public.tratativas_empenhos(tratativa_id,empenho_id,created_at)
select t.id,e_id,t.criado_em from public.tratativas_administrativas t
cross join lateral unnest(t.empenho_ids) e_id;

-- Único caminho de escrita: UPDATE da tratativa, validado e auditado.
-- Função privada; não pode ser invocada por RPC e não aceita IDs externos.
create function km_private.sincronizar_tratativas_empenhos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.tratativas_empenhos te
  where te.tratativa_id=new.id and not (te.empenho_id=any(new.empenho_ids));
  insert into public.tratativas_empenhos(tratativa_id,empenho_id)
  select new.id,e_id from unnest(new.empenho_ids) e_id
  on conflict (tratativa_id,empenho_id) do nothing;
  return new;
end $$;
revoke all on function km_private.sincronizar_tratativas_empenhos() from public,anon,authenticated;
create trigger sincronizar_tratativas_empenhos after insert or update of empenho_ids
on public.tratativas_administrativas for each row
execute function km_private.sincronizar_tratativas_empenhos();

create function public.validar_contrato_empenho_tratativas() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.contrato_id is distinct from old.contrato_id and exists (
    select 1 from public.tratativas_empenhos te
    join public.tratativas_administrativas t on t.id=te.tratativa_id
    where te.empenho_id=old.id and t.contrato_id is distinct from new.contrato_id
  ) then
    raise exception 'Empenho vinculado a tratativa: não é permitido trocar seu contrato.';
  end if;
  return new;
end $$;
create trigger validar_contrato_empenho_tratativas before update of contrato_id
on public.empenhos for each row execute function public.validar_contrato_empenho_tratativas();

create index tratativas_tipo_tratativa_idx on public.tratativas_administrativas(tipo_tratativa);
create index tratativas_status_idx on public.tratativas_administrativas(status);
create index tratativas_responsavel_idx on public.tratativas_administrativas(responsavel_id);
create index tratativas_prazo_idx on public.tratativas_administrativas(prazo)
where not excluida and encerrada_em is null;

alter table public.tratativas_tipos enable row level security;
alter table public.tratativas_status enable row level security;
alter table public.tratativas_empenhos enable row level security;
create policy tratativas_tipos_leitura on public.tratativas_tipos for select to anon,authenticated using (true);
create policy tratativas_status_leitura on public.tratativas_status for select to anon,authenticated using (true);
create policy tratativas_empenhos_leitura on public.tratativas_empenhos for select to anon,authenticated using (
  exists(select 1 from public.tratativas_administrativas t
    join public.empenhos e on e.contrato_id=t.contrato_id
    where t.id=tratativas_empenhos.tratativa_id and e.id=tratativas_empenhos.empenho_id)
);
revoke all on public.tratativas_tipos,public.tratativas_status,public.tratativas_empenhos from public,anon,authenticated;
grant select on public.tratativas_tipos,public.tratativas_status,public.tratativas_empenhos to anon,authenticated;

-- Empresa/órgão/processo/ata-contrato são lidos da entidade já existente.
-- Prioriza o registro ativo quando o mesmo ID ainda consta nas duas tabelas.
create view public.tratativas_administrativas_detalhes with (security_invoker=true) as
select t.*,c.empresa,c.orgao,c.processo,c.contrato as ata_contrato
from public.tratativas_administrativas t
left join lateral (
  select q.empresa,q.orgao,q.processo,q.contrato from (
    select a.empresa,a.orgao,a.processo,a.contrato,0 as ordem from public.contratos_ativos a where a.id=t.contrato_id
    union all
    select e.empresa,e.orgao,e.processo,e.contrato,1 as ordem from public.contratos_encerrados e where e.id=t.contrato_id
  ) q order by q.ordem limit 1
) c on true;
revoke all on public.tratativas_administrativas_detalhes from public,anon,authenticated;
grant select on public.tratativas_administrativas_detalhes to anon,authenticated;

comment on table public.tratativas_empenhos is 'Relação N:N. Alterar empenho_ids na tratativa; a sincronização transacional mantém compatibilidade e histórico.';
comment on column public.tratativas_administrativas.tipo_tratativa is 'Tipo canônico. CANCELAMENTO legado é a extinção contratual, como no frontend atual; o valor original tipo é preservado.';
comment on column public.tratativas_administrativas.responsavel_id is 'Usuário existente em auth.users. Nulo enquanto não houver responsável cadastrado.';
comment on column public.tratativas_administrativas.data_abertura is 'Alias de leitura de data_ocorrencia, preservado para o frontend legado.';
comment on column public.tratativas_administrativas.data_proxima_acao is 'Alias de leitura de acompanhar_em.';
comment on column public.tratativas_administrativas.ultima_movimentacao is 'Última gravação auditada da tratativa, inclusive mudanças nos vínculos.';
notify pgrst,'reload schema';
commit;
