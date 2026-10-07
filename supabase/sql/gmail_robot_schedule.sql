begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
update gmail_private.robot_settings set enabled=true;
select cron.schedule('gmail-robot-hamate','*/2 * * * *',$job$
 select net.http_post(
 url:='https://inaunswiwxfonhhdznkh.supabase.co/functions/v1/gmail-robot',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='gmail_robot_key')),
 body:='{"company":"HAMATE"}'::jsonb,timeout_milliseconds:=60000)
 where (select enabled from gmail_private.robot_settings)
 and exists(select 1 from gmail_private.accounts where company='HAMATE' and status='connected');
$job$);
select cron.schedule('gmail-robot-gadita','1-59/2 * * * *',$job$
 select net.http_post(
 url:='https://inaunswiwxfonhhdznkh.supabase.co/functions/v1/gmail-robot',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='gmail_robot_key')),
 body:='{"company":"GADITA"}'::jsonb,timeout_milliseconds:=60000)
 where (select enabled from gmail_private.robot_settings)
 and exists(select 1 from gmail_private.accounts where company='GADITA' and status='connected');
$job$);
commit;
