begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values('00000000-0000-4000-8000-000000000501','contract-fixture@example.invalid',now(),false);
insert into auth.sessions(id,user_id,created_at,updated_at) values('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000501',now(),now());
insert into gmail_private.operators values('contract-fixture@example.invalid','HAMATE');
insert into public.contratos_ativos(id,empresa,contrato,orgao) values('fixture-h-contract','Hamate','987654/2099','Órgão de teste'),('fixture-g-contract','Gadita','987654/2099','Outra empresa');
insert into gmail_private.messages(company,gmail_message_id,subject,internal_date,is_read,in_inbox,eligible,labels)
values('HAMATE','fixture-contract-mail','Contrato 987654/2099',1,false,false,true,array['SENT']),('GADITA','fixture-contract-mail','Contrato 987654/2099',1,false,true,true,array['INBOX']);
set local role service_role;
do $$
declare u uuid:='00000000-0000-4000-8000-000000000501';s uuid:='00000000-0000-4000-8000-000000000601';r jsonb;d jsonb:='{"message_id":"fixture-contract-mail","contract_id":"fixture-h-contract"}';
begin
 if gmail_private.reference_numbers('data 07/10/2026') <> '{}'::text[] then raise exception 'date false positive';end if;
 perform gmail_private.suggest_contracts('HAMATE');
 if not exists(select 1 from gmail_private.contract_suggestions where company='HAMATE' and gmail_message_id='fixture-contract-mail' and contract_id='fixture-h-contract') then raise exception 'missing suggestion';end if;
 if exists(select 1 from gmail_private.contract_suggestions where company='HAMATE' and contract_id='fixture-g-contract') then raise exception 'cross company suggestion';end if;
 if exists(select 1 from gmail_private.contract_links where gmail_message_id='fixture-contract-mail') then raise exception 'automatic link';end if;
 r:=public.gmail_contract_backend('link',u,s,'HAMATE',d);if r->>'error' is distinct from 'confirmation_required' then raise exception 'missing confirmation guard %',r;end if;
 r:=public.gmail_contract_backend('link',u,s,'HAMATE',d||'{"confirmed":true,"contract_id":"fixture-g-contract"}');if r->>'error' is distinct from 'contract_unavailable' then raise exception 'cross company link %',r;end if;
 r:=public.gmail_contract_backend('suggestions',u,s,'GADITA');if r->>'error' is distinct from 'not_authorized' then raise exception 'cross company read';end if;
 r:=public.gmail_contract_backend('reject',u,s,'HAMATE',d);
 update gmail_private.messages set matched_at=null where company='HAMATE' and gmail_message_id='fixture-contract-mail';perform gmail_private.suggest_contracts('HAMATE');
 if (select status from gmail_private.contract_suggestions where company='HAMATE' and gmail_message_id='fixture-contract-mail' and contract_id='fixture-h-contract')<>'rejected' then raise exception 'rejection lost';end if;
 r:=public.gmail_contract_backend('link',u,s,'HAMATE',d||'{"confirmed":true}');if r->>'ok' is distinct from 'true' then raise exception 'confirmation failed %',r;end if;
 r:=public.gmail_contract_backend('link',u,s,'HAMATE',d||'{"confirmed":true}');
 if (select count(*) from gmail_private.contract_links where company='HAMATE' and gmail_message_id='fixture-contract-mail')<>1 then raise exception 'duplicate link';end if;
 r:=public.gmail_contract_backend('message',u,s,'HAMATE','{"message_id":"fixture-contract-mail"}');if r->'link'->>'contract_id'<>'fixture-h-contract' then raise exception 'missing detail';end if;
 r:=public.gmail_sync_backend('list',u,s,'HAMATE');if r->>'error' is not null then raise exception 'sync listing %',r;end if;
 r:=public.gmail_contract_backend('unlink',u,s,'HAMATE','{"message_id":"fixture-contract-mail"}');if exists(select 1 from gmail_private.contract_links where company='HAMATE' and gmail_message_id='fixture-contract-mail') then raise exception 'unlink failed';end if;
 update gmail_private.messages set eligible=false where company='HAMATE' and gmail_message_id='fixture-contract-mail';
 r:=public.gmail_contract_backend('link',u,s,'HAMATE',d||'{"confirmed":true}');if r->>'error' is distinct from 'message_unavailable' then raise exception 'spam link';end if;
 r:=public.gmail_contract_backend('contracts',u,null,'HAMATE');if r->>'error' is distinct from 'not_authorized' then raise exception 'no session accepted';end if;
 if gmail_private.robot_allowed('{"_robot_key":"wrong"}') then raise exception 'invalid robot key';end if;
end $$;
set local role anon;
do $$begin
 begin perform public.gmail_contract_backend('suggestions');raise exception 'anon rpc';exception when insufficient_privilege then null;end;
 begin perform 1 from gmail_private.contract_links;raise exception 'anon links';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$begin
 begin perform public.gmail_contract_backend('link');raise exception 'client rpc';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Contract tests passed: consent, isolation, rejection, idempotency, unlink, access (rolled back)' as result;
