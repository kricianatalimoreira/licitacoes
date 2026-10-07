begin;
alter table gmail_private.messages add column eligible boolean not null default true;
alter table gmail_private.messages add column matched_at timestamptz;
update gmail_private.messages set eligible=not(labels && array['SPAM','TRASH']);
create index gmail_messages_all_date on gmail_private.messages(company,internal_date desc,gmail_message_id desc) where eligible;
create index gmail_messages_matching on gmail_private.messages(company,matched_at nulls first) where eligible;
create table gmail_private.contract_suggestions (
 company text not null, gmail_message_id text not null, contract_id text not null,
 reason text not null, status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid,
 primary key(company,gmail_message_id,contract_id),
 foreign key(company,gmail_message_id) references gmail_private.messages(company,gmail_message_id) on delete cascade
);
create index gmail_suggestions_pending on gmail_private.contract_suggestions(company,created_at desc) where status='pending';
create table gmail_private.contract_links (
 company text not null, gmail_message_id text not null, contract_id text not null,
 linked_by uuid not null, linked_at timestamptz not null default now(),
 primary key(company,gmail_message_id),
 foreign key(company,gmail_message_id) references gmail_private.messages(company,gmail_message_id) on delete cascade
);
create table gmail_private.contract_link_events (
 id uuid primary key default gen_random_uuid(), company text not null, gmail_message_id text not null,
 contract_id text not null, action text not null check(action in ('link','reject','unlink')), actor uuid not null,
 created_at timestamptz not null default now()
);
create index gmail_link_events_message on gmail_private.contract_link_events(company,gmail_message_id,created_at);
create table gmail_private.robot_settings (singleton boolean primary key default true check(singleton), enabled boolean not null default false);
insert into gmail_private.robot_settings default values;
alter table gmail_private.contract_suggestions enable row level security;
alter table gmail_private.contract_links enable row level security;
alter table gmail_private.contract_link_events enable row level security;
alter table gmail_private.robot_settings enable row level security;
revoke all on gmail_private.contract_suggestions,gmail_private.contract_links,gmail_private.contract_link_events,gmail_private.robot_settings from public,anon,authenticated;
grant select,insert,update,delete on gmail_private.contract_suggestions,gmail_private.contract_links,gmail_private.contract_link_events,gmail_private.robot_settings to service_role;
do $$ begin
 if not exists(select 1 from vault.secrets where name='gmail_robot_key') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'gmail_robot_key','Internal Gmail read-only robot');
 end if;
end $$;
create function gmail_private.robot_allowed(p_data jsonb) returns boolean language sql security invoker set search_path='' as $$
 select current_user in ('service_role','postgres') and coalesce((select enabled from gmail_private.robot_settings),false)
 and length(coalesce(p_data->>'_robot_key',''))=64
 and coalesce(p_data->>'_robot_key'=(select decrypted_secret from vault.decrypted_secrets where name='gmail_robot_key'),false)
$$;
create function gmail_private.contract_catalog(p_company text) returns table(id text,contrato text,orgao text,processo text,situacao text)
language sql stable security invoker set search_path='' as $$
 select distinct on (x.id) x.id,x.contrato,x.orgao,x.processo,x.situacao from (
 select id,contrato,orgao,processo,'ATIVO'::text situacao,0 priority from public.contratos_ativos where upper(trim(empresa))=p_company
 union all
 select id,contrato,orgao,processo,'ENCERRADO'::text,1 from public.contratos_encerrados where upper(trim(empresa))=p_company
 )x order by x.id,x.priority
$$;
create function gmail_private.reference_numbers(p_text text) returns text[] language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct coalesce(nullif(ltrim(r[2],'0'),''),'0')||'/'||r[3]),'{}')
 from regexp_matches(coalesce(p_text,''),'(^|[^0-9/])([0-9]{1,12})\s*/\s*(20[0-9]{2})\M','g') r
$$;
create function gmail_private.suggest_contracts(p_company text) returns integer language plpgsql security invoker set search_path='' as $$
declare m record; n integer:=0;
begin
 for m in select * from gmail_private.messages where company=p_company and eligible
 and (matched_at is null or matched_at<now()-interval '1 day') order by matched_at nulls first limit 100 for update skip locked loop
  if not exists(select 1 from gmail_private.contract_links l where l.company=p_company and l.gmail_message_id=m.gmail_message_id) then
   insert into gmail_private.contract_suggestions(company,gmail_message_id,contract_id,reason)
   select p_company,m.gmail_message_id,c.id,'Número de contrato ou processo encontrado no assunto/prévia. Confira o órgão antes de confirmar.'
   from gmail_private.contract_catalog(p_company)c
   where gmail_private.reference_numbers(concat_ws(' ',c.contrato,c.processo)) && gmail_private.reference_numbers(concat_ws(' ',m.subject,m.preview))
   on conflict(company,gmail_message_id,contract_id) do nothing;
  end if;
  update gmail_private.messages set matched_at=now() where company=p_company and gmail_message_id=m.gmail_message_id;
  n:=n+1;
 end loop;
 return n;
end $$;
create function public.gmail_contract_backend(p_action text,p_user_id uuid default null,p_session_id uuid default null,p_company text default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare allowed jsonb; result jsonb; chosen record; removed_id text; msg gmail_private.messages%rowtype;
begin
 if current_user not in ('postgres','service_role') then raise exception 'not_authorized'; end if;
 if p_action='robot_check' then return jsonb_build_object('ok',gmail_private.robot_allowed(p_data)); end if;
 if p_action='scan' then
  if not gmail_private.robot_allowed(p_data) then return jsonb_build_object('error','not_authorized'); end if;
  return jsonb_build_object('scanned',gmail_private.suggest_contracts(p_company));
 end if;
 allowed:=public.gmail_backend('accounts',p_user_id,p_session_id,p_company);
 if jsonb_typeof(allowed)<>'array' or not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(allowed)='array' then allowed else '[]'::jsonb end)a where a->>'company'=p_company) then return jsonb_build_object('error','not_authorized'); end if;
 if p_action='contracts' then
  select coalesce(jsonb_agg(to_jsonb(c) order by c.orgao,c.contrato),'[]') into result from gmail_private.contract_catalog(p_company)c;
  return jsonb_build_object('contracts',result);
 elsif p_action='suggestions' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
   select s.gmail_message_id,s.contract_id,s.reason,c.contrato,c.orgao,c.situacao,m.subject,m.preview,m.sender,m.message_date
   from gmail_private.contract_suggestions s join gmail_private.messages m using(company,gmail_message_id)
   join gmail_private.contract_catalog(p_company)c on c.id=s.contract_id
   where s.company=p_company and s.status='pending' and m.eligible
   and not exists(select 1 from gmail_private.contract_links l where l.company=s.company and l.gmail_message_id=s.gmail_message_id)
   and (p_data->>'message_id' is null or s.gmail_message_id=p_data->>'message_id')
   order by s.created_at desc,s.gmail_message_id,s.contract_id limit 100
  )q;
  return jsonb_build_object('suggestions',result,'robot_enabled',(select enabled from gmail_private.robot_settings),'sync',(select jsonb_build_object('phase',state->>'phase','last_error',last_error,'updated_at',updated_at) from gmail_private.sync_state where company=p_company));
 end if;
 select * into msg from gmail_private.messages where company=p_company and gmail_message_id=p_data->>'message_id' and eligible for update;
 if not found then return jsonb_build_object('error','message_unavailable'); end if;
 if p_action='message' then
  return jsonb_build_object('message',to_jsonb(msg)-'seen_generation'-'matched_at','link',(select to_jsonb(l) from gmail_private.contract_links l where l.company=p_company and l.gmail_message_id=msg.gmail_message_id));
 end if;
 if p_action='unlink' then
  delete from gmail_private.contract_links where company=p_company and gmail_message_id=msg.gmail_message_id returning contract_id into removed_id;
  if found then
   insert into gmail_private.contract_link_events(company,gmail_message_id,contract_id,action,actor) values(p_company,msg.gmail_message_id,removed_id,'unlink',p_user_id);
  end if;
  return jsonb_build_object('ok',true);
 end if;
 select * into chosen from gmail_private.contract_catalog(p_company) where id=p_data->>'contract_id';
 if not found then return jsonb_build_object('error','contract_unavailable'); end if;
 if p_action='link' then
  if p_data->>'confirmed' is distinct from 'true' then return jsonb_build_object('error','confirmation_required'); end if;
  if exists(select 1 from gmail_private.contract_links where company=p_company and gmail_message_id=msg.gmail_message_id and contract_id<>chosen.id) then return jsonb_build_object('error','already_linked'); end if;
  insert into gmail_private.contract_links(company,gmail_message_id,contract_id,linked_by) values(p_company,msg.gmail_message_id,chosen.id,p_user_id) on conflict do nothing;
  update gmail_private.contract_suggestions set status=case when contract_id=chosen.id then 'accepted' else 'rejected' end,decided_by=p_user_id,decided_at=now() where company=p_company and gmail_message_id=msg.gmail_message_id and status='pending';
 elsif p_action='reject' then
  insert into gmail_private.contract_suggestions(company,gmail_message_id,contract_id,reason,status,decided_at,decided_by)
  values(p_company,msg.gmail_message_id,chosen.id,'Recusado pelo usuário','rejected',now(),p_user_id)
  on conflict(company,gmail_message_id,contract_id) do update set status='rejected',decided_at=now(),decided_by=p_user_id;
 else return jsonb_build_object('error','invalid_action');
 end if;
 insert into gmail_private.contract_link_events(company,gmail_message_id,contract_id,action,actor) values(p_company,msg.gmail_message_id,chosen.id,p_action,p_user_id);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gmail_contract_backend(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_contract_backend(text,uuid,uuid,text,jsonb) to service_role;
revoke all on all functions in schema gmail_private from public,anon,authenticated;
grant execute on all functions in schema gmail_private to service_role;
commit;
