alter table public.tratativas_administrativas add column if not exists excluida boolean not null default false;
comment on column public.tratativas_administrativas.excluida is 'Exclusão recuperável: mantém o registro e seu histórico.';
notify pgrst, 'reload schema';