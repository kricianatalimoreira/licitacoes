begin;
create or replace function public.gmail_backend(p_action text, p_user_id uuid default null,
 p_session_id uuid default null, p_company text default null, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 a gmail_private.accounts%rowtype;
 s gmail_private.oauth_states%rowtype;
 v_email text;
 v_id uuid;
 v_secret text;
 v_result jsonb;
 v_flow uuid;
begin
 if current_user not in ('service_role','postgres') then raise exception 'not_authorized'; end if;
 if p_action='consume' then
   delete from gmail_private.oauth_states where state_hash=p_data->>'state_hash' returning * into s;
   if not found then return jsonb_build_object('error','invalid_state'); end if;
   select decrypted_secret into v_secret from vault.decrypted_secrets where id=s.verifier_secret_id;
   delete from vault.secrets where id=s.verifier_secret_id;
   if s.expires_at <= now() then return jsonb_build_object('error','expired_state'); end if;
   p_user_id:=s.user_id; p_session_id:=s.session_id; p_company:=s.company;
 end if;
 if p_action in ('accounts','credentials','refresh','invalid') and gmail_private.robot_allowed(p_data) then
  v_email:='__gmail_robot__';
 else
 select lower(u.email) into v_email from auth.users u
 join auth.sessions se on se.user_id=u.id
 where u.id=p_user_id and se.id=p_session_id and u.email_confirmed_at is not null
 and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<now())
 and (se.not_after is null or se.not_after>now());
 if v_email is null or not exists(select 1 from gmail_private.operators o where o.email=v_email
   and (p_company is null or o.company=p_company)) then
   return jsonb_build_object('error','not_authorized');
 end if;
 end if;
 if p_action='accounts' then
   select coalesce(jsonb_agg(distinct jsonb_build_object('company',x.company,'email',x.email,
    'google_account_id',x.google_account_id,'status',x.status,'connected_at',x.connected_at,
    'expires_at',x.expires_at,'last_checked_at',x.last_checked_at,'last_synced_at',x.last_synced_at,
    'last_error',x.last_error)),'[]') into v_result
    from gmail_private.accounts x join gmail_private.operators o on o.company=x.company where (o.email=v_email or (v_email='__gmail_robot__' and x.company=p_company));
   return v_result;
 end if;
 select * into a from gmail_private.accounts where company=p_company for update;
 if not found then return jsonb_build_object('error','invalid_company'); end if;
 if p_action='start' then
   -- Garbage collection also removes encrypted verifiers of abandoned requests.
   for v_id in delete from gmail_private.oauth_states where expires_at<now() or company=p_company returning verifier_secret_id loop
     delete from vault.secrets where id=v_id;
   end loop;
   v_flow:=gen_random_uuid();
   v_id:=vault.create_secret(p_data->>'verifier',null,'Gmail OAuth PKCE (temporary)');
   insert into gmail_private.oauth_states(state_hash,company,user_id,session_id,flow_id,verifier_secret_id,nonce)
    values(p_data->>'state_hash',p_company,p_user_id,p_session_id,v_flow,v_id,p_data->>'nonce');
   update gmail_private.accounts set flow_id=v_flow where company=p_company;
   return jsonb_build_object('email',a.email);
 elsif p_action='consume' then
   if a.flow_id is distinct from s.flow_id then return jsonb_build_object('error','superseded'); end if;
   return jsonb_build_object('company',s.company,'user_id',s.user_id,'session_id',s.session_id,
     'flow_id',s.flow_id,'verifier',v_secret,'nonce',s.nonce,'email',a.email,'google_account_id',a.google_account_id);
 elsif p_action='finish' then
   if a.flow_id is distinct from (p_data->>'flow_id')::uuid then return jsonb_build_object('error','superseded'); end if;
   if lower(p_data->>'email') is distinct from a.email or nullif(p_data->>'sub','') is null
    or (a.google_account_id is not null and a.google_account_id<>p_data->>'sub') then
     return jsonb_build_object('error','account_mismatch');
   end if;
   if nullif(p_data->>'access_token','') is null or nullif(p_data->>'refresh_token','') is null
    then return jsonb_build_object('error','missing_tokens'); end if;
   v_secret:=jsonb_build_object('access_token',p_data->>'access_token','refresh_token',p_data->>'refresh_token')::text;
   if a.token_secret_id is null then v_id:=vault.create_secret(v_secret,null,'Gmail tokens: '||p_company);
   else v_id:=a.token_secret_id; perform vault.update_secret(v_id,v_secret); end if;
   update gmail_private.accounts set google_account_id=p_data->>'sub',token_secret_id=v_id,
    token_revision=token_revision+1,status='connected',expires_at=(p_data->>'expires_at')::timestamptz,
    scopes=array(select jsonb_array_elements_text(p_data->'scopes')),connected_at=now(),last_checked_at=now(),
    last_error=null,flow_id=null,updated_at=now() where company=p_company;
   return jsonb_build_object('ok',true);
 elsif p_action='credentials' then
   if a.status<>'connected' or a.token_secret_id is null then return jsonb_build_object('error','not_connected'); end if;
   select decrypted_secret into v_secret from vault.decrypted_secrets where id=a.token_secret_id;
   return v_secret::jsonb || jsonb_build_object('revision',a.token_revision,'expires_at',a.expires_at,
    'email',a.email,'sub',a.google_account_id);
 elsif p_action in ('refresh','checked','invalid') then
   if a.token_revision<>(p_data->>'revision')::integer or a.status<>'connected' then
    return jsonb_build_object('error','superseded'); end if;
   if p_action='refresh' then
    select decrypted_secret into v_secret from vault.decrypted_secrets where id=a.token_secret_id;
    if nullif(p_data->>'access_token','') is null then return jsonb_build_object('error','missing_tokens'); end if;
    perform vault.update_secret(a.token_secret_id,(v_secret::jsonb || jsonb_build_object(
     'access_token',p_data->>'access_token','refresh_token',coalesce(nullif(p_data->>'refresh_token',''),v_secret::jsonb->>'refresh_token')))::text);
    update gmail_private.accounts set token_revision=token_revision+1,expires_at=(p_data->>'expires_at')::timestamptz,
     updated_at=now() where company=p_company;
   elsif p_action='checked' then
    update gmail_private.accounts set last_checked_at=now(),last_error=null where company=p_company;
   else
    update gmail_private.accounts set status='reconnect_required',last_error='reauthorize',updated_at=now() where company=p_company;
   end if;
   return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','invalid_action');
end $$;
revoke all on function public.gmail_backend(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_backend(text,uuid,uuid,text,jsonb) to service_role;

commit;
