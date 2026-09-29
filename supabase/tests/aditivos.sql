
begin;
set local role anon;
do $$
declare
 cid text:='teste-aditivos-'||gen_random_uuid()::text;
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();a2 uuid:=gen_random_uuid();s1 uuid:=gen_random_uuid();
 t uuid:=gen_random_uuid(); x record; n integer; before_hash text; after_hash text;
begin
 select md5(coalesce(string_agg(row_to_json(e)::text,'' order by id),'')) into before_hash from public.empenhos e;
 insert into public.contratos_ativos(id,data,data_fim,valor,orgao,status) values(cid,'2025-12-11','2026-12-11',1000,'ÓRGÃO TESTE','Vigente');
 insert into public.tratativas_administrativas(id,contrato_id,tipo,situacao,data_ocorrencia,descricao) values(t,cid,'CANCELAMENTO','AGUARDANDO RESPOSTA','2026-09-29','Teste isolado');
 insert into public.contrato_aditivos(id,contrato_id,tipo,status,numero_aditivo,vigencia_anterior,nova_vigencia,tratativa_id)
 values(p1,cid,'Prorrogação de vigência','Aguardando formalização','1º','2026-12-11','2027-12-11',t);
 select * into x from public.contratos_ativos where id=cid;
 if x.data_fim<>'2026-12-11'::date or x.valor<>1000 then raise exception 'Rascunho alterou contrato';end if;
 update public.contrato_aditivos set status='Formalizado',data_aditivo='2026-12-05' where id=p1 and versao=1;
 select * into x from public.contratos_ativos where id=cid;
 if x.data_fim<>'2027-12-11'::date then raise exception 'Formalização não prorrogou';end if;
 insert into public.contrato_aditivos(id,contrato_id,tipo,status,data_aditivo,vigencia_anterior,nova_vigencia)
 values(p2,cid,'Prorrogação de vigência','Formalizado','2027-12-05','2027-12-11','2028-12-11');
 select * into x from public.contrato_aditivos_base where contrato_id=cid;
 if x.data_original<>'2025-12-11'::date or x.vencimento_original<>'2026-12-11'::date or x.vencimento_atual<>'2028-12-11'::date then raise exception 'Histórico original/sucessão inválido';end if;
 update public.contrato_aditivos set excluido=true where id=p1;
 select * into x from public.contratos_ativos where id=cid;
 if x.data_fim<>'2028-12-11'::date then raise exception 'Exclusão do primeiro afetou última prorrogação';end if;
 update public.contrato_aditivos set nova_vigencia='2029-12-11' where id=p2;
 select * into x from public.contratos_ativos where id=cid;
 if x.data_fim<>'2029-12-11'::date then raise exception 'Edição não recalculou';end if;
 update public.contrato_aditivos set status='Cancelado' where id=p2;
 select * into x from public.contratos_ativos where id=cid;
 if x.data_fim<>'2026-12-11'::date then raise exception 'Cancelamento não restaurou original';end if;
 insert into public.contrato_aditivos(id,contrato_id,tipo,status,data_aditivo,valor_anterior,valor_acrescimo,novo_valor)
 values(a1,cid,'Acréscimo quantitativo','Formalizado','2026-01-01',1000,200,1200);
 insert into public.contrato_aditivos(id,contrato_id,tipo,status,data_aditivo,valor_anterior,novo_valor)
 values(a2,cid,'Reajuste','Formalizado','2026-02-01',1200,1320);
 insert into public.contrato_aditivos(id,contrato_id,tipo,status,data_aditivo,valor_anterior,valor_supressao,novo_valor)
 values(s1,cid,'Supressão quantitativa','Formalizado','2026-03-01',1320,20,1300);
 select * into x from public.contratos_ativos where id=cid;
 if x.valor<>1300 then raise exception 'Sucessão financeira inválida';end if;
 update public.contrato_aditivos set excluido=true where id=a1;
 select * into x from public.contratos_ativos where id=cid;
 if x.valor<>1100 then raise exception 'Exclusão do acréscimo não removeu seu efeito';end if;
 update public.contrato_aditivos set novo_valor=1350 where id=a2;
 select * into x from public.contratos_ativos where id=cid;
 if x.valor<>1130 then raise exception 'Edição financeira inválida';end if;
 update public.contratos_ativos set valor=9999,data='2020-01-01',data_fim='2030-01-01' where id=cid;
 select * into x from public.contratos_ativos where id=cid;
 if x.valor<>1130 or x.data<>'2025-12-11'::date or x.data_fim<>'2026-12-11'::date then raise exception 'Salvamento antigo sobrescreveu original/atual';end if;
 update public.contrato_aditivos set observacoes='stale' where id=a2 and versao=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'Versão obsoleta aceita';end if;
 begin
  insert into public.contrato_aditivos(contrato_id,tipo,status,data_aditivo,vigencia_anterior,nova_vigencia) values(cid,'Prorrogação de vigência','Formalizado','2026-12-01','2027-01-01','2026-01-01');
  raise exception 'Vigência inválida aceita';
 exception when raise_exception then if sqlerrm='Vigência inválida aceita' then raise;end if;end;
 begin
  update public.contrato_aditivos_base set valor_original=5 where contrato_id=cid;
  raise exception 'Original editável';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.contrato_aditivos where id=a2;
  raise exception 'Histórico apagável';
 exception when insufficient_privilege then null;end;
 select count(*) into n from public.contrato_aditivos_historico where contrato_id=cid;
 if n<>11 then raise exception 'Histórico incompleto: %',n;end if;
 select * into x from public.tratativas_administrativas where id=t;
 if x.situacao<>'AGUARDANDO RESPOSTA' or x.versao<>1 then raise exception 'Tratativa foi alterada';end if;
 -- Closed-table move preserves current values even if a legacy client supplies stale ones.
 insert into public.contratos_encerrados(id,data,data_fim,valor,orgao,status) values(cid,'2020-01-01','2030-01-01',9999,'ÓRGÃO TESTE','Encerrado');
 select * into x from public.contratos_encerrados where id=cid;
 if x.valor<>1130 or x.data_fim<>'2026-12-11'::date then raise exception 'Mudança para encerrados perdeu dados';end if;
 select md5(coalesce(string_agg(row_to_json(e)::text,'' order by id),'')) into after_hash from public.empenhos e;
 if before_hash<>after_hash then raise exception 'Empenhos alterados';end if;
end $$;
select 'OK: originais, múltiplas prorrogações, finanças, exclusão, edição, concorrência, legado e isolamento' as resultado;
rollback;
