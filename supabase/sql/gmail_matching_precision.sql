begin;
create function gmail_private.normalized_words(p_text text) returns text language sql immutable security invoker set search_path='' as $$
 select trim(regexp_replace(translate(lower(coalesce(p_text,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g'))
$$;
create function gmail_private.org_terms(p_org text) returns text[] language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct t order by t),'{}')
 from regexp_split_to_table(gmail_private.normalized_words(regexp_replace(split_part(coalesce(p_org,''),'/',1),'\([^)]*\)','','g')),' ')t
 where length(t)>=3 and t not in ('prefeitura','municipal','municipio','secretaria','fundo','camara','saude','educacao','estado','estadual','orgao','dos','das','para','com')
$$;
create function gmail_private.contract_candidates(p_company text,p_subject text,p_preview text)
returns table(contract_id text,reason text) language sql stable security invoker set search_path='' as $$
 with input as (
  select gmail_private.reference_numbers(concat_ws(' ',p_subject,p_preview)) refs,
   ' '||gmail_private.normalized_words(concat_ws(' ',p_subject,p_preview))||' ' words
 ), candidates as (
  select c.id,c.orgao,
   array(select unnest(gmail_private.reference_numbers(concat_ws(' ',c.contrato,c.processo))) intersect select unnest(i.refs)) matched_refs,
   count(*) over() candidate_count
  from gmail_private.contract_catalog(p_company)c cross join input i
  where gmail_private.reference_numbers(concat_ws(' ',c.contrato,c.processo)) && i.refs
  and cardinality(gmail_private.org_terms(c.orgao))>0
  and not exists(select 1 from unnest(gmail_private.org_terms(c.orgao))t where strpos(i.words,' '||t||' ')=0)
 )
 select id,'Órgão identificado: '||orgao||'. Referência encontrada: '||array_to_string(matched_refs,', ')||'. Confira antes de confirmar.'
 from candidates where candidate_count=1
$$;
alter table gmail_private.contract_suggestions drop constraint contract_suggestions_status_check;
alter table gmail_private.contract_suggestions add constraint contract_suggestions_status_check check(status in ('pending','accepted','rejected','withdrawn'));
create or replace function gmail_private.suggest_contracts(p_company text) returns integer language plpgsql security invoker set search_path='' as $$
declare m record; n integer:=0;
begin
 for m in select * from gmail_private.messages where company=p_company and eligible
 and (matched_at is null or matched_at<now()-interval '1 day') order by matched_at nulls first limit 100 for update skip locked loop
  if not exists(select 1 from gmail_private.contract_links l where l.company=p_company and l.gmail_message_id=m.gmail_message_id) then
   update gmail_private.contract_suggestions s set status='withdrawn'
    where s.company=p_company and s.gmail_message_id=m.gmail_message_id and s.status='pending'
    and not exists(select 1 from gmail_private.contract_candidates(p_company,m.subject,m.preview)c where c.contract_id=s.contract_id);
   insert into gmail_private.contract_suggestions(company,gmail_message_id,contract_id,reason)
   select p_company,m.gmail_message_id,c.contract_id,c.reason from gmail_private.contract_candidates(p_company,m.subject,m.preview)c
   on conflict(company,gmail_message_id,contract_id) do update set status='pending',reason=excluded.reason
    where gmail_private.contract_suggestions.status in ('pending','withdrawn');
  end if;
  update gmail_private.messages set matched_at=now() where company=p_company and gmail_message_id=m.gmail_message_id;
  n:=n+1;
 end loop;
 return n;
end $$;
-- Preserve approvals/rejections. Old undecided candidates are withdrawn, never deleted.
update gmail_private.contract_suggestions set status='withdrawn' where status='pending';
update gmail_private.messages set matched_at=null;
revoke all on function gmail_private.normalized_words(text),gmail_private.org_terms(text),gmail_private.contract_candidates(text,text,text) from public,anon,authenticated;
grant execute on function gmail_private.normalized_words(text),gmail_private.org_terms(text),gmail_private.contract_candidates(text,text,text) to service_role;
commit;
