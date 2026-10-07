begin;
insert into public.contratos_ativos(id,empresa,contrato,orgao,processo) values
 ('precision-1','Hamate','987654/2099','LAGOA FORMOSA/MG','PREGÃO 987655/2099'),
 ('precision-2','Hamate','987654/2099','LUNARDELLI/PR','PREGÃO 987655/2099'),
 ('precision-3','Gadita','987654/2099','LAGOA FORMOSA/MG',null);
set local role service_role;
do $$begin
 if exists(select 1 from gmail_private.contract_candidates('HAMATE','Contrato 987654/2099','')) then raise exception 'number alone suggested';end if;
 if exists(select 1 from gmail_private.contract_candidates('HAMATE','Contrato 987654/2099','Prefeitura de Araripina')) then raise exception 'wrong municipality suggested';end if;
 if (select count(*) from gmail_private.contract_candidates('HAMATE','Contrato 987654/2099','Prefeitura de Lagoa Formosa'))<>1 then raise exception 'strong match missing';end if;
 if (select contract_id from gmail_private.contract_candidates('HAMATE','Contrato 987654/2099','Prefeitura de Lagoa Formosa'))<>'precision-1' then raise exception 'wrong company match';end if;
 if exists(select 1 from gmail_private.contract_candidates('HAMATE','987654/2099','Lagoa Formosa e Lunardelli')) then raise exception 'ambiguous match suggested';end if;
 if exists(select 1 from gmail_private.contract_candidates('HAMATE','Lagoa Formosa','')) then raise exception 'municipality alone suggested';end if;
 if exists(select 1 from gmail_private.contract_candidates('HAMATE','Contrato 1987654/2099','Lagoa Formosa')) then raise exception 'partial number suggested';end if;
 if (select count(*) from gmail_private.contract_candidates('HAMATE','Contrato 0987654/2099','LAGOA FORMOSA'))<>1 then raise exception 'zero padding not normalized';end if;
end $$;
reset role;
rollback;
select 'Precision tests passed (rolled back)' as result;
