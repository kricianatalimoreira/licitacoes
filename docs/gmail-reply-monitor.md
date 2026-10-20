# Gmail reply monitor — preparation

User authorized a new integration on 2026-10-20 to detect replies to existing treatment conversations. Restored connection-only UI and service_role EXECUTE on gmail_backend. Automatic contract matching, sync RPC and old cron jobs remain disabled.

## Existing architecture
Static frontend on Vercel; Supabase Auth, Edge Functions and private gmail_private schema. OAuth tokens encrypted in Vault. Companies and operators already separate HAMATE and GADITA. Public treatment tables currently admit anonymous access: never copy email metadata or alerts there.

## Configuration
Reuse GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and APP_ORIGIN. Supabase supplies backend credentials. No new secret required for connection validation. OAuth uses openid email gmail.readonly, state, nonce, PKCE and exact mailbox identity validation. User must reauthorize each company if expired.

## Next implementation after validating connections
Private treatment_threads keyed by company + treatment + Gmail API thread ID; record approved sender addresses, source link fingerprint, binding confirmation, last received/sent message IDs and times, last checked time, error and pending reply state. Private events record transitions. Protected API validates operator/session and company ownership from treatment contract. No anonymous alert endpoint.

Only exact API thread bindings, confirmed by user when not unambiguously resolvable. Modern opaque Gmail web links and /u/2 account indexes must not be assumed to be API thread IDs or company identities. No fuzzy contract matching. Monitor excludes drafts, spam, trash and automatic replies; incoming messages from confirmed counterpart after last outgoing trigger pending reply. Read/unread does not clear alert. Later outgoing reply or explicit resolved action clears it. Closed treatments remain closed. Outage displays stale/connection-needed rather than a false all-clear.

Proposed scheduled polling every 5 minutes, bounded batches and retry/backoff. Enable only after company authorization and exact thread bindings are validated. UI shows red-soft pending rows, first in order, pending count and elapsed days. No sending email.

References: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get and https://supabase.com/docs/guides/database/vault
