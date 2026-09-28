# Tratativas administrativas

O módulo mantém as solicitações separadas do status jurídico do contrato e do andamento dos empenhos. Não calcula nem grava valores financeiros.

## Arquitetura e compatibilidade

- `index.html`: pontos de integração nas listagens de contratos, empenhos, detalhes e sino. Funções existentes de cálculo e persistência de contratos/empenhos permanecem inalteradas.
- `tratativas.js`: cadastro, edição, conclusão, histórico, filtros, links HTTP/HTTPS, escopo e follow-up. Salva somente na nova tabela, com controle de versão para impedir sobrescrita por uma edição desatualizada.
- `tratativas.css`: estilos responsivos que utilizam a paleta existente.
- Migration `tratativas_administrativas`: duas tabelas independentes; validação de vínculo e desfecho; histórico automático no banco. O histórico registra snapshots completos anteriores e posteriores. O frontend não tem permissão de excluir tratativas nem alterar/excluir eventos.

Os IDs existentes são texto. Contratos ativos e encerrados vivem em tabelas distintas e são movidos entre elas; por isso o vínculo é validado por trigger, sem uma chave estrangeira que quebraria o encerramento/reativação. Contratos sem tratativas continuam válidos. Empenhos de outros contratos são rejeitados. Sem sessões individuais no sistema atual, o responsável fica não identificado; `auth.uid()` será gravado quando houver autenticação individual.

As permissões mantêm o modelo de acesso atual do projeto (sem login). Não constituem uma implementação de autenticação. A função que grava o histórico é privada e não pode ser chamada como RPC público. A futura introdução de login deve revisar as políticas do sistema completo.

## Uso

1. Abra um contrato e vá a **Tratativas administrativas → Nova tratativa**.
2. Informe tipo, situação, data, descrição, abrangência e, quando aplicável, selecione os empenhos do contrato.
3. Cadastre links, próxima ação e **Acompanhar em**. URLs HTTP/HTTPS abrem em nova aba; nenhum e-mail é enviado.
4. **Editar** e **Registrar atualização** exigem a descrição da alteração e criam um novo evento no histórico.
5. **Concluir tratativa** exige resultado e data. Deferido, indeferido, parcialmente deferido, cancelado e concluído são situações finais da tratativa. Para reabrir, edite para uma situação aberta e justifique; o encerramento anterior permanece no histórico.
6. Combine tipo e situação nos filtros. Os dois critérios precisam corresponder à mesma tratativa. **Sem tratativa** significa nenhum cadastro, inclusive concluído; **Com tratativa ativa** considera somente abertas.
7. O sino inclui acompanhamentos vencidos, hoje e nos próximos dois dias. A contagem soma os alertas existentes de vencimento de contratos. Não foram adicionados cards ao dashboard.

## Validação

`test-ui.cjs` usa Chrome/Playwright e API simulada: criação, atualização, histórico, links, empenhos, filtros, fechamento, falha de gravação, conflito de versão, datas de acompanhamento e layout móvel. As escritas de teste não atingem produção.

`test-database.sql` executa os testes de banco em transação desfeita ao final, incluindo comparação dos dados de contratos, empenhos e compras antes/depois. O cadastro inicial é feito diretamente no banco, com seleção inequívoca por órgão, empresa, contrato, pregão, valor e quantidade, sem criar contratos ou empenhos fictícios nem alterar seus status.

## Cadastro inicial

Os dados reais são cadastrados somente no banco de produção e não são distribuídos neste repositório. Links e datas de acompanhamento devem corresponder às informações fornecidas pela usuária.

## Publicação

Aplicar e verificar a migration antes de publicar os arquivos do frontend. Se a tabela estiver indisponível, o módulo informa o erro, impede cadastro sem confirmação do banco e mantém as telas existentes funcionando. Os dados novos são persistidos no Supabase; o backup local legado não é uma restauração do histórico administrativo.

