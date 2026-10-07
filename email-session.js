/* Persist only the application's Supabase session. Google tokens stay in Vault. */
(() => {
 'use strict';
 const base='https://inaunswiwxfonhhdznkh.supabase.co',key='sb_publishable_65qYNb-AKxd6UksFJRD5GQ_ZRLTsug2',storageKey='km-email-session-v1';
 const listeners=new Set();let memory=null,flight=null,epoch=0;
 function read(){try{const v=JSON.parse(localStorage.getItem(storageKey));return v?.access_token&&v?.refresh_token?v:null;}catch{return memory;}}
 function save(value){memory=value;try{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);}catch{} }
 function notify(){listeners.forEach(fn=>fn(!!read()));}
 function clear(){epoch++;save(null);notify();}
 async function auth(path,body){const r=await fetch(`${base}/auth/v1/${path}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw new Error('network_error');}return {r,data};}
 async function token(force=false){
  if(flight)return flight;
  const run=async()=>{
   const s=read();if(!s)throw new Error('login_required');
   if(!force&&s.expires_at>Date.now()/1000+60)return s.access_token;
   const version=epoch;const {r,data}=await auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token});
   if(!r.ok){if([400,401,403].includes(r.status)&&epoch===version)clear();throw new Error([400,401,403].includes(r.status)?'login_required':'network_error');}
   if(epoch!==version||!read())throw new Error('login_required');
   save({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Date.now()/1000+data.expires_in});return data.access_token;
  };
  flight=(navigator.locks?navigator.locks.request(storageKey,run):run()).finally(()=>{flight=null;});return flight;
 }
 window.addEventListener('storage',e=>{if(e.key===storageKey){epoch++;memory=null;notify();}});
 window.KMEmailSession={
  has:()=>!!read(),onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async signIn(email,password){const {r,data}=await auth('token?grant_type=password',{email,password});if(!r.ok)throw new Error('login_failed');epoch++;save({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Date.now()/1000+data.expires_in});notify();},
  async signOut(){const s=read();clear();if(s)await fetch(`${base}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${s.access_token}`}}).catch(()=>{});},
  async api(action,company,extra={},endpoint='gmail-accounts'){
   for(let attempt=0;attempt<2;attempt++){
    const access=await token(attempt>0);const r=await fetch(`${base}/functions/v1/${endpoint}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action,company,...extra})});
    const data=await r.json();if(r.ok)return data;
    if(data.error==='login_required'&&attempt===0)continue;
    if(data.error==='login_required')clear();throw new Error(data.error||'network_error');
   }
  }
 };
})();
