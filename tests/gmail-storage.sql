-- Run as migration administrator. Synthetic values only; every change is rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('00000000-0000-4000-8000-000000000101','kricianatalimoreira@gmail.com',now(),false),
 ('00000000-0000-4000-8000-000000000102','unauthorized-oauth-test@example.invalid',now(),false);
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',now(),now()),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102',now(),now());
set local role service_role;
do $$
declare
 u uuid:='00000000-0000-4000-8000-000000000101';
 s uuid:='00000000-0000-4000-8000-000000000201';
 f jsonb; r jsonb; tokens jsonb; secret_id uuid;
begin
 r:=public.gmail_backend('accounts',u,s);
 if jsonb_array_length(r)<>2 then raise exception 'accounts permission failed'; end if;
 r:=public.gmail_backend('accounts','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000202');
 if r->>'error'<>'not_authorized' then raise exception 'unknown operator accepted'; end if;
 r:=public.gmail_backend('accounts',u,'00000000-0000-4000-8000-000000000299');
 if r->>'error'<>'not_authorized' then raise exception 'missing session accepted'; end if;
 perform public.gmail_backend('start',u,s,'HAMATE',jsonb_build_object('state_hash',repeat('a',64),'verifier','test-verifier','nonce','test-nonce'));
 f:=public.gmail_backend('consume',null,null,null,jsonb_build_object('state_hash',repeat('a',64)));
 if f->>'verifier'<>'test-verifier' then raise exception 'PKCE decryption failed'; end if;
 r:=public.gmail_backend('consume',null,null,null,jsonb_build_object('state_hash',repeat('a',64)));
 if r->>'error'<>'invalid_state' then raise exception 'state replay accepted'; end if;
 tokens:=jsonb_build_object('flow_id',f->>'flow_id','email','gaditaempreendimentos@gmail.com','sub','test-sub',
  'access_token','test-access','refresh_token','test-refresh','expires_at',now()+interval '1 hour','scopes',jsonb_build_array('test-scope'));
 r:=public.gmail_backend('finish',u,s,'HAMATE',tokens);
 if r->>'error'<>'account_mismatch' then raise exception 'cross-company connection accepted'; end if;
 tokens:=tokens||jsonb_build_object('email','hamateeletroinfo@gmail.com');
 r:=public.gmail_backend('finish',u,s,'HAMATE',tokens);
 if r->>'ok'<>'true' then raise exception 'finish failed: %',r; end if;
 if (select status from gmail_private.accounts where company='GADITA')<>'disconnected' then raise exception 'other company changed'; end if;
 r:=public.gmail_backend('credentials',u,s,'HAMATE');
 if r->>'refresh_token'<>'test-refresh' then raise exception 'token roundtrip failed'; end if;
 select token_secret_id into secret_id from gmail_private.accounts where company='HAMATE';
 if (select secret from vault.secrets where id=secret_id) like '%test-refresh%' then raise exception 'plaintext token stored'; end if;
 perform public.gmail_backend('refresh',u,s,'HAMATE',jsonb_build_object('revision',r->'revision','access_token','new-test-access','expires_at',now()+interval '1 hour'));
 r:=public.gmail_backend('credentials',u,s,'HAMATE');
 if r->>'refresh_token'<>'test-refresh' or r->>'access_token'<>'new-test-access' then raise exception 'refresh lost tokens'; end if;
 r:=public.gmail_backend('refresh',u,s,'HAMATE',jsonb_build_object('revision',0,'access_token','stale','expires_at',now()));
 if r->>'error'<>'superseded' then raise exception 'stale refresh accepted'; end if;
 r:=public.gmail_backend('accounts',u,s);
 if r::text like '%test-refresh%' or r::text like '%token_secret%' or r::text like '%access_token%' then raise exception 'metadata leaks tokens'; end if;
 perform public.gmail_backend('start',u,s,'GADITA',jsonb_build_object('state_hash',repeat('b',64),'verifier','temporary','nonce','n'));
 update gmail_private.oauth_states set expires_at=now()-interval '1 second' where company='GADITA';
 r:=public.gmail_backend('consume',null,null,null,jsonb_build_object('state_hash',repeat('b',64)));
 if r->>'error'<>'expired_state' then raise exception 'expired state accepted'; end if;
 if exists(select 1 from gmail_private.oauth_states) then raise exception 'state not consumed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.gmail_backend('accounts'); raise exception 'anonymous RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from gmail_private.accounts; raise exception 'anonymous table allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from vault.decrypted_secrets; raise exception 'anonymous vault allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.gmail_backend('accounts'); raise exception 'client RPC allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from gmail_private.accounts; raise exception 'client table allowed'; exception when insufficient_privilege then null; end;
 begin perform 1 from vault.decrypted_secrets; raise exception 'client vault allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'OAuth storage, permissions, isolation, replay and encryption tests passed (rolled back)' as result;
