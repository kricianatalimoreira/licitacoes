begin;
create table gmail_private.messages (
 company text not null references gmail_private.accounts(company),
 gmail_message_id text not null,
 gmail_thread_id text,
 history_id text,
 message_id text,
 in_reply_to text,
 reference_ids text[] not null default '{}',
 sender text,
 recipients text[] not null default '{}',
 cc text[] not null default '{}',
 subject text,
 internal_date bigint not null,
 message_date timestamptz,
 preview text,
 is_read boolean not null,
 in_inbox boolean not null,
 labels text[] not null default '{}',
 tratativa_id uuid check(tratativa_id is null), -- Linking is deliberately disabled pending company ACLs.
 seen_generation uuid,
 updated_at timestamptz not null default now(),
 primary key(company,gmail_message_id)
);
create index gmail_messages_inbox_date on gmail_private.messages(company,internal_date desc,gmail_message_id desc) where in_inbox;
create table gmail_private.sync_state (
 company text primary key references gmail_private.accounts(company),
 state jsonb not null default '{"phase":"idle"}' check(octet_length(state::text)<1048576),
 lease_id uuid,
 lease_until timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
insert into gmail_private.sync_state(company) select company from gmail_private.accounts;
alter table gmail_private.messages enable row level security;
alter table gmail_private.sync_state enable row level security;
revoke all on gmail_private.messages,gmail_private.sync_state from public,anon,authenticated;
grant select,insert,update,delete on gmail_private.messages,gmail_private.sync_state to service_role;

create function public.gmail_sync_backend(p_action text,p_user_id uuid default null,p_session_id uuid default null,
 p_company text default null,p_data jsonb default '{}') returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare
 allowed jsonb; s gmail_private.sync_state%rowtype; v_id uuid; m jsonb; rows jsonb; n integer;
begin
 if current_user not in ('postgres','service_role') then raise exception 'not_authorized'; end if;
 allowed:=public.gmail_backend('accounts',p_user_id,p_session_id);
 if jsonb_typeof(allowed)<>'array' or not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(allowed)='array' then allowed else '[]'::jsonb end) a where a->>'company'=p_company) then
  return jsonb_build_object('error','not_authorized');
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(q)-'seen_generation'),'[]') into rows from (
   select * from gmail_private.messages where company=p_company and in_inbox
   and (p_data->>'before_date' is null or (internal_date,gmail_message_id)<((p_data->>'before_date')::bigint,p_data->>'before_id'))
   order by internal_date desc,gmail_message_id desc limit 51
  )q;
  select count(*) into n from gmail_private.messages where company=p_company and in_inbox;
  return jsonb_build_object('messages',rows,'total',n,'email',(select email from gmail_private.accounts where company=p_company),
   'last_synced_at',(select last_synced_at from gmail_private.accounts where company=p_company),
   'in_progress',(select state->>'phase'<>'idle' from gmail_private.sync_state where company=p_company));
 end if;
 select * into s from gmail_private.sync_state where company=p_company for update;
 if p_action='claim' then
  if (select status from gmail_private.accounts where company=p_company)<>'connected' then return jsonb_build_object('error','not_connected'); end if;
  if s.lease_until>now() then return jsonb_build_object('error','sync_busy'); end if;
  v_id:=gen_random_uuid();
  update gmail_private.sync_state set lease_id=v_id,lease_until=now()+interval '2 minutes',last_error=null where company=p_company;
  return jsonb_build_object('lease_id',v_id,'state',s.state);
 end if;
 if s.lease_id is null or s.lease_until is null or s.lease_id is distinct from (p_data->>'lease_id')::uuid or s.lease_until<=now() then return jsonb_build_object('error','stale_sync'); end if;
 if p_action='fail' then
  update gmail_private.sync_state set lease_id=null,lease_until=null,last_error='retry_required',updated_at=now() where company=p_company;
  return jsonb_build_object('ok',true);
 elsif p_action='commit' then
  if (select status from gmail_private.accounts where company=p_company)<>'connected' then return jsonb_build_object('error','not_connected'); end if;
  if jsonb_array_length(p_data->'messages')>20 then raise exception 'batch too large'; end if;
  for m in select value from jsonb_array_elements(p_data->'messages') loop
   if coalesce((m->>'in_inbox')::boolean,false)=false then
    update gmail_private.messages set in_inbox=false,updated_at=now() where company=p_company and gmail_message_id=m->>'gmail_message_id';
   else
    insert into gmail_private.messages(company,gmail_message_id,gmail_thread_id,history_id,message_id,in_reply_to,reference_ids,
     sender,recipients,cc,subject,internal_date,message_date,preview,is_read,in_inbox,labels,seen_generation)
    values(p_company,m->>'gmail_message_id',m->>'gmail_thread_id',m->>'history_id',m->>'message_id',m->>'in_reply_to',
     array(select jsonb_array_elements_text(m->'reference_ids')),m->>'sender',array(select jsonb_array_elements_text(m->'recipients')),
     array(select jsonb_array_elements_text(m->'cc')),m->>'subject',(m->>'internal_date')::bigint,(m->>'message_date')::timestamptz,
     m->>'preview',(m->>'is_read')::boolean,true,array(select jsonb_array_elements_text(m->'labels')),(p_data->>'generation')::uuid)
    on conflict(company,gmail_message_id) do update set gmail_thread_id=excluded.gmail_thread_id,history_id=excluded.history_id,
     message_id=excluded.message_id,in_reply_to=excluded.in_reply_to,reference_ids=excluded.reference_ids,sender=excluded.sender,
     recipients=excluded.recipients,cc=excluded.cc,subject=excluded.subject,internal_date=excluded.internal_date,
     message_date=excluded.message_date,preview=excluded.preview,is_read=excluded.is_read,in_inbox=true,labels=excluded.labels,
     seen_generation=coalesce(excluded.seen_generation,gmail_private.messages.seen_generation),updated_at=now();
   end if;
  end loop;
  if coalesce((p_data->>'full_complete')::boolean,false) then
   if p_data->>'generation' is null then raise exception 'missing generation'; end if;
   update gmail_private.messages set in_inbox=false,updated_at=now() where company=p_company
    and seen_generation is distinct from (p_data->>'generation')::uuid;
  end if;
  update gmail_private.sync_state set state=p_data->'state',lease_id=null,lease_until=null,last_error=null,updated_at=now() where company=p_company;
  if p_data->'state'->>'phase'='idle' then update gmail_private.accounts set last_synced_at=now() where company=p_company; end if;
  select count(*) into n from gmail_private.messages where company=p_company and in_inbox;
  return jsonb_build_object('done',p_data->'state'->>'phase'='idle','total',n,'processed',jsonb_array_length(p_data->'messages'));
 end if;
 return jsonb_build_object('error','invalid_action');
end $$;
revoke all on function public.gmail_sync_backend(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_sync_backend(text,uuid,uuid,text,jsonb) to service_role;
commit;
