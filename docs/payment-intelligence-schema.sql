-- Campos opcionais; não converte nem preenche datas/valores existentes.
alter table public.empenhos
  add column if not exists data_recebimento_empenho date,
  add column if not exists data_recebimento_definitivo date,
  add column if not exists data_liquidacao date,
  add column if not exists data_vencimento_pagamento date,
  add column if not exists fonte_prazo_pagamento text,
  add column if not exists saldo_pendente_confirmado numeric(15,2),
  add column if not exists data_saldo_confirmado date;
alter table public.empenhos add constraint empenhos_saldo_confirmado_check
  check (saldo_pendente_confirmado is null or (saldo_pendente_confirmado >= 0 and saldo_pendente_confirmado <= valor and data_saldo_confirmado is not null));
alter table public.empenhos add constraint empenhos_vencimento_fonte_check
  check (data_vencimento_pagamento is null or length(trim(coalesce(fonte_prazo_pagamento,''))) > 0);
comment on column public.empenhos.data_recebimento_empenho is 'Recebimento do empenho pela empresa; distinto de emissão/pedido.';
comment on column public.empenhos.data_recebimento_definitivo is 'Aceite definitivo pelo órgão; distinto de entrega física.';
comment on column public.empenhos.data_vencimento_pagamento is 'Vencimento apurado conforme contrato/documento identificado em fonte_prazo_pagamento; não inferido de 30 dias.';
comment on column public.empenhos.saldo_pendente_confirmado is 'Saldo conferido pelo usuário, líquido de recebimentos parciais e cancelamentos, na data_saldo_confirmado. Não é um ledger de recebimentos.';
notify pgrst, 'reload schema';

