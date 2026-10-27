-- Protected master registry. No business records are updated by this migration.
create schema if not exists registry_private;
revoke all on schema registry_private from public, anon, authenticated;
grant usage on schema registry_private to service_role;
create table registry_private.orgaos (
 id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 1 and 250),
 cnpj text unique check(cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
 municipio text not null check(length(trim(municipio)) between 1 and 120),
 uf text not null check(uf=any(string_to_array('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO',' '))),
 tipo text not null check(tipo in ('Prefeitura','Câmara','Fundo','Secretaria','Autarquia','Consórcio','Outro')),
 contatos jsonb not null default '[]' check(jsonb_typeof(contatos)='array' and jsonb_array_length(contatos)<=6),
 site text not null default '',portal text not null default '',revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table registry_private.links (
 kind text not null check(kind in ('contrato','empenho')), record_id text not null,
 company text not null check(company in ('HAMATE','GADITA')), orgao_id uuid not null references registry_private.orgaos(id),
 source_name text not null,revision integer not null default 1,
 confirmed_by uuid not null references auth.users(id),confirmed_at timestamptz not null default now(),
 primary key(kind,record_id,company)
);
create index registry_links_orgao_idx on registry_private.links(orgao_id);
create index registry_links_user_idx on registry_private.links(confirmed_by);
create table registry_private.audit (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),
 action text not null,details jsonb not null,created_at timestamptz not null default now()
);
create index registry_audit_user_idx on registry_private.audit(user_id);
alter table registry_private.orgaos enable row level security;
alter table registry_private.links enable row level security;
alter table registry_private.audit enable row level security;
revoke all on all tables in schema registry_private from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema registry_private to service_role;
grant usage on all sequences in schema registry_private to service_role;

create or replace function public.org_registry_backend(p_action text,p_user_id uuid,p_session_id uuid,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_email text;v_companies text[];v_org registry_private.orgaos;v_old jsonb;v_id uuid;
 v_kind text;v_record text;v_company text;v_name text;v_count integer;v_link registry_private.links;v_revision integer;
begin
 if current_user not in ('service_role','postgres') then raise exception 'forbidden'; end if;
 select lower(u.email) into v_email from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=p_user_id and s.id=p_session_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now());
 if v_email is null then return jsonb_build_object('error','login_required'); end if;
 select array_agg(o.company) into v_companies from gmail_private.operators o where lower(o.email)=v_email;
 if coalesce(array_length(v_companies,1),0)=0 then return jsonb_build_object('error','forbidden'); end if;
 if p_action='list' then
  return jsonb_build_object('orgaos',coalesce((select jsonb_agg(to_jsonb(o) order by o.nome) from registry_private.orgaos o),'[]'::jsonb),
   'links',coalesce((select jsonb_agg(to_jsonb(l)) from registry_private.links l where l.company=any(v_companies)),'[]'::jsonb),'companies',to_jsonb(v_companies));
 elsif p_action='save' then
  -- Shared master/contact changes require an administrator of both companies.
  if not (array['HAMATE','GADITA']::text[] <@ v_companies) then return jsonb_build_object('error','forbidden'); end if;
  if nullif(p_data->>'id','') is null then
   insert into registry_private.orgaos(nome,cnpj,municipio,uf,tipo,contatos,site,portal)
   values(p_data->>'nome',nullif(p_data->>'cnpj',''),p_data->>'municipio',p_data->>'uf',p_data->>'tipo',p_data->'contatos',p_data->>'site',p_data->>'portal') returning * into v_org;
  else
   select * into v_org from registry_private.orgaos where id=(p_data->>'id')::uuid for update;
   if not found then return jsonb_build_object('error','not_found'); end if;
   if v_org.revision is distinct from (p_data->>'revision')::integer then return jsonb_build_object('error','conflict'); end if;
   v_old=to_jsonb(v_org);
   update registry_private.orgaos set nome=p_data->>'nome',cnpj=nullif(p_data->>'cnpj',''),municipio=p_data->>'municipio',uf=p_data->>'uf',tipo=p_data->>'tipo',contatos=p_data->'contatos',site=p_data->>'site',portal=p_data->>'portal',revision=revision+1,updated_at=now()
   where id=v_org.id returning * into v_org;
  end if;
  insert into registry_private.audit(user_id,action,details) values(p_user_id,'save',jsonb_build_object('before',v_old,'after',to_jsonb(v_org)));
  return jsonb_build_object('orgao',to_jsonb(v_org));
 elsif p_action in ('bind','unbind') then
  if p_data->>'confirmed' is distinct from 'true' then return jsonb_build_object('error','confirmation_required'); end if;
  v_kind=p_data->>'kind';v_record=p_data->>'record_id';v_company=p_data->>'company';
  if v_company is null or not(v_company=any(v_companies)) then return jsonb_build_object('error','forbidden'); end if;
  if v_kind='contrato' then
   select count(*),min(orgao) into v_count,v_name from (
    select orgao from public.contratos_ativos where id=v_record and upper(empresa)=v_company
    union select orgao from public.contratos_encerrados where id=v_record and upper(empresa)=v_company
   ) c;
  elsif v_kind='empenho' then
   select count(*),min(orgao) into v_count,v_name from public.empenhos where id=v_record and upper(empresa)=v_company;
  else return jsonb_build_object('error','invalid_record');end if;
  if v_count<>1 or v_name is distinct from p_data->>'source_name' then return jsonb_build_object('error','source_changed');end if;
  perform pg_advisory_xact_lock(hashtextextended(v_kind||':'||v_record||':'||v_company,0));
  select * into v_link from registry_private.links where kind=v_kind and record_id=v_record and company=v_company for update;
  if coalesce(v_link.revision,0) is distinct from (p_data->>'revision')::integer then return jsonb_build_object('error','conflict');end if;
  v_old=case when v_link.record_id is null then null else to_jsonb(v_link) end;
  if p_action='unbind' then
   delete from registry_private.links where kind=v_kind and record_id=v_record and company=v_company;
  else
   v_id=(p_data->>'orgao_id')::uuid;
   if not exists(select 1 from registry_private.orgaos where id=v_id) then return jsonb_build_object('error','not_found');end if;
   insert into registry_private.links(kind,record_id,company,orgao_id,source_name,confirmed_by,revision)
   values(v_kind,v_record,v_company,v_id,v_name,p_user_id,coalesce(v_link.revision,0)+1)
   on conflict(kind,record_id,company) do update set orgao_id=excluded.orgao_id,source_name=excluded.source_name,confirmed_by=excluded.confirmed_by,confirmed_at=now(),revision=excluded.revision;
  end if;
  insert into registry_private.audit(user_id,action,details) values(p_user_id,p_action,jsonb_build_object('before',v_old,'request',p_data));
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','invalid_action');
exception when unique_violation then return jsonb_build_object('error','duplicate_cnpj');
end; $$;
revoke all on function public.org_registry_backend(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.org_registry_backend(text,uuid,uuid,jsonb) to service_role;

