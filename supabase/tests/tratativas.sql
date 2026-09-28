-- Executar após a migration. Todas as escritas de teste são desfeitas.
begin;
set local role anon;
do $$
declare c text; e text; t uuid; v integer; n integer; states jsonb; after_states jsonb;
begin
  select id into c from public.contratos_ativos order by id limit 1;
  select id into e from public.empenhos where contrato_id=c limit 1;
  select jsonb_build_object('contratos',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.contratos_ativos x),
    'empenhos',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.empenhos x),
    'compras',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.compras x)) into states;
  insert into public.tratativas_administrativas(contrato_id,tipo,situacao,data_ocorrencia,descricao,nota_atualizacao)
    values(c,'OUTROS','AGUARDANDO ENVIO',current_date,'TESTE TRANSACIONAL','Cadastro de teste') returning id into t;
  select count(*) into n from public.tratativas_historico where tratativa_id=t;
  if n<>1 then raise exception 'Histórico de criação ausente'; end if;
  update public.tratativas_administrativas set situacao='AGUARDANDO RESPOSTA',nota_atualizacao='Envio realizado',acompanhar_em=current_date where id=t and versao=1;
  update public.tratativas_administrativas set observacoes='não deve salvar',nota_atualizacao='versão antiga' where id=t and versao=1;
  get diagnostics n = row_count;
  if n<>0 then raise exception 'Versão antiga sobrescreveu dados'; end if;
  select versao into v from public.tratativas_administrativas where id=t;
  if v<>2 then raise exception 'Versão incorreta'; end if;
  begin
    update public.tratativas_administrativas set abrangencia='contrato_empenhos',empenho_ids=array['empenho-inexistente'],nota_atualizacao='vínculo inválido' where id=t;
    raise exception 'Vínculo inválido aceito';
  exception when raise_exception then
    if sqlerrm not like 'Selecione apenas empenhos%' then raise; end if;
  end;
  begin
    update public.tratativas_administrativas set link_documento='javascript:alert(1)',nota_atualizacao='url inválida' where id=t;
    raise exception 'URL inválida aceita';
  exception when check_violation then null;
  end;
  begin
    update public.tratativas_administrativas set situacao='CONCLUÍDO',nota_atualizacao='sem desfecho' where id=t;
    raise exception 'Conclusão sem desfecho aceita';
  exception when check_violation then null;
  end;
  begin
    update public.tratativas_historico set descricao='alterado' where tratativa_id=t;
    raise exception 'Histórico mutável';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tratativas_administrativas where id=t;
    raise exception 'Exclusão permitida';
  exception when insufficient_privilege then null;
  end;
  update public.tratativas_administrativas set situacao='CONCLUÍDO',resultado='Teste concluído',encerrada_em=current_date,nota_atualizacao='Encerramento da tratativa' where id=t;
  select count(*) into n from public.tratativas_historico where tratativa_id=t;
  if n<>3 then raise exception 'Histórico incompleto'; end if;
  select jsonb_build_object('contratos',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.contratos_ativos x),
    'empenhos',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.empenhos x),
    'compras',(select md5(string_agg(to_jsonb(x)::text,'' order by id)) from public.compras x)) into after_states;
  if states<>after_states then raise exception 'Dados financeiros ou status existentes alterados'; end if;
end $$;
rollback;
select 'OK: criação, histórico, versões, vínculos, URLs, conclusão, proteção e dados financeiros preservados' as resultado;

