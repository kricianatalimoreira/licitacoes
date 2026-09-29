
begin;
create table public.contrato_aditivos_base (
 contrato_id text primary key,
 data_original date,
 vencimento_original date,
 valor_original numeric(18,2) not null,
 vencimento_atual date,
 valor_atual numeric(18,2) not null,
 versao integer not null default 0,
 criado_em timestamptz not null default now()
);
create table public.contrato_aditivos (
 id uuid primary key default gen_random_uuid(),
 contrato_id text not null references public.contrato_aditivos_base(contrato_id),
 tipo text not null check(tipo in ('Prorrogação de vigência','Acréscimo quantitativo','Supressão quantitativa','Reequilíbrio econômico-financeiro','Reajuste','Repactuação','Alteração de valor','Alteração contratual','Outro')),
 numero_aditivo text not null default '',
 data_aditivo date,
 status text not null default 'Em tratativa' check(status in ('Em tratativa','Solicitado pelo órgão','Manifestação enviada','Aguardando formalização','Formalizado','Indeferido','Cancelado')),
 vigencia_anterior date,
 nova_vigencia date,
 valor_anterior numeric(18,2),
 valor_acrescimo numeric(18,2),
 valor_supressao numeric(18,2),
 novo_valor numeric(18,2),
 protocolo text not null default '',
 link_documento text not null default '' check(link_documento='' or link_documento ~* '^https?://[^[:space:]]+$'),
 observacoes text not null default '',
 tratativa_id uuid references public.tratativas_administrativas(id) on delete restrict,
 excluido boolean not null default false,
 versao integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(valor_anterior is null or valor_anterior>=0),
 check(valor_acrescimo is null or valor_acrescimo>=0),
 check(valor_supressao is null or valor_supressao>=0),
 check(novo_valor is null or novo_valor>=0)
);
create index contrato_aditivos_contrato_idx on public.contrato_aditivos(contrato_id,data_aditivo,created_at);
create index contrato_aditivos_tratativa_idx on public.contrato_aditivos(tratativa_id) where tratativa_id is not null;
create table public.contrato_aditivos_historico (
 id uuid primary key default gen_random_uuid(),
 aditivo_id uuid not null references public.contrato_aditivos(id),
 contrato_id text not null,
 acao text not null,
 antes jsonb,
 depois jsonb not null,
 usuario_id uuid,
 criado_em timestamptz not null default now()
);
create index contrato_aditivos_historico_idx on public.contrato_aditivos_historico(contrato_id,criado_em);
alter table public.contrato_aditivos enable row level security;
alter table public.contrato_aditivos_base enable row level security;
alter table public.contrato_aditivos_historico enable row level security;

create policy aditivos_leitura on public.contrato_aditivos for select to anon,authenticated using (
 exists(select 1 from public.contratos_ativos c where c.id=contrato_id) or exists(select 1 from public.contratos_encerrados c where c.id=contrato_id));
create policy aditivos_criacao on public.contrato_aditivos for insert to anon,authenticated with check (
 exists(select 1 from public.contratos_ativos c where c.id=contrato_id) or exists(select 1 from public.contratos_encerrados c where c.id=contrato_id));
create policy aditivos_edicao on public.contrato_aditivos for update to anon,authenticated using (
 exists(select 1 from public.contratos_ativos c where c.id=contrato_id) or exists(select 1 from public.contratos_encerrados c where c.id=contrato_id)) with check (
 exists(select 1 from public.contratos_ativos c where c.id=contrato_id) or exists(select 1 from public.contratos_encerrados c where c.id=contrato_id));
create policy aditivos_base_leitura on public.contrato_aditivos_base for select to anon,authenticated using (
 exists(select 1 from public.contratos_ativos c where c.id=contrato_id) or exists(select 1 from public.contratos_encerrados c where c.id=contrato_id));
create policy aditivos_hist_leitura on public.contrato_aditivos_historico for select to anon,authenticated using (
 exists(select 1 from public.contrato_aditivos a where a.id=aditivo_id));
revoke all on public.contrato_aditivos,public.contrato_aditivos_base,public.contrato_aditivos_historico from anon,authenticated;
grant select,insert,update on public.contrato_aditivos to anon,authenticated;
grant select on public.contrato_aditivos_base,public.contrato_aditivos_historico to anon,authenticated;

-- Invoker validation runs before the private persistence trigger and respects contract RLS.
create function public.validar_contrato_aditivo() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.contratos_ativos where id=new.contrato_id)
 and not exists(select 1 from public.contratos_encerrados where id=new.contrato_id) then
  raise exception 'Contrato inexistente ou indisponível.';
 end if;
 if tg_op='UPDATE' then
  if new.id<>old.id or new.contrato_id<>old.contrato_id then raise exception 'Não é permitido trocar o contrato do aditivo.'; end if;
 end if;
 if new.tratativa_id is not null and not exists(
  select 1 from public.tratativas_administrativas t where t.id=new.tratativa_id and t.contrato_id=new.contrato_id
  and (not t.excluida or (tg_op='UPDATE' and old.tratativa_id=new.tratativa_id))
 ) then raise exception 'Selecione uma tratativa deste contrato.'; end if;
 if new.tipo='Prorrogação de vigência' then
  new.valor_anterior:=null;new.valor_acrescimo:=null;new.valor_supressao:=null;new.novo_valor:=null;
 elsif new.tipo not in ('Alteração contratual','Outro') then
  new.vigencia_anterior:=null;new.nova_vigencia:=null;
 end if;
 if new.tipo<>'Acréscimo quantitativo' then new.valor_acrescimo:=null; end if;
 if new.tipo<>'Supressão quantitativa' then new.valor_supressao:=null; end if;
 if new.status='Formalizado' and not new.excluido then
  if new.data_aditivo is null then raise exception 'Informe a data do aditivo formalizado.'; end if;
  if new.tipo='Prorrogação de vigência' or new.nova_vigencia is not null then
   if new.vigencia_anterior is null or new.nova_vigencia is null or new.nova_vigencia<=new.vigencia_anterior then
    raise exception 'A nova vigência deve ser posterior à anterior.';
   end if;
  end if;
  if new.tipo in ('Acréscimo quantitativo','Supressão quantitativa','Reequilíbrio econômico-financeiro','Reajuste','Repactuação','Alteração de valor') or new.novo_valor is not null then
   if new.valor_anterior is null or new.novo_valor is null then raise exception 'Informe o valor anterior e o novo valor.'; end if;
   if new.tipo='Acréscimo quantitativo' and (coalesce(new.valor_acrescimo,0)<=0 or new.novo_valor<>new.valor_anterior+new.valor_acrescimo) then
    raise exception 'Novo valor deve ser o anterior mais o acréscimo.';
   end if;
   if new.tipo='Supressão quantitativa' and (coalesce(new.valor_supressao,0)<=0 or new.novo_valor<>new.valor_anterior-new.valor_supressao) then
    raise exception 'Novo valor deve ser o anterior menos a supressão.';
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger a_validar_aditivo before insert or update on public.contrato_aditivos
 for each row execute function public.validar_contrato_aditivo();

-- Original values are captured once, never rewritten by clients.
create function km_private.preparar_contrato_aditivo() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare c record;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.contrato_id,19417));
 select data,data_fim,valor into c from public.contratos_ativos where id=new.contrato_id for update;
 if not found then select data,data_fim,valor into c from public.contratos_encerrados where id=new.contrato_id for update; end if;
 if not found then raise exception 'Contrato não encontrado.'; end if;
 insert into public.contrato_aditivos_base(contrato_id,data_original,vencimento_original,valor_original,vencimento_atual,valor_atual)
 values(new.contrato_id,c.data,c.data_fim,coalesce(c.valor,0),c.data_fim,coalesce(c.valor,0)) on conflict do nothing;
 if tg_op='UPDATE' then
  new.created_at:=old.created_at;new.versao:=old.versao+1;
 else new.created_at:=now();new.versao:=1;end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function km_private.preparar_contrato_aditivo() from public,anon,authenticated;
create trigger b_preparar_aditivo before insert or update on public.contrato_aditivos
 for each row execute function km_private.preparar_contrato_aditivo();

create function km_private.recalcular_contrato_aditivos() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare b public.contrato_aditivos_base%rowtype; r record; fim date; v_atual numeric;
begin
 select * into b from public.contrato_aditivos_base where contrato_id=new.contrato_id for update;
 fim:=b.vencimento_original;v_atual:=b.valor_original;
 for r in select * from public.contrato_aditivos where contrato_id=new.contrato_id and not excluido and status='Formalizado'
  order by data_aditivo,created_at,id loop
  if r.nova_vigencia is not null then fim:=r.nova_vigencia; end if;
  if r.novo_valor is not null then v_atual:=v_atual+r.novo_valor-r.valor_anterior; end if;
 end loop;
 if v_atual<0 then raise exception 'O recálculo resultaria em valor negativo. Revise os aditivos posteriores.'; end if;
 if fim<b.data_original then raise exception 'Vencimento incompatível com o início original.'; end if;
 update public.contrato_aditivos_base set vencimento_atual=fim,valor_atual=v_atual,versao=versao+1 where contrato_id=new.contrato_id;
 -- Only principal date/value columns change. Commitments/items/treatments are untouched.
 update public.contratos_ativos set data_fim=fim,valor=v_atual where id=new.contrato_id and (data_fim is distinct from fim or contratos_ativos.valor is distinct from v_atual);
 update public.contratos_encerrados set data_fim=fim,valor=v_atual where id=new.contrato_id and (data_fim is distinct from fim or contratos_encerrados.valor is distinct from v_atual);
 insert into public.contrato_aditivos_historico(aditivo_id,contrato_id,acao,antes,depois,usuario_id)
 values(new.id,new.contrato_id,
 case when tg_op='INSERT' then 'Criado' when new.excluido and not old.excluido then 'Excluído' else 'Editado' end,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
revoke all on function km_private.recalcular_contrato_aditivos() from public,anon,authenticated;
create trigger c_recalcular_aditivo after insert or update on public.contrato_aditivos
 for each row execute function km_private.recalcular_contrato_aditivos();

-- Legacy save-all clients cannot overwrite formalized terms, including moves to the closed table.
create function km_private.proteger_contrato_com_aditivos() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare b public.contrato_aditivos_base%rowtype;
begin
 select * into b from public.contrato_aditivos_base where contrato_id=new.id;
 if found then new.data:=b.data_original;new.data_fim:=b.vencimento_atual;new.valor:=b.valor_atual; end if;
 return new;
end $$;
revoke all on function km_private.proteger_contrato_com_aditivos() from public,anon,authenticated;
create trigger proteger_contrato_aditivos before insert or update on public.contratos_ativos
 for each row execute function km_private.proteger_contrato_com_aditivos();
create trigger proteger_contrato_aditivos before insert or update on public.contratos_encerrados
 for each row execute function km_private.proteger_contrato_com_aditivos();
notify pgrst,'reload schema';
commit;
