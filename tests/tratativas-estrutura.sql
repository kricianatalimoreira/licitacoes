-- Teste transacional: nenhum registro de teste permanece no banco.
begin;
set local role anon;
do $$
declare
  c1 text := gen_random_uuid()::text;
  c2 text := gen_random_uuid()::text;
  e1 text := gen_random_uuid()::text;
  e2 text := gen_random_uuid()::text;
  e3 text := gen_random_uuid()::text;
  t1 uuid;
  t2 uuid;
  ti uuid;
  v integer;
  before_time timestamptz;
  item record;
begin
  insert into public.contratos_ativos(id,empresa,orgao,processo,contrato)
  values(c1,'TESTE ROLLBACK','ÓRGÃO TESTE','PROCESSO TESTE','ATA/CONTRATO TESTE'),
        (c2,'TESTE ROLLBACK','OUTRO ÓRGÃO','OUTRO PROCESSO','OUTRO CONTRATO');
  insert into public.empenhos(id,contrato_id) values(e1,c1),(e2,c1),(e3,c2);
  insert into public.tratativas_administrativas(contrato_id,tipo,situacao,data_ocorrencia,descricao,abrangencia,empenho_ids)
  values(c1,'CANCELAMENTO','AGUARDANDO RESPOSTA',current_date,'Teste legado','empenhos',array[e1,e2]) returning id into t1;
  insert into public.tratativas_administrativas(contrato_id,tipo_tratativa,status,data_ocorrencia,descricao,abrangencia,empenho_ids,prioridade,prazo,proxima_acao,acompanhar_em)
  values(c1,'Cobrança de pagamento','Em andamento',current_date,'Teste novo','empenhos',array[e1],'Alta',current_date+7,'Contatar órgão',current_date+1) returning id into t2;

  if (select count(*) from public.tratativas_empenhos where tratativa_id in(t1,t2)) <> 3
     or (select count(*) from public.tratativas_empenhos where empenho_id=e1) <> 2 then
    raise exception 'FAIL: relação muitos para muitos';
  end if;
  if not exists(select 1 from public.tratativas_administrativas_detalhes where id=t2
    and empresa='TESTE ROLLBACK' and orgao='ÓRGÃO TESTE' and processo='PROCESSO TESTE'
    and ata_contrato='ATA/CONTRATO TESTE' and data_abertura=current_date
    and data_proxima_acao=current_date+1 and created_at=criado_em and updated_at=atualizado_em
    and ultima_movimentacao=updated_at and prioridade='Alta' and prazo=current_date+7) then
    raise exception 'FAIL: campos e vínculos derivados';
  end if;
  if not exists(select 1 from public.tratativas_administrativas where id=t1 and tipo='CANCELAMENTO'
     and tipo_tratativa='Extinção consensual' and status='Aguardando órgão') then
    raise exception 'FAIL: compatibilidade legada';
  end if;

  select versao,updated_at into v,before_time from public.tratativas_administrativas where id=t1;
  update public.tratativas_administrativas set empenho_ids=array[e2],nota_atualizacao='Retira vínculo de teste' where id=t1;
  if exists(select 1 from public.tratativas_empenhos where tratativa_id=t1 and empenho_id=e1)
    or not exists(select 1 from public.tratativas_empenhos where tratativa_id=t2 and empenho_id=e1)
    or not exists(select 1 from public.tratativas_administrativas where id=t1 and versao=v+1 and updated_at>before_time)
    or (select count(*) from public.tratativas_historico where tratativa_id=t1)<>2 then
    raise exception 'FAIL: sincronização, auditoria ou versão';
  end if;

  for item in select nome from public.tratativas_tipos loop
    insert into public.tratativas_administrativas(contrato_id,tipo_tratativa,status,data_ocorrencia,descricao)
    values(c1,item.nome,'Em andamento',current_date,'Teste de catálogo') returning id into ti;
  end loop;
  for item in select nome from public.tratativas_status order by ordem loop
    update public.tratativas_administrativas set status=item.nome,
      resultado=case when item.nome in('Deferido','Indeferido','Encerrado') then 'Resultado de teste' else '' end,
      encerrada_em=case when item.nome in('Deferido','Indeferido','Encerrado') then current_date else null end,
      nota_atualizacao='Teste de status' where id=t2;
    if not exists(select 1 from public.tratativas_administrativas where id=t2 and status=item.nome) then
      raise exception 'FAIL: status %',item.nome;
    end if;
  end loop;
  update public.tratativas_administrativas set situacao='ENVIADO',encerrada_em=null,resultado='',nota_atualizacao='Reabre pelo legado' where id=t2;
  if not exists(select 1 from public.tratativas_administrativas where id=t2 and status='Aguardando órgão') then
    raise exception 'FAIL: status legado';
  end if;

  begin
    update public.tratativas_administrativas set empenho_ids=array[e3],nota_atualizacao='Teste negativo' where id=t1;
    raise exception 'FAIL: aceitou empenho de outro contrato';
  exception when raise_exception then
    if sqlerrm <> 'Selecione apenas empenhos pertencentes a este contrato.' then raise; end if;
  end;
  begin
    update public.tratativas_administrativas set empenho_ids=array[e2,e2],nota_atualizacao='Teste negativo' where id=t1;
    raise exception 'FAIL: aceitou vínculo duplicado';
  exception when raise_exception then
    if sqlerrm <> 'Não repita um empenho na mesma tratativa.' then raise; end if;
  end;
  begin
    update public.tratativas_administrativas set responsavel_id=gen_random_uuid(),nota_atualizacao='Teste negativo' where id=t1;
    raise exception 'FAIL: aceitou usuário inexistente';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.tratativas_administrativas set prioridade='Inválida',nota_atualizacao='Teste negativo' where id=t1;
    raise exception 'FAIL: aceitou prioridade inválida';
  exception when check_violation then null;
  end;
  begin
    update public.tratativas_administrativas set status='Inválido',nota_atualizacao='Teste negativo' where id=t1;
    raise exception 'FAIL: aceitou status inválido';
  exception when raise_exception then
    if sqlerrm <> 'Status de tratativa inválido.' then raise; end if;
  end;
  begin
    delete from public.empenhos where id=e2;
    raise exception 'FAIL: apagou empenho vinculado';
  exception when foreign_key_violation or restrict_violation then null;
  end;
  begin
    update public.empenhos set contrato_id=c2 where id=e2;
    raise exception 'FAIL: moveu empenho vinculado';
  exception when raise_exception then
    if sqlerrm <> 'Empenho vinculado a tratativa: não é permitido trocar seu contrato.' then raise; end if;
  end;
  begin
    insert into public.tratativas_empenhos(tratativa_id,empenho_id) values(t2,e2);
    raise exception 'FAIL: permitiu bypass da sincronização';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tratativas_tipos values('Não autorizado',99);
    raise exception 'FAIL: permitiu escrita no catálogo';
  exception when insufficient_privilege then null;
  end;

  -- O vínculo sobrevive ao encerramento/reativação do contrato sem duplicar entidades.
  insert into public.contratos_encerrados(id,empresa,orgao,processo,contrato)
  select id,empresa,orgao,processo,contrato from public.contratos_ativos where id=c1;
  delete from public.contratos_ativos where id=c1;
  if not exists(select 1 from public.tratativas_administrativas_detalhes where id=t1 and empresa='TESTE ROLLBACK') then
    raise exception 'FAIL: contrato encerrado';
  end if;
end $$;
rollback;
