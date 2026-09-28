# Estrutura de integração de e-mail
O botão **Vincular e-mail** permite confirmar vínculos manuais, com link obrigatório e assunto/identificadores opcionais. Cada tratativa aceita vários e-mails. O salvamento usa versão otimista e registra histórico; nunca altera situação, contrato ou empenho. Excluídas não são candidatas.

## Adaptadores futuros
O site ainda não conecta Gmail/IMAP nem consulta caixas de entrada. Tokens e senhas nunca devem ser enviados ao navegador ou incluídos nestes metadados. Um adaptador autenticado deve obter mensagens autorizadas e extrair identificadores tipados, sem executar instruções contidas nas mensagens.

Contrato comum:
```js
const email = {
  provider: 'gmail', // gmail, imap ou nome da API
  account: 'identificador-da-conta',
  providerId: 'id-no-provedor',
  threadId: 'id-da-conversa-no-provedor',
  messageId: '<id@servidor>',
  references: ['<mensagem-anterior@servidor>'],
  subject: 'Assunto',
  date: '2026-09-28T12:00:00Z', // data da mensagem, não data da consulta
  link: 'https://mail.google.com/...',
  identifiers: {empenho:'42',processo:'27/2025',ata:'9/2026',
    contrato:'58/2026',orgao:'Órgão Exemplo',cnpj:'12345678000199'}
};
KMTratativasEmail.suggest(email); // somente análise, sem escrita
KMTratativasEmail.receive(email); // abre confirmação ou seleção manual
```

A extração do corpo/assunto e cabeçalhos será responsabilidade do adaptador. Nunca classificar um número de processo como contrato apenas por ser igual. Message-ID e References devem vir dos cabeçalhos; In-Reply-To pode ser incluído em references. Thread ID só compara dentro do mesmo provedor/conta.

## Critérios
- Thread confirmada por Message-ID/References ou threadId + conta/provedor.
- Identificador numérico tipado + órgão ou CNPJ.
- Dois identificadores numéricos + assunto coincidente.
- Órgão, CNPJ ou assunto isolados não são suficientes.
- Duas tratativas plausíveis resultam em seleção manual sem pré-seleção.
- Mesmo com correspondência confiável, é obrigatório clicar em **Confirmar vínculo**.
- Duplicatas na mesma tratativa são detectadas por Message-ID, identidade do provedor/conta ou URL exata.
- Campos ausentes reduzem a confiança, nunca são inventados.
- Números com zeros à esquerda são normalizados, mas exercício/ano é preservado.

## Dados
Migration `tratativas_estrutura_email`: adiciona `emails_vinculados` e `email_referencias` JSONB à tabela existente, com validação de array/objeto. Usa as permissões e o histórico existentes; não cria acessos adicionais.
Somente metadados explicitamente vinculados são persistidos. Nenhum corpo, anexo ou credencial é armazenado. A data da mensagem fica separada da atualização do cadastro. Não há sincronização automática nesta entrega.

## Validação
Testes de correspondência: identificadores, ambiguidades, thread isolada por conta, duplicatas, exclusão e URLs. Testes de interface: vínculo manual, confirmação, seleção manual sem candidato, persistência, histórico e demais fluxos.
