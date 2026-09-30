begin;
set local role anon;
do $$
declare
  c text:=gen_random_uuid()::text;
  t uuid;
  event_id uuid;
  repeated uuid;
  request_id uuid;
  version_before integer;
  event_count integer;
  kind text;
  when_at timestamptz:=now()-interval '2 days';
  requested_status text;
begin
  insert into public.contratos_ativos(id) values(c);
  insert into public.tratativas_administrativas(contrato_id,tipo_tratativa,status,data_ocorrencia,descricao)
    values(c,'Cobrança de pagamento','Em andamento',current_date-10,'Teste timeline rollback') returning id into t;
  foreach kind in array array['email_enviado','email_recebido','documento','ligacao','whatsapp','protocolo','observacao','alteracao_status','follow_up'] loop
    select versao into version_before from public.tratativas_administrativas where id=t;
    request_id:=gen_random_uuid();
    requested_status:=case when kind='alteracao_status' then 'Aguardando órgão' else null end;
    event_id:=public.registrar_movimentacao_tratativa(t,version_before,request_id,kind,'Teste '||kind,when_at,'https://example.com/referencia',requested_status);
    repeated:=public.registrar_movimentacao_tratativa(t,version_before,request_id,kind,'Teste '||kind,when_at,'https://example.com/referencia',requested_status);
    if event_id<>repeated or (select count(*) from public.tratativas_historico where requisicao_id=request_id)<>1 then
      raise exception 'FAIL: idempotência';
    end if;
    if not exists(select 1 from public.tratativas_historico where id=event_id and tratativa_id=t
      and tipo_movimentacao=kind and origem='manual' and ocorrida_em=when_at
      and data_hora>=ocorrida_em and antes is not null and depois is not null) then
      raise exception 'FAIL: metadados e snapshots';
    end if;
    if (select versao from public.tratativas_administrativas where id=t)<>version_before+1 then
      raise exception 'FAIL: versão';
    end if;
  end loop;
  if (select count(*) from public.tratativas_historico where tratativa_id=t)<>10 then
    raise exception 'FAIL: eventos anteriores não preservados';
  end if;
  if not exists(select 1 from public.tratativas_administrativas where id=t and status='Aguardando órgão' and situacao='AGUARDANDO RESPOSTA') then
    raise exception 'FAIL: status não sincronizado';
  end if;
  select versao into version_before from public.tratativas_administrativas where id=t;
  select count(*) into event_count from public.tratativas_historico where tratativa_id=t;
  begin
    perform public.registrar_movimentacao_tratativa(t,1,gen_random_uuid(),'observacao','Versão antiga');
    raise exception 'FAIL: aceitou versão antiga';
  exception when serialization_failure then null;
  end;
  begin
    perform public.registrar_movimentacao_tratativa(t,version_before,gen_random_uuid(),'observacao','');
    raise exception 'FAIL: aceitou descrição vazia';
  exception when raise_exception then if sqlerrm<>'Descreva a movimentação.' then raise; end if;
  end;
  begin
    perform public.registrar_movimentacao_tratativa(t,version_before,gen_random_uuid(),'observacao','Futuro',now()+interval '1 day');
    raise exception 'FAIL: aceitou data futura';
  exception when raise_exception then if sqlerrm<>'A movimentação não pode estar no futuro.' then raise; end if;
  end;
  begin
    perform public.registrar_movimentacao_tratativa(t,version_before,gen_random_uuid(),'observacao','URL inválida',null,'javascript:alert(1)');
    raise exception 'FAIL: aceitou URL insegura';
  exception when raise_exception then if sqlerrm<>'Informe um link HTTP ou HTTPS válido.' then raise; end if;
  end;
  begin
    perform public.registrar_movimentacao_tratativa(t,version_before,gen_random_uuid(),'alteracao_status','Fechar',null,'','Encerrado');
    raise exception 'FAIL: aceitou encerramento sem resultado';
  exception when raise_exception then if sqlerrm<>'Informe o resultado e a data de encerramento.' then raise; end if;
  end;
  begin
    update public.tratativas_historico set descricao='Sobrescrita' where tratativa_id=t;
    raise exception 'FAIL: permitiu alterar histórico';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tratativas_historico where tratativa_id=t;
    raise exception 'FAIL: permitiu apagar histórico';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.tratativas_historico where tratativa_id=t)<>event_count then
    raise exception 'FAIL: falha deixou eventos parciais';
  end if;
  perform public.registrar_movimentacao_tratativa(t,version_before,gen_random_uuid(),'alteracao_status','Encerramento de teste',null,'','Encerrado','Resolvido',current_date);
  if not exists(select 1 from public.tratativas_administrativas where id=t and status='Encerrado' and resultado='Resolvido' and encerrada_em=current_date) then
    raise exception 'FAIL: encerramento atômico';
  end if;
  -- A próxima escrita legada não herda contexto manual da chamada anterior.
  update public.tratativas_administrativas set nota_atualizacao='Atualização legada' where id=t;
  if not exists(select 1 from public.tratativas_historico where tratativa_id=t and descricao='Atualização legada' and origem='sistema' and requisicao_id is null) then
    raise exception 'FAIL: vazamento de contexto';
  end if;
end $$;
rollback;
