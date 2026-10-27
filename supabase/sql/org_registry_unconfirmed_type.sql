-- Expands the allowed type without guessing the legal identity of existing names.
alter table registry_private.orgaos drop constraint orgaos_tipo_check;
alter table registry_private.orgaos add constraint orgaos_tipo_check check(tipo in ('A confirmar','Prefeitura','Câmara','Fundo','Secretaria','Autarquia','Consórcio','Outro'));
