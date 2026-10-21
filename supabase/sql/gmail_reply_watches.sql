begin;
create table gmail_private.reply_watches(
 company text not null references gmail_private.accounts(company),
 tratativa_id uuid not null references public.tratativas_administrativas(id),
 thread_id text not null check(thread_id ~ '^[a-f0-9]{1,64}$'),
 counterpart_addresses text[] not null check(cardinality(counterpart_addresses)>0),
 source_link text, confirmed_by uuid not null references auth.users(id),
 confirmed_at timestamptz not null default now(),
 pending boolean not null default false,pending_since timestamptz,
 last_received_id text,last_received_at timestamptz,last_sent_id text,last_sent_at timestamptz,
 checked_at timestamptz,last_attempt_at timestamptz,last_error text,revision uuid not null default gen_random_uuid(),
 primary key(company,tratativa_id));
alter table gmail_private.reply_watches enable row level security;
revoke all on gmail_private.reply_watches from public,anon,authenticated;
grant all on gmail_private.reply_watches to service_role;
create index reply_watches_treatment on gmail_private.reply_watches(tratativa_id);
create index reply_watches_operator on gmail_private.reply_watches(confirmed_by);
create table gmail_private.reply_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into gmail_private.reply_settings values(true,false);
alter table gmail_private.reply_settings enable row level security;
revoke all on gmail_private.reply_settings from public,anon,authenticated;
grant select,update on gmail_private.reply_settings to service_role;
create function gmail_private.reply_robot_allowed(p_data jsonb) returns boolean language sql security invoker set search_path='' as $$
select current_user in ('service_role','postgres') and coalesce((select enabled from gmail_private.reply_settings),false)
and length(coalesce(p_data->>'_robot_key',''))=64
and coalesce(p_data->>'_robot_key'=(select decrypted_secret from vault.decrypted_secrets where name='gmail_robot_key'),false)
$$;
revoke all on function gmail_private.reply_robot_allowed(jsonb) from public,anon,authenticated;
grant execute on function gmail_private.reply_robot_allowed(jsonb) to service_role;
create or replace function public.gmail_reply_backend(p_action text,p_user_id uuid default null,p_session_id uuid default null,p_company text default null,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_email text; v_result jsonb; t public.tratativas_administrativas_detalhes%rowtype; v_robot boolean; w gmail_private.reply_watches%rowtype; a gmail_private.accounts%rowtype; v_secret text;
begin
 if current_user not in ('postgres','service_role') then raise exception 'not_authorized';end if;
 v_robot:=gmail_private.reply_robot_allowed(p_data);
 if not v_robot then
 select lower(u.email) into v_email from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=p_user_id and s.id=p_session_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<now()) and(s.not_after is null or s.not_after>now());
 if v_email is null or not exists(select 1 from gmail_private.operators where email=v_email and company=p_company)
 then return jsonb_build_object('error','not_authorized');end if;
 elsif p_action not in ('list','save','fail','credentials','refresh','invalid') then return jsonb_build_object('error','not_authorized');
 end if;

 if p_action in ('credentials','refresh','invalid') then
 select * into a from gmail_private.accounts where company=p_company for update;
 if not found or a.status<>'connected' or a.token_secret_id is null then return jsonb_build_object('error','not_connected');end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where id=a.token_secret_id;
 if p_action='credentials' then return v_secret::jsonb||jsonb_build_object('revision',a.token_revision,'expires_at',a.expires_at);end if;
 if a.token_revision<>(p_data->>'revision')::integer then return jsonb_build_object('error','superseded');end if;
 if p_action='invalid' then
 update gmail_private.accounts set status='reconnect_required',last_error='reauthorize',updated_at=now() where company=p_company;
 else
 if nullif(p_data->>'access_token','') is null then return jsonb_build_object('error','missing_tokens');end if;
 perform vault.update_secret(a.token_secret_id,(v_secret::jsonb||jsonb_build_object('access_token',p_data->>'access_token',
 'refresh_token',coalesce(nullif(p_data->>'refresh_token',''),v_secret::jsonb->>'refresh_token')))::text);
 update gmail_private.accounts set token_revision=token_revision+1,expires_at=(p_data->>'expires_at')::timestamptz,updated_at=now() where company=p_company;
 end if;
 return jsonb_build_object('ok',true);
 end if;
 if p_action='list' then
 select coalesce(jsonb_agg(jsonb_build_object('id',lt.id,'company',p_company,'orgao',lt.orgao,'contrato',lt.ata_contrato,
 'tipo',lt.tipo_tratativa,'link_gmail',lt.link_gmail,'watch',to_jsonb(lw)) order by coalesce(lw.pending,false) desc,lt.atualizado_em desc),'[]') into v_result
 from public.tratativas_administrativas_detalhes lt left join gmail_private.reply_watches lw on lw.tratativa_id=lt.id and lw.company=p_company
 where upper(trim(lt.empresa))=p_company and not lt.excluida and lt.encerrada_em is null;
 return jsonb_build_object('treatments',v_result);
 end if;
 select * into t from public.tratativas_administrativas_detalhes where id=(p_data->>'tratativa_id')::uuid
 and upper(trim(empresa))=p_company and not excluida and encerrada_em is null;
 if not found then return jsonb_build_object('error','invalid_treatment');end if;
 if p_action='bind' then
 if p_data->>'thread_id' !~ '^[a-f0-9]{1,64}$' or jsonb_array_length(p_data->'counterparts') not between 1 and 20
 then return jsonb_build_object('error','invalid_binding');end if;
 insert into gmail_private.reply_watches(company,tratativa_id,thread_id,counterpart_addresses,source_link,confirmed_by)
 values(p_company,t.id,p_data->>'thread_id',array(select jsonb_array_elements_text(p_data->'counterparts')),t.link_gmail,p_user_id)
 on conflict(company,tratativa_id) do update set thread_id=excluded.thread_id,counterpart_addresses=excluded.counterpart_addresses,
 source_link=excluded.source_link,confirmed_by=excluded.confirmed_by,confirmed_at=now(),revision=gen_random_uuid(),
 pending=false,pending_since=null,checked_at=null,last_error=null,last_received_id=null,last_received_at=null,last_sent_id=null,last_sent_at=null;
 return jsonb_build_object('ok',true);
 end if;
 select * into w from gmail_private.reply_watches where company=p_company and tratativa_id=t.id for update;
 if not found or w.revision::text is distinct from p_data->>'revision' then return jsonb_build_object('error','stale_binding');end if;
 if w.source_link is distinct from t.link_gmail then
 update gmail_private.reply_watches set last_error='link_changed' where company=p_company and tratativa_id=t.id;
 return jsonb_build_object('error','link_changed');end if;
 if p_action='save' then
 -- Discard older concurrent observations.
 if w.checked_at is not null and w.checked_at>(p_data->>'observed_at')::timestamptz then return jsonb_build_object('ok',true);end if;
 update gmail_private.reply_watches set pending=(p_data->>'pending')::boolean,
 pending_since=(p_data->>'pending_since')::timestamptz,last_received_id=p_data->>'received_id',
 last_received_at=(p_data->>'received_at')::timestamptz,last_sent_id=p_data->>'sent_id',
 last_sent_at=(p_data->>'sent_at')::timestamptz,checked_at=(p_data->>'observed_at')::timestamptz,last_attempt_at=now(),last_error=null
 where company=p_company and tratativa_id=t.id;
 elsif p_action='fail' then
 update gmail_private.reply_watches set last_attempt_at=now(),last_error=case when p_data->>'error'='link_changed' then 'link_changed' else 'check_failed' end
 where company=p_company and tratativa_id=t.id;
 else return jsonb_build_object('error','invalid_action');end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.gmail_reply_backend(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_reply_backend(text,uuid,uuid,text,jsonb) to service_role;
commit;
