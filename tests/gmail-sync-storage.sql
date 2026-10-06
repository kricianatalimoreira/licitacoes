begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values('00000000-0000-4000-8000-000000000301','sync-fixture@example.invalid',now(),false);
insert into auth.sessions(id,user_id,created_at,updated_at) values('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301',now(),now());
insert into gmail_private.operators values('sync-fixture@example.invalid','HAMATE'),('sync-fixture@example.invalid','GADITA');
set local role service_role;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000301';s uuid:='00000000-0000-4000-8000-000000000401';r jsonb;l text;m jsonb;co text;g uuid:=gen_random_uuid();
begin
 m:=jsonb_build_object('gmail_message_id','sync-test-shared-id','gmail_thread_id','test-thread','history_id','90071992547409999',
 'message_id','<test>','reference_ids',jsonb_build_array('<parent>'),'sender','sender@example.invalid','recipients',jsonb_build_array('recipient@example.invalid'),
 'cc','[]'::jsonb,'subject','sync fixture','internal_date','1760000000000','message_date','2025-10-09T08:53:20Z','preview','plain preview',
 'is_read',false,'in_inbox',true,'labels',jsonb_build_array('INBOX','UNREAD'));
 foreach co in array array['HAMATE','GADITA'] loop
  r:=public.gmail_sync_backend('claim',u,s,co);l:=r->>'lease_id';
  r:=public.gmail_sync_backend('claim',u,s,co);if r->>'error'<>'sync_busy' then raise exception 'lease overlap';end if;
  r:=public.gmail_sync_backend('commit',u,s,co,jsonb_build_object('lease_id',l,'messages',jsonb_build_array(m),'generation',g,'state',jsonb_build_object('phase','idle','cursor','c')));
  if r->>'done'<>'true' then raise exception 'commit failed: %',r;end if;
 end loop;
 if (select count(*) from gmail_private.messages where gmail_message_id='sync-test-shared-id')<>2 then raise exception 'cross-account deduplication';end if;
 r:=public.gmail_sync_backend('claim',u,s,'HAMATE');l:=r->>'lease_id';
 r:=public.gmail_sync_backend('commit',u,s,'HAMATE',jsonb_build_object('lease_id',l,'messages',jsonb_build_array(m||'{"is_read":true}'::jsonb),'state',jsonb_build_object('phase','idle','cursor','c2')));
 if (select count(*) from gmail_private.messages where company='HAMATE' and gmail_message_id='sync-test-shared-id')<>1 then raise exception 'duplicate persisted';end if;
 if (select is_read from gmail_private.messages where company='GADITA' and gmail_message_id='sync-test-shared-id') then raise exception 'other account updated';end if;
 r:=public.gmail_sync_backend('list',u,s,'HAMATE');if r->'messages'->0->>'company'<>'HAMATE' then raise exception 'list isolation';end if;
 r:=public.gmail_sync_backend('commit',u,s,'HAMATE',jsonb_build_object('lease_id',l,'messages','[]'::jsonb,'state','{}'::jsonb));
 if r->>'error'<>'stale_sync' then raise exception 'lease replay accepted';end if;
 r:=public.gmail_sync_backend('claim',u,s,'HAMATE');l:=r->>'lease_id';
 r:=public.gmail_sync_backend('commit',u,s,'HAMATE',jsonb_build_object('lease_id',l,'messages',jsonb_build_array(jsonb_build_object('gmail_message_id','sync-test-shared-id','in_inbox',false)),'state',jsonb_build_object('phase','idle','cursor','c3')));
 if (select in_inbox from gmail_private.messages where company='HAMATE' and gmail_message_id='sync-test-shared-id') then raise exception 'archive not reflected';end if;
 delete from gmail_private.operators where email='sync-fixture@example.invalid' and company='GADITA';
 r:=public.gmail_sync_backend('list',u,s,'GADITA');if r->>'error'<>'not_authorized' then raise exception 'unauthorized company';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.gmail_sync_backend('list');raise exception 'anonymous RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from gmail_private.messages;raise exception 'anonymous messages';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.gmail_sync_backend('list');raise exception 'direct client RPC';exception when insufficient_privilege then null;end;
 begin perform 1 from gmail_private.messages;raise exception 'direct client messages';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Synchronization storage, isolation, idempotency, locks and access checks passed (rolled back)' as result;
