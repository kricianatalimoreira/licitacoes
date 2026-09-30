-- Amplia o histórico existente; nenhum evento anterior é removido.
begin;
set local lock_timeout='5s';
alter table public.tratativas_historico
  add column tipo_movimentacao text not null default 'observacao'
    check(tipo_movimentacao in ('email_enviado','email_recebido','documento','ligacao','whatsapp','protocolo','observacao','alteracao_status','follow_up')),
  add column ocorrida_em timestamptz not null default now(),
  add column origem text not null default 'sistema' check(origem in ('sistema','manual')),
  add column link_referencia text not null default '' check(link_referencia='' or link_referencia ~* '^https?://[^[:space:]]+$'),
  add column requisicao_id uuid unique,
  add column requisicao jsonb not null default '{}' check(jsonb_typeof(requisicao)='object');
update public.tratativas_historico set ocorrida_em=data_hora,
  tipo_movimentacao=case when status_anterior is not null and status_anterior is distinct from novo_status then 'alteracao_status' else 'observacao' end;
create index tratativas_historico_timeline_idx on public.tratativas_historico(tratativa_id,ocorrida_em,data_hora,id);

-- Mantém a função privada de auditoria. O contexto somente acrescenta metadados;
-- snapshots, autor e transição de status continuam derivados da escrita real.
create or replace function km_private.registrar_historico_tratativa() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  contexto jsonb:=nullif(current_setting('km.tratativa_movimentacao',true),'')::jsonb;
  pedido jsonb;
  manual boolean:=false;
begin
  if tg_op='UPDATE' and contexto is not null then
    if (contexto->>'tratativa_id')::uuid is distinct from new.id
      or (contexto->'pedido'->>'versao')::integer is distinct from old.versao then
      raise exception 'Contexto de movimentação inválido.';
    end if;
    manual:=true;
    pedido:=contexto->'pedido';
  end if;
  insert into public.tratativas_historico(
    tratativa_id,usuario_id,descricao,status_anterior,novo_status,observacao,link_documento,antes,depois,
    data_hora,tipo_movimentacao,ocorrida_em,origem,link_referencia,requisicao_id,requisicao)
  values(new.id,auth.uid(),coalesce(nullif(trim(new.nota_atualizacao),''),'Tratativa cadastrada'),
    case when tg_op='UPDATE' then old.situacao else null end,new.situacao,new.observacoes,new.link_documento,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),clock_timestamp(),
    case when manual then pedido->>'tipo'
      when tg_op='UPDATE' and old.situacao is distinct from new.situacao then 'alteracao_status' else 'observacao' end,
    case when manual then coalesce((pedido->>'ocorrida_em')::timestamptz,clock_timestamp()) else clock_timestamp() end,
    case when manual then 'manual' else 'sistema' end,
    case when manual then coalesce(pedido->>'link_referencia','') else '' end,
    case when manual then (contexto->>'requisicao_id')::uuid else null end,
    case when manual then pedido else '{}'::jsonb end);
  return new;
end $$;
revoke all on function km_private.registrar_historico_tratativa() from public,anon,authenticated;

-- SECURITY INVOKER: respeita as permissões/RLS já existentes na tratativa.
-- A escrita e o histórico são atômicos, com versão e chave contra repetição.
create function public.registrar_movimentacao_tratativa(
  p_tratativa_id uuid,p_versao integer,p_requisicao_id uuid,p_tipo text,p_descricao text,
  p_ocorrida_em timestamptz default null,p_link_referencia text default '',
  p_status text default null,p_resultado text default null,p_encerrada_em date default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  tratativa public.tratativas_administrativas%rowtype;
  existente public.tratativas_historico%rowtype;
  pedido jsonb;
  evento_id uuid;
  contexto_anterior text:=current_setting('km.tratativa_movimentacao',true);
begin
  if p_requisicao_id is null or p_tratativa_id is null or p_versao is null then
    raise exception 'Informe a tratativa, a versão e a chave da movimentação.';
  end if;
  if p_tipo is null or p_tipo not in ('email_enviado','email_recebido','documento','ligacao','whatsapp','protocolo','observacao','alteracao_status','follow_up') then
    raise exception 'Tipo de movimentação inválido.';
  end if;
  if coalesce(length(trim(p_descricao)),0)=0 then raise exception 'Descreva a movimentação.'; end if;
  if p_ocorrida_em>clock_timestamp() then raise exception 'A movimentação não pode estar no futuro.'; end if;
  if coalesce(p_link_referencia,'')<>'' and p_link_referencia !~* '^https?://[^[:space:]]+$' then
    raise exception 'Informe um link HTTP ou HTTPS válido.';
  end if;
  if p_tipo='alteracao_status' then
    if p_status is null or not exists(select 1 from public.tratativas_status where nome=p_status) then
      raise exception 'Selecione o novo status.';
    end if;
    if p_status in ('Deferido','Indeferido','Encerrado') and
      (coalesce(length(trim(p_resultado)),0)=0 or p_encerrada_em is null) then
      raise exception 'Informe o resultado e a data de encerramento.';
    end if;
  elsif p_status is not null or p_resultado is not null or p_encerrada_em is not null then
    raise exception 'A mudança de status requer uma movimentação de alteração de status.';
  end if;
  pedido:=jsonb_build_object('versao',p_versao,'tipo',p_tipo,'descricao',trim(p_descricao),
    'ocorrida_em',p_ocorrida_em,'link_referencia',coalesce(p_link_referencia,''),
    'status',p_status,'resultado',p_resultado,'encerrada_em',p_encerrada_em);
  select * into tratativa from public.tratativas_administrativas where id=p_tratativa_id for update;
  if not found or tratativa.excluida then raise exception 'Tratativa não encontrada ou indisponível.'; end if;
  select * into existente from public.tratativas_historico where requisicao_id=p_requisicao_id;
  if found then
    if existente.tratativa_id=p_tratativa_id and existente.requisicao=pedido then return existente.id; end if;
    raise exception 'Chave de movimentação já utilizada com outros dados.';
  end if;
  if tratativa.versao<>p_versao then
    raise exception using errcode='40001',message='A tratativa foi alterada. Atualize os detalhes e tente novamente.';
  end if;
  if p_tipo='alteracao_status' and p_status=tratativa.status then raise exception 'Selecione um status diferente do atual.'; end if;
  perform set_config('km.tratativa_movimentacao',jsonb_build_object('tratativa_id',p_tratativa_id,'requisicao_id',p_requisicao_id,'pedido',pedido)::text,true);
  update public.tratativas_administrativas set nota_atualizacao=trim(p_descricao),
    status=case when p_tipo='alteracao_status' then p_status else status end,
    resultado=case when p_tipo='alteracao_status' then coalesce(p_resultado,'') else resultado end,
    encerrada_em=case when p_tipo='alteracao_status' then p_encerrada_em else encerrada_em end
  where id=p_tratativa_id;
  perform set_config('km.tratativa_movimentacao',coalesce(contexto_anterior,''),true);
  select id into evento_id from public.tratativas_historico where requisicao_id=p_requisicao_id;
  if evento_id is null then raise exception 'O banco não confirmou o registro no histórico.'; end if;
  return evento_id;
exception when others then
  perform set_config('km.tratativa_movimentacao',coalesce(contexto_anterior,''),true);
  raise;
end $$;
revoke all on function public.registrar_movimentacao_tratativa(uuid,integer,uuid,text,text,timestamptz,text,text,text,date) from public;
grant execute on function public.registrar_movimentacao_tratativa(uuid,integer,uuid,text,text,timestamptz,text,text,text,date) to anon,authenticated;
-- Não concede INSERT/UPDATE/DELETE diretos no histórico.
comment on column public.tratativas_historico.ocorrida_em is 'Data da ação; data_hora preserva o instante em que o banco registrou o evento.';
comment on column public.tratativas_historico.requisicao_id is 'Chave única para repetir uma tentativa de salvamento sem duplicar a movimentação.';
notify pgrst,'reload schema';
commit;
