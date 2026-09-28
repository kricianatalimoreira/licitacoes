alter table public.tratativas_administrativas
 add column if not exists emails_vinculados jsonb not null default '[]'::jsonb
 check(jsonb_typeof(emails_vinculados)='array'),
 add column if not exists email_referencias jsonb not null default '{}'::jsonb
 check(jsonb_typeof(email_referencias)='object');
comment on column public.tratativas_administrativas.emails_vinculados is 'Metadados de e-mails vinculados com confirmação; sem corpo, anexos ou credenciais.';
notify pgrst, 'reload schema';