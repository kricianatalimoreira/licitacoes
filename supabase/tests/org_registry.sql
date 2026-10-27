begin;
set local role service_role;
do $$
declare uid uuid;sid uuid;r jsonb;o uuid;record record;
begin
 select u.id,s.id into uid,sid from auth.users u join auth.sessions s on s.user_id=u.id where u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now()) and (select count(distinct company) from gmail_private.operators where lower(email)=lower(u.email))=2 limit 1;
 if uid is null then raise exception 'No active operator session available for backend test';end if;
 r=public.org_registry_backend('save',uid,sid,'{"nome":"TESTE TRANSACIONAL — NÃO PERSISTIR","municipio":"Teste","uf":"MG","tipo":"Prefeitura","cnpj":"00000000E08G12","contatos":[],"site":"","portal":""}');
 if r ? 'error' then raise exception 'save failed: %',r;end if;o=(r->'orgao'->>'id')::uuid;
 r=public.org_registry_backend('save',uid,sid,jsonb_build_object('id',o,'revision',0));if r->>'error' is distinct from 'conflict' then raise exception 'CAS failed';end if;
 r=public.org_registry_backend('save',uid,sid,'{"nome":"DUPLICADO","municipio":"Teste","uf":"MG","tipo":"Prefeitura","cnpj":"00000000E08G12","contatos":[],"site":"","portal":""}');if r->>'error' is distinct from 'duplicate_cnpj' then raise exception 'duplicate guard failed';end if;
 select id,orgao,upper(empresa) as company into record from public.contratos_ativos limit 1;
 r=public.org_registry_backend('bind',uid,sid,jsonb_build_object('kind','contrato','record_id',record.id,'company',record.company,'orgao_id',o,'source_name',record.orgao,'revision',0,'confirmed',false));if r->>'error' is distinct from 'confirmation_required' then raise exception 'confirmation guard failed';end if;
 r=public.org_registry_backend('bind',uid,sid,jsonb_build_object('kind','contrato','record_id',record.id,'company',record.company,'orgao_id',o,'source_name','STALE','revision',0,'confirmed',true));if r->>'error' is distinct from 'source_changed' then raise exception 'source guard failed';end if;
 r=public.org_registry_backend('bind',uid,sid,jsonb_build_object('kind','contrato','record_id',record.id,'company',record.company,'orgao_id',o,'source_name',record.orgao,'revision',0,'confirmed',true));if r->>'ok' is distinct from 'true' then raise exception 'bind failed: %',r;end if;
 r=public.org_registry_backend('list',uid,sid,'{}');if not exists(select 1 from jsonb_array_elements(r->'links') l where l->>'orgao_id'=o::text) then raise exception 'list failed';end if;
 r=public.org_registry_backend('unbind',uid,sid,jsonb_build_object('kind','contrato','record_id',record.id,'company',record.company,'source_name',record.orgao,'revision',1,'confirmed',true));if r->>'ok' is distinct from 'true' then raise exception 'unbind failed: %',r;end if;
end $$;
rollback;
select (select count(*) from registry_private.orgaos) as master_records,(select count(*) from registry_private.links) as links,(select count(*) from registry_private.audit) as audit_rows;

